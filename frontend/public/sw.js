// Ban sao tu linh-kien-app (v0.105, 2026-11-19).
// Service worker RIENG cho Web Push (phan hoi 2026-08-26: "Khi có tin nhắn thông báo mới => đẩy
// thông báo lập tức") - CHUA lam PWA offline-cache (khong intercept "fetch"), CHI xu ly 2 su kien
// push/notificationclick. Payload la JSON { title, body, url } (xem backend/src/lib/webPush.ts).
self.addEventListener("push", (event) => {
  let payload = { title: "Thông báo", body: "", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* payload khong phai JSON - giu mac dinh */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

// Bam vao notification - focus tab dang mo (neu co) thay vi luon mo tab moi, khop hanh vi app
// desktop/mobile thong thuong.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
