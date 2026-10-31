import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { bumpVersions } from "../lib/dataVersions";
import { encryptSecret } from "../lib/secretBox";
import { nowVN } from "../lib/vnTime";
import { cachedReport } from "../lib/reportCache";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ---- doc: ai cung xem duoc (dung cho dropdown form) ----
// goi y o nhap dong linh kien (form EO) + bo loc: ma LK -> ten (EO truoc, AMIS sau), doi tac, ly do PS da tung dung
app.get("/goi-y-dong", async (c) => c.json(await cachedReport(c.env.DB, "dm:goi-y-dong", ["eo", "amis"], async () => {
  const [lk, dt, ld] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ma, ten FROM (
         SELECT part_code ma, MAX(NULLIF(TRIM(part_name), '')) ten, 0 nguon FROM eo_item WHERE TRIM(part_code) <> '' GROUP BY UPPER(TRIM(part_code))
         UNION ALL
         SELECT part_code, MAX(NULLIF(TRIM(part_name), '')), 1 FROM amis_receipt WHERE voided_at IS NULL AND TRIM(part_code) <> ''
           AND UPPER(TRIM(part_code)) NOT IN (SELECT UPPER(TRIM(part_code)) FROM eo_item) GROUP BY UPPER(TRIM(part_code))
       ) ORDER BY ma`,
    ).all<{ ma: string; ten: string | null }>(),
    c.env.DB.prepare("SELECT MIN(TRIM(supplier)) v FROM eo_item WHERE TRIM(COALESCE(supplier, '')) <> '' GROUP BY UPPER(TRIM(supplier)) ORDER BY COUNT(*) DESC").all<{ v: string }>(),
    c.env.DB.prepare("SELECT MIN(TRIM(reason)) v FROM eo_item WHERE TRIM(COALESCE(reason, '')) <> '' GROUP BY UPPER(TRIM(reason)) ORDER BY COUNT(*) DESC").all<{ v: string }>(),
  ]);
  return {
    linh_kien: lk.results.map((r) => ({ ma: r.ma.trim(), ten: r.ten ?? "" })),
    doi_tac: dt.results.map((r) => r.v),
    ly_do: ld.results.map((r) => r.v),
  };
})));
app.get("/kho", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_warehouse ORDER BY ten_kho").all()).results));
app.get("/loai-hinh", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_eo_category ORDER BY code").all()).results));
app.get("/toc-do", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_speed_bucket ORDER BY min_days").all()).results));
app.get("/app", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM app_settings ORDER BY key").all()).results));

// ---- ghi: Admin ----
app.use("/*", async (c, next) => (c.req.method === "GET" ? next() : requireAdmin(c, next)));

app.put("/kho/:ten", async (c) => {
  const ten = decodeURIComponent(c.req.param("ten")).trim();
  if (!ten) return c.json({ error: "BAD_INPUT" }, 400);
  const b = (await c.req.json()) as { ma_kho?: string; active?: number };
  await c.env.DB.prepare(
    `INSERT INTO settings_warehouse (ten_kho, ma_kho, active) VALUES (?, ?, ?)
     ON CONFLICT(ten_kho) DO UPDATE SET ma_kho = excluded.ma_kho, active = excluded.active`,
  ).bind(ten, b.ma_kho ?? null, b.active ?? 1).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.put("/loai-hinh/:code", async (c) => {
  const code = decodeURIComponent(c.req.param("code")).trim();
  if (!code) return c.json({ error: "BAD_INPUT" }, 400);
  const b = (await c.req.json()) as { ten?: string; cap2?: string; phong_ban?: string };
  await c.env.DB.prepare(
    `INSERT INTO settings_eo_category (code, ten, cap2, phong_ban) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET ten = excluded.ten, cap2 = excluded.cap2, phong_ban = excluded.phong_ban`,
  ).bind(code, b.ten ?? code, b.cap2 ?? null, b.phong_ban ?? null).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

// min_days la khoa chinh -> doi nguong = xoa dong cu + them dong moi trong 1 batch
app.put("/toc-do", async (c) => {
  const b = (await c.req.json()) as { old_min_days?: number | null; min_days: number; label: string };
  if (typeof b.min_days !== "number" || !Number.isFinite(b.min_days) || !b.label?.trim()) {
    return c.json({ error: "BAD_INPUT" }, 400);
  }
  const stmts = [];
  if (b.old_min_days != null && b.old_min_days !== b.min_days) {
    stmts.push(c.env.DB.prepare("DELETE FROM settings_speed_bucket WHERE min_days = ?").bind(b.old_min_days));
  } else if (b.old_min_days == null) {
    const dup = await c.env.DB.prepare("SELECT 1 FROM settings_speed_bucket WHERE min_days = ?").bind(b.min_days).first();
    if (dup) return c.json({ error: "ALREADY_EXISTS" }, 409);
  }
  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO settings_speed_bucket (min_days, label) VALUES (?, ?)
       ON CONFLICT(min_days) DO UPDATE SET label = excluded.label`,
    ).bind(b.min_days, b.label.trim()),
  );
  await c.env.DB.batch(stmts);
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.delete("/toc-do/:min", async (c) => {
  const n = await c.env.DB.prepare("SELECT COUNT(*) n FROM settings_speed_bucket").first<{ n: number }>();
  if ((n?.n ?? 0) <= 1) return c.json({ error: "LAST_BUCKET" }, 409);
  await c.env.DB.prepare("DELETE FROM settings_speed_bucket WHERE min_days = ?").bind(Number(c.req.param("min"))).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.put("/app/:key", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const b = (await c.req.json()) as { value?: string };
  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).bind(key, b.value ?? null).run();
  await bumpVersions(c.env.DB, ["settings"]);
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
