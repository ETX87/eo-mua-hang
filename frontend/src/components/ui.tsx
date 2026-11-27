import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { I } from "../lib/icons";
import { useLop, laTrenCung } from "../lib/lop";
import { STATUS_META } from "../lib/nav";
import { yNghiaLoaiHinh } from "../lib/loaiHinh";

export function Card({ children, className = "", pad = true, style }: { children: ReactNode; className?: string; pad?: boolean; style?: React.CSSProperties }) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`} style={style}>{children}</div>;
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "nhap" };
  return <span className={`badge ${m.cls}`}>{label ?? m.label}</span>;
}

export function TypeBadge({ loai }: { loai?: string | null }) {
  if (!loai) return null;
  const s = String(loai);
  const vp = /văn phòng|hành chính|office|D103|D30/i.test(s);
  // y nghia = loai hinh cap 2 trong Cai dat (lib/loaiHinh) - dong nho duoi badge
  const yn = yNghiaLoaiHinh(s);
  return <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, maxWidth: 170 }} title={yn ? `${s}\n${yn}` : s}>
    <span className={`badge ${vp ? "type-vp" : "type-sx"}`} style={{ maxWidth: 150 }}><span className="badge-txt">{s}</span></span>
    {yn && <span style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{yn}</span>}
  </span>;
}

/** Trang dat tieu de len thanh tren cung (AppShell) - khong lap 1 dong tieu de rieng trong trang. */
export const PageTitleCtx = createContext<(t: string | null) => void>(() => {});

/**
 * Tieu de trang -> day len thanh tren cung. Trong trang chi con 1 dong gon KHI co nut quay lai / thao tac
 * (trang chi tiet, form). Trang co thanh loc: dat nut thao tac vao thanh loc, khong truyen actions.
 */
export function PageHeader({
  title, back, breadcrumb, actions,
}: { title: string; back?: () => void; breadcrumb?: string[]; actions?: ReactNode }) {
  const setTitle = useContext(PageTitleCtx);
  useEffect(() => { setTitle(title); return () => setTitle(null); }, [title, setTitle]);
  if (!back && !actions) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {back && <button className="btn ghost sm" onClick={back} aria-label="Quay lại" title="Quay lại"><I.arrowLeft /></button>}
        {breadcrumb && (
          <div className="muted" style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
            {breadcrumb.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <I.chevronRight width={12} height={12} />}<span>{b}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

export function WidgetCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 22px 4px", fontWeight: 650, fontSize: 17, letterSpacing: "-.02em", color: "var(--text)" }}>
        {title}
      </div>
      <div style={{ padding: "10px 22px 20px", flex: 1 }}>{children}</div>
      {action && <div style={{ padding: "0 22px 20px" }}>{action}</div>}
    </div>
  );
}

export function KpiCard({ icon, tint, label, value, delta }: {
  icon: keyof typeof I; tint: string; label: string; value: ReactNode; delta?: { text: string; up: boolean };
}) {
  const Icon = I[icon];
  return (
    <div className="card" style={{ padding: "18px 20px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 78%, #fff), ${tint})`,
        boxShadow: `0 2px 6px color-mix(in srgb, ${tint} 35%, transparent)`, display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 }}>
        <Icon width={21} height={21} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap", color: "var(--text-faint)" }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.025em", lineHeight: 1.2, marginTop: 4 }} className="mono-num">{value}</div>
        {delta && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, whiteSpace: "nowrap", color: delta.up ? "var(--ok)" : "var(--danger)" }}>{delta.text}</div>}
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, tint }: { label: string; value: ReactNode; sub?: string; tint?: string }) {
  return (
    <div style={{ border: 0, borderRadius: 16, padding: "12px 16px", background: tint ?? "var(--panel-2)", minWidth: 120 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.025em", marginTop: 2 }} className="mono-num">
        {value}{sub && <span className="muted" style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div style={{ padding: "40px 12px", textAlign: "center", fontSize: 13, color: "var(--text-faint)" }}>{text}</div>;
}

export function Modal({ title, onClose, children, footer, wide, width }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; width?: number;
}) {
  // v0.127: lop theo thu tu mo (lib/lop) - Modal mo sau nam tren; Esc chi dong Modal dang tren cung
  const { z, id } = useLop();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && laTrenCung(id.current) && !document.querySelector(".hop-loc, [data-modal='']")) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, id]);
  return (
    <div data-modal="1" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.28)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", zIndex: z, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" role="dialog" aria-modal="true" aria-label={title}
        style={{ width: width ?? (wide ? 720 : 460), maxWidth: "100%", padding: 0, borderRadius: 22, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 18px 14px 22px", borderBottom: "1px solid rgba(0,0,0,.06)",
          background: "var(--glass)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)" }}>
          <strong style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-.02em" }}>{title}</strong>
          <button onClick={onClose} aria-label="Đóng" style={{ width: 30, height: 30, borderRadius: "50%", border: 0, background: "rgba(0,0,0,.06)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0, color: "var(--text-muted)" }}><I.x width={15} height={15} /></button>
        </div>
        <div style={{ padding: "18px 22px", maxHeight: "70vh", overflow: "auto" }}>{children}</div>
        {footer && <div style={{ padding: "12px 22px 16px", borderTop: "1px solid rgba(0,0,0,.06)", display: "flex", justifyContent: "flex-end", gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Nut + bang xo xuong (thanh cong cu 1 dong: bo loc it dung, cong cu, chu giai). Bam ra ngoai / Esc de dong.
 * children nhan ham dong() de nut trong menu tu dong lai sau khi bam.
 */
export function Popover({ label, children, align = "left", width = 300, title, active, btnClass = "btn sm" }: {
  label: ReactNode; children: ReactNode | ((dong: () => void) => ReactNode); align?: "left" | "right"; width?: number;
  title?: string; active?: boolean; btnClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-modal]")) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  const dong = () => setOpen(false);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className={btnClass} title={title} onClick={() => setOpen((o) => !o)}
        style={{ boxShadow: active ? "0 0 0 2px var(--brand-yellow-btn)" : undefined, background: open ? "rgba(0,0,0,.1)" : active ? "#fff" : undefined }}>{label}</button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", [align]: 0, width, maxWidth: "90vw", background: "rgba(255,255,255,.96)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", border: 0,
          borderRadius: 14, boxShadow: "0 0 0 .5px rgba(0,0,0,.12), 0 18px 44px rgba(0,0,0,.18)", zIndex: 60, padding: 10, animation: "ap-in .18s cubic-bezier(.2,.8,.2,1)" }}>
          {typeof children === "function" ? children(dong) : children}
        </div>
      )}
    </div>
  );
}

/** Dong menu trong Popover (nut trai, rong het be ngang). */
export function MenuItem({ icon, children, onClick, disabled, title, right }: { icon?: ReactNode; children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; right?: ReactNode }) {
  return (
    <button type="button" className="btn ghost sm" disabled={disabled} title={title} onClick={onClick}
      style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 10, color: "var(--text)" }}>
      {icon}<span style={{ flex: 1, textAlign: "left" }}>{children}</span>{right}
    </button>
  );
}

export function Avatar({ name, size = 34 }: { name?: string | null; size?: number }) {
  const initials = (name || "?").replace(/@.*/, "").trim().split(/[.\s_-]+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(160deg,#5ea9ff,#0071e3)", color: "#fff", boxShadow: "0 2px 6px rgba(0,113,227,.3)",
      display: "grid", placeItems: "center", fontSize: size * 0.38, fontWeight: 700,
    }}>{initials || "?"}</div>
  );
}

export function Spinner({ text = "Đang tải…" }: { text?: string }) {
  return <div style={{ padding: "40px 12px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>{text}</div>;
}
