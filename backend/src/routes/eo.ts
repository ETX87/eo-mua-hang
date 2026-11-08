import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { canCreateEo, canManageEo, canSuaThongTinDong } from "../lib/eoAccess";
import { uploadPublicFile } from "../lib/googleDrive";
import { notifyStmt } from "../lib/notify";
import { recomputeMatch } from "../lib/amisMatch";
import { cachedReport } from "../lib/reportCache";
import { layBoChuan, chuanHoaDong } from "../lib/chuanHoa";

/** Doi tac / ly do PS khong nam trong danh muc chuan (migration 0020) -> 400 kem gia tri sai de FE bao ro. */
const loiChuan = (loi: { loai: string; gia_tri: string }[]) => ({ error: "GIA_TRI_KHONG_CHUAN", loi });

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** So luong hop le: so huu han, >= 0. */
const validQty = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** Chi sua dong khi EO dang DRAFT (soan / bi yeu cau cap nhat) hoac ISSUED (sua SL sau ban hanh) - WORKFLOW_SPEC §6, §8. */
const ITEM_EDITABLE_STATES = ["DRAFT", "ISSUED"];

// ------------------------------------------------------------------ Danh sach EO (man Quan ly EO)
// v0.062 (2026-11-07): bang kieu Excel - loc tung cot + sap xep phia SERVER. Toan bo EO (it cot, gom san ma LK / kho / NCC / ly do)
// dung 1 lan vao cache theo version eo/amis; moi request loc / sap / phan trang trong JS (tim KHONG DAU duoc - SQLite LIKE khong bo dau).
// Phan rieng tung nguoi (phieu cho toi duyet) doc truc tiep (chi muc idx_approval_user_pending).
interface DongEo {
  id: number; eo_code: string; approval_code: string | null; tieu_de: string | null; loai_hinh: string | null; phong_ban: string | null;
  trang_thai: string; final_approver_email: string | null; created_by: string; created_at: string; issued_at: string | null;
  so_dong: number; tong_sl: number; so_dong_sau_bh: number; so_dong_cho_duyet: number; sl_ve: number; so_dong_chua_du: number;
  /** DONE (2026-11-08): da ban hanh, co dong song va moi dong song ve >= SL dat (ket thuc som = SL dat ve SL da ve) */
  xong: boolean;
  ma_lk: string | null; lk: string; kho: string[]; ncc: string[]; ly_do: string[];
}
const boDau = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
const tachDs = (s: string | null) => [...new Set(String(s ?? "").split("\u001f").map((x) => x.trim()).filter(Boolean))];

async function dsEo(env: Env): Promise<DongEo[]> {
  const rs = await env.DB.prepare(
    `WITH ve AS (SELECT matched_eo_item_id id, SUM(qty_in) q FROM amis_receipt WHERE match_status = 'MATCHED_EO' AND matched_eo_item_id IS NOT NULL GROUP BY matched_eo_item_id),
     it AS (
       SELECT i.eo_id, COUNT(*) so_dong, COALESCE(SUM(i.current_qty), 0) tong_sl,
              SUM(i.created_after_issue = 1) so_dong_sau_bh, SUM(i.post_issue_status = 'PENDING') so_dong_cho_duyet,
              SUM(CASE WHEN i.line_status = 'ACTIVE' THEN MIN(i.current_qty, COALESCE(ve.q, 0)) ELSE 0 END) sl_ve,
              SUM(CASE WHEN i.line_status = 'ACTIVE' AND i.current_qty > COALESCE(ve.q, 0) THEN 1 ELSE 0 END) so_dong_chua_du,
              SUM(i.line_status = 'ACTIVE') so_dong_song,
              GROUP_CONCAT(CASE WHEN i.line_status = 'ACTIVE' THEN i.part_code END, char(31)) lk_song,
              GROUP_CONCAT(i.part_code || ' ' || COALESCE(i.part_code_goc, '') || ' ' || COALESCE(i.part_name, ''), char(31)) lk,
              GROUP_CONCAT(i.warehouse, char(31)) kho, GROUP_CONCAT(i.supplier, char(31)) ncc, GROUP_CONCAT(i.reason, char(31)) ly_do
       FROM eo_item i LEFT JOIN ve ON ve.id = i.id GROUP BY i.eo_id)
     SELECT e.id, e.eo_code, e.approval_code, e.tieu_de, e.loai_hinh, e.phong_ban, e.trang_thai, e.final_approver_email,
            e.created_by, e.created_at, e.issued_at, it.*
     FROM eo e LEFT JOIN it ON it.eo_id = e.id ORDER BY e.created_at DESC, e.id DESC`,
  ).all<any>();
  return rs.results.map((r) => {
    const song = tachDs(r.lk_song);
    return {
      id: r.id, eo_code: r.eo_code, approval_code: r.approval_code, tieu_de: r.tieu_de, loai_hinh: r.loai_hinh, phong_ban: r.phong_ban,
      trang_thai: r.trang_thai, final_approver_email: r.final_approver_email, created_by: r.created_by, created_at: r.created_at, issued_at: r.issued_at,
      so_dong: r.so_dong ?? 0, tong_sl: r.tong_sl ?? 0, so_dong_sau_bh: r.so_dong_sau_bh ?? 0, so_dong_cho_duyet: r.so_dong_cho_duyet ?? 0,
      sl_ve: r.sl_ve ?? 0, so_dong_chua_du: r.so_dong_chua_du ?? 0,
      xong: r.trang_thai === "ISSUED" && (r.so_dong_song ?? 0) > 0 && (r.so_dong_chua_du ?? 0) === 0,
      ma_lk: song.length ? song.slice(0, 4).join(", ") : null, lk: tachDs(r.lk).join(" "),
      kho: tachDs(r.kho), ncc: tachDs(r.ncc), ly_do: tachDs(r.ly_do),
    };
  });
}

