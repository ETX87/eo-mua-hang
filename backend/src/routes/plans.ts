import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { canEditPlan } from "../lib/eoAccess";
import { weekEnd, weekLabel, weekSaturday } from "../lib/week";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function itemCtx(db: Env["DB"], itemId: number) {
  return db.prepare("SELECT i.id, i.eo_id, i.current_qty, e.created_by FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id = ?").bind(itemId).first<{ id: number; eo_id: number; current_qty: number; created_by: string }>();
}
async function plannedSum(db: Env["DB"], itemId: number, excludePlanId?: number) {
  const r = await db.prepare(
    `SELECT COALESCE(SUM(planned_qty),0) s FROM item_plan WHERE eo_item_id = ? AND deleted_at IS NULL ${excludePlanId ? "AND id <> ?" : ""}`,
  ).bind(...(excludePlanId ? [itemId, excludePlanId] : [itemId])).first<{ s: number }>();
  return r?.s ?? 0;
}

// GET /api/plans/item/:itemId
app.get("/item/:itemId", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM item_plan WHERE eo_item_id = ? AND deleted_at IS NULL ORDER BY planned_date",
  ).bind(Number(c.req.param("itemId"))).all();
  return c.json(rows.results);
});

// POST /api/plans   body: { eo_item_id, planned_date, planned_qty, factory_committed_date?, ghi_chu? }
app.post("/", async (c) => {
  const b = (await c.req.json()) as { eo_item_id: number; planned_date: string; planned_qty: number; factory_committed_date?: string; ghi_chu?: string };
  const it = await itemCtx(c.env.DB, b.eo_item_id);
  if (!it) return c.json({ error: "ITEM_NOT_FOUND" }, 404);
  if (!canEditPlan(c.get("user"), it)) return c.json({ error: "READ_ONLY" }, 403);
  if (!b.planned_date || !(b.planned_qty > 0)) return c.json({ error: "BAD_INPUT" }, 400);
  const sum = await plannedSum(c.env.DB, b.eo_item_id);
  if (sum + b.planned_qty > it.current_qty) return c.json({ error: "PLAN_EXCEEDS_QTY", planned_sum: sum, current_qty: it.current_qty }, 409);

  const now = nowVN();
  const ins = await c.env.DB.prepare(
    `INSERT INTO item_plan (eo_item_id, planned_date, planned_qty, factory_committed_date, ghi_chu, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(b.eo_item_id, b.planned_date, b.planned_qty, b.factory_committed_date ?? null, b.ghi_chu ?? null, c.get("user").email, now).first<{ id: number }>();
  await c.env.DB.batch([
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: b.eo_item_id, eo_id: it.eo_id, event_type: "ADD_PLAN", user_email: c.get("user").email, at: now, after: b, metadata: { eo_item_id: b.eo_item_id, plan_id: ins!.id } }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ id: ins!.id });
});

// PATCH /api/plans/:id
app.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const p = await c.env.DB.prepare("SELECT * FROM item_plan WHERE id = ? AND deleted_at IS NULL").bind(id).first<any>();
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  const it = await itemCtx(c.env.DB, p.eo_item_id);
  if (!it) return c.json({ error: "ITEM_NOT_FOUND" }, 404);
  if (!canEditPlan(c.get("user"), it)) return c.json({ error: "READ_ONLY" }, 403);
  const b = (await c.req.json()) as Partial<{ planned_date: string; planned_qty: number; factory_committed_date: string; ghi_chu: string }>;
  if (p.loai === "TUAN" && "planned_date" in b && b.planned_date !== p.planned_date) return c.json({ error: "WEEK_PLAN_DATE_LOCKED" }, 400);
  const newQty = typeof b.planned_qty === "number" ? b.planned_qty : p.planned_qty;
  if (newQty <= 0) return c.json({ error: "BAD_QTY" }, 400);
  const sum = await plannedSum(c.env.DB, p.eo_item_id, id);
  if (sum + newQty > (it?.current_qty ?? 0)) return c.json({ error: "PLAN_EXCEEDS_QTY", planned_sum: sum, current_qty: it?.current_qty }, 409);

  const now = nowVN();
  const fields = ["planned_date", "planned_qty", "factory_committed_date", "ghi_chu"] as const;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of fields) if (f in b) { sets.push(`${f} = ?`); vals.push((b as any)[f]); }
  if (!sets.length) return c.json({ error: "NO_FIELDS" }, 400);
  sets.push("updated_by = ?", "updated_at = ?");
  vals.push(c.get("user").email, now, id);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE item_plan SET ${sets.join(", ")} WHERE id = ?`).bind(...vals),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: p.eo_item_id, eo_id: it!.eo_id, event_type: "UPDATE_PLAN", user_email: c.get("user").email, at: now, before: { planned_date: p.planned_date, planned_qty: p.planned_qty }, after: b, metadata: { eo_item_id: p.eo_item_id, plan_id: id } }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true });
});

