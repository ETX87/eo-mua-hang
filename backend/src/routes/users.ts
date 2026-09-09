import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/users/me - luon tra ve, ke ca khi chua duyet (FE dung de hien man cho duyet)
app.get("/me", (c) => c.json(c.get("user")));

// GET /api/users - Admin
app.get("/", requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM users ORDER BY trang_thai_duyet, email").all();
  return c.json(rows.results);
});

// GET /api/users/directory - moi tai khoan da duyet: danh sach toi thieu de chon nguoi tham dinh/duyet cuoi khi tao EO
app.get("/directory", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT email, ho_ten FROM users WHERE trang_thai_duyet = 'Da duyet' AND active = 1 ORDER BY ho_ten, email",
  ).all();
  return c.json(rows.results);
});

const EMAIL_RE = /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/;

// POST /api/users - Admin: them tai khoan thu cong, da duyet ngay (khi email do dang nhap Google
// se khop dong nay, khong bi treo "Cho duyet" lai).
app.post("/", requireAdmin, async (c) => {
  const b = (await c.req.json()) as { email?: string; ho_ten?: string; vai_tro?: string | null };
  const email = b.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return c.json({ error: "INVALID_EMAIL" }, 400);
  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return c.json({ error: "ALREADY_EXISTS" }, 409);
  const now = nowVN();
  await c.env.DB.prepare(
    `INSERT INTO users (email, ho_ten, vai_tro, trang_thai_duyet, active, approved_at, approved_by)
     VALUES (?, ?, ?, 'Da duyet', 1, ?, ?)`,
  ).bind(email, b.ho_ten?.trim() || email, b.vai_tro || null, now, c.get("user").email).run();
  await bumpVersions(c.env.DB, ["users"]);
  return c.json({ ok: true, email });
});

// PATCH /api/users/:email - Admin: vai tro / co nghiep vu / duyet / active
app.patch("/:email", requireAdmin, async (c) => {
  const email = c.req.param("email");
  const b = (await c.req.json()) as Record<string, unknown>;
  const allowed = [
    "ho_ten", "vai_tro", "la_nv_dat_hang", "la_nv_kho", "la_ke_toan", "la_theo_doi_td",
    "la_view", "khu_vuc_kho", "trang_thai_duyet", "active",
  ] as const;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of allowed) {
    if (k in b) { sets.push(`${k} = ?`); vals.push(b[k]); }
  }
  if (b["trang_thai_duyet"] === "Da duyet") {
    sets.push("approved_at = ?", "approved_by = ?");
    vals.push(nowVN(), c.get("user").email);
  }
  if (sets.length === 0) return c.json({ error: "NO_FIELDS" }, 400);
  vals.push(email);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`).bind(...vals).run();
  await bumpVersions(c.env.DB, ["users"]);
  return c.json({ ok: true });
});

export default app;
