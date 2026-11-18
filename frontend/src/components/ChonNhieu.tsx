import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { boDau } from "../lib/tonDong";

/**
 * O CHON NHIEU dung chung cho moi bo loc (nguyen tac chu he thong 2026-11-18: bo loc mac dinh cho tick NHIEU lua chon).
 * Thay <select> 1 gia tri o thanh loc. Gia tri = string[] ([] = khong loc). Co o tim khong dau, Chon tat ca / Bo chon,
 * vien vang + nut × khi dang loc. Doi ngay khi tick (khong can bam Ap dung).
 * Gui len server: noi bang NOI ("|") - backend tach bang `dsThamSo` (lib/thamSo.ts).
 */
export const NOI = "|";
export const noiDs = (v: string[]) => v.join(NOI);
export const tachDs = (s: string | null | undefined): string[] => (s ? s.split(NOI).map((x) => x.trim()).filter(Boolean) : []);

export type LuaChon = string | { v: string; l?: string; n?: number };

export function ChonNhieu({ value, onChange, options, placeholder, width = 200, title, style, nhan, align = "left" }: {
  value: string[]; onChange: (v: string[]) => void; options: LuaChon[];
  /** nhan khi chua chon gi, vd "Mọi kho" */
  placeholder: string; width?: number | string; title?: string; style?: CSSProperties;
  /** nhan hien thi 1 gia tri (vd email -> ho ten) */
  nhan?: (v: string) => string; align?: "left" | "right";
}) {
  const [mo, setMo] = useState(false);
  const [tim, setTim] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMo(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMo(false); } };
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k, true);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k, true); };
  }, [mo]);

  const ds = useMemo(() => options.map((o) => (typeof o === "string" ? { v: o } : o)), [options]);
  const ten = (o: { v: string; l?: string }) => o.l ?? (nhan ? nhan(o.v) : o.v);
  const loc = useMemo(() => { const t = boDau(tim.trim()); return t ? ds.filter((o) => boDau(ten(o)).includes(t)) : ds; }, [ds, tim]); // eslint-disable-line react-hooks/exhaustive-deps
  const chon = new Set(value);
  const dang = value.length > 0;
  const tomTat = !dang ? placeholder
    : value.length === 1 ? ten(ds.find((o) => o.v === value[0]) ?? { v: value[0] })
    : `${ten(ds.find((o) => o.v === value[0]) ?? { v: value[0] })} +${value.length - 1}`;
  const doi = (v: string) => { const n = new Set(chon); if (n.has(v)) n.delete(v); else n.add(v); onChange(ds.map((o) => o.v).filter((x) => n.has(x)).concat([...n].filter((x) => !ds.some((o) => o.v === x)))); };

  return (
    <div ref={ref} style={{ position: "relative", width, maxWidth: "100%", ...style }}>
      <button type="button" className="select tb" title={dang ? `${title ? title + ": " : ""}${value.map((v) => ten(ds.find((o) => o.v === v) ?? { v })).join(", ")}` : title}
        onClick={() => setMo((x) => !x)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 4, textAlign: "left", cursor: "pointer", background: "#fff",
          borderColor: dang ? "var(--brand-yellow-btn)" : undefined, fontWeight: dang ? 600 : undefined }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: dang ? undefined : "var(--text-muted)" }}>{tomTat}</span>
        {dang && <span role="button" title="Bỏ lọc" style={{ padding: "0 3px", color: "var(--text-muted)" }} onClick={(e) => { e.stopPropagation(); onChange([]); }}>×</span>}
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▾</span>
      </button>
      {mo && (
        <div data-modal style={{ position: "absolute", top: "calc(100% + 4px)", [align]: 0, minWidth: "100%", width: 280, maxWidth: "90vw", background: "#fff",
          border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-pop)", zIndex: 220, padding: 8 }}>
          {ds.length > 6 && <input autoFocus className="input tb" placeholder="🔍 Tìm…" value={tim} onChange={(e) => setTim(e.target.value)} style={{ width: "100%" }} />}
          <div style={{ display: "flex", gap: 6, margin: "6px 0", fontSize: 12 }}>
            <button type="button" className="btn ghost sm" onClick={() => onChange([...new Set([...value, ...loc.map((o) => o.v)])])}>Chọn tất cả{tim ? " (đang tìm)" : ""}</button>
            <button type="button" className="btn ghost sm" onClick={() => onChange(tim ? value.filter((v) => !loc.some((o) => o.v === v)) : [])}>Bỏ chọn</button>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 6px" }}>
            {loc.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 6 }}>Không có giá trị.</div>}
            {loc.map((o) => (
              <label key={o.v} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, padding: "3px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={chon.has(o.v)} onChange={() => doi(o.v)} />
                <span style={{ flex: 1 }}>{ten(o)}</span>
                {o.n != null && <span className="muted" style={{ fontSize: 11 }}>{o.n}</span>}
              </label>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Tick nhiều giá trị · không tick = không lọc.</div>
        </div>
      )}
    </div>
  );
}
