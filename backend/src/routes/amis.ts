import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { sha256Hex } from "../lib/sha";
import { recomputeMatch } from "../lib/amisMatch";
import { canImportAmis } from "../lib/eoAccess";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/** 1 dong MISA da parse o frontend (SheetJS). Ten cot theo `Mẫu import misa.xlsx`. */
interface MisaRow {
  "Mã kho"?: string;
  "Tên kho"?: string;
  "Mã hàng"?: string | number;
  "Tên hàng"?: string;
  "Ngày hạch toán"?: string;
  "Ngày chứng từ"?: string;
  "Số chứng từ"?: string;
  "ĐVT"?: string;
  "Diễn giải"?: string;
  "Số lượng Nhập"?: number | string;
  "Số lượng Xuất"?: number | string;
  "Số lượng Tồn"?: number | string;
  "TK Kho"?: string;
  "TK đối ứng"?: string;
  "Mã phê duyệt"?: string;
}

const s = (v: unknown) => (v == null ? null : String(v).trim() || null);
const n = (v: unknown) => {
  if (v == null || v === "") return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const p2 = (x: string | number) => String(x).padStart(2, "0");
function isoOk(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${p2(m)}-${p2(d)}` : null;
}
/** Ngay -> 'YYYY-MM-DD' hoac null (khong doan bua - dong ngay sai bi bo qua co ly do).
 *  '2026-09-08 00:00:00' | '2026-09-08T..' | '08/09/2026' (dd/mm/yyyy go tay) | '9/8/26' (m/d/yy - SheetJS
 *  hien thi o ngay Excel theo dinh dang mac dinh; FE moi da gui ISO, giu nhanh nay cho file/client cu). */
const dOnly = (v: unknown): string | null => {
  const t = s(v);
  if (!t) return null;
  const m1 = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m1) return isoOk(+m1[1], +m1[2], +m1[3]);
  const m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m2) return isoOk(+m2[3], +m2[2], +m2[1]);
  const m3 = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(t);
  if (m3) return isoOk(2000 + +m3[3], +m3[1], +m3[2]);
  return null;
};
/** Chi in hoa a-z (khop UPPER() cua SQLite - migrations/0009). */
const upA = (x: string) => x.replace(/[a-z]/g, (ch) => ch.toUpperCase());
/** Khoa chong trung = "ID tu sinh" cua 1 dong MISA (MISA khong co ID dong). PHAI khop bieu thuc SQL o
 *  migrations/0009_amis_khoa_trung.sql. Dong giong het thu n (n>=2) trong cung file them hau to '#n'. */
const khoaTrung = (docNo: string, wh: string, part: string, qty: number, docDate: string, approval: string) =>
  [upA(docNo), wh, upA(part), String(qty), docDate, upA(approval)].join("|");

// ------------------------------------------------------------------ POST /import
// body: { filename, file_hash?, rows: MisaRow[], mode?: 'APPEND'|'SYNC', dry_run?, ky_tu?, ky_den?, kho?: string[]|null, ly_do? }
//  - APPEND (mac dinh): them chung tu moi; chung tu da co bo qua; chung tu da HUY ma co lai trong file -> khoi phuc.
//  - SYNC "dong bo lai ky": nhu APPEND + moi dong SONG co ngay CT trong [ky_tu, ky_den] va thuoc pham vi kho
//    ma KHONG con trong file -> danh dau huy (MISA la nguon dung - xu ly chung tu bi sua / bi xoa tren MISA).
//    ky mac dinh = min/max ngay CT cua file; kho mac dinh = cac kho co trong file (null = moi kho).
//  - dry_run: chi dem + tra danh sach se huy / khoi phuc, khong ghi.
const CHUNK = 400;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

app.post("/import", async (c) => {
  if (!canImportAmis(c.get("user"))) return c.json({ error: "FORBIDDEN" }, 403);
  const body = (await c.req.json()) as {
    filename?: string; file_hash?: string; rows: MisaRow[];
    mode?: string; dry_run?: boolean; ky_tu?: string; ky_den?: string; kho?: string[] | null; ly_do?: string;
  };
  if (!Array.isArray(body.rows) || body.rows.length === 0) return c.json({ error: "NO_ROWS" }, 400);
  const mode = body.mode === "SYNC" ? "SYNC" : "APPEND";
  const db = c.env.DB;
  const email = c.get("user").email;

  const whRows = await db.prepare("SELECT ten_kho FROM settings_warehouse WHERE active = 1").all<{ ten_kho: string }>();
  const validWh = new Set(whRows.results.map((r) => r.ten_kho));

  // ---- 1. loc + khoa chong trung (mo phong '2.1 Amis 30 ngay'). dong[idx] = trang thai tung dong cua file.
  interface Valid { idx: number; r: MisaRow; approval: string; whName: string; part: string; qtyIn: number; docDate: string; docNo: string; key: string }
  const valid: Valid[] = [];
  const dong: string[] = new Array(body.rows.length);
  const lyDoBo: Record<string, number> = {};
  const bo = (idx: number, why: string) => { dong[idx] = `bo:${why}`; lyDoBo[why] = (lyDoBo[why] ?? 0) + 1; };
  const lan = new Map<string, number>(); // so lan 1 bo (CT, kho, ma, SL, ngay, 3TDO) xuat hien trong file
  for (let idx = 0; idx < body.rows.length; idx++) {
    const r = body.rows[idx];
    const approval = s(r["Mã phê duyệt"]);
    const whName = s(r["Tên kho"]);
    const part = s(r["Mã hàng"]);
    const qtyIn = n(r["Số lượng Nhập"]);
    const docDate = dOnly(r["Ngày chứng từ"]);
    const docNo = s(r["Số chứng từ"]);
    if (!approval) { bo(idx, "Không có mã phê duyệt"); continue; }
    if (qtyIn <= 0) { bo(idx, "SL nhập = 0 (dòng xuất / tồn)"); continue; }
    if (!whName || !validWh.has(whName)) { bo(idx, "Kho không có trong danh mục"); continue; }
    if (!part || !docNo) { bo(idx, "Thiếu mã hàng / số chứng từ"); continue; }
    if (!docDate) { bo(idx, "Ngày chứng từ sai định dạng"); continue; }
    const base = khoaTrung(docNo, whName, part, qtyIn, docDate, approval);
    const k = (lan.get(base) ?? 0) + 1;
    lan.set(base, k);
    valid.push({ idx, r, approval, whName, part, qtyIn, docDate, docNo, key: k === 1 ? base : `${base}#${k}` });
  }
  const skipped = body.rows.length - valid.length;
  const fileKeys = new Set(valid.map((v) => v.key));

  // ---- 2. chung tu da co trong he (song / da huy) - so theo khoa_trung
  const existing = new Map<string, { id: number; voided: boolean; approval: string }>();
  const keyList = [...fileKeys];
  for (let i = 0; i < keyList.length; i += CHUNK) {
    const rs = await db.prepare(
      "SELECT id, khoa_trung, voided_at, approval_code_raw FROM amis_receipt WHERE khoa_trung IN (SELECT value FROM json_each(?))",
    ).bind(JSON.stringify(keyList.slice(i, i + CHUNK))).all<{ id: number; khoa_trung: string; voided_at: string | null; approval_code_raw: string }>();
    for (const e of rs.results) existing.set(e.khoa_trung, { id: e.id, voided: !!e.voided_at, approval: e.approval_code_raw });
  }
  const toInsert: Valid[] = [];
  for (const v of valid) {
    const e = existing.get(v.key);
    dong[v.idx] = !e ? "moi" : e.voided ? "khoi_phuc" : "da_co";
    if (!e) toInsert.push(v);
  }
  const restore = [...existing.values()].filter((e) => e.voided);
  const unchanged = [...existing.values()].filter((e) => !e.voided).length;

  // ---- 3. SYNC: dong song trong ky + pham vi kho khong con trong file -> huy
  let kyTu: string | null = null, kyDen: string | null = null, khoScope: string[] | null = null;
  let toVoid: any[] = [];
  if (mode === "SYNC") {
    const dates = valid.map((v) => v.docDate).filter((d) => ISO.test(d)).sort();
    kyTu = body.ky_tu && ISO.test(body.ky_tu) ? body.ky_tu : dates[0] ?? null;
    kyDen = body.ky_den && ISO.test(body.ky_den) ? body.ky_den : dates[dates.length - 1] ?? null;
    if (!kyTu || !kyDen || kyTu > kyDen) return c.json({ error: "BAD_PERIOD" }, 400);
    khoScope = body.kho === null ? null : Array.isArray(body.kho) && body.kho.length ? body.kho : [...new Set(valid.map((v) => v.whName))];
    const live = await db.prepare(
      `SELECT id, khoa_trung, doc_no, doc_date, warehouse_name, part_code, part_name, qty_in, approval_code_raw, match_status
       FROM amis_receipt WHERE voided_at IS NULL AND doc_date BETWEEN ? AND ?
       ${khoScope ? "AND warehouse_name IN (SELECT value FROM json_each(?))" : ""}
       ORDER BY doc_date, doc_no`,
    ).bind(...(khoScope ? [kyTu, kyDen, JSON.stringify(khoScope)] : [kyTu, kyDen])).all<any>();
    toVoid = live.results.filter((r) => !fileKeys.has(r.khoa_trung));
  }

  const summary = {
    mode, rows: body.rows.length, skipped, hop_le: valid.length, them_moi: toInsert.length, giu_nguyen: unchanged,
    khoi_phuc: restore.length, ly_do_bo: lyDoBo, se_huy: toVoid.length, ky_tu: kyTu, ky_den: kyDen, kho: khoScope,
  };
  if (body.dry_run) {
    return c.json({ dry_run: true, summary, dong, huy: toVoid.slice(0, 1000).map(({ khoa_trung, ...r }) => r) });
  }
  if (mode === "SYNC" && !body.ly_do?.trim()) return c.json({ error: "REASON_REQUIRED" }, 400);

  // ---- 4. ghi
  const now = nowVN();
  const fileHash = body.file_hash ?? (await sha256Hex(JSON.stringify(body.rows)));
  const batchIns = await db.prepare(
    `INSERT INTO amis_import_batch (source_filename, file_hash, imported_by, imported_at, row_count, mode, ky_tu, ky_den, kho_pham_vi, ghi_chu)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(body.filename ?? null, fileHash, email, now, body.rows.length, mode, kyTu, kyDen,
    khoScope ? JSON.stringify(khoScope) : null, body.ly_do?.trim() || null).first<{ id: number }>();
  const batchId = batchIns!.id;

  const affectedCodes = new Set<string>();
  const naturalKeys = await Promise.all(toInsert.map((v) => sha256Hex(v.key)));
  const stmts: any[] = toInsert.map((v, i) => {
    affectedCodes.add(v.approval);
    const r = v.r;
    return db.prepare(
      `INSERT OR IGNORE INTO amis_receipt
        (import_batch_id, warehouse_code, warehouse_name, part_code, part_name, posting_date, doc_date,
         doc_no, uom, description, qty_in, qty_out, qty_balance, tk_kho, tk_doi_ung, approval_code_raw,
         match_key, match_status, natural_key, khoa_trung, source_row, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?, ?, ?, ?)`,
    ).bind(
      batchId, s(r["Mã kho"]), v.whName, v.part, s(r["Tên hàng"]), dOnly(r["Ngày hạch toán"]), v.docDate,
      v.docNo, s(r["ĐVT"]), s(r["Diễn giải"]), v.qtyIn, n(r["Số lượng Xuất"]), n(r["Số lượng Tồn"]),
      s(r["TK Kho"]), s(r["TK đối ứng"]), v.approval, `${v.whName};${v.part};${v.approval}`, naturalKeys[i], v.key, v.idx + 2, now,
    );
  });
  const restoreIds = restore.map((e) => e.id);
  for (const e of restore) affectedCodes.add(e.approval);
  for (let i = 0; i < restoreIds.length; i += CHUNK) {
    stmts.push(db.prepare(
      "UPDATE amis_receipt SET voided_at = NULL, voided_by = NULL, void_reason = NULL, void_batch_id = NULL WHERE id IN (SELECT value FROM json_each(?))",
    ).bind(JSON.stringify(restoreIds.slice(i, i + CHUNK))));
  }
  const voidIds = toVoid.map((r) => r.id as number);
  for (const r of toVoid) affectedCodes.add(r.approval_code_raw);
  const voidReason = `Đồng bộ lại kỳ ${kyTu} → ${kyDen}: ${body.ly_do?.trim() ?? ""}`;
  for (let i = 0; i < voidIds.length; i += CHUNK) {
    stmts.push(db.prepare(
      `UPDATE amis_receipt SET voided_at = ?, voided_by = ?, void_reason = ?, void_batch_id = ?, match_status = 'UNMATCHED', matched_eo_item_id = NULL
       WHERE voided_at IS NULL AND id IN (SELECT value FROM json_each(?))`,
    ).bind(now, email, voidReason, batchId, JSON.stringify(voidIds.slice(i, i + CHUNK))));
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));

  const after = await db.prepare("SELECT COUNT(*) n FROM amis_receipt WHERE import_batch_id = ?").bind(batchId).first<{ n: number }>();
  const inserted = after?.n ?? 0;
  const dup = valid.length - inserted - restore.length;

  // scope theo ma phe duyet bi anh huong; neu qua nhieu (>200) thi tinh lai toan bo cho gon
  await recomputeMatch(db, affectedCodes.size > 200 ? undefined : [...affectedCodes]);

  await db.batch([
    db.prepare("UPDATE amis_import_batch SET inserted_count = ?, duplicate_count = ?, error_count = ?, voided_count = ?, restored_count = ? WHERE id = ?")
      .bind(inserted, dup, skipped, voidIds.length, restoreIds.length, batchId),
    eventStmt(db, { entity_type: "amis_import_batch", entity_id: batchId, eo_id: null, event_type: mode === "SYNC" ? "SYNC_AMIS" : "IMPORT_AMIS", user_email: email, at: now,
      metadata: { filename: body.filename, rows: body.rows.length, inserted, dup, skipped, restored: restoreIds.length, voided: voidIds.length, ky_tu: kyTu, ky_den: kyDen, kho: khoScope, ly_do: body.ly_do ?? null } }),
  ]);
  await bumpVersions(db, ["amis"]);

  return c.json({ batch_id: batchId, rows: body.rows.length, inserted, duplicate: dup, skipped, restored: restoreIds.length, voided: voidIds.length, summary });
});

// ------------------------------------------------------------------ huy / khoi phuc
async function voidRows(db: Env["DB"], ids: number[], email: string, reason: string, now: string) {
  const codes = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const js = JSON.stringify(ids.slice(i, i + CHUNK));
    const rs = await db.prepare("SELECT DISTINCT approval_code_raw a FROM amis_receipt WHERE id IN (SELECT value FROM json_each(?))").bind(js).all<{ a: string }>();
    rs.results.forEach((r) => codes.add(r.a));
    await db.prepare(
      `UPDATE amis_receipt SET voided_at = ?, voided_by = ?, void_reason = ?, match_status = 'UNMATCHED', matched_eo_item_id = NULL
       WHERE voided_at IS NULL AND id IN (SELECT value FROM json_each(?))`,
    ).bind(now, email, reason, js).run();
  }
  return [...codes];
}

// POST /batches/:id/void  body { ly_do } - huy moi dong do lo nay THEM VAO (dong trung voi lo truoc thuoc lo truoc)
app.post("/batches/:id/void", async (c) => {
  if (!canImportAmis(c.get("user"))) return c.json({ error: "FORBIDDEN" }, 403);
  const id = Number(c.req.param("id"));
  const b = (await c.req.json().catch(() => ({}))) as { ly_do?: string };
  const lyDo = b.ly_do?.trim();
  if (!lyDo) return c.json({ error: "REASON_REQUIRED" }, 400);
  const batch = await c.env.DB.prepare("SELECT * FROM amis_import_batch WHERE id = ?").bind(id).first<any>();
  if (!batch) return c.json({ error: "NOT_FOUND" }, 404);
  if (batch.cancelled_at) return c.json({ error: "ALREADY_CANCELLED" }, 409);
  const now = nowVN();
  const email = c.get("user").email;
  const ids = (await c.env.DB.prepare("SELECT id FROM amis_receipt WHERE import_batch_id = ? AND voided_at IS NULL").bind(id).all<{ id: number }>()).results.map((r) => r.id);
  const codes = await voidRows(c.env.DB, ids, email, `Hủy lô import #${id}: ${lyDo}`, now);
  await recomputeMatch(c.env.DB, codes.length > 200 ? undefined : codes);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE amis_import_batch SET cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?").bind(now, email, lyDo, id),
    eventStmt(c.env.DB, { entity_type: "amis_import_batch", entity_id: id, eo_id: null, event_type: "VOID_AMIS_BATCH", user_email: email, at: now, metadata: { ly_do: lyDo, so_dong: ids.length, filename: batch.source_filename } }),
  ]);
  await bumpVersions(c.env.DB, ["amis"]);
  return c.json({ ok: true, so_dong: ids.length });
});

