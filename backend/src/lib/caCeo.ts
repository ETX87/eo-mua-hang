import type { Env } from "../types";
import { dsCaCeo } from "./baoCaoLoi";
import { layDongDieuHanh } from "./dieuHanh";
import { layDongTheoDoi, HAN_GT_TXT } from "./theoDoi";
import { maCeo } from "./maLoi";

/**
 * CA CEO + DO HOT (v0.098, chot voi lanh dao 2026-11-19 - moc 7 ngay = moc he thong tu bo giai trinh ca cu, lib/theoDoi tuGiaiTrinh):
 *   RAT_HOT   don CHUA XONG (con thieu hang) + con loi ghi nhan <= 7 ngay CHUA giai trinh  -> chua xu ly, rat hot
 *   GIAM_HOT  don CHUA XONG + loi da > 7 ngay (he thong tu dong) hoac da giai trinh bu     -> dang giam hot
 *   DA_XONG   don DA XONG (hang ve du / ket thuc som) nhung tung cham nguong CEO            -> khong con hot
 * Dong dang mo: nguong CEO theo lib/theoDoi (ceo_ly_do). Dong da dong (khong co ceo_ly_do): tinh lai cung 3 nguong (lui >= 3 · ngay DK cach ngay dat
 * >= 30 · >= 3 loi), chi dong ap dung quy tac, bo dong bi huy. Dung chung man /ca-ceo (routes/caCeo) + API doc /api/partner/ca-ceo.
 */
export type MucXuLy = "RAT_HOT" | "GIAM_HOT" | "DA_XONG";
export const THU_MUC: Record<MucXuLy, number> = { RAT_HOT: 3, GIAM_HOT: 2, DA_XONG: 1 };
const HUY = "Đơn trên EO bị hủy";
const dmy = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const soNgay = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400_000);

