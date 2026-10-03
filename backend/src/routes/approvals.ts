import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { notifyStmt } from "../lib/notify";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ------------------------------------------------------------------ GET /count  (badge)
app.get("/count", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM eo_approval a JOIN eo_submission s ON s.id = a.submission_id
     WHERE a.approver_email = ? AND a.status = 'PENDING' AND s.status = 'PENDING'`,
  ).bind(c.get("user").email).first<{ n: number }>();
  const p = await c.env.DB.prepare(
    `SELECT COUNT(*) n FROM eo_item i JOIN eo e ON e.id = i.eo_id
     WHERE i.post_issue_status = 'PENDING' AND e.trang_thai = 'ISSUED' AND e.final_approver_email = ?`,
  ).bind(c.get("user").email).first<{ n: number }>();
  return c.json({ count: (r?.n ?? 0) + (p?.n ?? 0) });
});

// ------------------------------------------------------------------ GET /post-issue (dong them sau ban hanh cho duyet)
app.get("/post-issue", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.eo_id, i.part_code, i.part_name, i.warehouse, i.current_qty, i.reason, i.created_by, i.created_at,
            e.eo_code, e.approval_code, e.tieu_de
     FROM eo_item i JOIN eo e ON e.id = i.eo_id
     WHERE i.post_issue_status = 'PENDING' AND e.trang_thai = 'ISSUED' AND e.final_approver_email = ?
     ORDER BY i.created_at`,
  ).bind(c.get("user").email).all();
  return c.json(rows.results);
});