/** EO con ton = chua ket thuc: khong huy / tu choi, va (chua ban hanh hoac con dong chua ve du). Nhom mac dinh khi vao man. */
const conTon = (r: DongEo) => !["CANCELLED", "REJECTED"].includes(r.trang_thai) && (r.trang_thai !== "ISSUED" || r.so_dong_chua_du > 0);
type NguCanh = { email: string; phieu: Map<number, { id: number; buoc: string }> };
const CHIP_EO: Record<string, (r: DongEo, n: NguCanh) => boolean> = {
  con_ton: (r) => conTon(r),
  cho_toi_duyet: (r, n) => n.phieu.has(r.id) || (r.trang_thai === "ISSUED" && r.final_approver_email === n.email && r.so_dong_cho_duyet > 0),
  nhap_cua_toi: (r, n) => r.trang_thai === "DRAFT" && r.created_by === n.email,
  dang_tham_dinh: (r) => r.trang_thai === "IN_REVIEW",
  cho_duyet_cuoi: (r) => r.trang_thai === "WAITING_FINAL_APPROVAL",
  da_ban_hanh: (r) => r.trang_thai === "ISSUED" && !r.xong,
  done: (r) => r.xong,
  sau_bh_cho: (r) => r.trang_thai === "ISSUED" && r.so_dong_cho_duyet > 0,
  tu_choi_huy: (r) => ["REJECTED", "CANCELLED"].includes(r.trang_thai),
};
const pct = (r: DongEo) => (r.trang_thai === "ISSUED" && r.tong_sl ? Math.round((r.sl_ve / r.tong_sl) * 100) : null);
const tonTt = (r: DongEo) => r.trang_thai === "ISSUED" ? (r.so_dong_chua_du > 0 ? "Còn dòng chưa về đủ" : "Đã về đủ")
  : ["IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(r.trang_thai) ? "Chờ duyệt" : "";
/** Cot loc / sap cua bang (key khop FE pages/eo/EoListInner): kieu + gia tri tho. */
const COT_EO: Record<string, { kieu: "chu" | "chon" | "ngay" | "so"; gt: (r: DongEo) => unknown; sap?: (r: DongEo) => unknown }> = {
  eo_code: { kieu: "chu", gt: (r) => `${r.eo_code} ${r.approval_code ?? ""}`, sap: (r) => r.eo_code },
  tieu_de: { kieu: "chu", gt: (r) => r.tieu_de },
  loai_hinh: { kieu: "chon", gt: (r) => r.loai_hinh },
  phong_ban: { kieu: "chon", gt: (r) => r.phong_ban },
  ma_lk: { kieu: "chu", gt: (r) => r.lk, sap: (r) => r.ma_lk },
  trang_thai: { kieu: "chon", gt: (r) => (r.xong ? "DONE" : r.trang_thai) },
  ton: { kieu: "chon", gt: tonTt, sap: (r) => (tonTt(r) === "Còn dòng chưa về đủ" ? r.issued_at : tonTt(r) === "Chờ duyệt" ? r.created_at : null) },
  created_by: { kieu: "chon", gt: (r) => r.created_by },
  created_at: { kieu: "ngay", gt: (r) => r.created_at },
  so_dong: { kieu: "so", gt: (r) => r.so_dong },
  issued: { kieu: "ngay", gt: (r) => r.issued_at },
  pct: { kieu: "so", gt: pct },
  final: { kieu: "chon", gt: (r) => r.final_approver_email },
};
interface GtLoc { q?: string; chon?: string[]; tu?: string; den?: string }
function khop(kieu: string, v: unknown, g: GtLoc): boolean {
  if (kieu === "chu") { const h = boDau(v); return boDau(g.q).split(/\s+/).filter(Boolean).every((t) => h.includes(t)); }
  if (kieu === "chon") return !g.chon?.length || g.chon.includes(String(v ?? ""));
  if (kieu === "ngay") { const d = String(v ?? "").slice(0, 10); return !!d && (!g.tu || d >= g.tu) && (!g.den || d <= g.den); }
  const n = v == null ? NaN : Number(v);
  return !Number.isNaN(n) && (!g.tu || n >= Number(g.tu)) && (!g.den || n <= Number(g.den));
}
const coLoc = (g?: GtLoc) => !!g && (!!g.q?.trim() || (g.chon?.length ?? 0) > 0 || !!g.tu || !!g.den);

async function nguCanh(c: any): Promise<NguCanh> {
  const email = c.get("user").email as string;
  const rs = await c.env.DB.prepare(
    `SELECT s.eo_id, a.id, a.step_type FROM eo_approval a JOIN eo_submission s ON s.id = a.submission_id
     WHERE a.approver_email = ? AND a.status = 'PENDING' AND s.status = 'PENDING'`,
  ).bind(email).all();
  return { email, phieu: new Map(rs.results.map((r: any) => [r.eo_id, { id: r.id, buoc: r.step_type }])) };
}

// ------------------------------------------------------------------ GET /dem (so dem tren tung chip)
app.get("/dem", async (c) => {
  const [ds, n] = await Promise.all([cachedReport(c.env.DB, "eo:ds-v2", ["eo", "amis"], () => dsEo(c.env)), nguCanh(c)]);
  const out: Record<string, number> = { tat_ca: ds.length };
  for (const [k, f] of Object.entries(CHIP_EO)) out[k] = ds.filter((r) => f(r, n)).length;
  return c.json(out);
});

// ------------------------------------------------------------------ GET / (list)
// ?chip= &q= (tim khong dau: ma EO / 3TDO / tieu de / ma - ten LK) &kho= &doi_tac= &ly_do= (bo loc it dung)
// &loc={"cot":{q|chon|tu|den}} (loc tung cot) &sap=cot:asc|desc &limit &offset
app.get("/", async (c) => {
  const url = new URL(c.req.url);
  const g = (k: string) => (url.searchParams.get(k) ?? "").trim();
  const limit = Math.min(Math.max(1, Number(g("limit") || 50) || 50), 500);
  const offset = Math.max(0, Number(g("offset") || 0) || 0);
  let loc: Record<string, GtLoc> = {};
  try { loc = JSON.parse(g("loc") || "{}"); } catch { /* bo qua */ }
  const [ds, n] = await Promise.all([cachedReport(c.env.DB, "eo:ds-v2", ["eo", "amis"], () => dsEo(c.env)), nguCanh(c)]);

  const chip = CHIP_EO[g("chip")];
  const tu = boDau(g("q")).split(/\s+/).filter(Boolean);
  const kho = g("kho"), doiTac = boDau(g("doi_tac")), lyDo = boDau(g("ly_do"));
  // tap truoc loc cot (dem "x / y", gia tri cho bo loc "chon")
  const goc = ds.filter((r) => (!chip || chip(r, n))
    && (!tu.length || ((h) => tu.every((t) => h.includes(t)))(boDau(`${r.eo_code} ${r.approval_code ?? ""} ${r.tieu_de ?? ""} ${r.lk}`)))
    && (!kho || r.kho.includes(kho))
    && (!doiTac || r.ncc.some((x) => boDau(x) === doiTac))
    && (!lyDo || r.ly_do.some((x) => boDau(x) === lyDo)));
  const cotLoc = Object.entries(loc).filter(([k, v]) => COT_EO[k] && coLoc(v));
  let rows = cotLoc.length ? goc.filter((r) => cotLoc.every(([k, v]) => khop(COT_EO[k].kieu, COT_EO[k].gt(r), v))) : goc;
  const [sk, sh] = g("sap").split(":");
  const cs = COT_EO[sk];
  if (cs) {
    const f = cs.sap ?? cs.gt;
    rows = [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null || x === "" || y == null || y === "") return (x == null || x === "" ? 1 : 0) - (y == null || y === "" ? 1 : 0);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "vi", { numeric: true });
      return sh === "desc" ? -d : d;
    });
  }
  // gia tri cho bo loc "chon" (tu tap truoc loc cot)
  const tuyChon: Record<string, string[]> = {};
  for (const [k, cot] of Object.entries(COT_EO)) {
    if (cot.kieu !== "chon") continue;
    tuyChon[k] = [...new Set(goc.map((r) => String(cot.gt(r) ?? "")))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "vi")));
  }
  const trang = rows.slice(offset, offset + limit).map(({ lk, kho: _k, ncc: _n, ly_do: _l, ...r }) => {
    const p = n.phieu.get(r.id);
    return { ...r, phieu_cho_toi_id: p?.id ?? null, phieu_cho_toi_buoc: p?.buoc ?? null };
  });
  return c.json({ rows: trang, total: rows.length, tong_truoc_loc: goc.length, tuy_chon: tuyChon, limit, offset });
});