// DELETE /api/plans/:id  (soft-delete)
app.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const p = await c.env.DB.prepare("SELECT * FROM item_plan WHERE id = ? AND deleted_at IS NULL").bind(id).first<any>();
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  const it = await itemCtx(c.env.DB, p.eo_item_id);
  if (!it) return c.json({ error: "ITEM_NOT_FOUND" }, 404);
  if (!canEditPlan(c.get("user"), it)) return c.json({ error: "READ_ONLY" }, 403);
  const now = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE item_plan SET deleted_at = ?, deleted_by = ? WHERE id = ?").bind(now, c.get("user").email, id),
    eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: p.eo_item_id, eo_id: it!.eo_id, event_type: "DELETE_PLAN", user_email: c.get("user").email, at: now, before: { planned_date: p.planned_date, planned_qty: p.planned_qty }, metadata: { eo_item_id: p.eo_item_id, plan_id: id } }),
  ]);
  await bumpVersions(c.env.DB, ["eo"]);
  return c.json({ ok: true });
});

// ================================================================== Cap nhat hang loat
// Dung chung cho: modal "Cap nhat ke hoach hang loat" (Chi tiet EO), import Excel o man Ke hoach
// hang ve, va man Ke hoach tuan (KRF). Danh sach id truyen qua json_each(?) - tranh gioi han 100
// bien bind / statement cua D1 va gioi han so query moi request.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: unknown): s is string => typeof s === "string" && ISO_DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const CHUNK = 400;

interface LineRow {
  id: number; eo_id: number; part_code: string; part_code_goc: string | null; part_name: string; warehouse: string;
  current_qty: number; line_status: string; eo_code: string; approval_code: string | null; trang_thai: string; created_by: string;
}
const LINE_SELECT = `SELECT i.id, i.eo_id, i.part_code, i.part_code_goc, i.part_name, i.warehouse, i.current_qty, i.line_status,
  e.eo_code, e.approval_code, e.trang_thai, e.created_by FROM eo_item i JOIN eo e ON e.id = i.eo_id`;

// GET /api/plans/lines?eo_id=&loai=NGAY|TUAN&con_lai=1
//   -> dong linh kien cua EO da ban hanh (+ tong da len KH, da ve AMIS) va ke hoach song cua loai.
//   Khong truyen eo_id: moi dong EO ISSUED (con_lai=1 -> chi dong con thieu ke hoach), toi da 5000.
app.get("/lines", async (c) => {
  const eoId = Number(c.req.query("eo_id")) || null;
  const loai = c.req.query("loai") === "TUAN" ? "TUAN" : "NGAY";
  const conLai = c.req.query("con_lai") === "1";
  const lines = await c.env.DB.prepare(
    `SELECT i.id, i.eo_id, i.part_code, i.part_code_goc, i.part_name, i.warehouse, i.supplier, i.current_qty,
            e.eo_code, e.approval_code, e.tieu_de,
            COALESCE((SELECT SUM(p.planned_qty) FROM item_plan p WHERE p.eo_item_id = i.id AND p.deleted_at IS NULL), 0) da_len_kh,
            COALESCE((SELECT SUM(p.planned_qty) FROM item_plan p WHERE p.eo_item_id = i.id AND p.deleted_at IS NULL AND p.loai = ?), 0) da_len_kh_loai,
            COALESCE((SELECT SUM(r.qty_in) FROM amis_receipt r WHERE r.match_status = 'MATCHED_EO' AND r.matched_eo_item_id = i.id), 0) da_ve
     FROM eo_item i JOIN eo e ON e.id = i.eo_id
     WHERE e.trang_thai = 'ISSUED' AND i.line_status = 'ACTIVE' ${eoId ? "AND e.id = ?" : ""}
     ORDER BY e.issued_at DESC, e.id DESC, i.id LIMIT 5000`,
  ).bind(...(eoId ? [loai, eoId] : [loai])).all<any>();
  let rows = lines.results;
  if (conLai) rows = rows.filter((r) => r.current_qty - r.da_len_kh > 0);
  const plans = eoId
    ? (await c.env.DB.prepare(
        `SELECT p.* FROM item_plan p JOIN eo_item i ON i.id = p.eo_item_id
         WHERE i.eo_id = ? AND p.deleted_at IS NULL AND p.loai = ? ORDER BY p.eo_item_id, p.planned_date`,
      ).bind(eoId, loai).all()).results
    : [];
  return c.json({ lines: rows, plans });
});

