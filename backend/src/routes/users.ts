import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";
import { linkOneUser } from "../lib/etxNhanSu";
import { layTenNguoiDung } from "../lib/tenNguoiDung";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/users/me - luon tra ve, ke ca khi chua duyet (FE dung de hien man cho duyet)
app.get("/me", (c) => c.json(c.get("user")));

// GET /api/users - Admin. Kem gmail_phu (user_alias); an dong users cua chinh Gmail phu (dong "Cho duyet" tao luc dang nhap truoc khi gan).
app.get("/", requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.*, (SELECT group_concat(a.email, ',') FROM user_alias a WHERE a.user_email = u.email) gmail_phu
     FROM users u WHERE u.email NOT IN (SELECT email FROM user_alias) ORDER BY u.trang_thai_duyet, u.email`,
  ).all();
  return c.json(rows.results);
});

// GET /api/users/ten - { gmail: ten hien thi } cho moi Gmail (uu tien ten ETX nhan su) - FE lib/format ten()
app.get("/ten", async (c) => c.json(await layTenNguoiDung(c.env.DB)));

// POST /api/users/:email/gmail-phu { gmail } - Admin: them Gmail dang nhap phu cho 1 tai khoan (dang nhap Gmail phu = dang nhap
// tai khoan chinh, hien ten tai khoan chinh). Gmail phu khong duoc la 1 tai khoan DA DUYET rieng (du lieu / quyen tach roi).
app.post("/:email/gmail-phu", requireAdmin, async (c) => {
  const db = c.env.DB;
  const chinh = decodeURIComponent(c.req.param("email") ?? "").toLowerCase();
  const gmail = String(((await c.req.json().catch(() => ({}))) as { gmail?: string }).gmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(gmail) || gmail === chinh) return c.json({ error: "INVALID_EMAIL" }, 400);
  if (!(await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(chinh).first())) return c.json({ error: "NOT_FOUND" }, 404);
  if (await db.prepare("SELECT 1 FROM user_alias WHERE email = ? OR email = ?").bind(chinh, gmail).first()) {
    const r = await db.prepare("SELECT user_email FROM user_alias WHERE email = ?").bind(gmail).first<{ user_email: string }>();
    return c.json({ error: r ? "DA_LA_GMAIL_PHU" : "TAI_KHOAN_LA_GMAIL_PHU", cua: r?.user_email ?? null }, 409);
  }
  if (await db.prepare("SELECT 1 FROM user_alias WHERE user_email = ?").bind(gmail).first()) return c.json({ error: "CO_GMAIL_PHU_RIENG" }, 409);
  const rieng = await db.prepare("SELECT trang_thai_duyet, active FROM users WHERE email = ?").bind(gmail).first<{ trang_thai_duyet: string; active: number }>();
  if (rieng?.trang_thai_duyet === "Da duyet" && rieng.active === 1) return c.json({ error: "LA_TAI_KHOAN_RIENG" }, 409);
  await db.batch([
    db.prepare("INSERT INTO user_alias (email, user_email, created_at, created_by) VALUES (?, ?, ?, ?)").bind(gmail, chinh, nowVN(), c.get("user").email),
    // dong "Cho duyet" tu tao khi Gmail nay dang nhap truoc do -> khoa (an khoi danh sach, dang nhap da chuyen sang tai khoan chinh)
    db.prepare("UPDATE users SET active = 0 WHERE email = ? AND trang_thai_duyet <> 'Da duyet'").bind(gmail),
  ]);
  await linkOneUser(db, chinh);
  await bumpVersions(db, ["users"]);
  return c.json({ ok: true });
});

app.delete("/:email/gmail-phu/:gmail", requireAdmin, async (c) => {
  const chinh = decodeURIComponent(c.req.param("email") ?? "").toLowerCase();
  const gmail = decodeURIComponent(c.req.param("gmail") ?? "").toLowerCase();
  await c.env.DB.prepare("DELETE FROM user_alias WHERE email = ? AND user_email = ?").bind(gmail, chinh).run();
  await linkOneUser(c.env.DB, chinh);
  await bumpVersions(c.env.DB, ["users"]);
  return c.json({ ok: true });
});

// GET /api/users/directory - moi tai khoan da duyet: danh sach toi thieu de chon nguoi tham dinh/duyet cuoi khi tao EO
app.get("/directory", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT email, ho_ten FROM users WHERE trang_thai_duyet = 'Da duyet' AND active = 1 ORDER BY ho_ten, email",
  ).all<{ email: string; ho_ten: string }>();
  // ten hien thi uu tien ETX (lib/tenNguoiDung)
  const ten = await layTenNguoiDung(c.env.DB);
  return c.json(rows.results.map((r) => ({ ...r, ho_ten: ten[r.email.toLowerCase()] ?? r.email.split("@")[0] }))
    .sort((a, b) => a.ho_ten.localeCompare(b.ho_ten, "vi")));
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
  await linkOneUser(c.env.DB, email);
  await bumpVersions(c.env.DB, ["users"]);
  return c.json({ ok: true, email });
});

// PATCH /api/users/:email - Admin: vai tro / co nghiep vu / duyet / active
app.patch("/:email", requireAdmin, async (c) => {
  const email = c.req.param("email");
  const b = (await c.req.json()) as Record<string, unknown>;
  // Khong tu khoa minh / ha quyen BOOTSTRAP_ADMIN (loadUser chi tu promote lai khi dong users bi mat).
  const protectedEmails = [c.get("user").email, (c.env.BOOTSTRAP_ADMIN_EMAIL ?? "").toLowerCase()];
  const demotes = ("vai_tro" in b && b.vai_tro !== "Admin") || ("active" in b && Number(b.active) !== 1) ||
    ("trang_thai_duyet" in b && b.trang_thai_duyet !== "Da duyet");
  if (protectedEmails.includes((email ?? "").toLowerCase()) && demotes) return c.json({ error: "CANNOT_DEMOTE_SELF_OR_BOOTSTRAP" }, 400);
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
