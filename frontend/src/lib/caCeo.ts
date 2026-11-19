import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/**
 * CA CEO dung chung (v0.101): man Ca ton CEO (pages/CaCeo) + o "Ca CEO" o man Vi pham dem CUNG 1 cach.
 * 1 ca = 1 PO + 1 ma CEO (201 / 202 / 203) - PHAI khop backend lib/caCeo.ts gomCaCeo.
 * Do hot ca: moi dong da xong -> DA_XONG · co dong RAT_HOT -> RAT_HOT · con lai GIAM_HOT.
 */
export interface Ma { ma: string; ten: string; nguong: string; gia_tri: string; chi_tiet: string[] }
export interface R {
  item_id: number; eo_id: number; po: string; ma_lk: string; ten_lk: string; kho: string; doi_tac: string | null; nguoi_dat: string | null;
  so_luong_dat: number; sl_ve: number; con_thieu: number; bat_dau: string | null; ngay_du_kien: string | null; ngay_nm_cam_ket: string | null; tinh_trang: string;
  so_lan_lui: number; so_loi: number; so_loi_cho_gt: number; ma_ceo: Ma[];
  ton: number | null; gd: string | null; qua_dk: number; thuc: number; thuc7: number; thuc_luc: string | null; phan_hoi: number; phan_hoi_luc: string | null; phan_hoi_tt: string | null;
  gt_nd: string | null; gt_luc: string | null; gt_ai_ma: string | null; gt_loi_ma: string | null; td_luc: string | null; td_loai: string | null; td_ai: string | null; im_lang: number | null; nhac: number;
  /** v0.098 do hot (backend lib/caCeo): RAT_HOT con thieu + loi <= 7 ngay chua giai trinh · GIAM_HOT con thieu + loi > 7 ngay / da giai trinh bu · DA_XONG hang ve du / phuc */
  muc_xu_ly: Muc; ly_do_xu_ly: string[]; so_gt_that: number; so_tu_dong_qua_han: number;
}
export type Muc = "RAT_HOT" | "GIAM_HOT" | "DA_XONG";
export const MUC: Record<Muc, { l: string; ngan: string; mau: string; nen: string; icon: string; mo_ta: string }> = {
  RAT_HOT: { l: "Rất hot — chưa xử lý", ngan: "Rất hot", mau: "#B91C1C", nen: "#FEE2E2", icon: "🔴", mo_ta: "còn thiếu hàng + có lỗi trong hạn giải trình (≤ 56h làm việc) chưa giải trình" },
  GIAM_HOT: { l: "Đang giảm hot", ngan: "Giảm hot", mau: "#C2410C", nen: "#FFEDD5", icon: "🟠", mo_ta: "còn thiếu hàng + lỗi đã quá hạn giải trình 56h làm việc (hệ thống tự đóng) hoặc đã giải trình bù" },
  DA_XONG: { l: "Đã xong — không còn hot", ngan: "Đã xong", mau: "#64748B", nen: "#F1F5F9", icon: "⚪", mo_ta: "hàng đã về đủ / kết thúc sớm — từng chạm ngưỡng CEO" },
};
/** gia tri muc la (du lieu ban cu / API doi) -> khong vo man */
export const mucCua = (k: string) => MUC[k as Muc] ?? { l: k, ngan: k, mau: "#64748B", nen: "#F1F5F9", icon: "•", mo_ta: "" };
export const MA_CEO: { ma: string; l: string; mau: string }[] = [
  { ma: "ER.MH-201", l: "Lùi ngày dự kiến ≥ 3 lần", mau: "#B91C1C" },
  { ma: "ER.MH-202", l: "Ngày dự kiến cách ngày đặt ≥ 30 ngày", mau: "#C2410C" },
  { ma: "ER.MH-203", l: "≥ 3 lỗi trên dòng", mau: "#7F1D1D" },
];

/** 1 dong bang = 1 dong LK trong 1 ca (PO + ma CEO) */
export interface C extends R { _ma: Ma; _khoa: string; _muc_ca: Muc }
export const THU: Record<Muc, number> = { RAT_HOT: 3, GIAM_HOT: 2, DA_XONG: 1 };
export interface Ca { khoa: string; eo_id: number; po: string; ma: string; muc: Muc; dong: C[] }
export function gomCa(rows: R[]): Ca[] {
  const m = new Map<string, Ca>();
  for (const r of rows) for (const x of r.ma_ceo ?? []) {
    const k = `${r.eo_id}|${x.ma}`;
    const c = m.get(k) ?? { khoa: k, eo_id: r.eo_id, po: r.po, ma: x.ma, muc: "GIAM_HOT" as Muc, dong: [] };
    c.dong.push({ ...r, _ma: x, _khoa: k, _muc_ca: "GIAM_HOT" }); m.set(k, c);
  }
  const out = [...m.values()];
  for (const c of out) {
    c.muc = c.dong.every((r) => r.muc_xu_ly === "DA_XONG") ? "DA_XONG" : c.dong.some((r) => r.muc_xu_ly === "RAT_HOT") ? "RAT_HOT" : "GIAM_HOT";
    for (const r of c.dong) r._muc_ca = c.muc;
    c.dong.sort((a, b) => (THU[b.muc_xu_ly] ?? 0) - (THU[a.muc_xu_ly] ?? 0) || (b.ton ?? 0) - (a.ton ?? 0));
  }
  // ca nong nhat len dau, cung muc -> ton lau nhat truoc
  const tonMax = (c: Ca) => Math.max(0, ...c.dong.map((r) => r.ton ?? 0));
  return out.sort((a, b) => THU[b.muc] - THU[a.muc] || tonMax(b) - tonMax(a));
}

/** du lieu GET /api/ca-ceo (queryKey "ca-ceo" - co trong cache trinh duyet) */
export const useCaCeo = () => useQuery({ queryKey: ["ca-ceo"], queryFn: () => api.get<{ rows: R[]; quan_ly: boolean }>("/ca-ceo") });