interface BulkRow {
  _row?: number;
  eo_item_id?: number;
  ma_po?: string; part_code?: string; warehouse?: string;
  planned_date?: string; tuan?: string; planned_qty: number;
  factory_committed_date?: string | null; ghi_chu?: string | null;
}
const ERR_TEXT: Record<string, string> = {
  ITEM_NOT_FOUND: "Không tìm thấy dòng linh kiện (kiểm tra Mã PO / Mã LK / Kho)",
  EO_NOT_FOUND: "Không tìm thấy EO theo Mã PO",
  AMBIGUOUS: "Mã LK có nhiều dòng trong EO — cần ghi rõ Kho",
  EO_NOT_ISSUED: "EO chưa ban hành",
  LINE_CANCELLED: "Dòng đã hủy",
  READ_ONLY: "Bạn không có quyền cập nhật kế hoạch dòng này",
  BAD_QTY: "Số lượng không hợp lệ",
  BAD_DATE: "Ngày về không hợp lệ",
  BAD_WEEK: "Tuần không hợp lệ (dạng Y26-W42)",
  BAD_FACTORY_DATE: "Ngày NM cam kết không hợp lệ",
  DUPLICATE_WEEK: "Trùng tuần với dòng khác của cùng linh kiện",
  PLAN_EXCEEDS_QTY: "Tổng kế hoạch vượt số lượng đặt",
};

