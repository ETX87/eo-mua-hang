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
const dOnly = (v: unknown) => {
  const t = s(v);
  if (!t) return null;
  // '2026-09-08 00:00:00' | '2026-09-08T00:00:00.000Z' | '08/09/2026'
  const m1 = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  return t.slice(0, 10);
};

// ------------------------------------------------------------------ POST /import
// body: { filename, file_hash?, rows: MisaRow[] }
app.post("/import", async (c) => {
  if (!canImportAmis(c.get("user"))) return c.json({ error: "FORBIDDEN" }, 403);
  const body = (await c.req.json()) as { filename?: string; file_hash?: string; rows: MisaRow[] };
  if (!Array.isArray(body.rows) || body.rows.length === 0) return c.json({ error: "NO_ROWS" }, 400);

  const whRows = await c.env.DB.prepare("SELECT ten_kho FROM settings_warehouse WHERE active = 1").all<{ ten_kho: string }>();
  const validWh = new Set(whRows.results.map((r) => r.ten_kho));

  const now = nowVN();
  const fileHash = body.file_hash ?? (await sha256Hex(JSON.stringify(body.rows)));

  const batchIns = await c.env.DB.prepare(
    `INSERT INTO amis_import_batch (source_filename, file_hash, imported_by, imported_at, row_count)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
  ).bind(body.filename ?? null, fileHash, c.get("user").email, now, body.rows.length).first<{ id: number }>();
  const batchId = batchIns!.id;

  let inserted = 0, dup = 0, skipped = 0;
  const affectedCodes = new Set<string>();
  const stmts: any[] = [];

  for (let idx = 0; idx < body.rows.length; idx++) {
    const r = body.rows[idx];
    const approval = s(r["Mã phê duyệt"]);
    const whName = s(r["Tên kho"]);
    const part = s(r["Mã hàng"]);
    const qtyIn = n(r["Số lượng Nhập"]);
    const docDate = dOnly(r["Ngày chứng từ"]);
    const docNo = s(r["Số chứng từ"]);
    // loc: chi nhan dong co Ma phe duyet, SL Nhap > 0, kho hop le  (mo phong '2.1 Amis 30 ngay')
    if (!approval || qtyIn <= 0 || !whName || !part || !docNo || !docDate || !validWh.has(whName)) {
      skipped++;
      continue;
    }
    const naturalKey = await sha256Hex([docNo, whName, part, qtyIn, docDate, approval].join("|"));
    const matchKey = `${whName};${part};${approval}`;
    stmts.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO amis_receipt
          (import_batch_id, warehouse_code, warehouse_name, part_code, part_name, posting_date, doc_date,
           doc_no, uom, description, qty_in, qty_out, qty_balance, tk_kho, tk_doi_ung, approval_code_raw,
           match_key, match_status, natural_key, source_row, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNMATCHED', ?, ?, ?)`,
      ).bind(
        batchId, s(r["Mã kho"]), whName, part, s(r["Tên hàng"]), dOnly(r["Ngày hạch toán"]), docDate,
        docNo, s(r["ĐVT"]), s(r["Diễn giải"]), qtyIn, n(r["Số lượng Xuất"]), n(r["Số lượng Tồn"]),
        s(r["TK Kho"]), s(r["TK đối ứng"]), approval, matchKey, naturalKey, idx + 2, now,
      ),
    );
    affectedCodes.add(approval);
  }

  // chay tung lo 50 statement
  for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));

  // dem thuc te da insert (natural_key UNIQUE bo qua trung)
  const after = await c.env.DB.prepare("SELECT COUNT(*) n FROM amis_receipt WHERE import_batch_id = ?").bind(batchId).first<{ n: number }>();
  inserted = after?.n ?? 0;
  dup = stmts.length - inserted;

  // scope theo ma phe duyet bi anh huong; neu qua nhieu (>200) thi tinh lai toan bo cho gon
  await recomputeMatch(c.env.DB, affectedCodes.size > 200 ? undefined : [...affectedCodes]);

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE amis_import_batch SET inserted_count = ?, duplicate_count = ?, error_count = ? WHERE id = ?")
      .bind(inserted, dup, skipped, batchId),
    eventStmt(c.env.DB, { entity_type: "amis_import_batch", entity_id: batchId, eo_id: null, event_type: "IMPORT_AMIS", user_email: c.get("user").email, at: now, metadata: { filename: body.filename, rows: body.rows.length, inserted, dup, skipped } }),
  ]);
  await bumpVersions(c.env.DB, ["amis"]);

  return c.json({ batch_id: batchId, rows: body.rows.length, inserted, duplicate: dup, skipped });
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
    "SELECT COALESCE(SUM(qty_in),0) sl, COUNT(*) so_dong FROM amis_receipt WHERE match_status = 'CODE_ONLY_NO_LINE'",
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
