import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { I } from "../lib/icons";
import { Clip } from "./Clip";
import { boDau } from "../lib/tonDong";

/** Chuoi tim kiem cua 1 dong: moi gia tri nguyen thuy (1 cap long nhau), bo dau. */
const chuoiTim = (row: unknown): string => {
  if (row == null || typeof row !== "object") return boDau(String(row ?? ""));
  return boDau(Object.values(row as Record<string, unknown>).map((v) => (v != null && typeof v === "object" ? Object.values(v as object).join(" ") : String(v ?? ""))).join(" "));
};

/** Kieu bo loc cot (kieu bang Excel): chu = tim theo tu (khong dau) · chon = tick gia tri · ngay = tu ngay - den ngay · so = tu - den. */
export type KieuLoc = "chu" | "chon" | "ngay" | "so";
/** Gia tri loc 1 cot. chon: [] = khong chon gi (khong loc); "" trong danh sach = o trong. */
export interface GiaTriLoc { q?: string; chon?: string[]; tu?: string; den?: string }
export type LocCot = Record<string, GiaTriLoc>;
export type SapCot = { k: string; tang: boolean } | null;
export const TRONG = "(Trống)";

export interface Col<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
  sticky?: boolean;
  /** Rong toi da cua o chu (mac dinh = width hoac 240px); qua dai hien "…" + tooltip. Cot so / can giua khong cat. */
  maxW?: number | string;
  /** true = khong cat chu (cho o can xuong dong, vd o nhap lieu). */
  wrap?: boolean;
  /** Bo loc tren tieu de cot (kieu Excel). Can kem `gt` (tru khi bang loc phia server - `ngoai`). */
  loc?: KieuLoc;
  /** Gia tri tho de loc / sap xep (ngay: chuoi ISO; so: number; chon: chuoi). */
  gt?: (row: T) => unknown;
  /** Nhan hien thi cua 1 gia tri trong bo loc "chon" (vd email -> ho ten, ma trang thai -> nhan). */
  nhanChon?: (v: string) => string;
  /** false = khong cho sap xep cot nay (mac dinh: sap duoc khi co `gt` hoac `loc`). */
  sapXep?: boolean;
  /** Gia tri sap xep rieng (mac dinh = gt), vd cot Ton loc theo moc nhung sap theo so ngay. */
  gtSap?: (row: T) => unknown;
}

export const PAGE_SIZE = 10; // quy uoc: moi bang 10 dong / trang

const dangLoc = (g?: GiaTriLoc) => !!g && (!!g.q?.trim() || (g.chon?.length ?? 0) > 0 || !!g.tu || !!g.den);
export const soCotLoc = (loc?: LocCot) => Object.values(loc ?? {}).filter(dangLoc).length;

/** 1 gia tri co khop bo loc khong (dung chung client: locVaSap, va bang tu loc). */
export function khopLoc(kieu: KieuLoc, v: unknown, g: GiaTriLoc): boolean {
  if (!dangLoc(g)) return true;
  if (kieu === "chu") {
    const h = boDau(Array.isArray(v) ? v.join(" ") : String(v ?? ""));
    return boDau(g.q ?? "").split(/\s+/).filter(Boolean).every((t) => h.includes(t));
  }
  if (kieu === "chon") {
    const vs = Array.isArray(v) ? (v.length ? v.map((x) => String(x ?? "")) : [""]) : [String(v ?? "")];
    return vs.some((x) => g.chon!.includes(x));
  }
  if (kieu === "ngay") {
    const d = String(v ?? "").slice(0, 10);
    if (!d) return false;
    return (!g.tu || d >= g.tu) && (!g.den || d <= g.den);
  }
  const n = v == null || v === "" ? NaN : Number(v);
  if (Number.isNaN(n)) return false;
  return (!g.tu || n >= Number(g.tu)) && (!g.den || n <= Number(g.den));
}

const soSanh = (a: unknown, b: unknown) => {
  const rongA = a == null || a === "", rongB = b == null || b === "";
  if (rongA || rongB) return rongA === rongB ? 0 : rongA ? 1 : -1; // o trong luon cuoi
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "vi", { numeric: true });
};

