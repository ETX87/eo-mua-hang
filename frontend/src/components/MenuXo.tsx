import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Nut "⋯" + menu xo xuong cho 1 DONG trong bang (v0.124, chu he thong 2026-11-26: "hien qua nhieu thao tac, rut gon lai 1 nut xo xuong").
 * Menu dat position: fixed theo vi tri nut -> khong bi khung cuon cua bang cat mat (dong cuoi bang van mo du). Bam ra ngoai / Esc / cuon -> dong.
 * Muc an (an = true) khong hien; khong con muc nao -> khong ve nut.
 */
export interface MucMenu { l: ReactNode; icon?: ReactNode; onClick: () => void; title?: string; nguy?: boolean; an?: boolean; ngan?: boolean }

/** nhan (v0.138): nut co chu (vd "✎ Sửa đơn ▾") thay cho "⋯" - dung o thanh cong cu popup. */
export function MenuXo({ muc, title = "Thao tác", nhan }: { muc: MucMenu[]; title?: string; nhan?: ReactNode }) {
  const [mo, setMo] = useState<{ x: number; y: number; len: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const nut = useRef<HTMLButtonElement>(null);
  const ds = muc.filter((m) => !m.an);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: Event) => { if (e.type === "mousedown" && (ref.current?.contains(e.target as Node) || nut.current?.contains(e.target as Node))) return; setMo(null); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setMo(null);
    window.addEventListener("mousedown", dong); window.addEventListener("keydown", k); window.addEventListener("scroll", dong, true); window.addEventListener("resize", dong);
    return () => { window.removeEventListener("mousedown", dong); window.removeEventListener("keydown", k); window.removeEventListener("scroll", dong, true); window.removeEventListener("resize", dong); };
  }, [mo]);
  if (!ds.length) return null;
  const bat = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mo) return setMo(null);
    const r = nut.current!.getBoundingClientRect();
    const cao = ds.length * 34 + 12;
    const len = r.bottom + cao > window.innerHeight - 8;
    setMo({ x: Math.min(r.left, window.innerWidth - 270), y: len ? r.top - 4 : r.bottom + 4, len });
  };
  return (
    <>
      {nhan ? <button ref={nut} type="button" className="btn sm" title={title} onClick={bat} style={{ background: mo ? "var(--panel-2)" : undefined }}>{nhan}</button>
        : <button ref={nut} type="button" className="btn ghost sm" title={title} onClick={bat}
        style={{ fontWeight: 900, letterSpacing: 1, minWidth: 30, background: mo ? "var(--panel-2)" : undefined }}>⋯</button>}
      {mo && (
        <div ref={ref} onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: mo.x, [mo.len ? "bottom" : "top"]: mo.len ? window.innerHeight - mo.y : mo.y, width: 260, background: "#fff",
            border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-pop)", zIndex: 2000, padding: 6 }}>
          {ds.map((m, i) => (
            <button key={i} type="button" className="btn ghost sm" title={m.title} onClick={() => { setMo(null); m.onClick(); }}
              style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "7px 10px", borderRadius: 7, color: m.nguy ? "var(--danger)" : undefined,
                borderTop: m.ngan ? "1px solid var(--border)" : undefined, marginTop: m.ngan ? 4 : 0 }}>
              <span style={{ width: 16, display: "inline-flex", justifyContent: "center" }}>{m.icon}</span><span style={{ flex: 1, textAlign: "left" }}>{m.l}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
