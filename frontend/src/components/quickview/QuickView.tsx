import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import { Spinner } from "../ui";
import { useLop, laTrenCung } from "../../lib/lop";

/**
 * Popup xem nhanh 95% man hinh: EO (theo id), don hang = 1 dong linh kien (theo item id) va ma linh kien (theo ma). Xep chong duoc (tu EO mo ma LK, tu ma LK mo EO),
 * nut ← quay lai popup duoi, Esc dong popup tren cung. Mo tu bat ky dau qua useQuickView() / <EoLink> / <PartLink>.
 */
type Item = { loai: "eo"; id: number; loi?: boolean } | { loai: "dong"; id: number } | { loai: "lk"; ma: string; po?: string };
/** openPart(ma, po?): po = ma phe duyet -> UI ma LK LOC theo PO do (dong khong xac dinh duoc dong dat, vd chung tu chua khop). */
/** openEo(id, { loi: true }) (v0.141): mo popup PO o tab Linh kien, LOC SAN cac dong co loi. */
interface Api { openEo: (id: number, tuy?: { loi?: boolean }) => void; openDong: (itemId: number) => void; openPart: (ma: string, po?: string) => void; closeAll: () => void }
const Ctx = createContext<Api | null>(null);

const EoQuickView = lazy(() => import("./EoQuickView"));
const PartQuickView = lazy(() => import("./PartQuickView"));
const DongQuickView = lazy(() => import("./DongQuickView"));

const NOOP: Api = { openEo: () => {}, openDong: () => {}, openPart: () => {}, closeAll: () => {} };
/** Khong co Provider (vd ngoai cay App) -> tra ham rong thay vi lam sap trang. */
export function useQuickView(): Api {
  return useContext(Ctx) ?? NOOP;
}

/** 1 lop popup xem nhanh - v0.127: z theo thu tu mo (lib/lop) -> mo tu trong Modal van nam TREN Modal; Esc chi dong khi day la lop tren cung
 *  (va khong dang mo bo loc cot / o chon nhieu). */
function LopXemNhanh({ i, onPop, children }: { i: number; onPop: () => void; children: ReactNode }) {
  const { z, id } = useLop();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && laTrenCung(id.current) && !document.querySelector(".hop-loc, [data-modal='']")) onPop(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onPop, id]);
  return (
    <div className="qv-overlay" style={{ zIndex: z, background: i ? "rgba(0,0,0,.3)" : undefined }} onMouseDown={(e) => { if (e.target === e.currentTarget) onPop(); }}>
      <div className="qv-panel">{children}</div>
    </div>
  );
}

export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Item[]>([]);
  const api: Api = {
    openEo: (id, tuy) => setStack((s) => [...s, { loai: "eo", id, loi: !!tuy?.loi }]),
    openDong: (id) => setStack((s) => [...s, { loai: "dong", id }]),
    openPart: (ma, po) => ma.trim() && setStack((s) => [...s, { loai: "lk", ma: ma.trim(), po: po?.trim() || undefined }]),
    closeAll: () => setStack([]),
  };
  const pop = () => setStack((s) => s.slice(0, -1));
  useEffect(() => {
    if (!stack.length) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [stack.length]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {stack.map((it, i) => (
        <LopXemNhanh key={i} i={i} onPop={pop}>
          <Suspense fallback={<Spinner />}>
            {it.loai === "eo" ? <EoQuickView id={it.id} locLoi={it.loi} onClose={pop} onCloseAll={api.closeAll} coTruoc={i > 0} />
              : it.loai === "dong" ? <DongQuickView id={it.id} onClose={pop} onCloseAll={api.closeAll} coTruoc={i > 0} />
              : <PartQuickView ma={it.ma} po={it.po} onClose={pop} onCloseAll={api.closeAll} coTruoc={i > 0} />}
          </Suspense>
        </LopXemNhanh>
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

/**
 * O tim CHUNG tren thanh tab cua popup (2026-11-23, chu he thong: "chuyen cong cu tim kiem len chung va dung cho tat ca cac tab co the tim kiem").
 * Dat cuoi .qv-tabs (tu day sang phai); giu chu khi doi tab; nut × xoa nhanh. Moi tab nhan `tim` va tu loc (khong dau, nhieu tu = VA).
 */
export function O_TIM({ tim, setTim }: { tim: string; setTim: (v: string) => void }) {
  return (
    <span className="qv-tim" style={{ position: "relative", display: "inline-flex" }}>
      <input className="input" style={{ width: "100%", height: "100%", fontSize: 12.5, paddingRight: tim ? 24 : undefined, borderColor: tim ? "var(--link-amber)" : undefined }}
        placeholder="🔍 Tìm trong tab đang mở (không dấu)…" title="Ô tìm dùng chung cho mọi tab — giữ nguyên khi đổi tab" value={tim} onChange={(e) => setTim(e.target.value)} />
      {tim && <button type="button" title="Xoá tìm kiếm" onClick={() => setTim("")}
        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontSize: 14 }}>×</button>}
    </span>
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


/**
 * v0.131 (chu he thong 27/11/2026 "UI chi tiet rat roi... chia 2 khu vuc: thong tin log, lich su, tien do / khu theo doi chinh"):
 * khu PHU ben phai (so lieu, canh bao, nhat ky / lich su) thu gon duoc - nho tren may (moi popup dung chung) -> khu CHINH rong gan het popup.
 */
export function useAnPhu(): [boolean, (v: boolean) => void] {
  const [an, setAn] = useState(() => localStorage.getItem("qv-an-phu") === "1");
  return [an, (v) => { setAn(v); localStorage.setItem("qv-an-phu", v ? "1" : "0"); }];
}
/** Tieu de khu: "chinh" (vang) / "phu" (xam). */
export function KhuTieuDe({ loai, children, phai }: { loai: "chinh" | "phu"; children: ReactNode; phai?: ReactNode }) {
  return <div className={`qv-khu ${loai}`}>{children}{phai && <span className="sp">{phai}</span>}</div>;
}
/** Cot khu PHU: dang an -> 1 thanh doc bam de mo lai. */
export function CotPhu({ an, setAn, tieuDe, children }: { an: boolean; setAn: (v: boolean) => void; tieuDe: string; children: ReactNode }) {
  if (an) return <div className="qv-col"><button type="button" className="qv-phu-thu" title={`Mở khu ${tieuDe}`} onClick={() => setAn(false)}>⟨ {tieuDe}</button></div>;
  return (
    <div className="qv-col">
      <KhuTieuDe loai="phu" phai={<button type="button" className="btn ghost sm" style={{ padding: "0 6px" }} title="Thu gọn — khu theo dõi chính rộng ra" onClick={() => setAn(true)}>Thu gọn ⟩</button>}>🕘 {tieuDe}</KhuTieuDe>
      {children}
    </div>
  );
}
