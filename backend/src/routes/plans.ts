import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { canEditPlan } from "../lib/eoAccess";

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

export default app;
