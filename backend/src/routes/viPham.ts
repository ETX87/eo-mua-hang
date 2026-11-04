import { Hono } from "hono";
import type { Env, AppVariables, AppUser } from "../types";
import { nowVN, todayVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { canEditPlan, isViewOnly, xemToanBoTheoDoi } from "../lib/eoAccess";
import { danhGiaQuyTac, layDongTheoDoi } from "../lib/theoDoi";

/**
 * /api/vi-pham - man "Vi pham & giai trinh" (FE pages/ViPham.tsx, migrations/0016). Moi dong = 1 loi (tl_loi) kem:
 *  nguoi vi pham (ai_email, mac dinh nguoi dat), muc do, lan thu / so lan cung loai tren dong, so ngay cho, giai trinh, nhac nho,
 *  chi so dong (cap CEO, so lan lui, tinh trang). Muc do (chot 2026-11-04):
 *    CEO  dong dang cap CEO (lib/theoDoi)
 *    CAO  cung loai lap >= 3 lan tren dong | cho giai trinh >= 7 ngay
 *    TB   cung loai lap 2 lan | cho giai trinh >= 3 ngay ("qua lau")
 *    THAP con lai
 * Pham vi: Admin / KH cung ung / Theo doi tien do / tai khoan chi xem: tat ca. Con lai: loi minh vi pham, don minh dat,
 * Kho: + kho phu trach.
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

export const QUA_LAU_NGAY = 3;
export const RAT_LAU_NGAY = 7;

const soNgay = (a: string, b: string) => Math.max(0, Math.floor((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400_000));

function phamVi(u: AppUser) {
  const tatCa = xemToanBoTheoDoi(u) || isViewOnly(u);
  const khoCua = (u.khu_vuc_kho ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return { tatCa, thay: (r: { nguoi_dat: string; nguoi_vp: string | null; kho: string }) =>
    tatCa || r.nguoi_dat === u.email || r.nguoi_vp === u.email || (u.vai_tro === "Kho" && (khoCua.length === 0 || khoCua.includes(r.kho))) };
}

// GET / - toan bo loi trong pham vi (moi trang thai), FE tu loc / gom / dem
app.get("/", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const [loiRs, gtRs, nnRs, dong] = await Promise.all([
    db.prepare(
      `SELECT l.id, l.eo_item_id, l.eo_id, l.quy_tac, l.han, l.ngay_tham_chieu, l.ai_ma, l.ai_email, l.loi_ma, l.trang_thai,
              l.giai_trinh_id, l.created_at, i.part_code, i.part_name, i.warehouse kho, i.supplier doi_tac, i.line_status,
              e.eo_code, e.approval_code, e.created_by nguoi_dat
       FROM tl_loi l JOIN eo_item i ON i.id = l.eo_item_id JOIN eo e ON e.id = l.eo_id ORDER BY l.id`,
    ).all<any>(),
    db.prepare(
      `SELECT id, substr(noi_dung, 1, 400) noi_dung, pham_vi, created_by, created_at, hinh_anh IS NOT NULL AND hinh_anh <> '[]' co_anh
       FROM tl_giai_trinh WHERE id IN (SELECT giai_trinh_id FROM tl_loi WHERE giai_trinh_id IS NOT NULL)`,
    ).all<any>(),
    db.prepare("SELECT eo_item_id, COUNT(*) n, SUM(kenh = 'TAY') tay, MAX(created_at) moi FROM tl_nhac_nho GROUP BY eo_item_id").all<any>(),
    layDongTheoDoi(c.env, "tat_ca"),
  ]);
  const pv = phamVi(u);
  const today = todayVN();
  const gtBy = new Map(gtRs.results.map((g: any) => [g.id, g]));
  const nnBy = new Map(nnRs.results.map((n: any) => [n.eo_item_id, n]));
  const dongBy = new Map(dong.map((d) => [d.item_id, d]));
  // lan thu / so lan cung loai tren 1 dong (theo han)
  const nhomLoai = new Map<string, any[]>();
  for (const l of loiRs.results) {
    const k = `${l.eo_item_id}|${l.quy_tac}`;
    nhomLoai.set(k, [...(nhomLoai.get(k) ?? []), l]);
  }
  for (const ds of nhomLoai.values()) ds.sort((a, b) => String(a.han ?? a.created_at).localeCompare(String(b.han ?? b.created_at)) || a.id - b.id);

  const rows = [];
  for (const l of loiRs.results) {
    const nguoiVp: string | null = l.ai_email || l.nguoi_dat;
    if (!pv.thay({ nguoi_dat: l.nguoi_dat, nguoi_vp: nguoiVp, kho: l.kho })) continue;
    const ds = nhomLoai.get(`${l.eo_item_id}|${l.quy_tac}`)!;
    const soLan = ds.length;
    const lanThu = ds.indexOf(l) + 1;
    const cho = l.trang_thai === "CHO_GIAI_TRINH";
    const gt = l.giai_trinh_id ? gtBy.get(l.giai_trinh_id) : null;
    const moc = (l.han ?? l.created_at) as string;
    const tuoi = cho ? soNgay(moc, today) : gt ? soNgay(moc, gt.created_at) : 0;
    const d = dongBy.get(l.eo_item_id);
    const ceo = !!d && d.ceo_ly_do.length > 0;
    const muc = ceo ? "CEO" : soLan >= 3 || (cho && tuoi >= RAT_LAU_NGAY) ? "CAO" : soLan >= 2 || (cho && tuoi >= QUA_LAU_NGAY) ? "TB" : "THAP";
    const nn = nnBy.get(l.eo_item_id);
    rows.push({
      ...l, nguoi_vp: nguoiVp, cua_toi: nguoiVp === u.email || l.nguoi_dat === u.email,
      so_lan: soLan, lan_thu: lanThu, tuoi_ngay: tuoi, qua_lau: cho && tuoi >= QUA_LAU_NGAY, muc,
      gt_noi_dung: gt?.noi_dung ?? null, gt_luc: gt?.created_at ?? null, gt_boi: gt?.created_by ?? null, gt_pham_vi: gt?.pham_vi ?? null, gt_co_anh: !!gt?.co_anh,
      so_nhac: nn?.n ?? 0, so_nhac_tay: nn?.tay ?? 0, nhac_gan_nhat: nn?.moi ?? null,
      ceo, ceo_ly_do: d?.ceo_ly_do ?? [], so_lan_lui: d?.so_lan_lui ?? 0, tinh_trang: d?.tinh_trang ?? null,
      ngay_du_kien: d?.ngay_du_kien_gan_nhat ?? null, so_luong_dat: d?.so_luong_dat ?? null, sl_ve: d?.sl_nhap_amis ?? null,
    });
  }
  const st = await db.prepare("SELECT danh_gia_luc FROM tl_state WHERE id = 1").first<{ danh_gia_luc: string | null }>();
  return c.json({
    rows, tat_ca: pv.tatCa, quan_ly: xemToanBoTheoDoi(u), co_the_gt: canEditPlan(u), me: u.email, vai_tro: u.vai_tro,
    qua_lau_ngay: QUA_LAU_NGAY, rat_lau_ngay: RAT_LAU_NGAY, danh_gia_luc: st?.danh_gia_luc ?? null,
  });
});

// GET /po/:eoId - du lieu form "Giai trinh ca PO": loi dang cho cua EO + cac dong dang mo (ghi loi moi cho ca PO)
app.get("/po/:eoId", async (c) => {
  const eoId = Number(c.req.param("eoId"));
  const db = c.env.DB;
  const [eo, loi, mo] = await Promise.all([
    db.prepare("SELECT id, eo_code, approval_code, tieu_de, created_by FROM eo WHERE id = ?").bind(eoId).first(),
    db.prepare(
      `SELECT l.id, l.eo_item_id, l.quy_tac, l.han, l.ngay_tham_chieu, l.ai_email, i.part_code, i.part_name
       FROM tl_loi l JOIN eo_item i ON i.id = l.eo_item_id WHERE l.eo_id = ? AND l.trang_thai = 'CHO_GIAI_TRINH' ORDER BY i.id, l.han`,
    ).bind(eoId).all(),
    layDongTheoDoi(c.env, "dang_mo"),
  ]);
  if (!eo) return c.json({ error: "EO_NOT_FOUND" }, 404);
  return c.json({ eo, loi: loi.results, dong_mo: mo.filter((r) => r.eo_id === eoId).map((r) => ({ item_id: r.item_id, part_code: r.part_code, part_name: r.part_name })) });
});

// GET /dong/:itemId/nhac-nho - cac lan nhac nho cua 1 dong (popup chi tiet vi pham)
app.get("/dong/:itemId/nhac-nho", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM tl_nhac_nho WHERE eo_item_id = ? ORDER BY id DESC LIMIT 200").bind(Number(c.req.param("itemId"))).all();
  return c.json(r.results);
});

// POST /nhac-nho { loi_ids: number[], noi_dung? } - quan ly nhac nguoi vi pham giai trinh (chi loi dang cho). 1 thong bao / (nguoi, EO).
app.post("/nhac-nho", async (c) => {
  const u = c.get("user");
  if (!xemToanBoTheoDoi(u)) return c.json({ error: "FORBIDDEN" }, 403);
  const b = (await c.req.json().catch(() => ({}))) as { loi_ids?: number[]; noi_dung?: string };
  const ids = [...new Set((b.loi_ids ?? []).map(Number).filter((x) => x > 0))];
  if (!ids.length || ids.length > 2000) return c.json({ error: "BAD_INPUT" }, 400);
  const loiNhan = (b.noi_dung ?? "").trim().slice(0, 500);
  const now = nowVN();
  const db = c.env.DB;
  const tenNguoi = u.ho_ten || u.email.split("@")[0];
  const res = await db.batch([
    db.prepare(
      `INSERT INTO tl_nhac_nho (eo_item_id, eo_id, loi_id, den_email, kenh, noi_dung, created_by, created_at)
       SELECT l.eo_item_id, l.eo_id, l.id, COALESCE(l.ai_email, e.created_by), 'TAY', ?, ?, ?
       FROM tl_loi l JOIN eo e ON e.id = l.eo_id WHERE l.id IN (SELECT value FROM json_each(?)) AND l.trang_thai = 'CHO_GIAI_TRINH'`,
    ).bind(loiNhan || null, u.email, now, JSON.stringify(ids)),
    db.prepare(
      `INSERT INTO notification (email, loai, noi_dung, eo_id, created_at)
       SELECT n.email, 'nhac_vi_pham', ? || ' nhắc giải trình ' || COUNT(*) || ' lỗi ở ' || COALESCE(e.approval_code, e.eo_code) || CASE WHEN ? <> '' THEN ': ' || ? ELSE '' END, l.eo_id, ?
       FROM tl_loi l JOIN eo e ON e.id = l.eo_id
       JOIN users n ON n.email = COALESCE(l.ai_email, e.created_by)
       WHERE l.id IN (SELECT value FROM json_each(?)) AND l.trang_thai = 'CHO_GIAI_TRINH' GROUP BY n.email, l.eo_id`,
    ).bind(tenNguoi, loiNhan, loiNhan, now, JSON.stringify(ids)),
  ]);
  const soLoi = res[0].meta.changes ?? 0;
  if (soLoi) {
    await db.prepare(
      `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
       SELECT 'eo', l.eo_id, l.eo_id, 'NHAC_NHO_VI_PHAM', json_object('so_loi', COUNT(*), 'noi_dung', ?), json_object('loi_ids', json_group_array(l.id)), ?, ?
       FROM tl_loi l WHERE l.id IN (SELECT value FROM json_each(?)) AND l.trang_thai = 'CHO_GIAI_TRINH' GROUP BY l.eo_id`,
    ).bind(loiNhan || null, u.email, now, JSON.stringify(ids)).run();
    await bumpVersions(db, ["theo_doi"]);
  }
  return c.json({ ok: true, so_loi: soLoi, so_nguoi: res[1].meta.changes ?? 0 });
});

/**
 * POST /giai-trinh-po { eo_id, quy_tac?: string[], eo_item_ids?: number[], moi?: boolean, ai_ma, ai_email?, loi_ma, noi_dung, hinh_anh }
 * Giai trinh CHUNG cho ca PO (1 EO): 1 noi dung dung cho moi dong linh kien trong PO.
 *  - mac dinh: dong MOI loi dang cho cua PO (loc quy_tac / eo_item_ids neu co). Co loi R1/R4 -> bat buoc anh.
 *  - moi = true: ghi 1 loi tay (TAY) cho moi dong DANG MO cua PO (vd NCC bao tre ca don) - nhu giai trinh khong gan loi o 1 dong.
 * Moi dong 1 ban ghi tl_giai_trinh (pham_vi 'PO', chung khoa nhom) -> lich su tung dong / popup cu doc duoc nhu giai trinh thuong.
 */
app.post("/giai-trinh-po", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  const b = (await c.req.json().catch(() => ({}))) as {
    eo_id?: number; quy_tac?: string[]; eo_item_ids?: number[]; moi?: boolean;
    ai_ma?: string; ai_email?: string; loi_ma?: string; noi_dung?: string; hinh_anh?: unknown[];
  };
  const eoId = Number(b.eo_id);
  const eo = await db.prepare("SELECT id, eo_code, approval_code, created_by FROM eo WHERE id = ?").bind(eoId)
    .first<{ id: number; eo_code: string; approval_code: string | null; created_by: string }>();
  if (!eo) return c.json({ error: "EO_NOT_FOUND" }, 404);
  if (!canEditPlan(u, eo)) return c.json({ error: "READ_ONLY" }, 403);
  const noiDung = (b.noi_dung ?? "").trim();
  if (!b.ai_ma || !b.loi_ma || !noiDung) return c.json({ error: "MISSING_FIELDS" }, 400);
  const dm = await db.prepare("SELECT loai FROM tl_danh_muc WHERE (loai = 'AI' AND ma = ?) OR (loai = 'LOI' AND ma = ?)").bind(b.ai_ma, b.loi_ma).all();
  if (dm.results.length < 2) return c.json({ error: "BAD_CATALOG" }, 400);
  const hinh = JSON.stringify((Array.isArray(b.hinh_anh) ? b.hinh_anh : []).filter((x: any) => x && x.url).slice(0, 10));
  const aiEmail = b.ai_email?.trim() || null;
  const quyTac = JSON.stringify((b.quy_tac ?? []).filter((x) => ["R1", "R3", "R4"].includes(x)));
  const chiDong = JSON.stringify((b.eo_item_ids ?? []).map(Number).filter((x) => x > 0));
  const now = nowVN();
  const nhom = `PO:${eoId}:${crypto.randomUUID().slice(0, 8)}`;
  const gtCols = "eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, hinh_anh, created_by, created_at, pham_vi, nhom";

  if (b.moi) {
    const mo = (await layDongTheoDoi(c.env, "dang_mo")).filter((r) => r.eo_id === eoId).map((r) => r.item_id);
    const chon = JSON.parse(chiDong) as number[];
    const ids = chon.length ? mo.filter((x) => chon.includes(x)) : mo;
    if (!ids.length) return c.json({ error: "KHONG_CO_DONG" }, 400);
    await db.batch([
      db.prepare(`INSERT INTO tl_giai_trinh (${gtCols}) SELECT value, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'PO', ? FROM json_each(?)`)
        .bind(eoId, b.ai_ma, aiEmail, b.loi_ma, noiDung, hinh, u.email, now, nhom, JSON.stringify(ids)),
      db.prepare(
        `INSERT INTO tl_loi (eo_item_id, eo_id, quy_tac, khoa, han, ai_ma, ai_email, loi_ma, trang_thai, giai_trinh_id, created_at)
         SELECT g.eo_item_id, g.eo_id, 'TAY', 'TAY:' || g.eo_item_id || ':' || g.id, ?, g.ai_ma, g.ai_email, g.loi_ma, 'DA_GIAI_TRINH', g.id, ?
         FROM tl_giai_trinh g WHERE g.nhom = ?`,
      ).bind(now, now, nhom),
      eventStmt(db, { entity_type: "eo", entity_id: eoId, eo_id: eoId, event_type: "GIAI_TRINH_THEO_DOI", user_email: u.email, at: now,
        after: { ai_ma: b.ai_ma, ai_email: aiEmail, loi_ma: b.loi_ma, noi_dung: noiDung, pham_vi: "PO", so_dong: ids.length },
        metadata: { quy_tac: "TAY", nhom, eo_item_ids: ids } }),
    ]);
    await bumpVersions(db, ["theo_doi"]);
    return c.json({ ok: true, so_dong: ids.length, so_loi: ids.length });
  }

  const loc = `l.eo_id = ?1 AND l.trang_thai = 'CHO_GIAI_TRINH'
    AND (?2 = '[]' OR l.quy_tac IN (SELECT value FROM json_each(?2)))
    AND (?3 = '[]' OR l.eo_item_id IN (SELECT value FROM json_each(?3)))`;
  const dem = await db.prepare(`SELECT COUNT(*) n, SUM(l.quy_tac IN ('R1', 'R4')) can_anh FROM tl_loi l WHERE ${loc}`)
    .bind(eoId, quyTac, chiDong).first<{ n: number; can_anh: number }>();
  if (!dem?.n) return c.json({ error: "KHONG_CO_LOI" }, 400);
  if ((dem.can_anh ?? 0) > 0 && hinh === "[]") return c.json({ error: "CAN_HINH_ANH" }, 400);
  const res = await db.batch([
    db.prepare(
      `INSERT INTO tl_giai_trinh (${gtCols})
       SELECT l.eo_item_id, l.eo_id, MIN(l.id), ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'PO', ?11 FROM tl_loi l WHERE ${loc} GROUP BY l.eo_item_id`,
    ).bind(eoId, quyTac, chiDong, b.ai_ma, aiEmail, b.loi_ma, noiDung, hinh, u.email, now, nhom),
    // chi dong loi cua dong da co ban ghi giai trinh trong nhom (loi moi ghi chen giua 2 lenh van cho giai trinh)
    db.prepare(
      `UPDATE tl_loi AS l SET trang_thai = 'DA_GIAI_TRINH', ai_ma = ?4, ai_email = ?5, loi_ma = ?6,
         giai_trinh_id = (SELECT g.id FROM tl_giai_trinh g WHERE g.nhom = ?7 AND g.eo_item_id = l.eo_item_id)
       WHERE ${loc} AND l.eo_item_id IN (SELECT g.eo_item_id FROM tl_giai_trinh g WHERE g.nhom = ?7)`,
    ).bind(eoId, quyTac, chiDong, b.ai_ma, aiEmail, b.loi_ma, nhom),
    eventStmt(db, { entity_type: "eo", entity_id: eoId, eo_id: eoId, event_type: "GIAI_TRINH_THEO_DOI", user_email: u.email, at: now,
      after: { ai_ma: b.ai_ma, ai_email: aiEmail, loi_ma: b.loi_ma, noi_dung: noiDung, pham_vi: "PO", so_loi: dem.n },
      metadata: { quy_tac: JSON.parse(quyTac), nhom } }),
  ]);
  await bumpVersions(db, ["theo_doi"]);
  return c.json({ ok: true, so_dong: res[0].meta.changes ?? 0, so_loi: res[1].meta.changes ?? 0 });
});

export default app;
