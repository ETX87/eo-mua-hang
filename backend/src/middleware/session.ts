import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verifySession, signSession } from "../lib/jwt";
import type { Env, AppVariables } from "../types";

export const SESSION_COOKIE = "eomua_session";
export const SESSION_TTL_SECONDS = 72 * 60 * 60; // 72h + gia han sliding

type Ctx = Context<{ Bindings: Env; Variables: AppVariables }>;

export async function verifySessionMiddleware(c: Ctx, next: Next) {
  // Local dev: bo qua OAuth khi bat co (dung email admin bootstrap)
  if (c.env.LOCAL_DEV_BYPASS_AUTH === "true") {
    c.set("email", c.env.BOOTSTRAP_ADMIN_EMAIL);
    await next();
    return;
  }

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "MISSING_TOKEN" }, 401);

  const payload = await verifySession(token, c.env.SESSION_SECRET);
  if (!payload) return c.json({ error: "INVALID_TOKEN" }, 401);

  c.set("email", payload.email);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp - now < SESSION_TTL_SECONDS / 2) {
    const fresh = await signSession({ email: payload.email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
    setCookie(c, SESSION_COOKIE, fresh, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
  }

  await next();
}