// ------------------------------------------------------------------ GET /inbox
app.get("/inbox", async (c) => {
  const email = c.get("user").email;
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.submission_id, a.step_type, a.status, a.assigned_at,
            s.eo_id, s.version, e.eo_code, e.tieu_de, e.trang_thai eo_status
     FROM eo_approval a
     JOIN eo_submission s ON s.id = a.submission_id
     JOIN eo e ON e.id = s.eo_id
     WHERE a.approver_email = ? AND a.status = 'PENDING'
       AND s.status IN ('PENDING')
     ORDER BY a.assigned_at`,
  ).bind(email).all();
  return c.json(rows.results);
});

// ------------------------------------------------------------------ POST /:id/act
// body: { action: 'approve'|'reject'|'request_update'|'withdraw', comment?: string }
app.post("/:id/act", async (c) => {
  const aid = Number(c.req.param("id"));
  const b = (await c.req.json()) as { action: string; comment?: string };
  const u = c.get("user");
  const now = nowVN();

  const a = await c.env.DB.prepare(
    `SELECT a.*, s.eo_id, s.status sub_status, e.trang_thai eo_status, e.final_approver_email,
            e.eo_code eo_code, e.created_by eo_created_by
     FROM eo_approval a JOIN eo_submission s ON s.id = a.submission_id JOIN eo e ON e.id = s.eo_id
     WHERE a.id = ?`,
  ).bind(aid).first<any>();
  if (!a) return c.json({ error: "NOT_FOUND" }, 404);
  const isOwner = a.approver_email === u.email;
  const isAdmin = u.vai_tro === "Admin";
  if (!isOwner && !isAdmin) return c.json({ error: "NOT_YOUR_APPROVAL" }, 403);

  const subId = a.submission_id as number;
  const eoId = a.eo_id as number;
  const stmts: any[] = [];

  // ---- WITHDRAW (chi phieu REVIEW da APPROVED) ----
  if (b.action === "withdraw") {
    if (a.step_type !== "REVIEW" || a.status !== "APPROVED") return c.json({ error: "CANT_WITHDRAW" }, 409);
    stmts.push(
      c.env.DB.prepare("UPDATE eo_approval SET status = 'WITHDRAWN', action_at = ?, comment = ? WHERE id = ?").bind(now, b.comment ?? null, aid),
      c.env.DB.prepare(
        `INSERT INTO eo_approval (submission_id, step_type, step_no, approver_email, status, assigned_at)
         VALUES (?, 'REVIEW', 1, ?, 'PENDING', ?)`,
      ).bind(subId, a.approver_email, now),
    );
    // neu FINAL da mo ma review chua xong -> dua EO ve IN_REVIEW, huy phieu FINAL PENDING
    stmts.push(
      c.env.DB.prepare("UPDATE eo_approval SET status = 'SKIPPED', action_at = ? WHERE submission_id = ? AND step_type = 'FINAL' AND status = 'PENDING'").bind(now, subId),
      c.env.DB.prepare("UPDATE eo SET trang_thai = 'IN_REVIEW', updated_by = ?, updated_at = ? WHERE id = ? AND trang_thai = 'WAITING_FINAL_APPROVAL'").bind(u.email, now, eoId),
      eventStmt(c.env.DB, { entity_type: "eo_approval", entity_id: aid, eo_id: eoId, event_type: "WITHDRAW_REVIEW", user_email: u.email, at: now, metadata: { comment: b.comment ?? null } }),
    );
    await c.env.DB.batch(stmts);
    await bumpVersions(c.env.DB, ["eo"]);
    return c.json({ ok: true });
  }

  if (a.status !== "PENDING") return c.json({ error: "ALREADY_ACTIONED", status: a.status }, 409);
  if (a.sub_status !== "PENDING") return c.json({ error: "SUBMISSION_CLOSED", sub_status: a.sub_status }, 409);

  // ================= REVIEW =================
  if (a.step_type === "REVIEW") {
    if (b.action === "request_update") {
      stmts.push(
        c.env.DB.prepare("UPDATE eo_approval SET status = 'REQUEST_UPDATE', action_at = ?, comment = ? WHERE id = ?").bind(now, b.comment ?? null, aid),
        c.env.DB.prepare("UPDATE eo_submission SET status = 'REQUEST_UPDATE', closed_at = ? WHERE id = ?").bind(now, subId),
        c.env.DB.prepare("UPDATE eo SET trang_thai = 'DRAFT', updated_by = ?, updated_at = ? WHERE id = ?").bind(u.email, now, eoId),
        eventStmt(c.env.DB, { entity_type: "eo_approval", entity_id: aid, eo_id: eoId, event_type: "REQUEST_UPDATE", user_email: u.email, at: now, metadata: { comment: b.comment ?? null } }),
      );
      if (a.eo_created_by !== u.email) {
        stmts.push(notifyStmt(c.env.DB, { email: a.eo_created_by, loai: "request_update", noi_dung: `EO ${a.eo_code} bị yêu cầu cập nhật${b.comment ? ": " + b.comment : ""}`, eo_id: eoId, at: now }));
      }
      await c.env.DB.batch(stmts);
      await bumpVersions(c.env.DB, ["eo"]);
      return c.json({ ok: true, trang_thai: "DRAFT" });
    }
    if (b.action !== "approve" && b.action !== "reject") return c.json({ error: "BAD_ACTION" }, 400);
    const newStatus = b.action === "approve" ? "APPROVED" : "REJECTED";
    stmts.push(
      c.env.DB.prepare("UPDATE eo_approval SET status = ?, action_at = ?, comment = ? WHERE id = ?").bind(newStatus, now, b.comment ?? null, aid),
      eventStmt(c.env.DB, { entity_type: "eo_approval", entity_id: aid, eo_id: eoId, event_type: b.action === "approve" ? "APPROVE_REVIEW" : "REJECT_REVIEW", user_email: u.email, at: now, metadata: { comment: b.comment ?? null } }),
    );

    // con phieu REVIEW nao PENDING khong?
    const pend = await c.env.DB.prepare(
      "SELECT COUNT(*) n FROM eo_approval WHERE submission_id = ? AND step_type = 'REVIEW' AND status = 'PENDING' AND id <> ?",
    ).bind(subId, aid).first<{ n: number }>();
    if ((pend?.n ?? 0) === 0) {
      // mo FINAL
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO eo_approval (submission_id, step_type, step_no, approver_email, status, assigned_at)
           VALUES (?, 'FINAL', 2, ?, 'PENDING', ?)`,
        ).bind(subId, a.final_approver_email, now),
        c.env.DB.prepare("UPDATE eo SET trang_thai = 'WAITING_FINAL_APPROVAL', updated_by = ?, updated_at = ? WHERE id = ?").bind(u.email, now, eoId),
      );
    }
    await c.env.DB.batch(stmts);
    await bumpVersions(c.env.DB, ["eo"]);
    return c.json({ ok: true });
  }

  // ================= FINAL =================
  if (a.step_type === "FINAL") {
    if (b.action !== "approve" && b.action !== "reject") return c.json({ error: "BAD_ACTION" }, 400);
    if (b.action === "reject") {
      stmts.push(
        c.env.DB.prepare("UPDATE eo_approval SET status = 'REJECTED', action_at = ?, comment = ? WHERE id = ?").bind(now, b.comment ?? null, aid),
        c.env.DB.prepare("UPDATE eo_submission SET status = 'REJECTED', closed_at = ? WHERE id = ?").bind(now, subId),
        c.env.DB.prepare("UPDATE eo SET trang_thai = 'REJECTED', updated_by = ?, updated_at = ? WHERE id = ?").bind(u.email, now, eoId),
        eventStmt(c.env.DB, { entity_type: "eo_approval", entity_id: aid, eo_id: eoId, event_type: "REJECT_FINAL", user_email: u.email, at: now, metadata: { comment: b.comment ?? null } }),
      );
      if (a.eo_created_by !== u.email) {
        stmts.push(notifyStmt(c.env.DB, { email: a.eo_created_by, loai: "rejected", noi_dung: `EO ${a.eo_code} bị từ chối (duyệt cuối)${b.comment ? ": " + b.comment : ""}`, eo_id: eoId, at: now }));
      }
      await c.env.DB.batch(stmts);
      await bumpVersions(c.env.DB, ["eo"]);
      return c.json({ ok: true, trang_thai: "REJECTED" });
    }
    // approve -> ISSUE
    const seq = await c.env.DB.prepare(
      "UPDATE id_counters SET gia_tri_hien_tai = gia_tri_hien_tai + 1 WHERE ten_bang = 'approval_code' RETURNING gia_tri_hien_tai",
    ).first<{ gia_tri_hien_tai: number }>();
    const approvalCode = `3TDO-${String(seq?.gia_tri_hien_tai ?? 1).padStart(6, "0")}`;
    stmts.push(
      c.env.DB.prepare("UPDATE eo_approval SET status = 'APPROVED', action_at = ?, comment = ? WHERE id = ?").bind(now, b.comment ?? null, aid),
      c.env.DB.prepare("UPDATE eo_submission SET status = 'APPROVED', closed_at = ? WHERE id = ?").bind(now, subId),
      c.env.DB.prepare(
        "UPDATE eo SET trang_thai = 'ISSUED', approval_code = ?, issued_by = ?, issued_at = ?, updated_by = ?, updated_at = ? WHERE id = ?",
      ).bind(approvalCode, u.email, now, u.email, now, eoId),
      // snapshot original_qty cho item tao truoc ban hanh
      c.env.DB.prepare("UPDATE eo_item SET original_qty = current_qty WHERE eo_id = ? AND created_after_issue = 0").bind(eoId),
      eventStmt(c.env.DB, { entity_type: "eo_approval", entity_id: aid, eo_id: eoId, event_type: "APPROVE_FINAL", user_email: u.email, at: now }),
      eventStmt(c.env.DB, { entity_type: "eo", entity_id: eoId, eo_id: eoId, event_type: "ISSUE_EO", user_email: u.email, at: now, metadata: { approval_code: approvalCode } }),
    );
    if (a.eo_created_by !== u.email) {
      stmts.push(notifyStmt(c.env.DB, { email: a.eo_created_by, loai: "issued", noi_dung: `EO ${a.eo_code} đã được ban hành (mã duyệt ${approvalCode})`, eo_id: eoId, at: now }));
    }
    await c.env.DB.batch(stmts);
    await bumpVersions(c.env.DB, ["eo", "amis"]); // amis: match_status can tinh lai khi co approval_code moi
    return c.json({ ok: true, trang_thai: "ISSUED", approval_code: approvalCode });
  }

  return c.json({ error: "UNKNOWN_STEP" }, 400);
});

export default app;
