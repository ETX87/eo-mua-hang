import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { canCreateEo, canManageEo } from "../lib/eoAccess";
import { uploadPublicFile } from "../lib/googleDrive";
import { notifyStmt } from "../lib/notify";
import { recomputeMatch } from "../lib/amisMatch";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** So luong hop le: so huu han, >= 0. */
const validQty = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** Chi sua dong khi EO dang DRAFT (soan / bi yeu cau cap nhat) hoac ISSUED (sua SL sau ban hanh) - WORKFLOW_SPEC §6, §8. */
const ITEM_EDITABLE_STATES = ["DRAFT", "ISSUED"];

// ------------------------------------------------------------------ GET / (list)
app.get("/", async (c) => {
  const url = new URL(c.req.url);
  const status = url.searchParams.get("trang_thai");
  const q = url.searchParams.get("q");
  const createdBy = url.searchParams.get("created_by");
  const loaiHinh = url.searchParams.get("loai_hinh");
  const phongBan = url.searchParams.get("phong_ban");
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50), 200);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

  const where: string[] = [];
  const bind: unknown[] = [];
  if (status) { where.push("e.trang_thai = ?"); bind.push(status); }
  if (createdBy) { where.push("e.created_by = ?"); bind.push(createdBy); }
  if (loaiHinh) { where.push("e.loai_hinh = ?"); bind.push(loaiHinh); }
  if (phongBan) { where.push("e.phong_ban = ?"); bind.push(phongBan); }
  if (q) { where.push("(e.eo_code LIKE ? OR e.approval_code LIKE ? OR e.tieu_de LIKE ?)"); bind.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const wsql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.eo_code, e.approval_code, e.tieu_de, e.loai_hinh, e.phong_ban, e.trang_thai,
            e.final_approver_email, e.created_by, e.created_at, e.issued_at,
            (SELECT COUNT(*) FROM eo_item i WHERE i.eo_id = e.id) so_dong,
            (SELECT COALESCE(SUM(i.current_qty),0) FROM eo_item i WHERE i.eo_id = e.id) tong_sl
     FROM eo e ${wsql}
     ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
  ).bind(...bind, limit, offset).all();

  const total = await c.env.DB.prepare(`SELECT COUNT(*) n FROM eo e ${wsql}`).bind(...bind).first<{ n: number }>();
  return c.json({ rows: rows.results, total: total?.n ?? 0, limit, offset });
});

// ------------------------------------------------------------------ GET /:id (detail)
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const eo = await c.env.DB.prepare("SELECT * FROM eo WHERE id = ?").bind(id).first();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);

  const [items, subs, apprs, plans, files, comments, events] = await Promise.all([
    c.env.DB.prepare(
      `SELECT i.*,
              COALESCE((SELECT SUM(qty_in) FROM amis_receipt r WHERE r.match_status='MATCHED_EO' AND r.matched_eo_item_id = i.id), 0) da_dat,
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

  const now = nowVN();
  const seq = await c.env.DB.prepare(
    "UPDATE id_counters SET gia_tri_hien_tai = gia_tri_hien_tai + 1 WHERE ten_bang = 'eo_code' RETURNING gia_tri_hien_tai",
  ).first<{ gia_tri_hien_tai: number }>();
  const eoCode = `EO-${String(seq?.gia_tri_hien_tai ?? 1).padStart(6, "0")}`;

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
  batch.push(eventStmt(c.env.DB, { entity_type: "eo", entity_id: eoId, eo_id: eoId, event_type: "CREATE_EO", user_email: u.email, at: now, metadata: { eo_code: eoCode, reviewers: b.reviewers ?? [], skip_review: !!b.skip_review, so_dong: b.items.length, nguon_dong: b.nguon_dong ?? null } }));
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
    stmts.push(eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: ins!.id, eo_id: id, event_type: "APPROVE_POST_ISSUE_ITEM", user_email: c.get("user").email, at: now, metadata: { ly_do: "Tự duyệt — người thêm là người duyệt cuối của EO" } }));
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
    let du = (sump?.s ?? 0) - b.current_qty;
    if (du > 1e-9 && !b.cat_ke_hoach) return c.json({ error: "QTY_BELOW_PLANNED_SUM", planned_sum: sump?.s }, 409);
    if (du > 1e-9) {
      const pls = await c.env.DB.prepare(
        "SELECT id, planned_date, planned_qty, tuan, loai FROM item_plan WHERE eo_item_id = ? AND deleted_at IS NULL ORDER BY planned_date DESC, id DESC",
      ).bind(itemId).all<any>();
      const u = c.get("user").email;
      for (const p of pls.results) {
        if (du <= 1e-9) break;
        const meta = { eo_item_id: itemId, plan_id: p.id, ly_do: "Giảm SL đặt — tự giảm kế hoạch" };
        if (p.planned_qty <= du + 1e-9) {
          du -= p.planned_qty;
          stmts.push(
            c.env.DB.prepare("UPDATE item_plan SET deleted_at = ?, deleted_by = ? WHERE id = ?").bind(now, u, p.id),
            eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "DELETE_PLAN", user_email: u, at: now, before: { planned_date: p.planned_date, planned_qty: p.planned_qty, tuan: p.tuan }, metadata: meta }),
          );
        } else {
          const q = Math.round((p.planned_qty - du) * 1000) / 1000;
          stmts.push(
            c.env.DB.prepare("UPDATE item_plan SET planned_qty = ?, updated_by = ?, updated_at = ? WHERE id = ?").bind(q, u, now, p.id),
            eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: "UPDATE_PLAN", user_email: u, at: now, before: { planned_date: p.planned_date, planned_qty: p.planned_qty }, after: { planned_date: p.planned_date, planned_qty: q }, metadata: meta }),
          );
          du = 0;
        }
      }
    }
    const newLine = b.current_qty === 0 ? "CANCELLED_LINE" : "ACTIVE";
    stmts.push(
      c.env.DB.prepare("UPDATE eo_item SET current_qty = ?, line_status = ?, updated_by = ?, updated_at = ? WHERE id = ?")
        .bind(b.current_qty, newLine, c.get("user").email, now, itemId),
      eventStmt(c.env.DB, { entity_type: "eo_item", entity_id: itemId, eo_id: row.eo_id, event_type: b.current_qty === 0 ? "CANCEL_LINE" : "UPDATE_QUANTITY", user_email: c.get("user").email, at: now, before: { qty: row.current_qty }, after: { qty: b.current_qty }, metadata: { reason: b.reason ?? null } }),
    );
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
