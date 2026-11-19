import type { Env } from "../types";
import { dsCaCeo } from "./baoCaoLoi";
import { layDongDieuHanh, IM_LANG_DO } from "./dieuHanh";

/**
 * CA TON CEO + MUC XU LY (v0.097, yeu cau lanh dao 2026-11-19: "trong 150 ca CEO bao nhieu ca van dang ton dong, bao nhieu ca da xu ly xong
 * hoac duoc giai trinh roi => do hot khac nhau de phan biet"). Dung chung man /ca-ceo (routes/caCeo) va API doc /api/partner/ca-ceo.
 * Moi ca (dong dang mo cap CEO) 1 trong 3 muc:
 *   TON_DONG  dang vi pham: con loi CHO giai trinh · qua ngay du kien · tre han chua co ngay du kien · im lang >= IM_LANG_DO ngay
 *   BO_QUA_GT het vi pham dang chay nhung co loi he thong TU DONG vi qua 7 ngay (AUTO:QUA_HAN) va dong chua tung co giai trinh THAT
 *   DA_XU_LY  het vi pham dang chay; loi da giai trinh that / tu dong do da khac phuc -> chi con cho hang ve
 * Ca da ve du / ket thuc tu roi khoi danh sach (khong con la ca ton).
 */
export type MucXuLy = "TON_DONG" | "BO_QUA_GT" | "DA_XU_LY";
export const THU_MUC: Record<MucXuLy, number> = { TON_DONG: 3, BO_QUA_GT: 2, DA_XU_LY: 1 };

export async function dsCaCeoXuLy(env: Env) {
  const [ds, dh] = await Promise.all([dsCaCeo(env), layDongDieuHanh(env)]);
  const ids = ds.map((r) => r.item_id);
  // thong ke giai trinh theo dong: that / tu dong qua han / tu dong khac phuc
  const gt = new Map<number, { that: number; qh: number; kp: number }>();
  for (let i = 0; i < ids.length; i += 400) {
    const rs = (await env.DB.prepare(
      `SELECT l.eo_item_id id, SUM(COALESCE(g.pham_vi, '') <> 'AUTO') that, SUM(g.nhom = 'AUTO:QUA_HAN') qh, SUM(g.nhom = 'AUTO:KHAC_PHUC') kp
       FROM tl_loi l JOIN tl_giai_trinh g ON g.id = l.giai_trinh_id
       WHERE l.eo_item_id IN (SELECT value FROM json_each(?)) GROUP BY l.eo_item_id`,
    ).bind(JSON.stringify(ids.slice(i, i + 400))).all<{ id: number; that: number; qh: number; kp: number }>()).results;
    for (const r of rs) gt.set(r.id, { that: r.that ?? 0, qh: r.qh ?? 0, kp: r.kp ?? 0 });
  }
  const dhBy = new Map(dh.dong.map((d) => [d.id, d]));
  return ds.map((r) => {
    const d = dhBy.get(r.item_id);
    const g = gt.get(r.item_id) ?? { that: 0, qh: 0, kp: 0 };
    const imLang = d?.im_lang ?? null;
    const lyDo: string[] = [];
    if (r.so_loi_cho_gt > 0) lyDo.push(`${r.so_loi_cho_gt} lỗi chờ giải trình`);
    if (r.tinh_trang === "QUA_HAN_NDK") lyDo.push(`quá ngày dự kiến${d?.qua_dk ? ` ${d.qua_dk} ngày` : ""}`);
    if (r.tinh_trang === "TRE_NDK") lyDo.push("trễ hạn, chưa có ngày dự kiến");
    if (imLang != null && imLang >= IM_LANG_DO) lyDo.push(`${imLang} ngày không ai tác động`);
    const muc: MucXuLy = lyDo.length ? "TON_DONG" : g.qh > 0 && g.that === 0 ? "BO_QUA_GT" : "DA_XU_LY";
    if (muc === "BO_QUA_GT") lyDo.push(`${g.qh} lỗi quá 7 ngày bị hệ thống tự đóng, chưa có giải trình`);
    if (muc === "DA_XU_LY") lyDo.push(g.that ? `đã giải trình ${g.that} lỗi` : g.kp ? `đã khắc phục (${g.kp} lỗi tự đóng)` : "không còn lỗi", r.ngay_du_kien ? "đang chờ hàng theo ngày dự kiến" : "");
    return {
      ...r, muc_xu_ly: muc, ly_do_xu_ly: lyDo.filter(Boolean), so_gt_that: g.that, so_tu_dong_qua_han: g.qh, so_tu_dong_khac_phuc: g.kp,
      ton: d?.ton ?? null, gd: d?.gd ?? null, qua_dk: d?.qua_dk ?? 0, thuc: d?.thuc ?? 0, thuc7: d?.thuc7 ?? 0, thuc_luc: d?.thuc_luc ?? null,
      phan_hoi: d?.phan_hoi ?? 0, phan_hoi_luc: d?.phan_hoi_luc ?? null, phan_hoi_tt: d?.phan_hoi_tt ?? null,
      gt_nd: d?.gt_nd ?? null, gt_luc: d?.gt_luc ?? null, gt_ai_ma: d?.gt_ai_ma ?? null, gt_loi_ma: d?.gt_loi_ma ?? null,
      td_luc: d?.td_luc ?? null, td_loai: d?.td_loai ?? null, td_ai: d?.td_ai ?? null, im_lang: imLang, nhac: d?.nhac ?? 0,
    };
  }).sort((a, b) => THU_MUC[b.muc_xu_ly] - THU_MUC[a.muc_xu_ly] || (b.ton ?? 0) - (a.ton ?? 0));
}

export function demTheoMuc(rows: { muc_xu_ly: MucXuLy; po: string }[]) {
  const out: Record<MucXuLy, { dong: number; po: number }> = { TON_DONG: { dong: 0, po: 0 }, BO_QUA_GT: { dong: 0, po: 0 }, DA_XU_LY: { dong: 0, po: 0 } };
  for (const m of Object.keys(out) as MucXuLy[]) { const x = rows.filter((r) => r.muc_xu_ly === m); out[m] = { dong: x.length, po: new Set(x.map((r) => r.po)).size }; }
  return out;
}
