import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { dayCongNhiemVu, gomViecChoDuyet, trangThaiCong } from "../lib/congNhiemVu";

// v0.116 Cong nhiem vu eOffice (lib/congNhiemVu.ts): trang thai lan gui cuoi + nut "Day len App Nhiem vu".
// Moi nguoi dung da duyet deu bam duoc: luon gui anh chup du (idempotent), khong lo du lieu ngoai hang cho duyet.
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/cong-nhiem-vu - trang thai + so viec dang cho (chua gui) de hien tren nut
app.get("/", async (c) => {
  const [st, gom] = await Promise.all([trangThaiCong(c.env), gomViecChoDuyet(c.env)]);
  return c.json({ ...st, hien_tai: { nguoi: gom.ds.length, viec: gom.ds.reduce((s, d) => s + d.items.length, 0), theo_loai: gom.theo_loai } });
});

// POST /api/cong-nhiem-vu/day - gui ngay anh chup du
app.post("/day", async (c) => {
  if (!c.env.TASK_FEED_KEY) return c.json({ error: "CHUA_CAU_HINH", message: "Chưa nạp khoá Cổng nhiệm vụ (TASK_FEED_KEY) cho app." }, 503);
  const kq = await dayCongNhiemVu(c.env, { force: true });
  if (!kq) return c.json({ error: "BUSY", message: "Đang có lần gửi khác chạy — thử lại sau 1–2 phút." }, 409);
  if (!kq.ok) return c.json({ error: "GUI_LOI", message: kq.loi ?? "Cổng nhiệm vụ trả lỗi", ket_qua: kq }, 502);
  return c.json(kq);
});

export default app;
