import type { CSSProperties } from "react";
import { soLuong } from "./format";

/**
 * Dung chung man "Lỗi theo PO" (pages/LoiTheoPo.tsx) + popup chi tiet PO (pages/loiPo/PopupPo.tsx) - v0.139 tach tu LoiTheoPo.
 * Du lieu GET /api/loi-po (backend routes/loiPo.ts). Mau kieu Apple (skill giao-dien-apple): doi tac = cam, noi bo = tim.
 */
export interface Dong { i: number; e: number; po: string; lk: string; ten_lk: string; kho: string; ncc: string; nguoi_dat: string; ngay_bh: string; gd: string; gd_ten: string; dat: number; ve: number; thieu: number; tre?: boolean }
export interface Loi { id: number; i: number; e: number; ma: string; ten: string; gd: string; ben: "NCC" | "NOI_BO"; ai: string; tt: "CHO" | "VI_PHAM" | "DA_GT" | "KHAC_PHUC"; ngay: string }
export interface Data { luc: string; tat_ca: boolean; dong: Dong[]; loi: Loi[]; tt_eo?: Record<string, string> }
/** v0.146 trang thai PO (to mau dong + cot "Trạng thái PO"): huy > dang duyet > xong (moi dong ve du / huy) > ton qua han (co dong tre) > dang ton */
export type TtPo = "HUY" | "DUYET" | "XONG" | "QUA_HAN" | "TON";
export const TT_PO: Record<TtPo, { l: string; mau: string; nen: string; cls?: string }> = {
  HUY: { l: "Đã hủy", mau: "#d70015", nen: "#ffe7e5", cls: "r-huy" }, DUYET: { l: "Đang duyệt", mau: "#0062c4", nen: "#e8f1fc" },
  XONG: { l: "Đã xong", mau: "#1d8a3c", nen: "#e2f6e7", cls: "r-xong" }, QUA_HAN: { l: "Tồn quá hạn", mau: "#c26400", nen: "#fff1dc", cls: "r-tre" },
  TON: { l: "Đang tồn", mau: "#515154", nen: "rgba(0,0,0,.05)" },
};
export function ttPoCua(ttEo: string | undefined, ds: Dong[]): TtPo {
  if (ttEo === "CANCELLED") return "HUY";
  if (ttEo && ttEo !== "ISSUED") return "DUYET";
  if (ds.length && ds.every((x) => x.gd === "XONG" || x.gd === "HUY")) return ds.every((x) => x.gd === "HUY") ? "HUY" : "XONG";
  return ds.some((x) => x.tre) ? "QUA_HAN" : "TON";
}
/** Trang thai 1 dong LK (view Theo linh kien) */
export const ttDong = (x: Dong): TtPo => (x.gd === "HUY" ? "HUY" : x.gd === "XONG" ? "XONG" : x.tre ? "QUA_HAN" : "TON");

export const GD: [string, string][] = [["G1", "Lập EO"], ["G2", "Thẩm định"], ["G3", "Duyệt mua"], ["G4", "Gửi / thúc NCC"], ["G5", "Chờ ngày DK"], ["G6", "Chờ giao hàng"], ["G7", "Nhập kho"], ["G8", "Giao bù"]];
export const GD_TEN: Record<string, string> = { ...Object.fromEntries(GD), XONG: "Đủ hàng", HUY: "Đã hủy" };
export const THU_TU_GD = [...GD.map(([k]) => k), "XONG", "HUY", ""];
export const TT: Record<Loi["tt"], { l: string; mau: string; nen: string }> = {
  CHO: { l: "Cần giải trình", mau: "#c26400", nen: "#fff1dc" }, VI_PHAM: { l: "Vi phạm (hết hạn không GT)", mau: "#d70015", nen: "#ffe7e5" },
  DA_GT: { l: "Đã giải trình", mau: "#1d8a3c", nen: "#e2f6e7" }, KHAC_PHUC: { l: "Tự khắc phục", mau: "#6e6e73", nen: "rgba(0,0,0,.05)" },
};
export const BEN = { NCC: { l: "Đối tác (NCC)", mau: "#c26400", dac: "#ff9500", nen: "#fff1dc" }, NOI_BO: { l: "Nội bộ", mau: "#8240a8", dac: "#af52de", nen: "#f5ebfc" } } as const;
export const SO: CSSProperties = { fontVariantNumeric: "tabular-nums" };
export const soMa = (ma: string) => ma.replace("ER.MH-", "");
export const pt = (a: number, b: number) => (b > 0 ? Math.round((Math.min(a, b) / b) * 100) : null);
const ngan = (s: string) => (s.length > 26 ? `${s.slice(0, 24)}…` : s);

/** Dem nhanh: map khoa -> so lan, tra top theo so lan giam dan */
export function dem<T>(ds: T[], k: (x: T) => string) {
  const m = new Map<string, number>();
  for (const x of ds) { const v = k(x); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
/** Chuoi "A ×3 · B ×1" (top n) */
export const topTxt = (xs: [string, number][], n = 3) => xs.slice(0, n).map(([k, v]) => `${k} ×${v}`).join(" · ") + (xs.length > n ? ` · +${xs.length - n}` : "");
/** Giai doan cua 1 nhom dong = giai doan SOM NHAT con dong dang o (dong cham nhat giu PO lai). */
export const gdSomNhat = (ds: Dong[]) => [...dem(ds, (x) => x.gd || "?")].sort((a, b) => THU_TU_GD.indexOf(a[0]) - THU_TU_GD.indexOf(b[0]))[0]?.[0] ?? "";

export function SoBen({ n, ben }: { n: number; ben: "NCC" | "NOI_BO" }) {
  if (!n) return <span className="muted">—</span>;
  return <span style={{ ...SO, background: BEN[ben].nen, color: BEN[ben].mau, fontWeight: 700, borderRadius: 999, padding: "2px 10px" }}>{soLuong(n)}</span>;
}
export function ChipMa({ xs, tenMa, n = 3 }: { xs: [string, number][]; tenMa: Map<string, Loi>; n?: number }) {
  if (!xs.length) return <span className="muted">—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {xs.slice(0, n).map(([ma, v]) => { const l = tenMa.get(ma); return (
        <span key={ma} title={`${ma} · ${l?.ten ?? ""}`} style={{ fontSize: 11.5, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap",
          background: l ? BEN[l.ben].nen : "#f5f5f7", color: l ? BEN[l.ben].mau : undefined, fontWeight: 600 }}>
          {soMa(ma)} {ngan(l?.ten ?? "")} ×{v}</span>); })}
      {xs.length > n && <span className="muted" style={{ fontSize: 11 }}>+{xs.length - n}</span>}
    </div>
  );
}
export function DapUng({ v, ve, dat }: { v: number | null; ve: number; dat: number }) {
  if (v == null) return <span className="muted">—</span>;
  const [mau, dac] = v >= 100 ? ["#1d8a3c", "#2fb350"] : v >= 70 ? ["#c26400", "#ff9500"] : ["#d70015", "#ff3b30"];
  return (
    <div style={{ minWidth: 70 }}>
      <div style={{ whiteSpace: "nowrap" }}><b style={{ ...SO, color: mau }}>{v}%</b> <span style={{ ...SO, fontSize: 11.5, color: "#6e6e73" }}>về {soLuong(ve)}/{soLuong(dat)}</span></div>
      <div style={{ height: 4, background: "#e8e8ed", borderRadius: 999, marginTop: 3 }}><div style={{ width: `${v}%`, height: 4, background: dac, borderRadius: 999 }} /></div>
    </div>
  );
}
