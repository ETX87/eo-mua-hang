import type { ReactNode } from "react";
import { useEffect } from "react";
import { I } from "../lib/icons";
import { STATUS_META } from "../lib/nav";

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
  return <span className={`badge ${vp ? "type-vp" : "type-sx"}`} style={{ maxWidth: 150 }} title={s}>
    <span className="badge-txt">{s}</span>
  </span>;
}

export function PageHeader({
  title, back, breadcrumb, actions,
}: { title: string; back?: () => void; breadcrumb?: string[]; actions?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {back && <button className="btn ghost sm" onClick={back} aria-label="Quay lại"><I.arrowLeft /></button>}
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{title}</h1>
        </div>
        {breadcrumb && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            {breadcrumb.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <I.chevronRight width={12} height={12} />}<span>{b}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

export function WidgetCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "var(--brand-yellow)", padding: "12px 16px", fontWeight: 800, textAlign: "center", color: "var(--brand-ink)" }}>
        {title}
      </div>
      <div style={{ padding: 16, flex: 1 }}>{children}</div>
      {action && <div style={{ padding: "0 16px 16px" }}>{action}</div>}
    </div>
  );
}

export function KpiCard({ icon, tint, label, value, delta }: {
  icon: keyof typeof I; tint: string; label: string; value: ReactNode; delta?: { text: string; up: boolean };
}) {
  const Icon = I[icon];
  return (
    <div className="card" style={{ padding: "18px 18px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ width: 48, height: 48, borderRadius: 13, background: tint, display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 }}>
        <Icon width={25} height={25} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: .4, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.3, marginTop: 4 }} className="mono-num">{value}</div>
        {delta && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, whiteSpace: "nowrap", color: delta.up ? "var(--ok)" : "var(--danger)" }}>{delta.text}</div>}
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, tint }: { label: string; value: ReactNode; sub?: string; tint?: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: tint ?? "#fff", minWidth: 120 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }} className="mono-num">
        {value}{sub && <span className="muted" style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="muted" style={{ padding: "48px 12px", textAlign: "center", fontSize: 13 }}>{text}</div>;
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.42)", display: "grid", placeItems: "center", zIndex: 60, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: wide ? 720 : 460, maxWidth: "100%", padding: 0, boxShadow: "var(--shadow-pop)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <button className="btn ghost sm" onClick={onClose}><I.x /></button>
        </div>
        <div style={{ padding: 18, maxHeight: "70vh", overflow: "auto" }}>{children}</div>
        {footer && <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 34 }: { name?: string | null; size?: number }) {
  const initials = (name || "?").replace(/@.*/, "").trim().split(/[.\s_-]+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,#FDE68A,#FBBF24)", color: "#7c5b00",
      display: "grid", placeItems: "center", fontSize: size * 0.38, fontWeight: 700,
    }}>{initials || "?"}</div>
  );
}

export function Spinner({ text = "Đang tải…" }: { text?: string }) {
  return <div className="muted" style={{ padding: "40px 12px", textAlign: "center" }}>{text}</div>;
}
