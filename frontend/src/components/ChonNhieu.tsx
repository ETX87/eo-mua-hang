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
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 4, textAlign: "left", cursor: "pointer", backgroundImage: "none", paddingRight: 10,
          background: dang ? "#fff" : undefined, boxShadow: dang ? "0 0 0 2px var(--brand-yellow-btn)" : undefined, fontWeight: dang ? 600 : undefined }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: dang ? undefined : "var(--text-muted)" }}>{tomTat}</span>
        {dang && <span role="button" title="Bỏ lọc" style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--brand-yellow-btn)", color: "#fff", fontSize: 11, lineHeight: "16px", textAlign: "center", flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); onChange([]); }}>×</span>}
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▾</span>
      </button>
      {mo && (
        <div data-modal style={{ position: "absolute", top: "calc(100% + 6px)", [align]: 0, minWidth: "100%", width: 290, maxWidth: "90vw", background: "rgba(255,255,255,.96)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", border: 0, borderRadius: 14,
          boxShadow: "0 0 0 .5px rgba(0,0,0,.12), 0 18px 44px rgba(0,0,0,.18)", zIndex: 220, padding: 12, animation: "ap-in .18s cubic-bezier(.2,.8,.2,1)" }}>
          {ds.length > 6 && <input autoFocus className="input tb" placeholder="🔍 Tìm…" value={tim} onChange={(e) => setTim(e.target.value)} style={{ width: "100%" }} />}
          <div style={{ display: "flex", gap: 6, margin: "6px 0", fontSize: 12 }}>
            <button type="button" className="btn ghost sm" onClick={() => onChange([...new Set([...value, ...loc.map((o) => o.v)])])}>Chọn tất cả{tim ? " (đang tìm)" : ""}</button>
            <button type="button" className="btn ghost sm" onClick={() => onChange(tim ? value.filter((v) => !loc.some((o) => o.v === v)) : [])}>Bỏ chọn</button>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", background: "var(--panel-2)", borderRadius: 10, padding: 4 }}>
            {loc.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 6 }}>Không có giá trị.</div>}
            {loc.map((o) => (
              <label key={o.v} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "6px 8px", borderRadius: 10, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <input type="checkbox" checked={chon.has(o.v)} onChange={() => doi(o.v)} style={{ accentColor: "var(--ocean-600)", width: 15, height: 15 }} />
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
