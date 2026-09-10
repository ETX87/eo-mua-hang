import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { bumpVersions } from "../lib/dataVersions";
import { encryptSecret } from "../lib/secretBox";
import { nowVN } from "../lib/vnTime";

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

// ---- Google Drive OAuth (uy quyen 1 tai khoan Google THAT de upload file dinh kem EO) ----
// Port nguyen ban tu ../linh-kien-app (backend/src/routes/settingsDatMua.ts) - da chay that trong
// production o he do. Dung chung GOOGLE_CLIENT_ID/SECRET voi dang nhap, chi xin them scope
// drive.file qua 1 luong uy quyen rieng (access_type=offline de lay refresh_token, luu ma hoa).
const GOOGLE_DRIVE_STATE_COOKIE = "eomua_drive_oauth_state";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";

app.get("/google-drive/status", requireAdmin, async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT google_email, authorized_by, authorized_at FROM google_drive_oauth WHERE id = 1",
  ).first<{ google_email: string; authorized_by: string; authorized_at: string }>();
  if (!row) return c.json({ connected: false });
  return c.json({ connected: true, ...row });
});

app.get("/google-drive/authorize", requireAdmin, async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, GOOGLE_DRIVE_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });

  const redirectUri = `${new URL(c.req.url).origin}/api/danh-muc/google-drive/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/google-drive/callback", requireAdmin, async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, GOOGLE_DRIVE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_DRIVE_STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const redirectUri = `${url.origin}/api/danh-muc/google-drive/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google: " + (await tokenRes.text()), 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokenJson.refresh_token) {
    return c.text(
      "Google khong tra ve refresh_token (co the tai khoan da tung uy quyen truoc do) - vao myaccount.google.com/permissions, go quyen truy cap cua app nay roi thu lai.",
      400,
    );
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const userInfo = (await userInfoRes.json()) as { email: string };

  const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "EO mua hang - Tai lieu dinh kem", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!folderRes.ok) return c.text("Khong the tao folder Drive: " + (await folderRes.text()), 502);
  const { id: folderId } = (await folderRes.json()) as { id: string };

  const refreshTokenEnc = await encryptSecret(c.env, tokenJson.refresh_token);
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO google_drive_oauth (id, google_email, refresh_token_enc, folder_id, authorized_by, authorized_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       folder_id = excluded.folder_id, authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  ).bind(userInfo.email, refreshTokenEnc, folderId, user.email, nowVN()).run();

  return c.redirect(c.env.FRONTEND_URL || "/");
});

export default app;