// GET /receipts?q=&include_voided=1&limit=  - tra cuu chung tu (so CT / ma hang / 3TDO / ten hang)
app.get("/receipts", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const inclVoided = c.req.query("include_voided") === "1";
  const onlyVoided = c.req.query("include_voided") === "only";
  const batchId = Number(c.req.query("batch_id")) || null;
  const where: string[] = [];
  const bind: unknown[] = [];
  if (q) { where.push("(r.doc_no LIKE ? OR r.part_code LIKE ? OR r.approval_code_raw LIKE ? OR r.part_name LIKE ?)"); bind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (onlyVoided) where.push("r.voided_at IS NOT NULL");
  else if (!inclVoided) where.push("r.voided_at IS NULL");
  if (batchId) { where.push("r.import_batch_id = ?"); bind.push(batchId); }
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.import_batch_id, r.doc_no, r.doc_date, r.warehouse_name, r.part_code, r.part_name, r.qty_in, r.approval_code_raw,
            r.match_status, r.voided_at, r.voided_by, r.void_reason, e.eo_code, e.id eo_id
     FROM amis_receipt r LEFT JOIN eo_item i ON i.id = r.matched_eo_item_id LEFT JOIN eo e ON e.id = i.eo_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.doc_date DESC, r.id DESC LIMIT 300`,
  ).bind(...bind).all();
  return c.json(rows.results);
});

// POST /receipts/:id/void | /receipts/:id/restore   body { ly_do }
app.post("/receipts/:id/:act{void|restore}", async (c) => {
  if (!canImportAmis(c.get("user"))) return c.json({ error: "FORBIDDEN" }, 403);
  const id = Number(c.req.param("id"));
  const act = c.req.param("act");
  const b = (await c.req.json().catch(() => ({}))) as { ly_do?: string };
  const lyDo = b.ly_do?.trim();
  if (!lyDo) return c.json({ error: "REASON_REQUIRED" }, 400);
  const r = await c.env.DB.prepare("SELECT * FROM amis_receipt WHERE id = ?").bind(id).first<any>();
  if (!r) return c.json({ error: "NOT_FOUND" }, 404);
  const now = nowVN();
  const email = c.get("user").email;
  if (act === "void") {
    if (r.voided_at) return c.json({ error: "ALREADY_VOIDED" }, 409);
    await voidRows(c.env.DB, [id], email, lyDo, now);
  } else {
    if (!r.voided_at) return c.json({ error: "NOT_VOIDED" }, 409);
    await c.env.DB.prepare("UPDATE amis_receipt SET voided_at = NULL, voided_by = NULL, void_reason = NULL, void_batch_id = NULL WHERE id = ?").bind(id).run();
  }
  await recomputeMatch(c.env.DB, [r.approval_code_raw]);
  await eventStmt(c.env.DB, { entity_type: "amis_receipt", entity_id: id, eo_id: null, event_type: act === "void" ? "VOID_AMIS_RECEIPT" : "RESTORE_AMIS_RECEIPT", user_email: email, at: now,
    before: { voided_at: r.voided_at, void_reason: r.void_reason }, metadata: { ly_do: lyDo, doc_no: r.doc_no, part_code: r.part_code, warehouse: r.warehouse_name, qty_in: r.qty_in, approval_code: r.approval_code_raw } }).run();
  await bumpVersions(c.env.DB, ["amis"]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ GET /batches
app.get("/batches", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM amis_import_batch ORDER BY imported_at DESC LIMIT 100",
  ).all();
  return c.json(rows.results);
});

// ------------------------------------------------------------------ GET /unmatched  (bao cao 0.2)
app.get("/unmatched", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT doc_no, warehouse_name, part_code, part_name, qty_in, doc_date, approval_code_raw
     FROM amis_receipt WHERE match_status = 'CODE_ONLY_NO_LINE' ORDER BY doc_date DESC`,
  ).all();
  const tot = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(qty_in),0) so_luong_nhap, COUNT(*) so_dong FROM amis_receipt WHERE match_status = 'CODE_ONLY_NO_LINE'",
  ).first();
  return c.json({ rows: rows.results, total: tot });
});

// ------------------------------------------------------------------ POST /recompute-match
app.post("/recompute-match", async (c) => {
  if (c.get("user").vai_tro !== "Admin" && !canImportAmis(c.get("user"))) return c.json({ error: "FORBIDDEN" }, 403);
  await recomputeMatch(c.env.DB);
  await bumpVersions(c.env.DB, ["amis"]);
  const dist = await c.env.DB.prepare(
    "SELECT match_status, COUNT(*) n FROM amis_receipt GROUP BY match_status",
  ).all();
  return c.json({ ok: true, distribution: dist.results });
});

export default app;
