import { Hono } from "hono";
import type { Env, AppVariables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /count - badge chuong thong bao (AppShell.tsx)
app.get("/count", async (c) => {
  const email = c.get("user").email;
  const r = await c.env.DB.prepare("SELECT COUNT(*) n FROM notification WHERE email = ? AND da_doc = 0")
    .bind(email)
    .first<{ n: number }>();
  return c.json({ count: r?.n ?? 0 });
});

// GET /?filter=all|unread|read - danh sach thong bao cua chinh nguoi dang dang nhap
app.get("/", async (c) => {
  const email = c.get("user").email;
  const filter = c.req.query("filter") ?? "all";
  const clause = filter === "unread" ? " AND n.da_doc = 0" : filter === "read" ? " AND n.da_doc = 1" : "";
  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.loai, n.noi_dung, n.eo_id, n.da_doc, n.created_at, e.eo_code
     FROM notification n JOIN eo e ON e.id = n.eo_id
     WHERE n.email = ?${clause} ORDER BY n.id DESC LIMIT 50`,
  )
    .bind(email)
    .all();
  return c.json(rows.results);
});

app.post("/mark-all-read", async (c) => {
  const email = c.get("user").email;
  await c.env.DB.prepare("UPDATE notification SET da_doc = 1 WHERE email = ? AND da_doc = 0").bind(email).run();
  return c.json({ ok: true });
});

app.post("/:id/read", async (c) => {
  const email = c.get("user").email;
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE notification SET da_doc = 1 WHERE id = ? AND email = ?").bind(id, email).run();
  return c.json({ ok: true });
});

export default app;
