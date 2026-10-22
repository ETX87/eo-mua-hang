import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { NAV } from "../lib/nav";
import { I } from "../lib/icons";
import { Avatar, PageTitleCtx } from "./ui";
import { NutGiaiThich } from "../lib/thuatNgu";
import { APP_VERSION } from "../version";
import { ten, tuBayGio } from "../lib/format";

interface Me { email: string; ho_ten: string; vai_tro: string | null; trang_thai_duyet: string; }

interface NotifRow { id: number; loai: string; noi_dung: string; eo_id: number; da_doc: number; created_at: string; eo_code: string; }

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [onOutside]);
  return ref;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const ref = useClickOutside(() => setOpen(false));
  const count = useQuery({
    queryKey: ["notif-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/count"),
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
  });
  const list = useQuery({
    queryKey: ["notif-list"],
    queryFn: () => api.get<NotifRow[]>("/notifications"),
    enabled: open,
    staleTime: 0,
  });
  const unread = count.data?.count ?? 0;
  const rows = list.data ?? [];

  async function markAllRead() {
    await api.post("/notifications/mark-all-read");
    qc.invalidateQueries({ queryKey: ["notif-count"] });
    qc.invalidateQueries({ queryKey: ["notif-list"] });
  }
  async function onRowClick(r: NotifRow) {
    if (!r.da_doc) {
      await api.post(`/notifications/${r.id}/read`);
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    }
    setOpen(false);
    nav(`/eo/${r.eo_id}`);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn ghost sm" style={{ position: "relative" }} aria-label="Thông báo" onClick={() => setOpen((o) => !o)}>
        <I.bell />
        {unread > 0 && <span style={{ position: "absolute", top: 1, right: 1, background: "#EF4444", color: "#fff", borderRadius: 999, fontSize: 9.5, fontWeight: 800, minWidth: 15, textAlign: "center", padding: "0 3px" }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 42, width: 360, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-pop)", zIndex: 50, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 13.5 }}>Thông báo</strong>
            {unread > 0 && <button className="btn ghost sm" style={{ fontSize: 12 }} onClick={markAllRead}>Đánh dấu đã đọc hết</button>}
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {list.isLoading && <div className="muted" style={{ padding: 20, textAlign: "center", fontSize: 12.5 }}>Đang tải…</div>}
            {!list.isLoading && rows.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center", fontSize: 12.5 }}>Chưa có thông báo.</div>}
            {rows.map((r) => (
              <div key={r.id} onClick={() => onRowClick(r)} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: r.da_doc ? "transparent" : "#FFF8E1", display: "flex", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: r.da_doc ? 500 : 700 }}>{r.noi_dung}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{tuBayGio(r.created_at)}</div>
                </div>
                {!r.da_doc && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand-yellow)", marginTop: 4, flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ uName, email, sub, subColor, nameColor, dropUp }: { uName: string; email?: string | null; sub: string; subColor?: string; nameColor?: string; dropUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const logout = () => api.post("/auth/logout").then(() => (location.href = "/"));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <Avatar name={uName} size={34} />
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: nameColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{uName}</div>
          <div style={{ fontSize: 11, color: subColor ?? "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
        </div>
        <I.chevronDown width={16} height={16} color={nameColor} />
      </div>
      {open && (
        <div style={{
          position: "absolute",
          // o cuoi sidebar (overflow hidden) -> mo len tren, gioi han trong be ngang the
          ...(dropUp ? { left: 0, right: 0, bottom: 48 } : { right: 0, top: 46, width: 220 }),
          background: "#fff", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-pop)", zIndex: 50, overflow: "hidden" }}>
          {email && (
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{uName}</div>
              <div className="muted" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{email}</div>
            </div>
          )}
          <button className="btn ghost sm" style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "11px 14px", color: "var(--danger-ink)" }} onClick={logout}>
            <I.logout width={16} height={16} /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

function CartLogo({ size = 34 }: { size?: number }) {
  return <img src="/icon-192.png" width={size} height={size} alt="" style={{ borderRadius: size * 0.22 }} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const loc = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/users/me") });
  // "Viec can xu ly" theo vai tro (backend routes/viecCanLam.ts) -> so do sau ten menu. Giu queryKey "inbox-count"
  // vi nhieu man da invalidate key nay sau khi duyet / sua.
  const viec = useQuery({
    queryKey: ["inbox-count"],
    queryFn: () => api.get<{ items: { to: string; count: number }[]; tong: number }>("/viec-can-lam"),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const badgeOf = (to: string) => (viec.data?.items ?? []).filter((x) => x.to === to).reduce((s, x) => s + x.count, 0);
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
          {NAV.filter((n) => !n.adminOnly || me.data?.vai_tro === "Admin").map((n) => {
            const Icon = I[n.icon];
            return (
              <div key={n.to}>
                {n.section && open && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--brand-olive)", letterSpacing: 1, margin: "18px 8px 8px" }}>{n.section}</div>
                )}
                <NavLink
                  to={n.to}
                  end={n.to === "/" || n.to === "/plans"}
                  style={({ isActive }) => ({
                    display: "flex", alignItems: "center", gap: 13, padding: open ? "11px 14px" : "11px", position: "relative",
                    borderRadius: 14, margin: "3px 0", fontWeight: 600, fontSize: 14,
                    color: "var(--brand-ink)",
                    background: isActive ? "#fff" : "transparent",
                    boxShadow: isActive ? "0 2px 6px rgba(60,50,0,.12)" : "none",
                    justifyContent: open ? "flex-start" : "center",
                  })}
                >
                  <Icon width={21} height={21} style={{ flexShrink: 0 }} />
                  {open && <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</span>}
                  {open && badgeOf(n.to) > 0 && (
                    <span title="Việc cần xử lý" style={{ background: "#EF4444", color: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 800, padding: "2px 8px", lineHeight: 1.3 }}>{badgeOf(n.to) > 999 ? "999+" : badgeOf(n.to)}</span>
                  )}
                  {!open && badgeOf(n.to) > 0 && <span style={{ position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: 4, background: "#EF4444" }} />}
                </NavLink>
              </div>
            );
          })}
        </nav>

        {open && (
          <div style={{ padding: 12 }}>
            <div style={{ padding: 10, borderRadius: 14, border: "1px solid rgba(120,100,20,.25)", background: "rgba(255,255,255,.28)" }}>
              <AccountMenu uName={uName} email={me.data?.email} sub={me.data?.email ?? ""} nameColor="var(--brand-ink)" subColor="var(--brand-olive)" dropUp />
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
          <div style={{ fontSize: 19, fontWeight: 800, flex: 1 }}>{pageTitle ?? titleFor(loc.pathname)}</div>
          <NutGiaiThich />
          <NotificationBell />
          <AccountMenu uName={uName} email={me.data?.email} sub={roleLabel(me.data?.vai_tro)} />
        </header>

        <main style={{ flex: 1, padding: 24, maxWidth: 1520, width: "100%", margin: "0 auto" }}>
          <PageTitleCtx.Provider value={setPageTitle}>{children}</PageTitleCtx.Provider>
        </main>
      </div>
    </div>
  );
}

function titleFor(path: string): string {
  if (path === "/") return "Tổng quan";
  if (/^\/eo\/new/.test(path)) return "Tạo mới EO";
  if (/^\/eo\/\d+\/edit/.test(path)) return "Sửa EO";
  if (/^\/eo\/\d+/.test(path)) return "Chi tiết EO";
  // khop dai nhat (/plans/tuan truoc /plans)
  const hit = NAV.filter((n) => n.to !== "/" && path.startsWith(n.to)).sort((a, b) => b.to.length - a.to.length)[0];
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
