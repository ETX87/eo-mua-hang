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

// EO MUA HANG - Worker doc lap (Hono + D1). Phuc vu ca API lan frontend tinh tu 1 Worker.
// Khong cron, khong R2 (xem TARGET_ARCHITECTURE.md).
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

// --- auth: khong yeu cau session ---
app.route("/api/auth", authRoutes);

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

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.onError((err, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  console.error(`[${requestId}]`, err);
  return c.json({ error: "INTERNAL_ERROR", requestId }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default { fetch: app.fetch };