// ------------------------------------------------------------------ GET /:id (detail)
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT * FROM eo WHERE id = ?").bind(id).first();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);

  const [items, subs, apprs, plans, files, comments, events] = await Promise.all([
    c.env.DB.prepare(
      `SELECT i.*,
              CASE WHEN i.line_status = 'CANCELLED_LINE' THEN 0 ELSE
                COALESCE((SELECT SUM(qty_in) FROM amis_receipt r WHERE r.match_status='MATCHED_EO' AND r.matched_eo_item_id = i.id), 0) END da_dat,
              COALESCE(i.don_gia_du_kien, 0) * i.current_qty thanh_tien_du_kien
       FROM eo_item i WHERE i.eo_id = ? ORDER BY i.id`,
    ).bind(id).all(),
    c.env.DB.prepare("SELECT * FROM eo_submission WHERE eo_id = ? ORDER BY version").bind(id).all(),
    c.env.DB.prepare(
      `SELECT a.* FROM eo_approval a JOIN eo_submission s ON s.id = a.submission_id
       WHERE s.eo_id = ? ORDER BY a.submission_id, a.step_no, a.id`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT p.* FROM item_plan p JOIN eo_item i ON i.id = p.eo_item_id
       WHERE i.eo_id = ? AND p.deleted_at IS NULL ORDER BY p.eo_item_id, p.planned_date`,
    ).bind(id).all(),
    c.env.DB.prepare("SELECT * FROM eo_file WHERE eo_id = ? AND deleted_at IS NULL ORDER BY id").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM eo_comment WHERE eo_id = ? ORDER BY created_at").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM event_log WHERE eo_id = ? ORDER BY created_at, id").bind(id).all(),
  ]);

  const it = items.results as any[];
  const tong = {
    so_dong: it.length,
    tong_sl_dat: round3(it.reduce((s, r) => s + (r.current_qty || 0), 0)),
    sl_da_dat: round3(it.reduce((s, r) => s + (r.da_dat || 0), 0)),
    sl_chua_dat: round3(it.reduce((s, r) => s + Math.max(0, (r.current_qty || 0) - (r.da_dat || 0)), 0)),
    tong_tien_du_kien: round3(it.reduce((s, r) => s + (r.thanh_tien_du_kien || 0), 0)),
  };
  return c.json({
    eo,
    items: it.map((r) => ({ ...r, chua_dat: Math.max(0, (r.current_qty || 0) - (r.da_dat || 0)) })),
    tong,
    submissions: subs.results,
    approvals: apprs.results,
    plans: plans.results,
    files: files.results,
    comments: comments.results,
    events: events.results,
  });
});

// ------------------------------------------------------------------ POST / (create draft)
interface CreateBody {
  tieu_de?: string;
  noi_dung?: string;
  loai_hinh?: string;
  phong_ban?: string;
  final_approver_email: string;
  reviewers?: string[];
  skip_review?: boolean;
  /** 'excel' khi dong linh kien duoc import tu file mau (ghi vao lich su). */
  nguon_dong?: string;
  /** id EO nguon khi tao bang nut "Copy EO" (chi chep thong tin phieu, khong chep dong) - ghi vao lich su. */
  copy_tu_eo_id?: number;
  items: Array<{
    part_code: string; part_name?: string; warehouse: string; supplier?: string;
    current_qty: number; reason?: string; crm_id?: string; order_id?: string; ghi_chu?: string;
    don_gia_du_kien?: number;
  }>;
}

app.post("/", async (c) => {
  const u = c.get("user");
  if (!canCreateEo(u)) return c.json({ error: "FORBIDDEN" }, 403);
  const b = (await c.req.json()) as CreateBody;
  if (!b.items?.length) return c.json({ error: "EO_MUST_HAVE_ITEM" }, 400);
  if (!b.final_approver_email) return c.json({ error: "FINAL_APPROVER_REQUIRED" }, 400);
  if (b.items.some((it) => !it.part_code?.trim() || !it.warehouse || !validQty(it.current_qty))) {
    return c.json({ error: "BAD_ITEM" }, 400);
  }
  { const loi = chuanHoaDong(await layBoChuan(c.env.DB), b.items); if (loi.length) return c.json(loiChuan(loi), 400); }

  const copyTu = Number(b.copy_tu_eo_id) > 0
    ? await c.env.DB.prepare("SELECT id, eo_code, approval_code FROM eo WHERE id = ?").bind(Number(b.copy_tu_eo_id))
        .first<{ id: number; eo_code: string; approval_code: string | null }>()
    : null;

  const now = nowVN();
  const seq = await c.env.DB.prepare(
    "UPDATE id_counters SET gia_tri_hien_tai = gia_tri_hien_tai + 1 WHERE ten_bang = 'eo_code' RETURNING gia_tri_hien_tai",
  ).first<{ gia_tri_hien_tai: number }>();
  // tien to 'MH-' tu 2026-11-04 (truoc do 'EO-' - ma da cap giu nguyen, cung bo dem eo_code)
  const eoCode = `MH-${String(seq?.gia_tri_hien_tai ?? 1).padStart(6, "0")}`;

  const ins = await c.env.DB.prepare(
    `INSERT INTO eo (eo_code, tieu_de, noi_dung, loai_hinh, phong_ban, trang_thai, final_approver_email, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?) RETURNING id`,
  ).bind(eoCode, b.tieu_de ?? "", b.noi_dung ?? "", b.loai_hinh ?? null, b.phong_ban ?? null, b.final_approver_email.trim().toLowerCase(), u.email, now).first<{ id: number }>();
  const eoId = ins!.id;

  const batch = b.items.map((it) =>
    c.env.DB.prepare(
      `INSERT INTO eo_item (eo_id, part_code, part_name, warehouse, supplier, original_qty, current_qty,
        reason, crm_id, order_id, ghi_chu, line_status, don_gia_du_kien, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(eoId, it.part_code.trim(), it.part_name ?? "", it.warehouse, it.supplier ?? null,
      it.current_qty, it.current_qty, it.reason ?? null, it.crm_id ?? null, it.order_id ?? null,
      it.ghi_chu ?? null, it.current_qty === 0 ? "CANCELLED_LINE" : "ACTIVE",
      it.don_gia_du_kien ?? null, u.email, now),
  );
  batch.push(eventStmt(c.env.DB, { entity_type: "eo", entity_id: eoId, eo_id: eoId, event_type: "CREATE_EO", user_email: u.email, at: now, metadata: { eo_code: eoCode, reviewers: b.reviewers ?? [], skip_review: !!b.skip_review, so_dong: b.items.length, nguon_dong: b.nguon_dong ?? null, copy_tu: copyTu ?? null } }));
  await c.env.DB.batch(batch);
  await bumpVersions(c.env.DB, ["eo"]);

  // luu tam reviewer/skip_review vao app_settings-like? -> giu trong 1 dong draft submission chua tao.
  // Reviewer/skip_review truyen lai luc /submit. Tra ve id.
  return c.json({ id: eoId, eo_code: eoCode });
});

// ------------------------------------------------------------------ PATCH /:id (edit draft)
app.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT * FROM eo WHERE id = ?").bind(id).first<{ id: number; trang_thai: string; created_by: string }>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);
  if (!canManageEo(c.get("user"), eo)) return c.json({ error: "FORBIDDEN" }, 403);
  if (eo.trang_thai !== "DRAFT") return c.json({ error: "ONLY_DRAFT_EDITABLE" }, 409);

  const b = (await c.req.json()) as Record<string, unknown>;
  const fields = ["tieu_de", "noi_dung", "loai_hinh", "phong_ban", "final_approver_email"] as const;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) if (f in b) { sets.push(`${f} = ?`); vals.push(b[f]); }
  if (!sets.length) return c.json({ error: "NO_FIELDS" }, 400);
  const now = nowVN();
  sets.push("updated_by = ?", "updated_at = ?");
  vals.push(c.get("user").email, now, id);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE eo SET ${sets.join(", ")} WHERE id = ?`).bind(...vals),
    eventStmt(c.env.DB, { entity_type: "eo", entity_id: id, eo_id: id, event_type: "UPDATE_EO", user_email: c.get("user").email, at: now, after: b }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ POST /:id/items (add item)
app.post("/:id/items", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT * FROM eo WHERE id = ?").bind(id).first<{ id: number; eo_code: string; approval_code: string | null; trang_thai: string; created_by: string; final_approver_email: string | null }>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);
  if (!canManageEo(c.get("user"), eo)) return c.json({ error: "FORBIDDEN" }, 403);
  if (!["DRAFT", "ISSUED"].includes(eo.trang_thai)) return c.json({ error: "BAD_STATE" }, 409);

  const body = (await c.req.json()) as any;

  // Them nhieu dong 1 lan (import Excel o form Sua EO) - chi khi DRAFT, 1 batch.
  if (Array.isArray(body?.items)) {
    if (eo.trang_thai !== "DRAFT") return c.json({ error: "BULK_ONLY_DRAFT" }, 409);
    const list = body.items as CreateBody["items"];
    if (!list.length || list.length > 2000) return c.json({ error: "BAD_ITEMS" }, 400);
    if (list.some((x) => !x.part_code?.trim() || !x.warehouse || !validQty(x.current_qty))) return c.json({ error: "BAD_ITEM" }, 400);
    { const loi = chuanHoaDong(await layBoChuan(c.env.DB), list); if (loi.length) return c.json(loiChuan(loi), 400); }
    const now = nowVN();
    const email = c.get("user").email;
    const stmts = list.map((x) =>
      c.env.DB.prepare(
        `INSERT INTO eo_item (eo_id, part_code, part_name, warehouse, supplier, original_qty, current_qty,
          reason, crm_id, order_id, ghi_chu, line_status, don_gia_du_kien, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, x.part_code.trim(), x.part_name ?? "", x.warehouse, x.supplier ?? null, x.current_qty, x.current_qty,
        x.reason ?? null, x.crm_id ?? null, x.order_id ?? null, x.ghi_chu ?? null,
        x.current_qty === 0 ? "CANCELLED_LINE" : "ACTIVE", x.don_gia_du_kien ?? null, email, now),
    );
    stmts.push(eventStmt(c.env.DB, { entity_type: "eo", entity_id: id, eo_id: id, event_type: "IMPORT_ITEMS", user_email: email, at: now,
      after: list.map((x) => ({ part_code: x.part_code.trim(), warehouse: x.warehouse, qty: x.current_qty })), metadata: { so_dong: list.length } }));
    await c.env.DB.batch(stmts);
    await bumpVersions(c.env.DB, ["eo"]);
    return c.json({ ok: true, so_dong: list.length });
  }

  const it = body as {
    part_code: string; part_name?: string; warehouse: string; supplier?: string;
    current_qty: number; reason?: string; crm_id?: string; order_id?: string; ghi_chu?: string;
  };
  if (!it.part_code?.trim() || !it.warehouse) return c.json({ error: "PART_AND_WAREHOUSE_REQUIRED" }, 400);
  if (!validQty(it.current_qty)) return c.json({ error: "BAD_QTY" }, 400);
  { const loi = chuanHoaDong(await layBoChuan(c.env.DB), [it]); if (loi.length) return c.json(loiChuan(loi), 400); }
  const now = nowVN();
  const afterIssue = eo.trang_thai === "ISSUED";
  // nguoi them chinh la nguoi duyet cuoi cua EO -> tu duyet luon (khong can cho chinh minh duyet)
  const tuDuyet = afterIssue && !!eo.final_approver_email && eo.final_approver_email === c.get("user").email;
  const ins = await c.env.DB.prepare(
    `INSERT INTO eo_item (eo_id, part_code, part_name, warehouse, supplier, original_qty, current_qty,
      reason, crm_id, order_id, ghi_chu, line_status, post_issue_status, post_issue_approved_by, post_issue_approved_at,
      created_by, created_at, created_after_issue)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(id, it.part_code.trim(), it.part_name ?? "", it.warehouse, it.supplier ?? null, it.current_qty, it.current_qty,
    it.reason ?? null, it.crm_id ?? null, it.order_id ?? null, it.ghi_chu ?? null,
    it.current_qty === 0 ? "CANCELLED_LINE" : "ACTIVE", afterIssue ? (tuDuyet ? "APPROVED" : "PENDING") : null,
    tuDuyet ? c.get("user").email : null, tuDuyet ? now : null,
    c.get("user").email, now, afterIssue ? 1 : 0).first<{ id: number }>();

  const stmts = [
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: ins!.id, eo_id: id, event_type: "ADD_ITEM", user_email: c.get("user").email, at: now, after: it, metadata: { after_issue: afterIssue } }),
  ];
  if (tuDuyet) {
    stmts.push(eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: ins!.id, eo_id: id, event_type: "APPROVE_POST_ISSUE_ITEM", user_email: c.get("user").email, at: now, metadata: { ly_do: "Tự duyệt — người thêm là người duyệt mua của EO" } }));
  }
  if (afterIssue && eo.final_approver_email && eo.final_approver_email !== c.get("user").email) {
    stmts.push(notifyStmt(c.env.DB, { email: eo.final_approver_email, loai: "post_issue_pending", noi_dung: `EO ${eo.eo_code}: dòng ${it.part_code} thêm sau ban hành đang chờ bạn duyệt`, eo_id: id, at: now }));
  }
  await c.env.DB.batch(stmts);
  // dong moi sau ban hanh: AMIS da ve cho (kho; ma hang; 3TDO) nay dang CODE_ONLY_NO_LINE -> khop lai
  if (afterIssue && eo.approval_code) await recomputeMatch(c.env.DB, [eo.approval_code]);
  await bumpVersions(c.env.DB, afterIssue ? ["eo", "amis"] : ["eo"]);
  return c.json({ id: ins!.id, post_issue_status: afterIssue ? (tuDuyet ? "APPROVED" : "PENDING") : null });
});

/**
 * Giam tong ke hoach song cua 1 dong di `du`: giam / xoa mem cac dot tu dot XA NHAT (co log). Tra ve cac statement de chay chung batch.
 * Dung khi giam SL dat (PATCH cat_ke_hoach) va ket thuc som.
 */
async function catKeHoach(db: D1Database, itemId: number, eoId: number, du: number, u: string, now: string, lyDo: string) {
  const stmts: D1PreparedStatement[] = [];
  const pls = await db.prepare(
    "SELECT id, planned_date, planned_qty, tuan, loai FROM item_plan WHERE eo_item_id = ? AND deleted_at IS NULL ORDER BY planned_date DESC, id DESC",
  ).bind(itemId).all<any>();
  for (const p of pls.results) {
    if (du <= 1e-9) break;
    const meta = { eo_item_id: itemId, plan_id: p.id, ly_do: lyDo };
    if (p.planned_qty <= du + 1e-9) {
      du -= p.planned_qty;
      stmts.push(
        db.prepare("UPDATE item_plan SET deleted_at = ?, deleted_by = ? WHERE id = ?").bind(now, u, p.id),
        eventStmt(db, { entity_type: "eo_item", entity_id: itemId, eo_id: eoId, event_type: "DELETE_PLAN", user_email: u, at: now, before: { planned_date: p.planned_date, planned_qty: p.planned_qty, tuan: p.tuan }, metadata: meta }),
      );
    } else {
      const q = round3(p.planned_qty - du);
      stmts.push(
        db.prepare("UPDATE item_plan SET planned_qty = ?, updated_by = ?, updated_at = ? WHERE id = ?").bind(q, u, now, p.id),
        eventStmt(db, { entity_type: "eo_item", entity_id: itemId, eo_id: eoId, event_type: "UPDATE_PLAN", user_email: u, at: now, before: { planned_date: p.planned_date, planned_qty: p.planned_qty }, after: { planned_date: p.planned_date, planned_qty: q }, metadata: meta }),
      );
      du = 0;
    }
  }
  return stmts;
}

// ------------------------------------------------------------------ PATCH /items/:itemId (qty / fields)
app.patch("/items/:itemId", async (c) => {
  const itemId = Number(c.req.param("itemId"));
  const row = await c.env.DB.prepare(
    `SELECT i.*, e.trang_thai eo_status, e.created_by eo_created_by FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?`,
  ).bind(itemId).first<any>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (!canManageEo(c.get("user"), { created_by: row.eo_created_by })) return c.json({ error: "FORBIDDEN" }, 403);
  if (!ITEM_EDITABLE_STATES.includes(row.eo_status)) return c.json({ error: "BAD_STATE", trang_thai: row.eo_status }, 409);

  // cat_ke_hoach: SL moi < tong ke hoach -> tu giam / xoa cac dot ke hoach tu dot XA NHAT cho vua SL moi (cung batch, co log)
  const b = (await c.req.json()) as { current_qty?: number; reason?: string; part_name?: string; supplier?: string; ghi_chu?: string; crm_id?: string; order_id?: string; don_gia_du_kien?: number; cat_ke_hoach?: boolean };
  const now = nowVN();
  const stmts: any[] = [];

  if (b.current_qty !== undefined && !validQty(b.current_qty)) return c.json({ error: "BAD_QTY" }, 400);
  if (typeof b.current_qty === "number" && b.current_qty !== row.current_qty) {
    if (row.eo_status === "ISSUED" && !b.reason) return c.json({ error: "REASON_REQUIRED" }, 400);
    // rang buoc: current_qty moi >= tong planned_qty song
    const sump = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(planned_qty),0) s FROM item_plan WHERE eo_item_id = ? AND deleted_at IS NULL",
    ).bind(itemId).first<{ s: number }>();
    const du = (sump?.s ?? 0) - b.current_qty;
    if (du > 1e-9 && !b.cat_ke_hoach) return c.json({ error: "QTY_BELOW_PLANNED_SUM", planned_sum: sump?.s }, 409);
    if (du > 1e-9) stmts.push(...(await catKeHoach(c.env.DB, itemId, row.eo_id, du, c.get("user").email, now, "Giảm SL đặt — tự giảm kế hoạch")));
    const newLine = b.current_qty === 0 ? "CANCELLED_LINE" : "ACTIVE";
    stmts.push(
      c.env.DB.prepare("UPDATE eo_item SET current_qty = ?, line_status = ?, updated_by = ?, updated_at = ? WHERE id = ?")
        .bind(b.current_qty, newLine, c.get("user").email, now, itemId),
      eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: b.current_qty === 0 ? "CANCEL_LINE" : "UPDATE_QUANTITY", user_email: c.get("user").email, at: now, before: { qty: row.current_qty }, after: { qty: b.current_qty }, metadata: { reason: b.reason ?? null } }),
    );
  }

  // chi chuan hoa supplier - b.reason o day la ly do doi SL, khong phai ly do PS
  if ("supplier" in b) {
    const x: { supplier?: string | null } = { supplier: b.supplier ?? null };
    const loi = chuanHoaDong(await layBoChuan(c.env.DB), [x]);
    if (loi.length) return c.json(loiChuan(loi), 400);
    (b as any).supplier = x.supplier ?? null;
  }
  const misc = ["part_name", "supplier", "ghi_chu", "crm_id", "order_id", "don_gia_du_kien"] as const;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of misc) if (f in b) { sets.push(`${f} = ?`); vals.push((b as any)[f]); }
  if (sets.length) {
    sets.push("updated_by = ?", "updated_at = ?");
    vals.push(c.get("user").email, now, itemId);
    stmts.push(
      c.env.DB.prepare(`UPDATE eo_item SET ${sets.join(", ")} WHERE id = ?`).bind(...vals),
      eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "UPDATE_ITEM", user_email: c.get("user").email, at: now, after: b }),
    );
  }
  if (!stmts.length) return c.json({ error: "NO_CHANGE" }, 400);
  await c.env.DB.batch(stmts);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ POST /:id/submit
app.post("/:id/submit", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT * FROM eo WHERE id = ?").bind(id).first<any>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);
  if (!canManageEo(c.get("user"), eo)) return c.json({ error: "FORBIDDEN" }, 403);
  if (eo.trang_thai !== "DRAFT") return c.json({ error: "ONLY_DRAFT_SUBMITTABLE" }, 409);

  const nItems = await c.env.DB.prepare("SELECT COUNT(*) n FROM eo_item WHERE eo_id = ?").bind(id).first<{ n: number }>();
  if (!nItems?.n) return c.json({ error: "EO_MUST_HAVE_ITEM" }, 400);
  if (!eo.loai_hinh || !eo.phong_ban || !String(eo.noi_dung ?? "").trim()) {
    return c.json({ error: "MISSING_REQUIRED_FIELDS" }, 400);
  }

  const b = (await c.req.json().catch(() => ({}))) as { reviewers?: string[]; final_approver_email?: string };
  const reviewers = [...new Set((b.reviewers ?? []).map((x) => x.toLowerCase()).filter(Boolean))];
  const finalApprover = (b.final_approver_email ?? eo.final_approver_email)?.toLowerCase();
  if (!finalApprover) return c.json({ error: "FINAL_APPROVER_REQUIRED" }, 400);

  const now = nowVN();
  const prevSub = await c.env.DB.prepare(
    "SELECT * FROM eo_submission WHERE eo_id = ? ORDER BY version DESC LIMIT 1",
  ).bind(id).first<any>();
  const version = (prevSub?.version ?? 0) + 1;
  const skipReview = reviewers.length === 0;

  const subIns = await c.env.DB.prepare(
    `INSERT INTO eo_submission (eo_id, version, skip_review, status, submitted_by, submitted_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?) RETURNING id`,
  ).bind(id, version, skipReview ? 1 : 0, c.get("user").email, now).first<{ id: number }>();
  const subId = subIns!.id;

  // carry-forward: reviewer da APPROVED o submission truoc va van con trong danh sach
  const carried = new Set<string>();
  if (prevSub) {
    const prevApproved = await c.env.DB.prepare(
      "SELECT approver_email FROM eo_approval WHERE submission_id = ? AND step_type = 'REVIEW' AND status = 'APPROVED'",
    ).bind(prevSub.id).all<{ approver_email: string }>();
    for (const r of prevApproved.results) if (reviewers.includes(r.approver_email)) carried.add(r.approver_email);
  }

  const stmts: any[] = [];
  for (const rv of reviewers) {
    const isCarried = carried.has(rv);
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO eo_approval (submission_id, step_type, step_no, approver_email, status, assigned_at, action_at, carried_from_submission_id)
         VALUES (?, 'REVIEW', 1, ?, ?, ?, ?, ?)`,
      ).bind(subId, rv, isCarried ? "APPROVED" : "PENDING", now, isCarried ? now : null, isCarried ? prevSub.id : null),
    );
  }
  // neu skip review -> tao FINAL luon
  let newStatus = "IN_REVIEW";
  if (skipReview) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO eo_approval (submission_id, step_type, step_no, approver_email, status, assigned_at)
         VALUES (?, 'FINAL', 2, ?, 'PENDING', ?)`,
      ).bind(subId, finalApprover, now),
    );
    newStatus = "WAITING_FINAL_APPROVAL";
  } else if (reviewers.length > 0 && carried.size === reviewers.length) {
    // tat ca carry-forward -> mo FINAL ngay
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO eo_approval (submission_id, step_type, step_no, approver_email, status, assigned_at)
         VALUES (?, 'FINAL', 2, ?, 'PENDING', ?)`,
      ).bind(subId, finalApprover, now),
    );
    newStatus = "WAITING_FINAL_APPROVAL";
  }

  if (prevSub && prevSub.status !== "APPROVED") {
    stmts.push(c.env.DB.prepare("UPDATE eo_submission SET status = 'SUPERSEDED', closed_at = ? WHERE id = ?").bind(now, prevSub.id));
  }
  stmts.push(
    c.env.DB.prepare("UPDATE eo SET trang_thai = ?, current_submission_id = ?, final_approver_email = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      .bind(newStatus, subId, finalApprover, c.get("user").email, now, id),
    eventStmt(c.env.DB, { entity_type: "eo_submission", entity_id: subId, eo_id: id, event_type: version === 1 ? "SUBMIT_EO" : "RESUBMIT_EO", user_email: c.get("user").email, at: now, metadata: { version, reviewers, skip_review: skipReview, carried: [...carried] } }),
  );
  await c.env.DB.batch(stmts);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true, submission_id: subId, version, trang_thai: newStatus });
});

