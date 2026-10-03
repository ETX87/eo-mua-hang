import type { Context, Next } from "hono";
import type { Env, AppVariables, AppUser } from "../types";
import { nowVN } from "../lib/vnTime";
import { linkOneUser } from "../lib/etxNhanSu";

type Ctx = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Nap users row -> ctx.user. Tu tao/promote tai khoan bootstrap admin o lan dau. Tai khoan chua
 * duyet / bi khoa -> 403 (tru chinh route /api/users/me de FE biet trang thai).
 */
export async function loadUser(c: Ctx, next: Next) {
  const email = c.get("email");
  let user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<AppUser>();

  if (!user && email && email === c.env.BOOTSTRAP_ADMIN_EMAIL) {
    await c.env.DB.prepare(
      `INSERT INTO users (email, ho_ten, vai_tro, trang_thai_duyet, active, approved_at)
       VALUES (?, ?, 'Admin', 'Da duyet', 1, ?)
       ON CONFLICT(email) DO UPDATE SET vai_tro='Admin', trang_thai_duyet='Da duyet', active=1`,
    ).bind(email, email, nowVN()).run();
    user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<AppUser>();
  }

  if (!user) {
    // Tao dong cho duyet de Admin thay trong Users module
    await c.env.DB.prepare(
      `INSERT INTO users (email, ho_ten) VALUES (?, ?) ON CONFLICT(email) DO NOTHING`,
    ).bind(email, email).run();
    await linkOneUser(c.env.DB, email);
    user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<AppUser>();
  }

  c.set("user", user as AppUser);
  await next();
}

/** Chan moi route nghiep vu neu tai khoan chua duoc duyet hoac bi vo hieu hoa. */
export async function requireApproved(c: Ctx, next: Next) {
  const u = c.get("user");
  if (!u || u.trang_thai_duyet !== "Da duyet" || u.active !== 1) {
    return c.json({ error: "ACCOUNT_NOT_APPROVED", trang_thai_duyet: u?.trang_thai_duyet ?? null }, 403);
  }
  await next();
}

/** View = chi doc: chan moi method khac GET. */
export async function requireWrite(c: Ctx, next: Next) {
  const u = c.get("user");
  const isViewOnly = u.vai_tro === "View" || (u.la_view === 1 &&
    u.la_nv_dat_hang === 0 && u.la_nv_kho === 0 && u.la_ke_toan === 0 && u.la_theo_doi_td === 0);
  if (isViewOnly && c.req.method !== "GET") {
    return c.json({ error: "READ_ONLY" }, 403);
  }
  await next();
}

export async function requireAdmin(c: Ctx, next: Next) {
  if (c.get("user").vai_tro !== "Admin") return c.json({ error: "ADMIN_ONLY" }, 403);
  await next();
}
