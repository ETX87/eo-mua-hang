import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import { Spinner } from "../ui";

/**
 * Popup xem nhanh 95% man hinh: EO (theo id), don hang = 1 dong linh kien (theo item id) va ma linh kien (theo ma). Xep chong duoc (tu EO mo ma LK, tu ma LK mo EO),
 * nut ← quay lai popup duoi, Esc dong popup tren cung. Mo tu bat ky dau qua useQuickView() / <EoLink> / <PartLink>.
 */
type Item = { loai: "eo"; id: number } | { loai: "dong"; id: number } | { loai: "lk"; ma: string; po?: string };
/** openPart(ma, po?): po = ma phe duyet -> UI ma LK LOC theo PO do (dong khong xac dinh duoc dong dat, vd chung tu chua khop). */
interface Api { openEo: (id: number) => void; openDong: (itemId: number) => void; openPart: (ma: string, po?: string) => void; closeAll: () => void }
const Ctx = createContext<Api | null>(null);

const EoQuickView = lazy(() => import("./EoQuickView"));
const PartQuickView = lazy(() => import("./PartQuickView"));
const DongQuickView = lazy(() => import("./DongQuickView"));

const NOOP: Api = { openEo: () => {}, openDong: () => {}, openPart: () => {}, closeAll: () => {} };
/** Khong co Provider (vd ngoai cay App) -> tra ham rong thay vi lam sap trang. */
export function useQuickView(): Api {
  return useContext(Ctx) ?? NOOP;
}

export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Item[]>([]);
  const api: Api = {
    openEo: (id) => setStack((s) => [...s, { loai: "eo", id }]),
    openDong: (id) => setStack((s) => [...s, { loai: "dong", id }]),
    openPart: (ma, po) => ma.trim() && setStack((s) => [...s, { loai: "lk", ma: ma.trim(), po: po?.trim() || undefined }]),
    closeAll: () => setStack([]),
  };
  const pop = () => setStack((s) => s.slice(0, -1));
  useEffect(() => {
    if (!stack.length) return;
    // Esc dang mo modal thao tac (sua dong, giai trinh...) chi dong modal, khong dong popup
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[data-modal]")) pop(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [stack.length]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {stack.map((it, i) => (
        <div key={i} className="qv-overlay" style={{ zIndex: 80 + i, background: i ? "rgba(15,23,42,.3)" : undefined }} onMouseDown={(e) => { if (e.target === e.currentTarget) pop(); }}>
          <div className="qv-panel" style={i ? { width: "93vw", height: "93vh" } : undefined}>
            <Suspense fallback={<Spinner />}>
              {it.loai === "eo" ? <EoQuickView id={it.id} onClose={pop} onCloseAll={api.closeAll} coTruoc={i > 0} />
                : it.loai === "dong" ? <DongQuickView id={it.id} onClose={pop} onCloseAll={api.closeAll} coTruoc={i > 0} />
                : <PartQuickView ma={it.ma} po={it.po} onClose={pop} onCloseAll={api.closeAll} coTruoc={i > 0} />}
            </Suspense>
          </div>
        </div>
      ))}
    </Ctx.Provider>
  );
}

/** Ma EO bam duoc -> popup EO. */
export function EoLink({ id, children, title }: { id: number; children: ReactNode; title?: string }) {
  const qv = useContext(Ctx);
  if (!qv) return <>{children}</>;
  return <button type="button" className="qv-link" title={title ?? "Xem nhanh EO"} onClick={(e) => { e.stopPropagation(); qv.openEo(id); }}>{children}</button>;
}

/** Ma linh kien bam duoc -> popup ma linh kien. */
export function PartLink({ ma, children }: { ma: string | null | undefined; children?: ReactNode }) {
  const qv = useContext(Ctx);
  if (!qv || !ma) return <>{children ?? ma}</>;
  return <button type="button" className="qv-link" title="Xem lịch sử mã linh kiện" onClick={(e) => { e.stopPropagation(); qv.openPart(ma); }}>{children ?? ma}</button>;
}

/** Khung tieu de chung cua 2 popup. */
export function QvHeader({ coTruoc, onClose, onCloseAll, children, actions }: {
  coTruoc: boolean; onClose: () => void; onCloseAll: () => void; children: ReactNode; actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      {coTruoc && <button className="btn sm" title="Quay lại" onClick={onClose}>←</button>}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {actions}
        {coTruoc && <button className="btn sm ghost" onClick={onCloseAll} title="Đóng tất cả">Đóng hết</button>}
        <button className="btn sm" onClick={onClose} title="Đóng (Esc)">✕</button>
      </div>
    </div>
  );
}

export function Kpi({ l, v, tone }: { l: string; v: ReactNode; tone?: "danger" | "ok" | "warn" }) {
  const color = tone === "danger" ? "var(--danger-ink)" : tone === "ok" ? "var(--ok-ink)" : tone === "warn" ? "var(--warn-ink)" : undefined;
  return <div className="qv-kpi"><div className="l" title={l}>{l}</div><div className="v" style={{ color }}>{v}</div></div>;
}

/**
 * 2 giao dien theo ma linh kien (2026-11-08, yeu cau #23):
 *  - PartLink  -> UI CHUNG: moi don dat / PO lien quan ma LK (dung o dong NHOM / o tra ma).
 *  - DongLink  -> UI LE: ma LK trong 1 PO (= 1 dong dat, popup don hang) - dung o dong LE. Shift / Ctrl + bam -> UI chung.
 * Hai popup co nut chuyen qua lai (popup don hang: "⇄ Tất cả đơn của mã này"; popup ma LK: nut mo don tren tung dong).
 */
export function DongLink({ id, ma, po, children }: { id?: number | null; ma: string | null | undefined; po?: string | null; children?: ReactNode }) {
  const qv = useContext(Ctx);
  if (!qv || !ma) return <>{children ?? ma}</>;
  // khong co dong dat nhung biet ma PO (vd chung tu AMIS chua khop) -> UI ma LK loc theo PO do; khong biet PO -> UI chung
  if (!id && po) return <button type="button" className="qv-link" title={`Xem mã ${ma} trong PO ${po} — Shift + bấm: tất cả đơn của mã`}
    onClick={(e) => { e.stopPropagation(); if (e.shiftKey || e.ctrlKey || e.metaKey) qv.openPart(ma); else qv.openPart(ma, po); }}>{children ?? ma}</button>;
  if (!id) return <PartLink ma={ma}>{children}</PartLink>;
  return <button type="button" className="qv-link" title={`Xem ${ma} trong PO này (đơn hàng) — Shift + bấm: tất cả đơn của mã`}
    onClick={(e) => { e.stopPropagation(); if (e.shiftKey || e.ctrlKey || e.metaKey) qv.openPart(ma); else qv.openDong(id); }}>{children ?? ma}</button>;
}
