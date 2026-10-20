import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { dvbhEnabled, maybeSyncDvbh } from "../lib/dvbhSync";

// Admin: trang thai + chay tay dong bo PO sang app DVBH (lib/dvbhSync.ts).
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
app.use("*", requireAdmin);

// GET /api/dvbh-sync/status
app.get("/status", async (c) => {
  const st = await c.env.DB.prepare("SELECT * FROM dvbh_sync_state WHERE id = 1").first();
  const n = await c.env.DB.prepare("SELECT COUNT(*) n, MAX(pushed_at) gan_nhat FROM dvbh_sync_item").first<{ n: number; gan_nhat: string | null }>();
  return c.json({
    configured: dvbhEnabled(c.env), binding: !!c.env.DVBH, base_url: c.env.DVBH_BASE_URL ?? null,
    state: st, so_dong_da_gui: n?.n ?? 0, lan_gui_dong_gan_nhat: n?.gan_nhat ?? null,
  });
});

// POST /api/dvbh-sync/run  body { full?: boolean } - full = gui lai toan bo (dong bo lai khi lech)
app.post("/run", async (c) => {
  if (!dvbhEnabled(c.env)) return c.json({ error: "NOT_CONFIGURED" }, 400);
  const b = (await c.req.json().catch(() => ({}))) as { full?: boolean };
  const r = await maybeSyncDvbh(c.env, { force: true, full: !!b.full });
  if (!r.ran) return c.json({ error: "BUSY", message: "Đang có lần đồng bộ khác chạy — thử lại sau 1–2 phút." }, 409);
  if (r.error) return c.json({ error: "SYNC_FAILED", message: r.error }, 502);
  return c.json({ ok: true, pushed: r.pushed, total: r.total });
});

export default app;
