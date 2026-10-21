import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN, todayVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { canEditPlan } from "../lib/eoAccess";
import { requireAdmin } from "../middleware/guards";
import { uploadPublicFile } from "../lib/googleDrive";
import { danhGiaQuyTac, layDongTheoDoi } from "../lib/theoDoi";

// /api/theo-doi - man "Theo doi linh kien dat" + "Canh bao CEO" (quy tac: lib/theoDoi.ts, migrations/0012).
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /danh-sach?pham_vi=dang_mo|tat_ca - danh gia quy tac truoc (toi da 10 phut/lan) roi tra danh sach dong
app.get("/danh-sach", async (c) => {
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const rows = await layDongTheoDoi(c.env, c.req.query("pham_vi") === "tat_ca" ? "tat_ca" : "dang_mo");
  const st = await c.env.DB.prepare("SELECT danh_gia_luc FROM tl_state WHERE id = 1").first<{ danh_gia_luc: string | null }>();
  return c.json({ rows, danh_gia_luc: st?.danh_gia_luc ?? null });
});

// GET /ceo - dong dang mo thoa 1 trong 3 dieu kien cap CEO
app.get("/ceo", async (c) => {
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const rows = (await layDongTheoDoi(c.env, "dang_mo")).filter((r) => r.ceo_ly_do.length > 0);
  return c.json({ rows });
});

// GET /dong/:itemId - lich su theo doi 1 dong: loi, giai trinh, push, mail, ngay du kien
app.get("/dong/:itemId", async (c) => {
  const id = Number(c.req.param("itemId"));
  const db = c.env.DB;
  const [loi, gt, push, mail, plans, item, keHoach, nhap] = await Promise.all([
    db.prepare("SELECT * FROM tl_loi WHERE eo_item_id = ? ORDER BY COALESCE(han, created_at) DESC, id DESC").bind(id).all(),
    db.prepare("SELECT * FROM tl_giai_trinh WHERE eo_item_id = ? ORDER BY id DESC").bind(id).all(),
    db.prepare(
      `SELECT p.ma_push, p.doi_tac, p.tieu_de, p.trang_thai, p.created_by, p.created_at, pi.ngay
       FROM tl_push_item pi JOIN tl_push p ON p.id = pi.push_id WHERE pi.eo_item_id = ? ORDER BY p.id DESC`,
    ).bind(id).all(),
    db.prepare(
      `SELECT m.* FROM tl_mail m WHERE m.eo_item_id = ?
         OR m.ma_push IN (SELECT p.ma_push FROM tl_push_item pi JOIN tl_push p ON p.id = pi.push_id WHERE pi.eo_item_id = ?)
       ORDER BY m.thoi_gian DESC LIMIT 100`,
    ).bind(id, id).all(),
    db.prepare(
      `SELECT event_type, after_json, before_json, user_email, created_at FROM event_log
       WHERE event_type IN ('ADD_PLAN','UPDATE_PLAN','DELETE_PLAN','BULK_PLAN') AND (entity_id = ? OR json_extract(metadata_json,'$.eo_item_id') = ?)
       ORDER BY created_at DESC, id DESC LIMIT 100`,
    ).bind(id, id).all(),
    // 3 loai ngay cua 1 dong tren cung 1 man: dong + cac dot ke hoach (ngay du kien / ngay NM cam ket) + phieu nhap AMIS (ngay hang ve thuc te)
    db.prepare(
      `SELECT i.id, i.eo_id, i.part_code, i.part_name, i.warehouse, i.supplier, i.current_qty, i.line_status, e.eo_code, e.approval_code, e.created_by
       FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?`,
    ).bind(id).first(),
    db.prepare(
      `SELECT id, planned_date, planned_qty, factory_committed_date, ghi_chu, loai, tuan, created_by, created_at, updated_by, updated_at
       FROM item_plan WHERE eo_item_id = ? AND deleted_at IS NULL ORDER BY planned_date, id`,
    ).bind(id).all(),
    db.prepare(
      `SELECT id, doc_no, doc_date, warehouse_name, qty_in FROM amis_receipt
       WHERE match_status = 'MATCHED_EO' AND matched_eo_item_id = ? AND voided_at IS NULL ORDER BY doc_date, id`,
    ).bind(id).all(),
  ]);
  return c.json({
    loi: loi.results, giai_trinh: gt.results, push: push.results, mail: mail.results, ngay_du_kien: plans.results,
    item, ke_hoach: keHoach.results, phieu_nhap: nhap.results,
  });
});

// ---- danh muc Ai / Loi
app.get("/danh-muc", async (c) =>
  c.json((await c.env.DB.prepare("SELECT * FROM tl_danh_muc ORDER BY loai, thu_tu, ma").all()).results));