/** Loc + sap xep phia client theo bo loc cot (trang tu giu state, can danh sach da loc - vd xuat Excel, chon tat ca). */
export function locVaSap<T>(rows: T[], cols: Col<T>[], loc?: LocCot, sap?: SapCot): T[] {
  const ds = cols.filter((c) => c.loc && c.gt && dangLoc(loc?.[c.key]));
  let out = ds.length ? rows.filter((r) => ds.every((c) => khopLoc(c.loc!, c.gt!(r), loc![c.key]))) : rows;
  const cs = sap ? cols.find((c) => c.key === sap.k && (c.gtSap || c.gt)) : null;
  if (cs) { const f = (cs.gtSap ?? cs.gt)!; out = [...out].sort((a, b) => { const x = soSanh(f(a), f(b)); return sap!.tang ? x : -x; }); }
  return out;
}

/**
 * Cot thao tac (key "act") luon dung DAU bang va ghim trai - bang nhieu cot khong bi day nut ra khoi man hinh.
 * totalRow (theo vi tri cot khai bao) duoc doi cho theo.
 *
 * Loc / sap xep kieu Excel (yeu cau 2026-11-07): cot co `loc` + `gt` -> icon loc tren tieu de, bam tieu de = sap xep.
 *  - Tu quan ly (mac dinh): bang tu loc + sap rows.
 *  - Dieu khien ngoai: truyen `loc/onLoc`, `sap/onSap`. Kem `ngoai` = rows DA loc/sap san (server, hoac trang dung locVaSap) ->
 *    bang khong loc lai; gia tri cho bo loc "chon" lay tu `tuyChon` (server) hoac `rowsGoc`.
 */