// POST /api/plans/bulk
// body: { loai: 'NGAY'|'TUAN', thay_the: bool, dry_run: bool, nguon?: string, rows: BulkRow[] }
//   - Dong xac dinh bang eo_item_id, hoac (ma_po = eo_code|approval_code, part_code [, warehouse]).
//   - thay_the: xoa mem ke hoach SONG cung loai cua cac dong co trong file roi ghi moi (import lai 1 file = idempotent).
//   - planned_qty = 0: khong ghi dong ke hoach (van tinh dong do vao pham vi thay the -> dung de xoa).
//   - Tat ca hoac khong: con 1 dong loi -> 400 kem danh sach loi, khong ghi gi.
app.post("/bulk", async (c) => {
  const u = c.get("user");
  const b = (await c.req.json()) as { loai?: string; thay_the?: boolean; dry_run?: boolean; nguon?: string; rows?: BulkRow[] };
  const loai = b.loai === "TUAN" ? "TUAN" : "NGAY";
  const input = Array.isArray(b.rows) ? b.rows : [];
  if (!input.length) return c.json({ error: "NO_ROWS" }, 400);
  if (input.length > 5000) return c.json({ error: "TOO_MANY_ROWS", max: 5000 }, 400);
  const db = c.env.DB;

  // ---- nap dong linh kien can dung
  const byId = new Map<number, LineRow>();
  const ids = [...new Set(input.map((r) => Number(r.eo_item_id)).filter((x) => x > 0))];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rs = await db.prepare(`${LINE_SELECT} WHERE i.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids.slice(i, i + CHUNK))).all<LineRow>();
    for (const r of rs.results) byId.set(r.id, r);
  }
  const pos = [...new Set(input.filter((r) => !(Number(r.eo_item_id) > 0) && r.ma_po).map((r) => String(r.ma_po).trim().toUpperCase()))];
  const eoByPo = new Map<string, number>();
  const linesByEo = new Map<number, LineRow[]>();
  for (let i = 0; i < pos.length; i += CHUNK) {
    const chunk = JSON.stringify(pos.slice(i, i + CHUNK));
    const es = await db.prepare(
      `SELECT id, UPPER(eo_code) c1, UPPER(COALESCE(approval_code,'')) c2 FROM eo
       WHERE UPPER(eo_code) IN (SELECT value FROM json_each(?)) OR UPPER(approval_code) IN (SELECT value FROM json_each(?))`,
    ).bind(chunk, chunk).all<{ id: number; c1: string; c2: string }>();
    for (const e of es.results) { eoByPo.set(e.c1, e.id); if (e.c2) eoByPo.set(e.c2, e.id); }
  }
  const eoIds = [...new Set(eoByPo.values())];
  for (let i = 0; i < eoIds.length; i += CHUNK) {
    const rs = await db.prepare(`${LINE_SELECT} WHERE i.eo_id IN (SELECT value FROM json_each(?)) ORDER BY i.id`).bind(JSON.stringify(eoIds.slice(i, i + CHUNK))).all<LineRow>();
    for (const r of rs.results) {
      byId.set(r.id, r);
      const arr = linesByEo.get(r.eo_id) ?? [];
      arr.push(r);
      linesByEo.set(r.eo_id, arr);
    }
  }

  // ---- kiem tung dong
  const up = (s: unknown) => String(s ?? "").trim().toUpperCase();
  const out = input.map((r, idx) => {
    const res: any = {
      _row: r._row ?? idx + 1, ok: false, planned_qty: r.planned_qty,
      factory_committed_date: r.factory_committed_date || null, ghi_chu: String(r.ghi_chu ?? "").trim() || null,
    };
    let line: LineRow | undefined;
    if (Number(r.eo_item_id) > 0) {
      line = byId.get(Number(r.eo_item_id));
      if (!line) return { ...res, error: "ITEM_NOT_FOUND" };
    } else {
      const eoId = eoByPo.get(up(r.ma_po));
      if (!eoId) return { ...res, error: r.ma_po ? "EO_NOT_FOUND" : "ITEM_NOT_FOUND" };
      const pc = up(r.part_code), wh = up(r.warehouse);
      let cands = (linesByEo.get(eoId) ?? []).filter((l) => up(l.part_code) === pc || up(l.part_code_goc) === pc);
      if (wh) cands = cands.filter((l) => up(l.warehouse) === wh);
      if (cands.length > 1) cands = cands.filter((l) => l.line_status === "ACTIVE");
      if (cands.length === 0) return { ...res, error: "ITEM_NOT_FOUND" };
      if (cands.length > 1) return { ...res, error: "AMBIGUOUS" };
      line = cands[0];
    }
    Object.assign(res, {
      eo_item_id: line.id, eo_id: line.eo_id, eo_code: line.eo_code, approval_code: line.approval_code,
      part_code: line.part_code, part_name: line.part_name, warehouse: line.warehouse, current_qty: line.current_qty,
    });
    if (line.trang_thai !== "ISSUED") return { ...res, error: "EO_NOT_ISSUED" };
    if (line.line_status !== "ACTIVE") return { ...res, error: "LINE_CANCELLED" };
    if (!canEditPlan(u, line)) return { ...res, error: "READ_ONLY" };
    const q = r.planned_qty;
    if (typeof q !== "number" || !Number.isFinite(q) || q < 0) return { ...res, error: "BAD_QTY" };
    if (loai === "TUAN") {
      const sat = r.tuan ? weekSaturday(r.tuan) : validDate(r.planned_date) ? weekEnd(r.planned_date) : null;
      if (!sat) return { ...res, error: "BAD_WEEK" };
      res.planned_date = sat;
      res.tuan = weekLabel(sat).label;
    } else {
      // SL 0 = chi dua dong vao pham vi thay the, khong can ngay
      if (!validDate(r.planned_date)) return q === 0 ? { ...res, ok: true, planned_date: null, tuan: null } : { ...res, error: "BAD_DATE" };
      res.planned_date = r.planned_date;
      res.tuan = null;
    }
    if (res.factory_committed_date && !validDate(res.factory_committed_date)) return { ...res, error: "BAD_FACTORY_DATE" };
    return { ...res, ok: true };
  });

  // ---- trung tuan (TUAN) + tong so luong theo dong
  if (loai === "TUAN") {
    const seen = new Set<string>();
    for (const r of out) if (r.ok && r.planned_qty > 0) {
      const k = `${r.eo_item_id}|${r.tuan}`;
      if (seen.has(k)) { r.ok = false; r.error = "DUPLICATE_WEEK"; } else seen.add(k);
    }
  }
  const itemIds = [...new Set(out.filter((r) => r.eo_item_id).map((r) => r.eo_item_id as number))];
  const live = new Map<number, { tong: number; cung_loai: number; so_cu: number }>();
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const rs = await db.prepare(
      `SELECT eo_item_id, SUM(planned_qty) tong, SUM(CASE WHEN loai = ? THEN planned_qty ELSE 0 END) cung_loai,
              SUM(CASE WHEN loai = ? THEN 1 ELSE 0 END) so_cu
       FROM item_plan WHERE deleted_at IS NULL AND eo_item_id IN (SELECT value FROM json_each(?)) GROUP BY eo_item_id`,
    ).bind(loai, loai, JSON.stringify(itemIds.slice(i, i + CHUNK))).all<{ eo_item_id: number; tong: number; cung_loai: number; so_cu: number }>();
    for (const r of rs.results) live.set(r.eo_item_id, r);
  }
  const newSum = new Map<number, number>();
  for (const r of out) if (r.ok) newSum.set(r.eo_item_id, (newSum.get(r.eo_item_id) ?? 0) + (r.planned_qty || 0));
  for (const r of out) {
    if (!r.ok) continue;
    const l = live.get(r.eo_item_id) ?? { tong: 0, cung_loai: 0, so_cu: 0 };
    const kept = b.thay_the ? l.tong - l.cung_loai : l.tong;
    const moi = newSum.get(r.eo_item_id) ?? 0;
    if (kept + moi > r.current_qty + 1e-9) {
      r.ok = false; r.error = "PLAN_EXCEEDS_QTY";
      r.detail = `Kế hoạch giữ lại ${kept} + mới ${moi} > SL đặt ${r.current_qty}`;
    }
  }
  for (const r of out) if (r.error) r.error_text = ERR_TEXT[r.error] ?? r.error;

  const errors = out.filter((r) => !r.ok);
  const writes = out.filter((r) => r.ok && r.planned_qty > 0);
  const scope = [...new Set(out.filter((r) => r.ok).map((r) => r.eo_item_id as number))];
  const soCu = b.thay_the ? scope.reduce((s, id) => s + (live.get(id)?.so_cu ?? 0), 0) : 0;
  const summary = { so_dong: out.length, so_loi: errors.length, so_ghi: writes.length, so_dong_lk: scope.length, so_ke_hoach_cu_thay: soCu };
  if (b.dry_run || errors.length) {
    return c.json({ ok: !errors.length, error: errors.length ? "HAS_ERRORS" : undefined, dry_run: !!b.dry_run, loai, summary, rows: out }, errors.length && !b.dry_run ? 400 : 200);
  }

  // ---- ghi (1 batch = 1 transaction)
  const now = nowVN();
  const stmts: D1PreparedStatement[] = [];
  if (b.thay_the) {
    for (let i = 0; i < scope.length; i += CHUNK) {
      stmts.push(db.prepare(
        `UPDATE item_plan SET deleted_at = ?, deleted_by = ? WHERE deleted_at IS NULL AND loai = ? AND eo_item_id IN (SELECT value FROM json_each(?))`,
      ).bind(now, u.email, loai, JSON.stringify(scope.slice(i, i + CHUNK))));
    }
  }
  for (let i = 0; i < writes.length; i += CHUNK) {
    const js = JSON.stringify(writes.slice(i, i + CHUNK).map((r) => [r.eo_item_id, r.planned_date, r.planned_qty, r.factory_committed_date, r.ghi_chu, r.tuan]));
    stmts.push(db.prepare(
      `INSERT INTO item_plan (eo_item_id, planned_date, planned_qty, factory_committed_date, ghi_chu, loai, tuan, created_by, created_at)
       SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'),
              json_extract(value,'$[4]'), ?, json_extract(value,'$[5]'), ?, ? FROM json_each(?)`,
    ).bind(loai, u.email, now, js));
  }
  // 1 event / dong linh kien: BULK_PLAN (after = cac moc moi; metadata = loai / thay the / so KH cu / nguon)
  const ev = scope.map((id) => {
    const first = out.find((r) => r.eo_item_id === id)!;
    const moc = writes.filter((r) => r.eo_item_id === id)
      .map((r) => ({ planned_date: r.planned_date, tuan: r.tuan, planned_qty: r.planned_qty, factory_committed_date: r.factory_committed_date, ghi_chu: r.ghi_chu }));
    const meta = { loai, thay_the: !!b.thay_the, so_ke_hoach_cu: b.thay_the ? (live.get(id)?.so_cu ?? 0) : 0, nguon: b.nguon ?? null, part_code: first.part_code };
    return [id, first.eo_id, JSON.stringify(moc), JSON.stringify(meta)];
  });
  for (let i = 0; i < ev.length; i += CHUNK) {
    stmts.push(db.prepare(
      `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
       SELECT 'eo_item', json_extract(value,'$[0]'), json_extract(value,'$[1]'), 'BULK_PLAN',
              json_extract(value,'$[2]'), json_extract(value,'$[3]'), ?, ? FROM json_each(?)`,
    ).bind(u.email, now, JSON.stringify(ev.slice(i, i + CHUNK))));
  }
  await db.batch(stmts);
  await bumpVersions(db, ["eo"]);
  return c.json({ ok: true, loai, summary });
});

export default app;
