import { buildPushPayload, type PushSubscription as WebPushSubscription } from "@block65/webcrypto-web-push";
import type { Env } from "../types";

// Ban sao tu linh-kien-app (v0.105, 2026-11-19). Day thong bao ngay qua Web Push (phan hoi 2026-08-26: "Khi có tin nhắn thông báo mới => đẩy thông
// báo lập tức cho nhân sự nhận thông báo. (nếu dùng điện thoại thì đẩy qua hệ thống thông báo, web
// thì đẩy 1 thông báo popup)") - CHI 1 co che duy nhat (Web Push API chuan, ma hoa qua
// @block65/webcrypto-web-push vi Workers khong co Node crypto that de dung goi "web-push" chinh
// thuc), khac biet "he thong thong bao" (mobile) vs "popup" (desktop web) la do TRINH DUYET/OS tu
// quyet dinh cach hien thi, khong phai app tu phan nhanh 2 duong rieng.
export interface PushPayload {
  title: string;
  body: string;
  // Duong dan tuong doi de Service Worker mo/focus dung tab khi bam vao notification (xem
  // frontend/public/sw.js) - vd "/" (mac dinh, mo Home).
  url: string;
}

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Gui push toi TAT CA thiet bi da dang ky cua 1 nguoi dung - loi tung thiet bi khong lam hong cac
 * thiet bi con lai. Subscription het han/bi thu hoi (404/410 tu push service) se tu XOA khoi DB. */
export async function sendPushToUser(env: Env, nguoiDung: string, payload: PushPayload): Promise<void> {
  if (!env.VAPID_SERVER_PRIVATE_KEY) return; // Chua cau hinh VAPID (vd local dev chua dien .dev.vars).
  const { results } = await env.DB.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE nguoi_dung = ?")
    .bind(nguoiDung)
    .all<PushSubscriptionRow>();
  if (results.length === 0) return;

  await Promise.all(
    results.map(async (row) => {
      const subscription: WebPushSubscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        const init = await buildPushPayload(
          { data: JSON.stringify(payload), options: { ttl: 3600, urgency: "high" } },
          subscription,
          { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_SERVER_PUBLIC_KEY, privateKey: env.VAPID_SERVER_PRIVATE_KEY },
        );
        const res = await fetch(row.endpoint, init);
        // 404/410 = push service da xoa subscription nay vinh vien (may/trinh duyet go cai dat, user
        // thu hoi quyen...) - don rac ngay, khong de tich luy subscription chet.
        if (res.status === 404 || res.status === 410) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(row.id).run();
        }
        else if (!res.ok) console.error("web push", res.status, await res.text().catch(() => ""));
      } catch (e) {
        // Khong lam hong luong chinh chi vi 1 lan gui push that bai mang - nhung LUON ghi log de chan doan.
        console.error("web push", e);
      }
    }),
  );
}
