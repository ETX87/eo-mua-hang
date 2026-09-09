import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { NAV } from "../lib/nav";
import { I } from "../lib/icons";
import { Avatar } from "./ui";
import { APP_VERSION } from "../version";
import { ten } from "../lib/format";

interface Me { email: string; ho_ten: string; vai_tro: string | null; trang_thai_duyet: string; }

function CartLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="#1F2430" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h3l2.2 12.5a2 2 0 0 0 2 1.7h11.4a2 2 0 0 0 2-1.6L27 8H8" />
      <circle cx="12" cy="25" r="2.1" fill="#1F2430" />
      <circle cx="23" cy="25" r="2.1" fill="#1F2430" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const loc = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/users/me") });
  const inbox = useQuery({
    queryKey: ["inbox-count"],
    queryFn: () => api.get<{ count: number }>("/approvals/count"),
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
  });
  const approvalsBadge = inbox.data?.count ?? 0;
  const uName = me.data?.ho_ten && !me.data.ho_ten.includes("@") ? me.data.ho_ten : ten(me.data?.email) || "—";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ---------------- Sidebar ---------------- */}
      <aside style={{
        width: open ? "var(--sidebar-w)" : 66, flexShrink: 0, background: "var(--brand-yellow)",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
        transition: "width .16s", overflow: "hidden",
      }}>
        <div style={{ padding: open ? "18px 16px 16px" : "18px 8px", display: "flex", gap: 10, alignItems: "center" }}>
          <CartLogo size={38} />
          {open && (
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "var(--brand-ink)", letterSpacing: .3 }}>EO MUA HÀNG 3T</div>
              <div style={{ fontSize: 10.5, color: "var(--brand-olive)", marginTop: 2 }}>Hệ thống đặt mua hàng nội bộ</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: open ? "6px 12px" : "6px 8px" }}>
          {NAV.map((n) => {
            const Icon = I[n.icon];
            return (
              <div key={n.to}>
                {n.section && open && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-olive)", letterSpacing: 1, margin: "18px 8px 8px" }}>{n.section}</div>
                )}
                <NavLink
                  to={n.to}
                  end={n.to === "/"}
                  style={({ isActive }) => ({
                    display: "flex", alignItems: "center", gap: 13, padding: open ? "11px 14px" : "11px",
                    borderRadius: 14, margin: "3px 0", fontWeight: 600, fontSize: 14,
                    color: "var(--brand-ink)",
                    background: isActive ? "#fff" : "transparent",
                    boxShadow: isActive ? "0 2px 6px rgba(60,50,0,.12)" : "none",
                    justifyContent: open ? "flex-start" : "center",
                  })}
                >
                  <Icon width={21} height={21} style={{ flexShrink: 0 }} />
                  {open && <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</span>}
                  {open && n.badgeKey === "approvals" && approvalsBadge > 0 && (
                    <span style={{ background: "#EF4444", color: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 800, padding: "2px 8px", lineHeight: 1.3 }}>{approvalsBadge}</span>
                  )}
                </NavLink>
              </div>
            );
          })}
        </nav>

        {open && (
          <div style={{ padding: 12 }}>
            <div style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, borderRadius: 14, border: "1px solid rgba(120,100,20,.25)", background: "rgba(255,255,255,.28)" }}>
              <Avatar name={uName} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{uName}</div>
                <div style={{ fontSize: 11, color: "var(--brand-olive)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.data?.email}</div>
              </div>
              <I.chevronDown width={16} height={16} />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--brand-olive)", textAlign: "center", marginTop: 12 }}>
              Phiên bản v{APP_VERSION} — Hệ thống nội bộ
            </div>
          </div>
        )}
      </aside>

      {/* ---------------- Main ---------------- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{
          height: "var(--topbar-h)", background: "#fdfdfc", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 18, padding: "0 24px", position: "sticky", top: 0, zIndex: 20,
        }}>
          <button className="btn ghost sm" onClick={() => setOpen((o) => !o)} aria-label="Menu"><I.menu /></button>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{titleFor(loc.pathname)}</div>
          <div style={{ flex: 1, maxWidth: 540, marginInline: "auto", display: "flex" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <I.search width={16} height={16} style={{ position: "absolute", left: 13, top: 12, color: "var(--text-faint)" }} />
              <input className="input" style={{ paddingLeft: 36, borderRadius: "10px 0 0 10px", borderRight: "none", height: 40 }} placeholder="Tìm kiếm EO, mã phê duyệt, tiêu đề..." />
            </div>
            <button className="btn primary" style={{ borderRadius: "0 10px 10px 0", height: 40, width: 46, padding: 0, justifyContent: "center" }}><I.search width={17} height={17} /></button>
          </div>
          <button className="btn ghost sm" style={{ position: "relative" }} aria-label="Thông báo">
            <I.bell />
            {approvalsBadge > 0 && <span style={{ position: "absolute", top: 1, right: 1, background: "#EF4444", color: "#fff", borderRadius: 999, fontSize: 9.5, fontWeight: 800, minWidth: 15, textAlign: "center", padding: "0 3px" }}>{approvalsBadge}</span>}
          </button>
          <button className="btn ghost sm" aria-label="Trợ giúp"><I.help /></button>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Avatar name={uName} size={34} />
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{uName}</div>
              <div className="muted" style={{ fontSize: 11 }}>{roleLabel(me.data?.vai_tro)}</div>
            </div>
            <I.chevronDown width={16} height={16} />
          </div>
        </header>

        <main style={{ flex: 1, padding: 24, maxWidth: 1520, width: "100%", margin: "0 auto" }}>{children}</main>
      </div>
    </div>
  );
}

function titleFor(path: string): string {
  if (path === "/") return "Tổng quan";
  if (/^\/eo\/new/.test(path)) return "Tạo mới EO";
  if (/^\/eo\/\d+\/edit/.test(path)) return "Sửa EO";
  if (/^\/eo\/\d+/.test(path)) return "Chi tiết EO";
  const hit = NAV.find((n) => n.to !== "/" && path.startsWith(n.to));
  return hit?.label ?? "EO Mua hàng";
}

const ROLE_VI: Record<string, string> = {
  Admin: "Quản trị hệ thống", "KH cung ung": "KH cung ứng", "Ke toan": "Kế toán",
  Kho: "Bộ phận kho", "Theo doi tien do": "Theo dõi tiến độ", View: "Chỉ xem",
};
export function roleLabel(v?: string | null): string {
  if (!v) return "Nhân viên";
  return ROLE_VI[v] ?? v;
}
