import { useState, type ReactNode } from "react";
import { ngayGio } from "../lib/format";

/**
 * Nhat ky GOP (2026-11-08, yeu cau #30): danh sach muc da sap moi -> cu, muc LIEN TIEP cung loai + cung nguoi + gan nhau
 * (lib/gopTrung gopLienTiep) hien 1 dong "(×n)" kem khoang thoi gian + tom tat (vd cac ma LK); bam "▾ Xem n mục" de doc tung muc.
 * Dung cho popup PO (Nhat ky xu ly) + popup ma LK (Nhat ky chinh sua). Du lieu goc khong doi.
 */
export function NhatKyGop<T>({ nhom, dot, luc, ai, tieu, tieuNhom, moTa, tomTat, khoa, rong = "Không có mục nào." }: {
  nhom: { x: T; ds: T[] }[];
  dot: (x: T) => string;
  luc: (x: T) => string;
  ai: (x: T) => ReactNode;
  tieu: (x: T) => ReactNode;
  /** tieu de dong GOP (mac dinh = tieu cua muc moi nhat), vd "Cập nhật kế hoạch" khong kem ma LK */
  tieuNhom?: (x: T) => ReactNode;
  moTa: (x: T) => ReactNode;
  /** tom tat 1 nhom n muc (vd "LCD-A52, PIN-IP12 +3") */
  tomTat?: (ds: T[]) => ReactNode;
  khoa: (x: T, i: number) => string;
  rong?: string;
}) {
  const [mo, setMo] = useState<Set<string>>(new Set());
  const doi = (k: string) => setMo((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const gio = (s: string) => ngayGio(s).slice(-5);
  return (
    <ul className="qv-tl">
      {nhom.length === 0 && <li className="muted" style={{ fontSize: 12 }}>{rong}</li>}
      {nhom.map(({ x, ds }, i) => {
        const k = khoa(x, i);
        const n = ds.length;
        if (n === 1) return (
          <li key={k} style={{ ["--dot" as any]: dot(x) }}>
            <div className="t">{ngayGio(luc(x))}{ai(x) ? <> · {ai(x)}</> : null}</div>
            <div className="h">{tieu(x)}</div>
            {moTa(x) ? <div className="d">{moTa(x)}</div> : null}
          </li>
        );
        const cu = ds[n - 1];
        const cungNgay = luc(cu).slice(0, 10) === luc(x).slice(0, 10);
        const moRong = mo.has(k);
        return (
          <li key={k} style={{ ["--dot" as any]: dot(x) }}>
            <div className="t">{cungNgay ? `${ngayGio(luc(cu))} – ${gio(luc(x))}` : `${ngayGio(luc(cu))} – ${ngayGio(luc(x))}`}{ai(x) ? <> · {ai(x)}</> : null}</div>
            <div className="h">{(tieuNhom ?? tieu)(x)} <span className="badge final" style={{ fontSize: 10.5 }}>×{n}</span></div>
            {tomTat ? <div className="d">{tomTat(ds)}</div> : moTa(x) ? <div className="d">{moTa(x)}</div> : null}
            <button type="button" className="btn ghost sm" style={{ height: 22, padding: "0 6px", fontSize: 11.5, marginTop: 2 }} onClick={() => doi(k)}>
              {moRong ? "▴ Thu gọn" : `▾ Xem ${n} mục`}</button>
            {moRong && (
              <ul className="qv-tl" style={{ padding: "2px 0 0 4px" }}>
                {ds.map((y, j) => (
                  <li key={j} style={{ ["--dot" as any]: dot(y), padding: "4px 0 4px 14px" }}>
                    <div className="t">{ngayGio(luc(y))}</div>
                    <div className="h" style={{ fontWeight: 600, fontSize: 12 }}>{tieu(y)}</div>
                    {moTa(y) ? <div className="d">{moTa(y)}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
