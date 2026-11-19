import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { danhGiaQuyTac } from "../lib/theoDoi";
import { dsCaCeoXuLy, demTheoMuc } from "../lib/caCeo";
import { xemToanBoTheoDoi } from "../lib/eoAccess";

/**
 * /api/ca-ceo - menu "Ca tồn CEO" (v0.091, yeu cau lanh dao tach rieng menu): dong dang mo cap CEO (lib/theoDoi: lui >= 3 lan / ngay DK cach
 * ngay dat >= 30 ngay / >= 3 loi) kem ma ER.MH-201..203 + dien giai, va hanh dong (lib/dieuHanh: thuc NCC, NCC phan hoi, giai trinh gan nhat, im lang).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/", async (c) => {
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  // v0.097: kem muc xu ly (TON_DONG / BO_QUA_GT / DA_XU_LY) - lib/caCeo
  const rows = await dsCaCeoXuLy(c.env);
  return c.json({ rows, dem: demTheoMuc(rows), quan_ly: xemToanBoTheoDoi(c.get("user")) });
});

export default app;
