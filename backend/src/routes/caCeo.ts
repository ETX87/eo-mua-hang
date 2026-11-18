import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { danhGiaQuyTac } from "../lib/theoDoi";
import { dsCaCeo } from "../lib/baoCaoLoi";
import { layDongDieuHanh } from "../lib/dieuHanh";
import { xemToanBoTheoDoi } from "../lib/eoAccess";

/**
 * /api/ca-ceo - menu "Ca tồn CEO" (v0.091, yeu cau lanh dao tach rieng menu): dong dang mo cap CEO (lib/theoDoi: lui >= 3 lan / ngay DK cach
 * ngay dat >= 30 ngay / >= 3 loi) kem ma ER.MH-201..203 + dien giai, va hanh dong (lib/dieuHanh: thuc NCC, NCC phan hoi, giai trinh gan nhat, im lang).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/", async (c) => {
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const [ds, dh] = await Promise.all([dsCaCeo(c.env), layDongDieuHanh(c.env)]);
  const dhBy = new Map(dh.dong.map((d) => [d.id, d]));
  const rows = ds.map((r) => {
    const d = dhBy.get(r.item_id);
    return { ...r, ton: d?.ton ?? null, gd: d?.gd ?? null, qua_dk: d?.qua_dk ?? 0, thuc: d?.thuc ?? 0, thuc7: d?.thuc7 ?? 0, thuc_luc: d?.thuc_luc ?? null,
      phan_hoi: d?.phan_hoi ?? 0, phan_hoi_luc: d?.phan_hoi_luc ?? null, phan_hoi_tt: d?.phan_hoi_tt ?? null,
      gt_nd: d?.gt_nd ?? null, gt_luc: d?.gt_luc ?? null, gt_ai_ma: d?.gt_ai_ma ?? null, gt_loi_ma: d?.gt_loi_ma ?? null,
      td_luc: d?.td_luc ?? null, td_loai: d?.td_loai ?? null, td_ai: d?.td_ai ?? null, im_lang: d?.im_lang ?? null, nhac: d?.nhac ?? 0 };
  });
  return c.json({ rows, quan_ly: xemToanBoTheoDoi(c.get("user")) });
});

export default app;