export async function dsCaCeoXuLy(env: Env) {
  const [mo, tatCa, dh] = await Promise.all([dsCaCeo(env), layDongTheoDoi(env, "tat_ca"), layDongDieuHanh(env)]);
  // ca DA DONG tung cham nguong CEO
  const dong = tatCa.filter((r) => r.tinh_trang === "DONG" && r.ap_dung && r.trang_thai_don_hang !== HUY).map((r) => {
    const ma: { ma: string; ten: string; nguong: string; gia_tri: string; chi_tiet: string[] }[] = [];
    if (r.so_lan_lui >= 3) ma.push({ ma: maCeo("LUI")!.ma, ten: "Lùi ngày dự kiến nhiều lần", nguong: "≥ 3 lần", gia_tri: `${r.so_lan_lui} lần`, chi_tiet: [] });
    const xa = r.ngay_du_kien_gan_nhat && r.bat_dau ? soNgay(r.bat_dau, r.ngay_du_kien_gan_nhat) : 0;
    if (xa >= 30) ma.push({ ma: maCeo("XA")!.ma, ten: "Ngày dự kiến quá xa ngày đặt", nguong: "≥ 30 ngày", gia_tri: `${xa} ngày`, chi_tiet: [] });
    if (r.so_loi >= 3) ma.push({ ma: maCeo("LOI")!.ma, ten: "Tích lũy nhiều lỗi", nguong: "≥ 3 lỗi", gia_tri: `${r.so_loi} lỗi`, chi_tiet: [] });
    return ma.length ? {
      item_id: r.item_id, eo_id: r.eo_id, po: r.ma_phe_duyet || r.eo_code, eo_code: r.eo_code, ma_lk: r.part_code, ten_lk: r.part_name, kho: r.kho,
      doi_tac: r.doi_tac, nguoi_dat: r.nguoi_dat, so_luong_dat: r.so_luong_dat, sl_ve: r.sl_nhap_amis, con_thieu: r.so_luong_con_thieu,
      bat_dau: r.bat_dau, ngay_du_kien: r.ngay_du_kien_gan_nhat, ngay_nm_cam_ket: r.ngay_nm_cam_ket, tinh_trang: r.tinh_trang,
      so_lan_lui: r.so_lan_lui, so_loi: r.so_loi, so_loi_cho_gt: r.so_loi_cho_gt, ma_ceo: ma,
      _xong: r.trang_thai_don_hang === "Kết thúc sớm" ? "kết thúc sớm" : `đã về đủ${r.ngay_ve_du ? ` ngày ${dmy(r.ngay_ve_du)}` : ""}`,
    } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const ds = [...mo.map((r) => ({ ...r, _xong: null as string | null })), ...dong];

  const ids = ds.map((r) => r.item_id);
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
  return ds.map(({ _xong, ...r }) => {
    const d = dhBy.get(r.item_id);
    const g = gt.get(r.item_id) ?? { that: 0, qh: 0, kp: 0 };
    const lyDo: string[] = [];
    let muc: MucXuLy;
    if (_xong) {
      muc = "DA_XONG";
      lyDo.push(_xong);
    } else if (r.so_loi_cho_gt > 0) {
      // loi cho giai trinh luon trong han GIO_TU_DONG gio LV (qua han he thong tu dong) -> chua xu ly
      muc = "RAT_HOT";
      lyDo.push(`${r.so_loi_cho_gt} lỗi trong hạn giải trình (≤ ${HAN_GT_TXT}) chưa giải trình`);
      if (d?.loi_cho_ngay) lyDo.push(`lỗi cũ nhất ${d.loi_cho_ngay} ngày`);
    } else {
      muc = "GIAM_HOT";
      if (g.that) lyDo.push(`đã giải trình bù ${g.that} lỗi`);
      if (g.qh) lyDo.push(`${g.qh} vi phạm (hết hạn giải trình, không giải trình)`);
      if (g.kp) lyDo.push(`${g.kp} lỗi đã khắc phục`);
      if (!g.that && !g.qh && !g.kp) lyDo.push("không có lỗi chờ giải trình");
    }
    if (muc !== "DA_XONG" && r.con_thieu > 0) lyDo.push(`còn thiếu ${r.con_thieu}`);
    return {
      ...r, muc_xu_ly: muc, ly_do_xu_ly: lyDo, so_gt_that: g.that, so_tu_dong_qua_han: g.qh, so_tu_dong_khac_phuc: g.kp,
      ton: d?.ton ?? null, gd: d?.gd ?? null, qua_dk: d?.qua_dk ?? 0, thuc: d?.thuc ?? 0, thuc7: d?.thuc7 ?? 0, thuc_luc: d?.thuc_luc ?? null,
      phan_hoi: d?.phan_hoi ?? 0, phan_hoi_luc: d?.phan_hoi_luc ?? null, phan_hoi_tt: d?.phan_hoi_tt ?? null,
      gt_nd: d?.gt_nd ?? null, gt_luc: d?.gt_luc ?? null, gt_ai_ma: d?.gt_ai_ma ?? null, gt_loi_ma: d?.gt_loi_ma ?? null,
      td_luc: d?.td_luc ?? null, td_loai: d?.td_loai ?? null, td_ai: d?.td_ai ?? null, im_lang: d?.im_lang ?? null, nhac: d?.nhac ?? 0,
    };
  }).sort((a, b) => THU_MUC[b.muc_xu_ly] - THU_MUC[a.muc_xu_ly] || (b.ton ?? 0) - (a.ton ?? 0));
}

/**
 * GOP CA CEO (v0.100, yeu cau 2026-11-19 "canh bao cap CEO cung gom vi pham"): 1 CA = 1 PO + 1 ma CEO (201 / 202 / 203), du bao nhieu dong.
 * Dong co nhieu ma -> nam trong nhieu ca. Do hot ca: moi dong da xong -> DA_XONG; co dong RAT_HOT -> RAT_HOT; con lai GIAM_HOT.
 * FE pages/CaCeo gop cung quy tac (khoaCa).
 */
export const khoaCa = (eoId: number, ma: string) => `${eoId}|${ma}`;
export function gomCaCeo<T extends { eo_id: number; po: string; muc_xu_ly: MucXuLy; ma_ceo: { ma: string }[]; item_id: number }>(rows: T[]) {
  const m = new Map<string, { khoa: string; eo_id: number; po: string; ma: string; dong: T[] }>();
  for (const r of rows) for (const c of r.ma_ceo) {
    const k = khoaCa(r.eo_id, c.ma);
    const x = m.get(k) ?? { khoa: k, eo_id: r.eo_id, po: r.po, ma: c.ma, dong: [] };
    x.dong.push(r); m.set(k, x);
  }
  return [...m.values()].map((x) => ({
    ...x,
    muc: (x.dong.every((r) => r.muc_xu_ly === "DA_XONG") ? "DA_XONG" : x.dong.some((r) => r.muc_xu_ly === "RAT_HOT") ? "RAT_HOT" : "GIAM_HOT") as MucXuLy,
    so_dong: x.dong.length, so_dong_xong: x.dong.filter((r) => r.muc_xu_ly === "DA_XONG").length,
  }));
}

/** Dem theo muc: so CA (PO + ma CEO), so dong, so PO. */
export function demTheoMuc(rows: { muc_xu_ly: MucXuLy; po: string; eo_id: number; item_id: number; ma_ceo: { ma: string }[] }[]) {
  const ca = gomCaCeo(rows);
  const out: Record<MucXuLy, { ca: number; dong: number; po: number }> = { RAT_HOT: { ca: 0, dong: 0, po: 0 }, GIAM_HOT: { ca: 0, dong: 0, po: 0 }, DA_XONG: { ca: 0, dong: 0, po: 0 } };
  for (const m of Object.keys(out) as MucXuLy[]) {
    const x = ca.filter((c) => c.muc === m);
    out[m] = { ca: x.length, dong: new Set(x.flatMap((c) => c.dong.map((r) => r.item_id))).size, po: new Set(x.map((c) => c.po)).size };
  }
  return out;
}