app.put("/danh-muc", requireAdmin, async (c) => {
  const b = (await c.req.json()) as { loai?: string; ma?: string; ten?: string; thu_tu?: number; active?: boolean | number };
  const loai = b.loai === "AI" ? "AI" : b.loai === "LOI" ? "LOI" : null;
  const ma = (b.ma ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!loai || !ma || !b.ten?.trim()) return c.json({ error: "BAD_INPUT" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO tl_danh_muc (loai, ma, ten, thu_tu, active) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(loai, ma) DO UPDATE SET ten = excluded.ten, thu_tu = excluded.thu_tu, active = excluded.active`,
  ).bind(loai, ma, b.ten.trim(), Number(b.thu_tu) || 0, b.active === false || b.active === 0 ? 0 : 1).run();
  return c.json({ ok: true, ma });
});

// ---- anh bang chung giai trinh (Google Drive, cong khai theo link nhu file dinh kem EO)
const ANH = /\.(png|jpe?g|gif|webp|heic|bmp)$/i;
app.post("/upload", async (c) => {
  const filename = c.req.query("filename")?.trim();
  if (!filename || !ANH.test(filename)) return c.json({ error: "BAD_FILE_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (!bytes.byteLength) return c.json({ error: "EMPTY_FILE" }, 400);
  if (bytes.byteLength > 15 * 1024 * 1024) return c.json({ error: "FILE_TOO_LARGE" }, 413);
  try {
    const up = await uploadPublicFile(c.env, c.env.DB, bytes, c.req.header("Content-Type") || "image/jpeg", `giai-trinh_${filename}`);
    return c.json({ name: filename, drive_file_id: up.id, url: up.url });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return c.json({ error: m.startsWith("GOOGLE_DRIVE_NOT_CONNECTED") ? "GOOGLE_DRIVE_NOT_CONNECTED" : "UPLOAD_FAILED" }, m.startsWith("GOOGLE_DRIVE") ? 400 : 502);
  }
});

// POST /giai-trinh { eo_item_id, loi_id?, ai_ma, ai_email?, loi_ma, noi_dung, hinh_anh: [{name,drive_file_id,url}] }
//   loi_id: giai trinh 1 loi he thong da ghi (R1/R4 bat buoc anh). Khong loi_id: ghi them 1 loi tay (quy_tac TAY) -
//   "moi giai trinh deu phai xac dinh loi".
app.post("/giai-trinh", async (c) => {
  const u = c.get("user");
  const b = (await c.req.json()) as { eo_item_id?: number; loi_id?: number; ai_ma?: string; ai_email?: string; loi_ma?: string; noi_dung?: string; hinh_anh?: unknown[] };
  const itemId = Number(b.eo_item_id);
  const it = await c.env.DB.prepare("SELECT i.id, i.eo_id, e.created_by FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?")
    .bind(itemId).first<{ id: number; eo_id: number; created_by: string }>();
  if (!it) return c.json({ error: "ITEM_NOT_FOUND" }, 404);
  if (!canEditPlan(u, it)) return c.json({ error: "READ_ONLY" }, 403);
  const noiDung = (b.noi_dung ?? "").trim();
  if (!b.ai_ma || !b.loi_ma || !noiDung) return c.json({ error: "MISSING_FIELDS" }, 400);
  const dm = await c.env.DB.prepare("SELECT loai, ma FROM tl_danh_muc WHERE (loai = 'AI' AND ma = ?) OR (loai = 'LOI' AND ma = ?)")
    .bind(b.ai_ma, b.loi_ma).all<{ loai: string }>();
  if (dm.results.length < 2) return c.json({ error: "BAD_CATALOG" }, 400);
  const hinh = (Array.isArray(b.hinh_anh) ? b.hinh_anh : []).filter((x: any) => x && x.url).slice(0, 10);

  let loi: any = null;
  if (b.loi_id) {
    loi = await c.env.DB.prepare("SELECT * FROM tl_loi WHERE id = ? AND eo_item_id = ?").bind(b.loi_id, itemId).first();
    if (!loi) return c.json({ error: "LOI_NOT_FOUND" }, 404);
    if (loi.trang_thai !== "CHO_GIAI_TRINH") return c.json({ error: "DA_GIAI_TRINH" }, 409);
    if ((loi.quy_tac === "R1" || loi.quy_tac === "R4") && !hinh.length) return c.json({ error: "CAN_HINH_ANH" }, 400);
  }
  const now = nowVN();
  const gt = await c.env.DB.prepare(
    `INSERT INTO tl_giai_trinh (eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, hinh_anh, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(itemId, it.eo_id, loi?.id ?? null, b.ai_ma, b.ai_email?.trim() || null, b.loi_ma, noiDung, JSON.stringify(hinh), u.email, now).first<{ id: number }>();
  const stmts = [
    loi
      ? c.env.DB.prepare("UPDATE tl_loi SET trang_thai = 'DA_GIAI_TRINH', giai_trinh_id = ?, ai_ma = ?, ai_email = ?, loi_ma = ? WHERE id = ?")
          .bind(gt!.id, b.ai_ma, b.ai_email?.trim() || null, b.loi_ma, loi.id)
      : c.env.DB.prepare(
          `INSERT INTO tl_loi (eo_item_id, eo_id, quy_tac, khoa, han, ai_ma, ai_email, loi_ma, trang_thai, giai_trinh_id, created_at)
           VALUES (?, ?, 'TAY', ?, ?, ?, ?, ?, 'DA_GIAI_TRINH', ?, ?)`,
        ).bind(itemId, it.eo_id, `TAY:${itemId}:${gt!.id}`, now, b.ai_ma, b.ai_email?.trim() || null, b.loi_ma, gt!.id, now),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: it.eo_id, event_type: "GIAI_TRINH_THEO_DOI", user_email: u.email, at: now,
      after: { ai_ma: b.ai_ma, ai_email: b.ai_email ?? null, loi_ma: b.loi_ma, noi_dung: noiDung, so_anh: hinh.length },
      metadata: { loi_id: loi?.id ?? null, quy_tac: loi?.quy_tac ?? "TAY", giai_trinh_id: gt!.id } }),
  ];
  await c.env.DB.batch(stmts);
  await bumpVersions(c.env.DB, ["theo_doi"]);
  return c.json({ ok: true, id: gt!.id });
});

// POST /push { eo_item_ids: number[] } - tao dot push doi tac (1 dot / doi tac) -> FE dung du lieu tra ve de tao file
// Excel chuan EO-PUSH_<ma>.xlsx + tieu de mail "[EO-PUSH][<ma>] ..." (app theo-doi-mua-hang bat theo ma nay).
app.post("/push", async (c) => {
  const u = c.get("user");
  const b = (await c.req.json()) as { eo_item_ids?: number[] };
  const ids = [...new Set((b.eo_item_ids ?? []).map(Number).filter((x) => x > 0))];
  if (!ids.length || ids.length > 2000) return c.json({ error: "BAD_INPUT" }, 400);
  const all = await layDongTheoDoi(c.env, "tat_ca");
  const rows = all.filter((r) => ids.includes(r.item_id));
  if (!rows.length) return c.json({ error: "ITEM_NOT_FOUND" }, 404);
  const metas = await c.env.DB.prepare("SELECT i.id, e.created_by FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ id: number; created_by: string }>();
  if (metas.results.some((m) => !canEditPlan(u, m))) return c.json({ error: "READ_ONLY" }, 403);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.doi_tac?.trim() || "(Chưa có đối tác)";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const now = nowVN();
  const today = todayVN();
  const yymmdd = today.slice(2).replace(/-/g, "");
  const out = [];
  for (const [doiTac, list] of groups) {
    const seq = await c.env.DB.prepare(
      "UPDATE id_counters SET gia_tri_hien_tai = gia_tri_hien_tai + 1 WHERE ten_bang = 'tl_push' RETURNING gia_tri_hien_tai",
    ).first<{ gia_tri_hien_tai: number }>();
    const ma = `PUSH-${yymmdd}-${String(seq?.gia_tri_hien_tai ?? 1).padStart(4, "0")}`;
    const tieuDe = `[EO-PUSH][${ma}] ${doiTac} - Đề nghị xác nhận ngày giao hàng (${list.length} dòng)`;
    const tenFile = `EO-PUSH_${ma}.xlsx`;
    const p = await c.env.DB.prepare(
      "INSERT INTO tl_push (ma_push, doi_tac, so_dong, tieu_de, ten_file, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    ).bind(ma, doiTac, list.length, tieuDe, tenFile, u.email, now).first<{ id: number }>();
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO tl_push_item (push_id, eo_item_id, ngay) SELECT ?, value, ? FROM json_each(?)",
    ).bind(p!.id, today, JSON.stringify(list.map((r) => r.item_id))).run();
    out.push({ ma_push: ma, doi_tac: doiTac, tieu_de: tieuDe, ten_file: tenFile, rows: list });
  }
  await bumpVersions(c.env.DB, ["theo_doi"]);
  return c.json({ ok: true, dot: out });
});

export default app;
