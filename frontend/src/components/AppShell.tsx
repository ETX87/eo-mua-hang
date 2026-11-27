import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { xoaCacheTrinhDuyet } from "../lib/cacheTrinhDuyet";
import { api } from "../api/client";
import { NAV, type NavItem } from "../lib/nav";
import { I } from "../lib/icons";
import { Avatar, PageTitleCtx } from "./ui";
import { NutGiaiThich } from "../lib/thuatNgu";
import { APP_VERSION } from "../version";
import { ten, tuBayGio } from "../lib/format";
import { NutThongBaoDay } from "./NhacGiaiTrinhPopup";

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
        {unread > 0 && <span style={{ position: "absolute", top: 1, right: 1, background: "#ff3b30", color: "#fff", borderRadius: 999, fontSize: 9.5, fontWeight: 700, minWidth: 15, textAlign: "center", padding: "0 3px" }}>{unread}</span>}
      </button>
      {open && (
        <div className="notif-pop" style={{ position: "absolute", right: 0, top: 42, width: 360, background: "rgba(255,255,255,.96)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", border: 0, borderRadius: 14, boxShadow: "var(--shadow-pop)", zIndex: 50, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 13.5 }}>Thông báo</strong>
            <span style={{ display: "flex", gap: 4 }}>
              <NutThongBaoDay />
              {unread > 0 && <button className="btn ghost sm" style={{ fontSize: 12 }} onClick={markAllRead}>Đánh dấu đã đọc hết</button>}
            </span>
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

function AccountMenu({ uName, email, sub, subColor, nameColor, dropUp, compact }: { uName: string; email?: string | null; sub: string; subColor?: string; nameColor?: string; dropUp?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const logout = () => xoaCacheTrinhDuyet().finally(() => api.post("/auth/logout").then(() => (location.href = "/")));
  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <Avatar name={uName} size={compact ? 30 : 34} />
        {!compact && (
          <div style={{ lineHeight: 1.25, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: nameColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{uName}</div>
            <div style={{ fontSize: 11, color: subColor ?? "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
          </div>
        )}
        {!compact && <I.chevronDown width={16} height={16} color={nameColor} />}
      </div>
      {open && (
        <div style={{
          position: "absolute",
          // o cuoi sidebar (overflow hidden) -> mo len tren, gioi han trong be ngang the
          ...(dropUp ? { left: 0, right: 0, bottom: 48 } : { right: 0, top: 46, width: 220 }),
          background: "rgba(255,255,255,.96)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", border: 0, borderRadius: 14, boxShadow: "0 0 0 .5px rgba(0,0,0,.12), 0 18px 44px rgba(0,0,0,.18)", zIndex: 50, overflow: "hidden" }}>
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

const MOBILE_MQ = "(max-width: 767px)";
/** Man hinh dien thoai (< 768px): sidebar thanh ngan keo truot, thanh tren thu gon. */
// + screen.width: dang bo cuc desktop (sidebar 246px) ma thu hep (xoay doc dien thoai) -> trang rong hon man hinh,
// trinh duyet tu thu nho -> media query khong con khop; be ngang man hinh thiet bi thi khong doi theo noi dung.
const laMobile = () => window.matchMedia(MOBILE_MQ).matches || window.screen.width < 768;
export function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && laMobile());
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const h = () => setM(laMobile());
    h();
    mq.addEventListener("change", h);
    window.addEventListener("resize", h); // du phong: xoay man hinh / trinh duyet khong ban su kien change
    return () => { mq.removeEventListener("change", h); window.removeEventListener("resize", h); };
  }, []);
  return m;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const mobile = useIsMobile();
  const [openDesk, setOpenDesk] = useState(true);
  const [openMob, setOpenMob] = useState(false);
  const open = mobile ? openMob : openDesk;
  const setOpen = mobile ? setOpenMob : setOpenDesk;
  const loc = useLocation();
  // dien thoai: chon muc menu -> dong ngan keo
  useEffect(() => { setOpenMob(false); }, [loc.pathname, loc.search]);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/users/me") });
  // "Viec can xu ly" theo vai tro (backend routes/viecCanLam.ts) -> so do sau ten menu. Giu queryKey "inbox-count"
  // vi nhieu man da invalidate key nay sau khi duyet / sua.
  const viec = useQuery({
    queryKey: ["inbox-count"],
    queryFn: () => api.get<{ items: { to: string; count: number }[]; tong: number }>("/viec-can-lam"),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  // so khop theo duong dan (bo ?query): viec tro toi /don-hang?nhom=... van cong vao muc /don-hang
  const badgeOf = (to: string) => (viec.data?.items ?? []).filter((x) => x.to.split("?")[0] === to).reduce((s, x) => s + x.count, 0);
  // uu tien ten ETX (lib/format ten), khong co moi dung ho ten tai khoan / Gmail
  const uName = (me.data?.email && ten(me.data.email) !== me.data.email.split("@")[0] ? ten(me.data.email) : null)
    ?? (me.data?.ho_ten && !me.data.ho_ten.includes("@") ? me.data.ho_ten : ten(me.data?.email)) ?? "—";
  // muc con sidebar: khop duong dan DUNG (khong prefix - /don-hang/ke-hoach-tuan khong to muc nao) + moi ?tham so cua muc
  const khopCon = (to: string) => {
    const [p, qs] = to.split("?");
    if (loc.pathname !== p) return false;
    const cur = new URLSearchParams(loc.search);
    return [...new URLSearchParams(qs ?? "")].every(([k, v]) => cur.get(k) === v);
  };
  // v0.129 menu 3 cap: muc KHONG co ?query chi active khi khong muc co query nao KHAC (o moi nhom, tru cap 2 cua chinh no) khop URL
  // (vd "Theo LK" /don-hang tat khi dang o /don-hang?tab=bao-cao cua nhom Tong quan; "Theo PO" /eo tat khi o /eo?chip=po_do)
  const moiMucQuery = NAV.flatMap((n) => (n.children ?? []).flatMap((c) => [c.to, ...(c.con ?? []).map((x) => x.to)])).filter((t) => t.includes("?"));
  const conActive = (to: string, cuaMinh: string[] = []) =>
    to.includes("?") ? khopCon(to) : khopCon(to) && !moiMucQuery.some((x) => x !== to && !cuaMinh.includes(x) && khopCon(x));
  const gocActive = (n: NavItem) => (n.children?.length
    ? n.children.some((c) => conActive(c.to, (c.con ?? []).map((x) => x.to))) || (n.to !== "/" && loc.pathname.startsWith(n.to))
    : n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to));
  // so dem menu phu Don PO: GET /eo/dem (dung chung cache voi man Don PO) - "chip" = so PO nhom; "chip:moc" = so PO cua nhom o giai doan
  const demQ = useQuery({ queryKey: ["eo-dem"], queryFn: () => api.get<Record<string, any>>("/eo/dem"), enabled: me.data?.trang_thai_duyet === "Da duyet",
    staleTime: 60_000, refetchInterval: 180_000, refetchIntervalInBackground: false });
  const demCua = (k?: string): number | null => {
    if (!k || !demQ.data) return null;
    const [chip, moc] = k.split(":");
    return moc ? demQ.data.theo_moc?.[chip]?.[moc] ?? 0 : typeof demQ.data[chip] === "number" ? demQ.data[chip] : null;
  };
  // nhom dang xo: mac dinh xo nhom dang dung; bam mui ten de xo / thu (nho tren may)
  const [xo, setXo] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("nav-xo") ?? "{}"); } catch { return {}; } });
  const doiXo = (k: string, v: boolean) => setXo((s) => { const n = { ...s, [k]: v }; localStorage.setItem("nav-xo", JSON.stringify(n)); return n; });
  const badgeGoc = (n: NavItem) => [...new Set([n.to, ...(n.children ?? []).map((c) => c.to.split("?")[0])])].reduce((s, t) => s + badgeOf(t), 0);
  const SoDem = ({ v, doDam, tren }: { v: number | null; doDam?: boolean; tren?: boolean }) => v == null ? null : (
    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "0 7px", lineHeight: "17px", flexShrink: 0, fontVariantNumeric: "tabular-nums",
      background: doDam && v > 0 ? "#ff3b30" : tren ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.06)", color: doDam && v > 0 || tren ? "#fff" : "var(--text-muted)" }}>{v > 999 ? "999+" : v}</span>);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {mobile && open && <div className="nav-backdrop" onClick={() => setOpen(false)} />}
      {/* ---------------- Sidebar ---------------- */}
      <aside style={mobile ? {
        width: "min(86vw, 300px)", background: "var(--sidebar-bg)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", borderRight: "1px solid rgba(0,0,0,.08)", display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, height: "100dvh", zIndex: 70, overflow: "hidden",
        transform: open ? "none" : "translateX(-105%)", transition: "transform .2s",
        boxShadow: open ? "0 18px 44px rgba(0,0,0,.18)" : "none",
      } : {
        width: open ? "var(--sidebar-w)" : 66, flexShrink: 0, background: "var(--sidebar-bg)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", borderRight: "1px solid rgba(0,0,0,.08)",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
        transition: "width .16s", overflow: "hidden",
      }}>
        <div style={{ padding: open ? "18px 16px 16px" : "18px 8px", display: "flex", gap: 10, alignItems: "center" }}>
          <CartLogo size={38} />
          {open && (
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", letterSpacing: "-.02em" }}>EO Mua hàng 3T</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Hệ thống đặt mua hàng nội bộ</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: open ? "6px 12px" : "6px 8px" }}>
          {NAV.filter((n) => !n.adminOnly || me.data?.vai_tro === "Admin").map((n) => {
            const Icon = I[n.icon];
            const on = gocActive(n);
            const coCon = !!n.children?.length;
            const dangXo = coCon && (xo[n.to] ?? on);
            const bd = badgeGoc(n);
            return (
              <div key={n.to}>
                {n.section && open && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", letterSpacing: ".06em", textTransform: "uppercase", margin: "18px 8px 8px" }}>{n.section}</div>
                )}
                <div style={{ position: "relative" }}>
                  <Link to={n.to} onClick={() => { if (coCon && !on) doiXo(n.to, true); }} title={!open ? n.label : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: open ? (coCon ? "9px 34px 9px 12px" : "9px 12px") : "10px", position: "relative",
                      borderRadius: 10, margin: "2px 0", fontWeight: 600, fontSize: 14, letterSpacing: "-.01em",
                      color: on && (!coCon || !open) ? "#fff" : "var(--text)",
                      background: on && (!coCon || !open) ? "var(--ocean-600)" : on ? "rgba(0,0,0,.06)" : "transparent",
                      boxShadow: "none", transition: "background .15s",
                      justifyContent: open ? "flex-start" : "center",
                    }}>
                    <Icon width={20} height={20} strokeWidth={1.8} style={{ flexShrink: 0, color: on && (!coCon || !open) ? "#fff" : "var(--ocean-600)" }} />
                    {open && <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</span>}
                    {open && bd > 0 && (
                      <span title="Việc cần xử lý" style={{ background: "#ff3b30", color: "#fff", borderRadius: 999, fontSize: 11.5, fontWeight: 700, padding: "1px 8px", lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>{bd > 999 ? "999+" : bd}</span>
                    )}
                    {!open && bd > 0 && <span style={{ position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: 4, background: "#ff3b30" }} />}
                  </Link>
                  {open && coCon && (
                    <button aria-label={dangXo ? "Thu gọn" : "Mở rộng"} title={dangXo ? "Thu gọn" : "Mở rộng"} onClick={() => doiXo(n.to, !dangXo)}
                      style={{ position: "absolute", right: 6, top: 7, border: 0, background: "transparent", cursor: "pointer", padding: 4, color: "var(--text-faint)", display: "flex" }}>
                      <I.chevronDown width={16} height={16} style={{ transform: dangXo ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
                    </button>
                  )}
                </div>
                {open && dangXo && (
                  <div style={{ margin: "0 0 4px 22px", borderLeft: "1px solid rgba(0,0,0,.08)", paddingLeft: 6 }}>
                    {n.children!.map((c) => {
                      const CIcon = I[c.icon];
                      const conTo = (c.con ?? []).map((x) => x.to);
                      const cOn = conActive(c.to, conTo);
                      const cap2 = cOn ? (c.con ?? []).filter((x) => !x.anRong || (demCua(x.dem) ?? 0) > 0) : [];
                      return (
                        <div key={c.to}>
                          <Link to={c.to} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 10px", borderRadius: 10, margin: "1px 0",
                            fontSize: 13, fontWeight: cOn ? 600 : 500, color: cOn ? "#fff" : "var(--text)",
                            background: cOn ? "var(--ocean-600)" : "transparent", boxShadow: "none",
                          }}>
                            <CIcon width={15} height={15} strokeWidth={1.8} style={{ flexShrink: 0, color: cOn ? "#fff" : "var(--ocean-600)" }} />
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                            <SoDem v={demCua(c.dem)} doDam={c.demDo} tren={cOn} />
                          </Link>
                          {cap2.length > 0 && (
                            <div style={{ margin: "0 0 4px 18px", borderLeft: "1px solid rgba(0,0,0,.08)", paddingLeft: 4 }}>
                              {cap2.map((x) => {
                                const xOn = khopCon(x.to);
                                return (
                                  <Link key={x.to} to={xOn ? c.to : x.to} title={xOn ? "Bấm lần nữa để bỏ lọc giai đoạn" : `Lọc: ${x.label}`} style={{
                                    display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 10, margin: "1px 0",
                                    fontSize: 12.5, fontWeight: xOn ? 600 : 500, color: xOn ? "var(--ocean-600)" : "var(--text-muted)",
                                    background: xOn ? "var(--ocean-100)" : "transparent",
                                  }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: xOn ? "var(--ocean-600)" : "#c7c7cc" }} />
                                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.label}</span>
                                    <SoDem v={demCua(x.dem)} />
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {open && (
          <div style={{ padding: 12 }}>
            <div style={{ padding: 10, borderRadius: 14, background: "rgba(0,0,0,.04)" }}>
              <AccountMenu uName={uName} email={me.data?.email} sub={me.data?.email ?? ""} nameColor="var(--text)" subColor="var(--text-muted)" dropUp />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center", marginTop: 12 }}>
              Phiên bản v{APP_VERSION} — Hệ thống nội bộ
            </div>
          </div>
        )}
      </aside>

      {/* ---------------- Main ---------------- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header className="app-top" style={{
          height: "var(--topbar-h)", background: "var(--glass)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)", borderBottom: "1px solid rgba(0,0,0,.08)",
          display: "flex", alignItems: "center", gap: mobile ? 6 : 18, padding: mobile ? "0 8px" : "0 24px", position: "sticky", top: 0, zIndex: 20,
        }}>
          <button className="btn ghost sm" onClick={() => setOpen((o) => !o)} aria-label="Menu" style={{ position: "relative" }}>
            <I.menu />
            {mobile && (viec.data?.tong ?? 0) > 0 && <span style={{ position: "absolute", top: 2, right: 4, width: 8, height: 8, borderRadius: 4, background: "#ff3b30" }} />}
          </button>
          <div style={{ fontSize: mobile ? 17 : 22, fontWeight: 700, letterSpacing: "-.022em", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pageTitle ?? titleFor(loc.pathname)}</div>
          <NutTaiLai />
          {/* v0.086: huong dan su dung theo vai tro (frontend/public/huong-dan/*.html, tinh) */}
          <a className="btn ghost sm" href="/huong-dan/index.html" target="_blank" rel="noopener" title="Hướng dẫn sử dụng theo vai trò (mở tab mới)" style={{ fontWeight: 600 }}>📘 Hướng dẫn</a>
          <NutGiaiThich />
          <NotificationBell />
          <AccountMenu uName={uName} email={me.data?.email} sub={roleLabel(me.data?.vai_tro)} compact={mobile} />
        </header>

        <main className="app-main" style={{ flex: 1, padding: mobile ? 10 : 24, maxWidth: 1520, width: "100%", margin: "0 auto", minWidth: 0 }}>
          <PageTitleCtx.Provider value={setPageTitle}>{children}</PageTitleCtx.Provider>
        </main>
      </div>
    </div>
  );
}

function titleFor(path: string): string {
  if (path === "/") return "Tổng quan";
  if (path.startsWith("/dieu-hanh")) return "Điều hành";
  if (/^\/eo\/new/.test(path)) return "Tạo mới EO";
  if (/^\/eo\/\d+\/edit/.test(path)) return "Sửa EO";
  if (/^\/eo\/\d+/.test(path)) return "Chi tiết EO";
  if (path.startsWith("/don-hang/ke-hoach-tuan")) return "Kế hoạch tuần KRF";
  if (path.startsWith("/ca-ceo")) return "PO tồn CEO";
  if (path.startsWith("/don-hang")) return "Đơn PO · Theo LK";
  if (path.startsWith("/ma-loi")) return "Bảng mã lỗi";
  // khop dai nhat
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

/**
 * Nut "Tai lai du lieu" (v0.097): app mo bang du lieu cache (trinh duyet + server) va tu cap nhat o nen; nut nay ep tai lai NGAY moi du lieu
 * dang hien (xoa cache trinh duyet, refetch moi query dang dung). Hien gio lan cap nhat moi nhat cua cac du lieu dang hien.
 */
function NutTaiLai() {
  const qc = useQueryClient();
  const [dang, setDang] = useState(false);
  const dangTaiNen = useIsFetching(); // ve lai khi tai nen xong -> gio moi
  const moiNhat = Math.max(0, ...qc.getQueryCache().getAll().filter((q) => q.getObserversCount() > 0).map((q) => q.state.dataUpdatedAt));
  const taiLai = async () => {
    setDang(true);
    try { await xoaCacheTrinhDuyet(); await qc.refetchQueries({ type: "active" }); } finally { setDang(false); }
  };
  const gio = moiNhat ? new Date(moiNhat).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <button className="btn ghost sm" onClick={taiLai} disabled={dang} title={`Tải lại dữ liệu mới nhất từ máy chủ${gio ? ` (đang hiện dữ liệu lúc ${gio})` : ""}`}>
      <I.refresh width={14} height={14} style={dang ? { animation: "quay 0.8s linear infinite" } : undefined} /> {dang ? "Đang tải…" : dangTaiNen ? "Đang cập nhật…" : gio || "Tải lại"}
    </button>
  );
}
