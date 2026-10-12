import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { signSession } from "../lib/jwt";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "../middleware/session";
import type { Env, AppVariables } from "../types";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
// Chong login-CSRF: /login dat state ngau nhien vao cookie, /callback chi nhan code khi state khop.
const LOGIN_STATE_COOKIE = "eomua_login_state";

// GET /api/auth/login -> chuyen huong sang Google OAuth consent
app.get("/login", (c) => {
  if (c.env.LOCAL_DEV_BYPASS_AUTH === "true") return c.redirect("/");
  const state = crypto.randomUUID();
  setCookie(c, LOGIN_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/api/auth" });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", c.env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
});

// GET /api/auth/callback?code=...
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "MISSING_CODE" }, 400);
  const state = c.req.query("state");
  const savedState = getCookie(c, LOGIN_STATE_COOKIE);
  deleteCookie(c, LOGIN_STATE_COOKIE, { path: "/api/auth" });
  if (!state || !savedState || state !== savedState) return c.json({ error: "BAD_STATE" }, 400);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.json({ error: "OAUTH_TOKEN_FAILED" }, 502);
  const tok = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!infoRes.ok) return c.json({ error: "OAUTH_USERINFO_FAILED" }, 502);
  const info = (await infoRes.json()) as { email: string; name?: string; verified_email?: boolean };
  if (!info.email || info.verified_email === false) return c.json({ error: "EMAIL_NOT_VERIFIED" }, 403);
  const email = info.email.toLowerCase();

  await c.env.DB.prepare(
    `INSERT INTO users (email, ho_ten) VALUES (?, ?) ON CONFLICT(email) DO NOTHING`,
  ).bind(email, info.name ?? email).run();

  const jwt = await signSession({ email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, jwt, {
    httpOnly: true, secure: true, sameSite: "Lax", maxAge: SESSION_TTL_SECONDS, path: "/",
  });
  return c.redirect(c.env.FRONTEND_URL || "/");
});

app.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/status", (c) => c.json({ hasCookie: !!getCookie(c, SESSION_COOKIE) }));

export default app;
