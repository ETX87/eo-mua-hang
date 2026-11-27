import { useEffect, useState, type CSSProperties } from "react";
import type { Col } from "../../components/DataTable";
import { soLuong } from "../../lib/format";

/*
 * Man "Lỗi theo PO" tren dien thoai (v0.139): useHep (< 980px) + DsThe (bang -> THE, nhan nho viet hoa tren gia tri).
 * v0.143: popup chi tiet PO rieng (PopupPo) da GOP vao popup PO cu (components/quickview/EoQuickView) theo yeu cau chu he thong - file nay chi con phan the.
 */

/** Man hep (< 980px): bang -> the, popup -> bottom-sheet. */
export function useHep() {
  const q = "(max-width: 979px)";
  const [h, setH] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setH(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return h;
}

const NHAN: CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#86868b" };

/** Danh sach THE thay bang tren dien thoai: cot 1 = dau the, cac cot con lai = nhan tren gia tri. 30 the / lan + "Xem thêm". */
export function DsThe<T>({ cols, rows, keyOf, onClick, empty }: { cols: Col<T>[]; rows: T[]; keyOf: (r: T) => string | number; onClick: (r: T) => void; empty: string }) {
  const [n, setN] = useState(30);
  if (!rows.length) return <div style={{ color: "#86868b", fontSize: 13, padding: 12 }}>{empty}</div>;
  const [dau, ...con] = cols;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.slice(0, n).map((r) => (
        <div key={keyOf(r)} role="button" tabIndex={0} onClick={() => onClick(r)} onKeyDown={(e) => e.key === "Enter" && onClick(r)}
          style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 0 0 1px #e8e8ed", cursor: "pointer" }}>
          <div>{dau.render(r)}</div>
          {/* flex 2 cot (khong dung grid: CSS chung cua app ep moi luoi inline ve 1 cot tren dien thoai) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 12px", marginTop: 10 }}>
            {con.map((c) => (
              <div key={c.key} style={{ flex: "1 1 calc(50% - 12px)", minWidth: 0, overflowWrap: "anywhere" }}>
                <div style={NHAN}>{c.header}</div>
                <div style={{ fontSize: 14 }}>{c.render(r)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length > n && <button className="btn" style={{ borderRadius: 980, minHeight: 44 }} onClick={() => setN(n + 30)}>Xem thêm ({soLuong(rows.length - n)})</button>}
    </div>
  );
}