// ------------------------------------------------------------------ POST /:id/cancel
app.post("/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT * FROM eo WHERE id = ?").bind(id).first<any>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  const preIssue = ["DRAFT", "IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(eo.trang_thai);
  if (preIssue) {
    if (!canManageEo(u, eo)) return c.json({ error: "FORBIDDEN" }, 403);
  } else if (eo.trang_thai === "ISSUED") {
    if (u.vai_tro !== "Admin") return c.json({ error: "ADMIN_ONLY_AFTER_ISSUE" }, 403);
  } else {
    return c.json({ error: "BAD_STATE" }, 409);
  }
  const b = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE eo SET trang_thai = 'CANCELLED', cancelled_by = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?")
      .bind(u.email, now, b.reason ?? null, id),
    c.env.DB.prepare("UPDATE eo_submission SET status = 'CANCELLED', closed_at = ? WHERE eo_id = ? AND status IN ('PENDING','REQUEST_UPDATE')").bind(now, id),
    eventStmt(c.env.DB, { entity_type: "eo", entity_id: id, eo_id: id, event_type: "CANCEL_EO", user_email: u.email, at: now, metadata: { reason: b.reason ?? null, after_issue: !preIssue } }),
  ]);
  // huy sau ban hanh: dong AMIS chi khop ma (CODE_ONLY_NO_LINE) cua EO nay khong con tinh nua
  if (!preIssue && eo.approval_code) await recomputeMatch(c.env.DB, [eo.approval_code]);
  await bumpVersions(c.env.DB, preIssue ? ["eo"] : ["eo", "amis"]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ POST /:id/recall (rut ve nhap de sua)
// Nguoi tao (canManageEo) sua EO khi CHUA duyet xong: dong lan trinh hien tai (SUPERSEDED) TRUOC moi ghi
// khac bang UPDATE co dieu kien - phieu duyet claim deu kiem tra submission con PENDING (routes/approvals.ts)
// nen nguoi duyet bam cung luc se nhan SUBMISSION_CLOSED. Phieu PENDING -> WITHDRAWN, EO -> DRAFT.
// Trinh lai: nguoi tham dinh da APPROVED o lan nay duoc carry-forward (POST /:id/submit).
app.post("/:id/recall", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT * FROM eo WHERE id = ?").bind(id).first<any>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (!canManageEo(u, eo)) return c.json({ error: "FORBIDDEN" }, 403);
  if (!["IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(eo.trang_thai) || !eo.current_submission_id) return c.json({ error: "BAD_STATE", trang_thai: eo.trang_thai }, 409);
  const b = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const now = nowVN();
  const subId = eo.current_submission_id as number;

  const claim = await c.env.DB.prepare(
    "UPDATE eo_submission SET status = 'SUPERSEDED', closed_at = ?, note = ? WHERE id = ? AND status = 'PENDING'",
  ).bind(now, `Người tạo rút về để sửa${b.reason ? ": " + b.reason : ""}`, subId).run();
  if (!claim.meta.changes) return c.json({ error: "SUBMISSION_CLOSED" }, 409);

  const pending = await c.env.DB.prepare(
    "SELECT approver_email FROM eo_approval WHERE submission_id = ? AND status = 'PENDING'",
  ).bind(subId).all<{ approver_email: string }>();
  const stmts: any[] = [
    c.env.DB.prepare("UPDATE eo_approval SET status = 'WITHDRAWN', action_at = ?, comment = 'Người tạo rút EO về để sửa' WHERE submission_id = ? AND status = 'PENDING'").bind(now, subId),
    c.env.DB.prepare("UPDATE eo SET trang_thai = 'DRAFT', updated_by = ?, updated_at = ? WHERE id = ? AND trang_thai IN ('IN_REVIEW','WAITING_FINAL_APPROVAL')").bind(u.email, now, id),
    eventStmt(c.env.DB, { entity_type: "eo", entity_id: id, eo_id: id, event_type: "RECALL_EO", user_email: u.email, at: now, before: { trang_thai: eo.trang_thai }, after: { trang_thai: "DRAFT" }, metadata: { submission_id: subId, reason: b.reason ?? null } }),
  ];
  for (const p of pending.results) {
    if (p.approver_email !== u.email) {
      stmts.push(notifyStmt(c.env.DB, { email: p.approver_email, loai: "recalled", noi_dung: `EO ${eo.eo_code} đã được người tạo rút về để sửa — không cần duyệt lần trình này`, eo_id: id, at: now }));
    }
  }
  await c.env.DB.batch(stmts);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true, trang_thai: "DRAFT" });
});

