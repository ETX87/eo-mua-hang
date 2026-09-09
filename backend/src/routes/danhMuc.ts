import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { bumpVersions } from "../lib/dataVersions";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ---- doc: ai cung xem duoc (dung cho dropdown form) ----
app.get("/kho", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_warehouse ORDER BY ten_kho").all()).results));
app.get("/loai-hinh", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_eo_category ORDER BY code").all()).results));
app.get("/toc-do", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_speed_bucket ORDER BY min_days").all()).results));
app.get("/app", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM app_settings ORDER BY key").all()).results));

// ---- ghi: Admin ----
app.use("/*", async (c, next) => (c.req.method === "GET" ? next() : requireAdmin(c, next)));

app.put("/kho/:ten", async (c) => {
  const ten = decodeURIComponent(c.req.param("ten"));
  const b = (await c.req.json()) as { ma_kho?: string; active?: number };
  await c.env.DB.prepare(
    `INSERT INTO settings_warehouse (ten_kho, ma_kho, active) VALUES (?, ?, ?)
     ON CONFLICT(ten_kho) DO UPDATE SET ma_kho = excluded.ma_kho, active = excluded.active`,
  ).bind(ten, b.ma_kho ?? null, b.active ?? 1).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.put("/loai-hinh/:code", async (c) => {
  const code = decodeURIComponent(c.req.param("code"));
  const b = (await c.req.json()) as { ten?: string; cap2?: string; phong_ban?: string };
  await c.env.DB.prepare(
    `INSERT INTO settings_eo_category (code, ten, cap2, phong_ban) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET ten = excluded.ten, cap2 = excluded.cap2, phong_ban = excluded.phong_ban`,
  ).bind(code, b.ten ?? code, b.cap2 ?? null, b.phong_ban ?? null).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.put("/app/:key", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const b = (await c.req.json()) as { value?: string };
  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).bind(key, b.value ?? null).run();
  return c.json({ ok: true });
});

export default app;
