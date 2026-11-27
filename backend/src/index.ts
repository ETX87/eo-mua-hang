import { Hono } from "hono";
import type { Env, AppVariables } from "./types";
import { verifySessionMiddleware } from "./middleware/session";
import { loadUser, requireApproved, requireWrite } from "./middleware/guards";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import eoRoutes from "./routes/eo";
import approvalsRoutes from "./routes/approvals";
import plansRoutes from "./routes/plans";
import amisRoutes from "./routes/amis";
import reportsRoutes from "./routes/reports";
import dashboardRoutes from "./routes/dashboard";
import danhMucRoutes from "./routes/danhMuc";
import notificationsRoutes from "./routes/notifications";
import etxNhanSuRoutes from "./routes/etxNhanSu";
import dvbhSyncRoutes from "./routes/dvbhSync";
import theoDoiRoutes from "./routes/theoDoi";
import viecCanLamRoutes from "./routes/viecCanLam";
import viecCuaToiRoutes from "./routes/viecCuaToi";
import xemNhanhRoutes from "./routes/xemNhanh";
import soDonHangRoutes from "./routes/soDonHang";
import partnerRoutes from "./routes/partner";
import viPhamRoutes from "./routes/viPham";
import loiPoRoutes from "./routes/loiPo";
import dieuHanhRoutes from "./routes/dieuHanh";
import caCeoRoutes from "./routes/caCeo";
import pushRoutes from "./routes/push";
import { danhGiaQuyTac } from "./lib/theoDoi";
import { dvbhEnabled, maybeSyncDvbh } from "./lib/dvbhSync";
import congNhiemVuRoutes from "./routes/congNhiemVu";
import { congNvBat, dayCongNhiemVu } from "./lib/congNhiemVu";
import { layCuaSoThongTin } from "./lib/cuaSoThongTin";

// EO MUA HANG - Worker doc lap (Hono + D1). Phuc vu ca API lan frontend tinh tu 1 Worker.
// Khong R2 (xem TARGET_ARCHITECTURE.md). Tu v0.105 co 1 cron MOI GIO: danhGiaQuyTac (ghi loi + nhac sap het han giai trinh + push).
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

// Day PO thay doi sang DVBH sau moi request API (khong cron - xem lib/dvbhSync.ts). Chay nen bang
// waitUntil, khong lam cham response; tu bo qua khi version du lieu + ngay chua doi.
// Cua so thong tin eOffice (2026-11-24, lib/cuaSoThongTin.ts): khong can dang nhap - hien ca o man dang nhap.
app.get("/api/cua-so", async (c) => c.json(await layCuaSoThongTin(c.env.CUA_SO_KHOA)));

app.use("/api/*", async (c, next) => {
  await next();
  // ghi loi Theo doi linh kien dat (R1/R3/R4) - toi da 10 phut/lan, xem lib/theoDoi.ts; xong moi day DVBH (payload co so loi)
  c.executionCtx.waitUntil((async () => {
    await danhGiaQuyTac(c.env).catch((e) => console.error("theo doi", e));
    if (dvbhEnabled(c.env) && !c.req.path.startsWith("/api/dvbh-sync")) await maybeSyncDvbh(c.env).catch((e) => console.error("dvbh sync", e));
  })());
  // v0.116 day viec cho duyet len App Nhiem vu eOffice khi version eo/users doi (lib/congNhiemVu.ts) - song song, loi khong anh huong nghiep vu
  if (congNvBat(c.env) && !c.req.path.startsWith("/api/cong-nhiem-vu")) {
    c.executionCtx.waitUntil(dayCongNhiemVu(c.env).catch((e) => console.error("cong nhiem vu", e)).then(() => undefined));
  }
});

// --- auth: khong yeu cau session ---
app.route("/api/auth", authRoutes);
// API he ngoai (X-API-Key rieng, khong session) - phai mount TRUOC verifySessionMiddleware
app.route("/api/partner", partnerRoutes);

// --- moi route /api/* con lai: session -> loadUser -> requireApproved (tru /users/me) -> requireWrite ---
app.use("/api/*", verifySessionMiddleware);
app.use("/api/*", loadUser);
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/users/me") return next();
  return requireApproved(c, next);
});
app.use("/api/*", requireWrite);

app.route("/api/users", usersRoutes);
app.route("/api/eo", eoRoutes);
app.route("/api/approvals", approvalsRoutes);
app.route("/api/plans", plansRoutes);
app.route("/api/amis", amisRoutes);
app.route("/api/reports", reportsRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/danh-muc", danhMucRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/etx-nhan-su", etxNhanSuRoutes);
app.route("/api/dvbh-sync", dvbhSyncRoutes);
app.route("/api/theo-doi", theoDoiRoutes);
app.route("/api/viec-can-lam", viecCanLamRoutes);
app.route("/api/viec-cua-toi", viecCuaToiRoutes);
app.route("/api/xem", xemNhanhRoutes);
app.route("/api/so-don-hang", soDonHangRoutes);
app.route("/api/vi-pham", viPhamRoutes);
app.route("/api/loi-po", loiPoRoutes);
app.route("/api/dieu-hanh", dieuHanhRoutes);
app.route("/api/ca-ceo", caCeoRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/cong-nhiem-vu", congNhiemVuRoutes);

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.onError((err, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  console.error(`[${requestId}]`, err);
  return c.json({ error: "INTERNAL_ERROR", requestId }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // v0.105 (2026-11-19, "He thong tu quet moi gio"): ban dem / ngay nghi khong ai mo app van ghi loi + nhac + day thong bao.
  async scheduled(_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(danhGiaQuyTac(env).catch((e) => console.error("cron theo doi", e)).then(() => undefined));
    // v0.116 cron moi gio gui lai anh chup du len Cong nhiem vu: lam moi "khan" theo gio + bu lan gui loi
    if (congNvBat(env)) ctx.waitUntil(dayCongNhiemVu(env, { force: true }).catch((e) => console.error("cron cong nhiem vu", e)).then(() => undefined));
  },
};