// ------------------------------------------------------------------ POST /:id/comments
app.post("/:id/comments", async (c) => {
  const id = Number(c.req.param("id"));
  const b = (await c.req.json()) as { noi_dung: string; submission_id?: number };
  if (!b.noi_dung?.trim()) return c.json({ error: "EMPTY" }, 400);
  if (!(await c.env.DB.prepare("SELECT 1 FROM eo WHERE id = ?").bind(id).first())) return c.json({ error: "NOT_FOUND" }, 404);
  await c.env.DB.prepare(
    "INSERT INTO eo_comment (eo_id, submission_id, user_email, noi_dung, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, b.submission_id ?? null, c.get("user").email, b.noi_dung.trim(), nowVN()).run();
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ POST /:id/files (upload tai lieu dinh kem qua Google Drive)
// Excel / anh / PDF / Word, toi da 20MB. Ghi event_log UPLOAD_FILE (gan lan trinh hien tai neu co) de
// lich su EO the hien tai lieu bo sung luc nao, o giai doan nao (nhap / dang duyet / sau ban hanh).
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = /\.(xlsx|xlsm|xls|csv|png|jpe?g|gif|webp|heic|bmp|pdf|docx?)$/i;
app.post("/:id/files", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT id, trang_thai, current_submission_id FROM eo WHERE id = ?").bind(id).first<{ id: number; trang_thai: string; current_submission_id: number | null }>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);

  const filename = c.req.query("filename")?.trim();
  if (!filename) return c.json({ error: "MISSING_FILENAME" }, 400);
  if (!ALLOWED_EXT.test(filename)) return c.json({ error: "BAD_FILE_TYPE" }, 400);
  const ghiChu = c.req.query("ghi_chu")?.trim() || null;
  const contentType = c.req.header("Content-Type") || "application/octet-stream";
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);
  if (bytes.byteLength > MAX_FILE_BYTES) return c.json({ error: "FILE_TOO_LARGE" }, 413);

  let uploaded: { id: string; url: string };
  try {
    uploaded = await uploadPublicFile(c.env, c.env.DB, bytes, contentType, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    }
    return c.json({ error: "UPLOAD_FAILED", message }, 502);
  }

  const now = nowVN();
  const u = c.get("user");
  const ins = await c.env.DB.prepare(
    `INSERT INTO eo_file (eo_id, submission_id, file_name, drive_file_id, drive_url, file_type, file_size, uploaded_by, uploaded_at, ghi_chu)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(id, eo.current_submission_id, filename, uploaded.id, uploaded.url, contentType, bytes.byteLength, u.email, now, ghiChu).first<{ id: number }>();
  await c.env.DB.batch([
    eventStmt(c.env.DB, { entity_type: "eo_file", entity_id: ins!.id, eo_id: id, event_type: "UPLOAD_FILE", user_email: u.email, at: now, after: { file_name: filename, file_size: bytes.byteLength, ghi_chu: ghiChu }, metadata: { trang_thai_eo: eo.trang_thai, submission_id: eo.current_submission_id } }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json(ins, 201);
});

// ------------------------------------------------------------------ DELETE /:id/files/:fileId (xoa file dinh kem)
// Xoa mem (giu file tren Drive de truy vet), ghi DELETE_FILE vao lich su. Truoc ban hanh: nguoi quan ly EO
// (canManageEo) hoac chinh nguoi tai len; sau ban hanh / huy: chi Admin.
app.delete("/:id/files/:fileId", async (c) => {
  const id = Number(c.req.param("id"));
  const fileId = Number(c.req.param("fileId"));
  const eo = await c.env.DB.prepare("SELECT id, trang_thai, created_by FROM eo WHERE id = ?").bind(id).first<{ id: number; trang_thai: string; created_by: string }>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);
  const f = await c.env.DB.prepare("SELECT * FROM eo_file WHERE id = ? AND eo_id = ? AND deleted_at IS NULL").bind(fileId, id).first<any>();
  if (!f) return c.json({ error: "FILE_NOT_FOUND" }, 404);
  const u = c.get("user");
  const preIssue = ["DRAFT", "IN_REVIEW", "WAITING_FINAL_APPROVAL", "REJECTED"].includes(eo.trang_thai);
  const allowed = u.vai_tro === "Admin" || (preIssue && (canManageEo(u, eo) || f.uploaded_by === u.email));
  if (!allowed) return c.json({ error: preIssue ? "FORBIDDEN" : "ADMIN_ONLY_AFTER_ISSUE" }, 403);
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE eo_file SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL").bind(now, u.email, fileId),
    eventStmt(c.env.DB, { entity_type: "eo_file", entity_id: fileId, eo_id: id, event_type: "DELETE_FILE", user_email: u.email, at: now,
      before: { file_name: f.file_name, file_size: f.file_size, drive_url: f.drive_url }, metadata: { trang_thai_eo: eo.trang_thai } }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ POST /items/:itemId/replace-part
// NCC/KRF giao ma tuong duong (B) thay cho ma da duyet (A): doi ma dang dung cua dong, giu ma goc o
// part_code_goc (chi ghi lan dau - thay tiep B->C van giu A). Doi ve dung ma goc = bo thay the.
// AMIS khop theo ca 2 ma (lib/amisMatch.ts) -> phieu nhap da ve theo ma A van tinh cho dong.
app.post("/items/:itemId/replace-part", async (c) => {
  const itemId = Number(c.req.param("itemId"));
  const row = await c.env.DB.prepare(
    `SELECT i.*, e.trang_thai eo_status, e.created_by eo_created_by, e.approval_code
     FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?`,
  ).bind(itemId).first<any>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (!canManageEo(u, { created_by: row.eo_created_by })) return c.json({ error: "FORBIDDEN" }, 403);
  if (row.eo_status !== "ISSUED") return c.json({ error: "ONLY_ISSUED" }, 409);

  const b = (await c.req.json()) as { part_code?: string; part_name?: string; reason?: string };
  const newCode = b.part_code?.trim() ?? "";
  const reason = b.reason?.trim() ?? "";
  if (!newCode) return c.json({ error: "PART_REQUIRED" }, 400);
  if (!reason) return c.json({ error: "REASON_REQUIRED" }, 400);
  if (newCode === row.part_code) return c.json({ error: "SAME_PART" }, 400);
  const dup = await c.env.DB.prepare(
    "SELECT id FROM eo_item WHERE eo_id = ? AND id <> ? AND warehouse = ? AND part_code = ? AND line_status = 'ACTIVE'",
  ).bind(row.eo_id, itemId, row.warehouse, newCode).first();
  if (dup) return c.json({ error: "DUPLICATE_LINE" }, 409);

  const goc = row.part_code_goc ?? row.part_code;
  const tenGoc = row.part_code_goc ? row.part_name_goc : row.part_name;
  const revert = newCode === goc;
  const newName = b.part_name?.trim() || (revert ? tenGoc : row.part_name) || "";
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE eo_item SET part_code = ?, part_name = ?, part_code_goc = ?, part_name_goc = ?, updated_by = ?, updated_at = ? WHERE id = ?",
    ).bind(newCode, newName, revert ? null : goc, revert ? null : tenGoc, u.email, now, itemId),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "REPLACE_PART", user_email: u.email, at: now,
      before: { part_code: row.part_code, part_name: row.part_name }, after: { part_code: newCode, part_name: newName },
      metadata: { reason, part_code_goc: revert ? null : goc, warehouse: row.warehouse } }),
  ]);
  if (row.approval_code) await recomputeMatch(c.env.DB, [row.approval_code]);
  await bumpVersions(c.env.DB, ["eo", "amis"]);
  return c.json({ ok: true, part_code: newCode, part_code_goc: revert ? null : goc });
});

// ------------------------------------------------------------------ POST /items/:itemId/sua-thong-tin
// Sua lai MA LINH KIEN / KHO / DOI TAC cua dong dat (nhap sai) - ke toan, mua hang, nguoi tao PO (2026-11-08, lib/eoAccess
// canSuaThongTinDong). Chi khi PO CHUA ket thuc hoan toan (con dong dang mo chua ve du) va EO DRAFT / ISSUED. Bat buoc ly do.
// Khac "thay ma tuong duong" (replace-part, giu ma goc): day la SUA SAI -> khong ghi part_code_goc. Log day du truoc / sau.
// Doi ma / kho cua EO da ban hanh -> khop lai AMIS (recomputeMatch theo ma phe duyet).
app.post("/items/:itemId/sua-thong-tin", async (c) => {
  const db = c.env.DB;
  const itemId = Number(c.req.param("itemId"));
  const row = await db.prepare(
    `SELECT i.*, e.trang_thai eo_status, e.created_by eo_created_by, e.approval_code FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?`,
  ).bind(itemId).first<any>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (!canSuaThongTinDong(u, { created_by: row.eo_created_by })) return c.json({ error: "FORBIDDEN" }, 403);
  if (!["DRAFT", "ISSUED"].includes(row.eo_status)) return c.json({ error: "BAD_STATE", trang_thai: row.eo_status }, 409);
  if (row.line_status !== "ACTIVE") return c.json({ error: "DONG_DA_HUY" }, 409);
  if (row.eo_status === "ISSUED") {
    const mo = await db.prepare(
      `SELECT 1 FROM eo_item i WHERE i.eo_id = ? AND i.line_status = 'ACTIVE' AND i.ket_thuc_som_at IS NULL AND i.current_qty >
         (SELECT COALESCE(SUM(r.qty_in), 0) FROM amis_receipt r WHERE r.matched_eo_item_id = i.id AND r.match_status = 'MATCHED_EO') LIMIT 1`,
    ).bind(row.eo_id).first();
    if (!mo) return c.json({ error: "PO_DA_KET_THUC" }, 409);
  }
  const b = (await c.req.json().catch(() => ({}))) as { part_code?: string; warehouse?: string; supplier?: string | null; part_name?: string; ly_do?: string };
  const lyDo = (b.ly_do ?? "").trim();
  if (!lyDo) return c.json({ error: "REASON_REQUIRED" }, 400);
  const truoc: Record<string, unknown> = {}, sau: Record<string, unknown> = {};
  const doi = (k: string, cu: unknown, moi: unknown) => { if (moi !== undefined && moi !== cu) { truoc[k] = cu; sau[k] = moi; } };
  if (b.part_code !== undefined) {
    const v = b.part_code.trim();
    if (!v) return c.json({ error: "PART_REQUIRED" }, 400);
    doi("part_code", row.part_code, v);
  }
  if (b.part_name !== undefined) doi("part_name", row.part_name, b.part_name.trim());
  if (b.warehouse !== undefined) {
    const v = b.warehouse.trim();
    if (!(await db.prepare("SELECT 1 FROM settings_warehouse WHERE ten_kho = ?").bind(v).first())) return c.json({ error: "KHO_KHONG_CO" }, 400);
    doi("warehouse", row.warehouse, v);
  }
  if (b.supplier !== undefined) {
    const x: { supplier?: string | null } = { supplier: b.supplier ?? null };
    const loi = chuanHoaDong(await layBoChuan(db), [x]);
    if (loi.length) return c.json(loiChuan(loi), 400);
    doi("supplier", row.supplier ?? null, x.supplier ?? null);
  }
  if (!Object.keys(sau).length) return c.json({ error: "NO_CHANGE" }, 400);
  const maMoi = (sau.part_code as string) ?? row.part_code, khoMoi = (sau.warehouse as string) ?? row.warehouse;
  if ("part_code" in sau || "warehouse" in sau) {
    const dup = await db.prepare("SELECT id FROM eo_item WHERE eo_id = ? AND id <> ? AND warehouse = ? AND part_code = ? AND line_status = 'ACTIVE'")
      .bind(row.eo_id, itemId, khoMoi, maMoi).first();
    if (dup) return c.json({ error: "DUPLICATE_LINE" }, 409);
  }
  const now = nowVN();
  const cols = Object.keys(sau);
  await db.batch([
    db.prepare(`UPDATE eo_item SET ${cols.map((k) => `${k} = ?`).join(", ")}, updated_by = ?, updated_at = ? WHERE id = ?`)
      .bind(...cols.map((k) => sau[k]), u.email, now, itemId),
    eventStmt(db, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "SUA_THONG_TIN_DONG", user_email: u.email, at: now,
      before: truoc, after: sau, metadata: { ly_do: lyDo, part_code: row.part_code, warehouse: row.warehouse } }),
  ]);
  if (row.approval_code && ("part_code" in sau || "warehouse" in sau)) await recomputeMatch(db, [row.approval_code]);
  await bumpVersions(db, ["eo", "amis"]);
  return c.json({ ok: true, doi: sau });
});

// ------------------------------------------------------------------ POST /items/:itemId/approve-post-issue
app.post("/items/:itemId/approve-post-issue", async (c) => {
  const itemId = Number(c.req.param("itemId"));
  const row = await c.env.DB.prepare(
    "SELECT i.*, e.final_approver_email, e.trang_thai eo_status FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?",
  ).bind(itemId).first<any>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (u.email !== row.final_approver_email && u.vai_tro !== "Admin") return c.json({ error: "ONLY_FINAL_APPROVER" }, 403);
  if (row.post_issue_status !== "PENDING") return c.json({ error: "NOT_PENDING" }, 409);
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE eo_item SET post_issue_status = 'APPROVED', post_issue_approved_by = ?, post_issue_approved_at = ? WHERE id = ?")
      .bind(u.email, now, itemId),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "APPROVE_POST_ISSUE_ITEM", user_email: u.email, at: now }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ POST /items/:itemId/cancel-line
// Huy 1 dong dang hieu luc cua EO DA BAN HANH (ke ca dong them sau BH da duyet): nguoi quan ly EO (tao / KH cung ung / Admin)
// hoac nguoi duyet cuoi. Bat buoc ly do. Dong -> CANCELLED_LINE, SL 0, xoa mem ke hoach. Dong dang cho duyet -> dung Tu choi.
app.post("/items/:itemId/cancel-line", async (c) => {
  const itemId = Number(c.req.param("itemId"));
  const b = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason = String(b.reason ?? "").trim();
  if (!reason) return c.json({ error: "REASON_REQUIRED" }, 400);
  const row = await c.env.DB.prepare(
    "SELECT i.*, e.final_approver_email, e.approval_code, e.created_by eo_created_by, e.trang_thai eo_status FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?",
  ).bind(itemId).first<any>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (!canManageEo(u, { created_by: row.eo_created_by }) && u.email !== row.final_approver_email) return c.json({ error: "FORBIDDEN" }, 403);
  if (row.eo_status !== "ISSUED") return c.json({ error: "ONLY_ISSUED" }, 409);
  if (row.line_status !== "ACTIVE") return c.json({ error: "ALREADY_CANCELLED" }, 409);
  if (row.post_issue_status === "PENDING") return c.json({ error: "USE_REJECT" }, 409);
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE eo_item SET line_status = 'CANCELLED_LINE', current_qty = 0, updated_by = ?, updated_at = ? WHERE id = ?").bind(u.email, now, itemId),
    c.env.DB.prepare("UPDATE item_plan SET deleted_at = ?, deleted_by = ? WHERE eo_item_id = ? AND deleted_at IS NULL").bind(now, u.email, itemId),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "CANCEL_LINE", user_email: u.email, at: now, before: { qty: row.current_qty }, after: { qty: 0 }, metadata: { reason } }),
  ]);
  if (row.approval_code) await recomputeMatch(c.env.DB, [row.approval_code]);
  await bumpVersions(c.env.DB, ["eo", "amis"]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ POST /items/:itemId/ket-thuc-som
// Ket thuc som 1 don dat (dong EO DA BAN HANH, da ve 1 phan theo AMIS): SL dat ve DUNG SL da ve, cat ke hoach con lai, danh dau
// ket_thuc_som_* (bao cao 0.1 trang thai "Kết thúc sớm" = dong). Quyen nhu huy dong; bat buoc ly do. Chua ve gi -> dung Huy don.
app.post("/items/:itemId/ket-thuc-som", async (c) => {
  const itemId = Number(c.req.param("itemId"));
  const b = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason = String(b.reason ?? "").trim();
  if (!reason) return c.json({ error: "REASON_REQUIRED" }, 400);
  const row = await c.env.DB.prepare(
    `SELECT i.*, e.final_approver_email, e.created_by eo_created_by, e.trang_thai eo_status,
            COALESCE((SELECT SUM(r.qty_in) FROM amis_receipt r WHERE r.match_status = 'MATCHED_EO' AND r.matched_eo_item_id = i.id AND r.voided_at IS NULL), 0) da_ve
     FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?`,
  ).bind(itemId).first<any>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (!canManageEo(u, { created_by: row.eo_created_by }) && u.email !== row.final_approver_email) return c.json({ error: "FORBIDDEN" }, 403);
  if (row.eo_status !== "ISSUED") return c.json({ error: "ONLY_ISSUED" }, 409);
  if (row.line_status !== "ACTIVE" || row.post_issue_status === "PENDING") return c.json({ error: "NOT_ACTIVE" }, 409);
  const daVe = round3(row.da_ve);
  if (daVe <= 0) return c.json({ error: "CHUA_VE" }, 409);
  if (daVe >= row.current_qty) return c.json({ error: "DA_VE_DU" }, 409);
  const now = nowVN();
  const sump = await c.env.DB.prepare("SELECT COALESCE(SUM(planned_qty),0) s FROM item_plan WHERE eo_item_id = ? AND deleted_at IS NULL").bind(itemId).first<{ s: number }>();
  const du = (sump?.s ?? 0) - daVe;
  await c.env.DB.batch([
    ...(du > 1e-9 ? await catKeHoach(c.env.DB, itemId, row.eo_id, du, u.email, now, "Kết thúc sớm — SL đặt về SL đã về") : []),
    c.env.DB.prepare(
      `UPDATE eo_item SET current_qty = ?, sl_dat_truoc_kts = ?, ket_thuc_som_at = ?, ket_thuc_som_by = ?, ket_thuc_som_ly_do = ?,
         updated_by = ?, updated_at = ? WHERE id = ?`,
    ).bind(daVe, row.current_qty, now, u.email, reason, u.email, now, itemId),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "KET_THUC_SOM", user_email: u.email, at: now,
      before: { qty: row.current_qty }, after: { qty: daVe }, metadata: { reason } }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true, sl_dat: daVe, sl_dat_truoc: row.current_qty });
});

// ------------------------------------------------------------------ POST /:id/ket-thuc-som (ca PO)
// Ket thuc som CA PO (2026-11-08): moi dong dang mo -> SL dat = SL da ve thuc te (AMIS). Dong ve 1 phan: nhu ket thuc som 1 dong;
// dong CHUA VE gi: SL 0 + huy dong (CANCELLED_LINE) + danh dau ket thuc som; dong da ve du / da ket thuc som / huy: giu nguyen;
// dong them sau BH dang cho duyet: bo qua (duyet / tu choi rieng). { xem: true } = xem truoc tung dong (FE canh bao). Bat buoc ly do.
app.post("/:id/ket-thuc-som", async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param("id"));
  const b = (await c.req.json().catch(() => ({}))) as { reason?: string; xem?: boolean };
  const eo = await db.prepare("SELECT id, trang_thai, created_by, final_approver_email, approval_code FROM eo WHERE id = ?").bind(id).first<any>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (!canManageEo(u, { created_by: eo.created_by }) && u.email !== eo.final_approver_email) return c.json({ error: "FORBIDDEN" }, 403);
  if (eo.trang_thai !== "ISSUED") return c.json({ error: "ONLY_ISSUED" }, 409);
  const ds = (await db.prepare(
    `SELECT i.id, i.part_code, i.part_name, i.warehouse, i.current_qty, i.line_status, i.post_issue_status, i.ket_thuc_som_at,
            COALESCE((SELECT SUM(r.qty_in) FROM amis_receipt r WHERE r.match_status = 'MATCHED_EO' AND r.matched_eo_item_id = i.id AND r.voided_at IS NULL), 0) da_ve,
            (SELECT COALESCE(SUM(p.planned_qty), 0) FROM item_plan p WHERE p.eo_item_id = i.id AND p.deleted_at IS NULL) sl_kh
     FROM eo_item i WHERE i.eo_id = ? ORDER BY i.id`,
  ).bind(id).all<any>()).results.map((r) => {
    const daVe = round3(r.da_ve);
    const hd = r.line_status !== "ACTIVE" ? "BO_QUA_HUY" : r.post_issue_status === "PENDING" ? "BO_QUA_CHO_DUYET"
      : r.ket_thuc_som_at ? "BO_QUA_DA_KTS" : daVe >= r.current_qty ? "BO_QUA_DU" : daVe > 0 ? "VE_MOT_PHAN" : "CHUA_VE";
    return { ...r, da_ve: daVe, hanh_dong: hd };
  });
  const doi = ds.filter((r) => r.hanh_dong === "VE_MOT_PHAN" || r.hanh_dong === "CHUA_VE");
  if (b.xem) return c.json({ dong: ds, so_doi: doi.length });
  const reason = String(b.reason ?? "").trim();
  if (!reason) return c.json({ error: "REASON_REQUIRED" }, 400);
  if (!doi.length) return c.json({ error: "KHONG_CO_DONG_MO" }, 409);
  const now = nowVN();
  const stmts: D1PreparedStatement[] = [];
  for (const r of doi) {
    const du = (r.sl_kh ?? 0) - r.da_ve;
    if (du > 1e-9) stmts.push(...(await catKeHoach(db, r.id, id, du, u.email, now, "Kết thúc sớm cả PO — SL đặt về SL đã về")));
    stmts.push(
      db.prepare(
        `UPDATE eo_item SET current_qty = ?, line_status = ?, sl_dat_truoc_kts = ?, ket_thuc_som_at = ?, ket_thuc_som_by = ?, ket_thuc_som_ly_do = ?,
           updated_by = ?, updated_at = ? WHERE id = ?`,
      ).bind(r.da_ve, r.da_ve > 0 ? "ACTIVE" : "CANCELLED_LINE", r.current_qty, now, u.email, reason, u.email, now, r.id),
      eventStmt(db, { entity_type: "eo_item", entity_id: r.id, eo_id: id, event_type: "KET_THUC_SOM", user_email: u.email, at: now,
        before: { qty: r.current_qty }, after: { qty: r.da_ve }, metadata: { reason, pham_vi: "PO", chua_ve: r.da_ve <= 0 } }),
    );
  }
  stmts.push(eventStmt(db, { entity_type: "eo", entity_id: id, eo_id: id, event_type: "KET_THUC_SOM_PO", user_email: u.email, at: now,
    metadata: { reason, so_dong: doi.length, dong: doi.map((r) => ({ id: r.id, part_code: r.part_code, truoc: r.current_qty, sau: r.da_ve })) } }));
  await db.batch(stmts);
  await bumpVersions(db, ["eo"]);
  return c.json({ ok: true, so_dong: doi.length });
});

// ------------------------------------------------------------------ POST /items/:itemId/reject-post-issue
// Tu choi dong them sau ban hanh: chi nguoi duyet cuoi cua EO / Admin, bat buoc ly do. Dong -> huy (SL 0), xoa mem ke hoach.
app.post("/items/:itemId/reject-post-issue", async (c) => {
  const itemId = Number(c.req.param("itemId"));
  const b = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const reason = String(b.reason ?? "").trim();
  if (!reason) return c.json({ error: "REASON_REQUIRED" }, 400);
  const row = await c.env.DB.prepare(
    "SELECT i.*, e.final_approver_email, e.approval_code, e.trang_thai eo_status FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?",
  ).bind(itemId).first<any>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const u = c.get("user");
  if (u.email !== row.final_approver_email && u.vai_tro !== "Admin") return c.json({ error: "ONLY_FINAL_APPROVER" }, 403);
  if (row.post_issue_status !== "PENDING") return c.json({ error: "NOT_PENDING" }, 409);
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE eo_item SET post_issue_status = NULL, line_status = 'CANCELLED_LINE', current_qty = 0,
         post_issue_rejected_by = ?, post_issue_rejected_at = ?, post_issue_reject_reason = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
    ).bind(u.email, now, reason, u.email, now, itemId),
    c.env.DB.prepare("UPDATE item_plan SET deleted_at = ?, deleted_by = ? WHERE eo_item_id = ? AND deleted_at IS NULL").bind(now, u.email, itemId),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "REJECT_POST_ISSUE_ITEM", user_email: u.email, at: now, before: { qty: row.current_qty }, after: { qty: 0 }, metadata: { reason } }),
  ]);
  if (row.approval_code) await recomputeMatch(c.env.DB, [row.approval_code]);
  await bumpVersions(c.env.DB, ["eo", "amis"]);
  return c.json({ ok: true });
});

export default app;