export function DataTable<T>({
  cols: colsIn, rows: rowsIn, keyOf, totalRow: totalRowIn, empty = "Không có dữ liệu", onRowClick, minWidth, pageSize, timKiem = true,
  loc: locNgoai, onLoc, sap: sapNgoai, onSap, ngoai, tuyChon, rowsGoc, tongGoc, tongSauLoc, nhom,
}: {
  cols: Col<T>[];
  rows: T[];
  keyOf: (row: T, i: number) => string | number;
  totalRow?: ReactNode[];
  empty?: string;
  onRowClick?: (row: T) => void;
  minWidth?: number;
  /** Bat phan trang client-side (mac dinh 10). Truyen 0/undefined de tat. */
  pageSize?: number;
  /** O tim nhanh trong bang (khong dau, moi cot). Mac dinh bat; tat (false) khi trang da co o tim rieng / tim phia server. */
  timKiem?: boolean;
  loc?: LocCot; onLoc?: (l: LocCot) => void;
  sap?: SapCot; onSap?: (s: SapCot) => void;
  /** rows da loc / sap xep ben ngoai (server hoac trang) - bang chi hien. */
  ngoai?: boolean;
  /** Gia tri cho bo loc "chon" theo key cot (server tra). */
  tuyChon?: Record<string, string[]>;
  /** Danh sach day du truoc loc cot (lay gia tri "chon" + dem "x / y") khi `ngoai` phia client. */
  rowsGoc?: T[];
  /** Tong truoc / sau loc cot khi phan trang server (hien "x / y"). */
  tongGoc?: number; tongSauLoc?: number;
  /**
   * Xem theo nhom (vd theo PO / theo ma linh kien): dong tieu de nhom (bam = thu gon / mo) roi cac dong cua nhom. Thu tu nhom = thu tu
   * dong dau tien sau loc / sap. Phan trang theo NHOM: moi trang gom nhom tron ven toi ~pageSize dong (nhom thu gon = 1 dong).
   */
  nhom?: { khoa: (row: T) => string; dau: (khoa: string, rows: T[], mo: boolean) => ReactNode };
}) {
  const [q, setQ] = useState("");
  const [locTrong, setLocTrong] = useState<LocCot>({});
  const [sapTrong, setSapTrong] = useState<SapCot>(null);
  const loc = locNgoai ?? locTrong;
  const sap = sapNgoai !== undefined ? sapNgoai : sapTrong;
  const datLoc = (l: LocCot) => { (onLoc ?? setLocTrong)(l); setPage(0); };
  const datSap = (s: SapCot) => { (onSap ?? setSapTrong)(s); setPage(0); };
  const [moLoc, setMoLoc] = useState<{ k: string; el: HTMLElement } | null>(null);

  const tu = boDau(q).split(/\s+/).filter(Boolean);
  const daTim = tu.length ? rowsIn.filter((r) => { const h = chuoiTim(r); return tu.every((x) => h.includes(x)); }) : rowsIn;
  const rows = ngoai ? daTim : locVaSap(daTim, colsIn, loc, sap);
  const coTim = timKiem && (rowsIn.length >= 6 || q !== "");
  const ai = colsIn.findIndex((c) => c.key === "act");
  const order = ai > 0 ? [ai, ...colsIn.map((_, i) => i).filter((i) => i !== ai)] : colsIn.map((_, i) => i);
  const cols = order.map((i) => (i === ai ? { ...colsIn[i], sticky: true, align: "left" as const, header: colsIn[i].header || "Thao tác", wrap: true } : colsIn[i]));
  const totalRow = totalRowIn && totalRowIn.length === colsIn.length ? order.map((i) => totalRowIn[i]) : totalRowIn;
  const size = pageSize ?? 0;
  const [page, setPage] = useState(0);
  const total = rows.length;
  const start = size > 0 ? page * size : 0;
  const shown = size > 0 ? rows.slice(start, start + size) : rows;
  // xem theo nhom: gom nhom + chia trang theo nhom (nhom khong bi cat giua 2 trang)
  const [thuGon, setThuGon] = useState<Set<string>>(new Set());
  const [thuGonHet, setThuGonHet] = useState(false);
  const daThuGon = (k: string) => thuGonHet !== thuGon.has(k); // thuGon = cac nhom KHAC trang thai chung
  const nhomDs: [string, T[]][] = [];
  const trangNhom: [number, number][] = [];
  if (nhom) {
    const m = new Map<string, T[]>();
    for (const r of rows) { const k = nhom.khoa(r); const a = m.get(k); if (a) a.push(r); else { const b: T[] = [r]; m.set(k, b); nhomDs.push([k, b]); } }
    let s0 = 0, n = 0;
    nhomDs.forEach(([k, ds], i) => {
      const h = 1 + (daThuGon(k) ? 0 : ds.length);
      if (size > 0 && n > 0 && n + h > size) { trangNhom.push([s0, i]); s0 = i; n = 0; }
      n += h;
    });
    if (nhomDs.length) trangNhom.push([s0, nhomDs.length]);
  }
  // clamp khi rows doi (vd sau khi loc)
  if (page > 0 && (nhom ? page >= trangNhom.length : size > 0 && start >= total)) setPage(0);
  const nhomTrang = nhom ? nhomDs.slice(...(trangNhom[page] ?? [0, 0])) : [];
  const doiNhom = (k: string) => setThuGon((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const soLoc = soCotLoc(loc);
  const goc = rowsGoc ?? rowsIn;
  const tongTruoc = tongGoc ?? (ngoai ? goc.length : rowsIn.length);
  const tongSau = ngoai && tongGoc != null ? tongSauLoc : total;
  const giaTriChon = (c: Col<T>): string[] => {
    if (tuyChon?.[c.key]) return tuyChon[c.key];
    if (!c.gt) return [];
    const s = new Set<string>();
    for (const r of goc) { const v = c.gt(r); (Array.isArray(v) ? (v.length ? v : [""]) : [v]).forEach((x) => s.add(String(x ?? ""))); }
    return [...s].sort((a, b) => soSanh(a || null, b || null));
  };
  const cotMo = moLoc ? colsIn.find((c) => c.key === moLoc.k) : null;
  const dongBang = (row: T, i: number, tienTo = "") => (
    <tr key={tienTo + keyOf(row, i)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={{ cursor: onRowClick ? "pointer" : undefined }}>
      {cols.map((c) => (
        <td key={c.key} style={{ textAlign: c.align ?? "left",
          position: c.sticky ? "sticky" : undefined, left: c.sticky ? 0 : undefined, background: c.sticky ? "#fff" : undefined, zIndex: c.sticky ? 1 : undefined,
          whiteSpace: c.key === "act" ? "nowrap" : undefined, boxShadow: c.key === "act" ? "6px 0 6px -6px rgba(15,23,42,.18)" : undefined,
          paddingLeft: nhom && c.sticky ? 28 : undefined }}>
          {c.wrap || c.align === "right" || c.align === "center" ? c.render(row) : <Clip w={c.maxW ?? c.width ?? 240}>{c.render(row)}</Clip>}
        </td>
      ))}
    </tr>
  );

  return (
    <>
      {(coTim || soLoc > 0 || nhom) && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {soLoc > 0 && (
            <span style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center", marginRight: "auto" }}>
              <I.filter width={13} height={13} style={{ color: "var(--link-amber)" }} />
              <span>Đang lọc {soLoc} cột{tongSau != null ? <> · <b>{tongSau.toLocaleString("vi-VN")}</b> / {tongTruoc.toLocaleString("vi-VN")} dòng</> : ""}</span>
              {cols.filter((c) => dangLoc(loc[c.key])).map((c) => (
                <span key={c.key} className="qv-chip on" style={{ display: "inline-flex", gap: 4 }}>{typeof c.header === "string" ? c.header : c.key}
                  <span role="button" title="Bỏ lọc cột này" style={{ cursor: "pointer" }} onClick={() => { const n = { ...loc }; delete n[c.key]; datLoc(n); }}>×</span></span>
              ))}
              <button className="btn ghost sm" onClick={() => datLoc({})}>Xóa lọc cột</button>
            </span>
          )}
          {nhom && (
            <span style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center", marginRight: soLoc > 0 ? undefined : "auto" }}>
              <b>{nhomDs.length.toLocaleString("vi-VN")}</b> nhóm · {total.toLocaleString("vi-VN")} dòng
              <button className="btn ghost sm" onClick={() => { setThuGonHet((x) => !x); setThuGon(new Set()); setPage(0); }}>{thuGonHet ? "▾ Mở tất cả nhóm" : "▸ Thu gọn tất cả nhóm"}</button>
            </span>
          )}
          {coTim && <>
            {q && <span className="muted" style={{ fontSize: 12 }}>{rows.length} / {rowsIn.length} dòng</span>}
            <input className="input" style={{ width: 260, height: 32 }} placeholder="🔍 Tìm nhanh trong bảng (không dấu)…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </>}
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr>
              {cols.map((c) => {
                const coSap = c.sapXep !== false && (!!c.gt || !!c.gtSap || (ngoai && !!c.loc)) && c.key !== "act";
                const dangSap = sap?.k === c.key;
                const coLoc = !!c.loc && (!!c.gt || ngoai);
                const loc1 = dangLoc(loc[c.key]);
                return (
                  <th key={c.key} style={{ textAlign: c.align ?? "left", width: c.width, whiteSpace: "nowrap",
                    position: c.sticky ? "sticky" : undefined, left: c.sticky ? 0 : undefined, zIndex: c.sticky ? 2 : undefined,
                    background: c.sticky ? "var(--panel-2)" : loc1 ? "#FEF9C3" : undefined }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span onClick={coSap ? () => datSap(!dangSap ? { k: c.key, tang: true } : sap!.tang ? { k: c.key, tang: false } : null) : undefined}
                        style={{ cursor: coSap ? "pointer" : undefined, userSelect: "none" }} title={coSap ? "Bấm để sắp xếp tăng / giảm / bỏ" : undefined}>
                        {c.header}{dangSap && <span style={{ color: "var(--link-amber)", marginLeft: 2 }}>{sap!.tang ? "▲" : "▼"}</span>}
                      </span>
                      {coLoc && (
                        <button type="button" className={`th-loc${loc1 ? " on" : ""}`} title={loc1 ? "Đang lọc — bấm để sửa" : "Lọc cột này"}
                          onClick={(e) => { e.stopPropagation(); setMoLoc(moLoc?.k === c.key ? null : { k: c.key, el: e.currentTarget }); }}>
                          <I.filter width={11} height={11} />
                        </button>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {totalRow && (
              <tr className="total-row">
                {totalRow.map((v, i) => (
                  <td key={i} style={{ textAlign: cols[i]?.align ?? "left" }}>{v}</td>
                ))}
              </tr>
            )}
            {(nhom ? nhomDs.length === 0 : shown.length === 0) && (
              <tr><td colSpan={cols.length} className="muted" style={{ textAlign: "center", padding: "40px 12px" }}>{empty}</td></tr>
            )}
            {!nhom && shown.map((row, i) => dongBang(row, start + i))}
            {nhom && nhomTrang.map(([k, ds]) => {
              const mo = !daThuGon(k);
              return [
                <tr key={`g:${k}`} className="grp-row" onClick={() => doiNhom(k)} title={mo ? "Bấm để thu gọn nhóm" : "Bấm để mở nhóm"}>
                  <td colSpan={cols.length}>
                    <div style={{ position: "sticky", left: 10, display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 12, color: "var(--text-muted)" }}>{mo ? "▾" : "▸"}</span>{nhom.dau(k, ds, mo)}
                    </div>
                  </td>
                </tr>,
                ...(mo ? ds.map((row, i) => dongBang(row, i, `${k}:`)) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
      {size > 0 && !nhom && total > size && (
        <SimplePager total={total} size={size} page={page} onPage={setPage} />
      )}
      {nhom && trangNhom.length > 1 && (
        <SimplePager total={nhomDs.length} size={size} page={page} onPage={setPage} soTrang={trangNhom.length}
          nhan={`Nhóm ${(trangNhom[page]?.[0] ?? 0) + 1}–${trangNhom[page]?.[1] ?? 0} / ${nhomDs.length.toLocaleString("vi-VN")} nhóm`} />
      )}
      {moLoc && cotMo && (
        <HopLoc neo={moLoc.el} tieuDe={typeof cotMo.header === "string" ? cotMo.header : cotMo.key} kieu={cotMo.loc!}
          giaTri={loc[cotMo.key] ?? {}} chon={cotMo.loc === "chon" ? giaTriChon(cotMo) : []} nhan={cotMo.nhanChon}
          onApDung={(g) => { const n = { ...loc }; if (dangLoc(g)) n[cotMo.key] = g; else delete n[cotMo.key]; datLoc(n); setMoLoc(null); }}
          onDong={() => setMoLoc(null)} />
      )}
    </>
  );
}

/** Hop loc 1 cot (dinh vi fixed duoi nut loc - khong bi khung cuon cua bang cat). */
function HopLoc({ neo, tieuDe, kieu, giaTri, chon, nhan, onApDung, onDong }: {
  neo: HTMLElement; tieuDe: string; kieu: KieuLoc; giaTri: GiaTriLoc; chon: string[]; nhan?: (v: string) => string;
  onApDung: (g: GiaTriLoc) => void; onDong: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<GiaTriLoc>(giaTri);
  const [tim, setTim] = useState("");
  const [vt, setVt] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const r = neo.getBoundingClientRect();
    const w = 280;
    setVt({ top: Math.min(r.bottom + 4, window.innerHeight - 380), left: Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8)) });
  }, [neo]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !neo.contains(e.target as Node)) onDong(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onDong(); } };
    document.addEventListener("mousedown", h);
    window.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k, true); };
  }, [neo, onDong]);
  const nhanCua = (v: string) => (v === "" ? TRONG : nhan ? nhan(v) : v);
  const ds = useMemo(() => { const t = boDau(tim); return chon.filter((v) => !t || boDau(nhanCua(v)).includes(t)); }, [chon, tim]); // eslint-disable-line react-hooks/exhaustive-deps
  const daChon = new Set(g.chon ?? []);
  const apDung = () => onApDung(g);
  return (
    <div ref={ref} data-modal className="hop-loc" style={{ top: vt.top, left: vt.left }} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Enter" && kieu !== "chon") apDung(); }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>Lọc: {tieuDe}</div>
      {kieu === "chu" && (
        <input autoFocus className="input" style={{ height: 32 }} placeholder="Gõ từ cần tìm (không dấu)…" value={g.q ?? ""} onChange={(e) => setG({ q: e.target.value })} />
      )}
      {kieu === "chon" && <>
        <input autoFocus className="input" style={{ height: 30, fontSize: 12.5 }} placeholder="🔍 Tìm giá trị…" value={tim} onChange={(e) => setTim(e.target.value)} />
        <div style={{ display: "flex", gap: 6, margin: "6px 0", fontSize: 12 }}>
          <button className="btn ghost sm" onClick={() => setG({ chon: [...new Set([...(g.chon ?? []), ...ds])] })}>Chọn tất cả{tim ? " (đang tìm)" : ""}</button>
          <button className="btn ghost sm" onClick={() => setG({ chon: tim ? (g.chon ?? []).filter((v) => !ds.includes(v)) : [] })}>Bỏ chọn</button>
        </div>
        <div style={{ maxHeight: 230, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 6px" }}>
          {ds.length === 0 && <div className="muted" style={{ fontSize: 12, padding: 6 }}>Không có giá trị.</div>}
          {ds.map((v) => (
            <label key={v} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, padding: "2px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={daChon.has(v)} onChange={() => { const n = new Set(daChon); if (n.has(v)) n.delete(v); else n.add(v); setG({ chon: [...n] }); }} />
              <span style={{ color: v === "" ? "var(--text-muted)" : undefined }}>{nhanCua(v)}</span>
            </label>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Không tick ô nào = không lọc cột này.</div>
      </>}
      {(kieu === "ngay" || kieu === "so") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <label style={{ fontSize: 11.5 }}>{kieu === "ngay" ? "Từ ngày" : "Từ"}
            <input autoFocus className="input" style={{ height: 32 }} type={kieu === "ngay" ? "date" : "number"} value={g.tu ?? ""} onChange={(e) => setG({ ...g, tu: e.target.value })} /></label>
          <label style={{ fontSize: 11.5 }}>{kieu === "ngay" ? "Đến ngày" : "Đến"}
            <input className="input" style={{ height: 32 }} type={kieu === "ngay" ? "date" : "number"} value={g.den ?? ""} onChange={(e) => setG({ ...g, den: e.target.value })} /></label>
          {kieu === "ngay" && <div className="muted" style={{ gridColumn: "1 / -1", fontSize: 11 }}>1 ngày: chọn cùng ngày ở 2 ô.</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn sm ghost" onClick={() => onApDung({})}>Xóa lọc</button>
        <button className="btn sm primary" onClick={apDung}>Áp dụng</button>
      </div>
    </div>
  );
}

function SimplePager({ total, size, page, onPage, soTrang, nhan }: { total: number; size: number; page: number; onPage: (p: number) => void; soTrang?: number; nhan?: string }) {
  const pages = soTrang ?? Math.max(1, Math.ceil(total / size));
  const cur = page + 1;
  const nums: (number | "...")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p <= 2 || p > pages - 1 || Math.abs(p - cur) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 10 }}>
      <div className="muted" style={{ fontSize: 12.5 }}>
        {nhan ?? <>Hiển thị {page * size + 1}–{Math.min((page + 1) * size, total)} / {total.toLocaleString("vi-VN")}</>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage(0)}>«</button>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage(page - 1)}>‹</button>
        {nums.map((n, i) => n === "..." ? <span key={i} className="muted" style={{ padding: "0 4px" }}>…</span> : (
          <button key={i} className={`btn sm ${n === cur ? "primary" : "ghost"}`} onClick={() => onPage(n - 1)}>{n}</button>
        ))}
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage(page + 1)}>›</button>
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage(pages - 1)}>»</button>
      </div>
    </div>
  );
}

/** Phan trang SERVER-side (EoList) — giu API cu. */
export function Pagination({
  total, limit, offset, onPage,
}: {
  total: number; limit: number; offset: number;
  onPage: (offset: number) => void;
  pageSize?: number; onPageSize?: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const cur = Math.floor(offset / limit) + 1;
  const nums: (number | "...")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p <= 3 || p > pages - 1 || Math.abs(p - cur) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
      <div className="muted" style={{ fontSize: 12.5 }}>
        Hiển thị {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} / {total.toLocaleString("vi-VN")} kết quả
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage(0)}>«</button>
        <button className="btn ghost sm" disabled={cur === 1} onClick={() => onPage((cur - 2) * limit)}>‹</button>
        {nums.map((n, i) => n === "..." ? <span key={i} className="muted" style={{ padding: "0 4px" }}>…</span> : (
          <button key={i} className={`btn sm ${n === cur ? "primary" : "ghost"}`} onClick={() => onPage((n - 1) * limit)}>{n}</button>
        ))}
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage(cur * limit)}>›</button>
        <button className="btn ghost sm" disabled={cur === pages} onClick={() => onPage((pages - 1) * limit)}>»</button>
      </div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>{children}</div>;
}

export const RefreshFiltersBtn = ({ onClick }: { onClick: () => void }) => (
  <button className="btn ghost sm" style={{ color: "var(--text-muted)" }} onClick={onClick}><I.refresh width={14} height={14} /> Xóa lọc</button>
);
