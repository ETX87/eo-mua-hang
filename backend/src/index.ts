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
import xemNhanhRoutes from "./routes/xemNhanh";
import partnerRoutes from "./routes/partner";
import { danhGiaQuyTac } from "./lib/theoDoi";
import { dvbhEnabled, maybeSyncDvbh } from "./lib/dvbhSync";

// EO MUA HANG - Worker doc lap (Hono + D1). Phuc vu ca API lan frontend tinh tu 1 Worker.
// Khong cron, khong R2 (xem TARGET_ARCHITECTURE.md).
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

// Day PO thay doi sang DVBH sau moi request API (khong cron - xem lib/dvbhSync.ts). Chay nen bang
// waitUntil, khong lam cham response; tu bo qua khi version du lieu + ngay chua doi.
app.use("/api/*", async (c, next) => {
  await next();
  // ghi loi Theo doi linh kien dat (R1/R3/R4) - toi da 10 phut/lan, xem lib/theoDoi.ts; xong moi day DVBH (payload co so loi)
  c.executionCtx.waitUntil((async () => {
    await danhGiaQuyTac(c.env).catch((e) => console.error("theo doi", e));
    if (dvbhEnabled(c.env) && !c.req.path.startsWith("/api/dvbh-sync")) await maybeSyncDvbh(c.env).catch((e) => console.error("dvbh sync", e));
  })());
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
app.route("/api/xem", xemNhanhRoutes);

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.onError((err, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  console.error(`[${requestId}]`, err);
  return c.json({ error: "INTERNAL_ERROR", requestId }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch };
