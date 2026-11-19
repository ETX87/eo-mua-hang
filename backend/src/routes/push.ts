import { Hono } from "hono";
import type { Env, AppVariables } from "../types";



// Dang ky/huy Web Push subscription (phan hoi 2026-08-26: day thong bao ngay khi co tin nhan moi
// (v0.105 - ban sao tu linh-kien-app; xem lib/webPush.ts, migration 0025_nhac_het_han_push.sql).
const push = new Hono<{ Bindings: Env; Variables: AppVariables }>();
// session + loadUser + requireApproved da gan o index.ts (/api/*).

// GET /api/push/vapid-public-key - khong nhay cam (public key), frontend can gia tri nay lam
// applicationServerKey cho PushManager.subscribe().
push.get("/vapid-public-key", (c) => c.json({ publicKey: c.env.VAPID_SERVER_PUBLIC_KEY }));

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// POST /api/push/subscribe - luu/cap nhat 1 PushSubscription (goi ngay sau
// PushManager.subscribe() thanh cong o frontend). "endpoint" la khoa tu nhien (UNIQUE) - 1 nguoi
// dung bat lai tu 1 thiet bi da dang ky se ghi de p256dh/auth cu (endpoint co the doi key ma van
// giu nguyen URL trong 1 so truong hop trinh duyet lam moi subscription).
// Chi nhan endpoint cua dich vu push that cua trinh duyet (2026-10-08, danh gia bao mat) - truoc day nhan URL bat ky,
// Worker se goi POST toi URL do moi khi co thong bao (bi loi dung de Worker goi ra ngoai).
const HOST_PUSH = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
function laEndpointPush(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 1000) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOST_PUSH.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

push.post("/subscribe", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<SubscribeBody>();
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) return c.json({ error: "INVALID_BODY" }, 400);
  if (!laEndpointPush(body.endpoint) || body.keys.p256dh.length > 200 || body.keys.auth.length > 100) return c.json({ error: "INVALID_BODY" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (nguoi_dung, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET nguoi_dung = excluded.nguoi_dung, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(user.email, body.endpoint, body.keys.p256dh, body.keys.auth)
    .run();
  return c.json({ ok: true });
});

// POST /api/push/unsubscribe - goi khi nguoi dung tu tat thong bao day (xoa dong tuong ung).
push.post("/unsubscribe", async (c) => {
  const body = await c.req.json<{ endpoint: string }>();
  if (!body.endpoint) return c.json({ error: "INVALID_BODY" }, 400);
  // Chi xoa dang ky CUA CHINH MINH (truoc day xoa duoc dang ky cua nguoi khac neu biet endpoint).
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND nguoi_dung = ?").bind(body.endpoint, c.get("user").email).run();
  return c.json({ ok: true });
});

export default push;
