import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Card, PageHeader, Spinner } from "../components/ui";
import { DataTable, FilterBar, RefreshFiltersBtn, type Col } from "../components/DataTable";
import { ChonNhieu, noiDs, tachDs } from "../components/ChonNhieu";
import { useQuickView } from "../components/quickview/QuickView";
import { I } from "../lib/icons";
import { soLuong } from "../lib/format";
import { exportRowsToXlsx, type ExportCol } from "../lib/exportXlsx";
import { GiaiTrinhDongModal } from "./theodoi/GiaiTrinhPo";
import { BEN, ChipMa, DapUng, GD, GD_TEN, SO, SoBen, THU_TU_GD, TT, dem, pt, soMa, topTxt, type Data, type Dong, type Loi } from "../lib/loiPo";
import { DsThe, PopupPo, useHep } from "./loiPo/PopupPo";

/**
 * MAN "LỖI THEO PO" (v0.138) - Giam doc 2026-11-27: "1s phai biet ngay mac loi gi ... loi doi tac / noi bo ... loc theo ma loi ... don gian hoa".
 * 1 man, 1 bo loc, 4 cach xem: Theo PO (mac dinh) · Theo linh kien · Theo mã lỗi · Theo ai lỗi. Dem = SO LAN loi (moi ban ghi tl_loi = 1 lan).
 * v0.139: bam PO / linh kien -> popup PopupPo (luong ngang, theo demo da duyet); man hep -> the (DsThe).
 * Du lieu GET /api/loi-po (backend routes/loiPo.ts). Bo loc tren URL (chon nhieu, noi "|"): ben, ma, gd, ncc, ai, tt, xem, het (= hien ca PO khong loi).
 */

type Xem = "po" | "lk" | "ma" | "ai";
interface DongPo { e: number; po: string; ncc: string; nguoi_dat: string; ngay_bh: string; gd: string; gd_txt: string; so_lk: number; dat: number; ve: number; thieu: number; du: number | null;
  ncc_n: number; nb_n: number; tong: number; cho: number; vp: number; ma: [string, number][]; ai: [string, number][] }

export default function LoiTheoPo() {
  const qv = useQuickView();
  const hep = useHep();
  const [moPo, setMoPo] = useState<number | null>(null);
  const [gt, setGt] = useState<Dong[] | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["loi-po"], queryFn: () => api.get<Data>("/loi-po") });
  const [sp, setSp] = useSearchParams();
  const xem = (sp.get("xem") as Xem) || "po";
  const lay = (k: string) => tachDs(sp.get(k));
  const dat = (k: string, v: string | string[] | null) => setSp((s) => {
    const n = new URLSearchParams(s);
    const x = Array.isArray(v) ? noiDs(v) : v;
    if (x) n.set(k, x); else n.delete(k);
    return n;
  }, { replace: true });
  const fBen = lay("ben"), fMa = lay("ma"), fGd = lay("gd"), fNcc = lay("ncc"), fAi = lay("ai"), fTt = lay("tt");
  const hetPo = sp.get("het") === "1";
  const coLoc = [fBen, fMa, fGd, fNcc, fAi, fTt].some((x) => x.length);
  const xoaLoc = () => setSp((s) => { const n = new URLSearchParams(); if (s.get("xem")) n.set("xem", s.get("xem")!); return n; }, { replace: true });

  const d = q.data;
  const dongBy = useMemo(() => new Map((d?.dong ?? []).map((x) => [x.i, x])), [d]);
  const tenMa = useMemo(() => { const m = new Map<string, Loi>(); for (const l of d?.loi ?? []) if (!m.has(l.ma)) m.set(l.ma, l); return m; }, [d]);
  const nccCua = (l: Loi) => dongBy.get(l.i)?.ncc ?? "";
  // bo loc ap len LOI (ben, ma, gd loi, ai, trang thai, ncc cua dong)
  const loi = useMemo(() => (d?.loi ?? []).filter((l) =>
    (!fBen.length || fBen.includes(l.ben)) && (!fMa.length || fMa.includes(l.ma)) && (!fGd.length || fGd.includes(l.gd))
    && (!fAi.length || fAi.includes(l.ai)) && (!fTt.length || fTt.includes(l.tt)) && (!fNcc.length || fNcc.includes(nccCua(l)))), [d, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const loiTheoDong = useMemo(() => { const m = new Map<number, Loi[]>(); for (const l of loi) m.set(l.i, [...(m.get(l.i) ?? []), l]); return m; }, [loi]);
  const chiLoc = coLoc; // co loc theo loi -> chi hien PO / dong co loi khop
  const dongHien = useMemo(() => (d?.dong ?? []).filter((x) => (!fNcc.length || fNcc.includes(x.ncc))
    && (loiTheoDong.has(x.i) || (!chiLoc && hetPo))), [d, loiTheoDong, hetPo, chiLoc, fNcc]);

  const tongHop = (ds: Loi[]) => ({
    ncc_n: ds.filter((l) => l.ben === "NCC").length, nb_n: ds.filter((l) => l.ben === "NOI_BO").length, tong: ds.length,
    cho: ds.filter((l) => l.tt === "CHO").length, vp: ds.filter((l) => l.tt === "VI_PHAM").length,
    ma: dem(ds, (l) => l.ma), ai: dem(ds, (l) => l.ai),
  });
  // ---- theo PO
  const poRows: DongPo[] = useMemo(() => {
    const m = new Map<number, Dong[]>();
    for (const x of dongHien) m.set(x.e, [...(m.get(x.e) ?? []), x]);
    return [...m.entries()].map(([e, ds]) => {
      const ls = ds.flatMap((x) => loiTheoDong.get(x.i) ?? []);
      // giai doan PO = giai doan SOM NHAT con dong dang o (dong cham nhat giu PO lai)
      const gdDem = dem(ds, (x) => x.gd || "?");
      const gd = [...gdDem].sort((a, b) => THU_TU_GD.indexOf(a[0]) - THU_TU_GD.indexOf(b[0]))[0]?.[0] ?? "";
      const nGd = gdDem.find(([k]) => k === gd)?.[1] ?? 0;
      const datT = ds.reduce((t, x) => t + x.dat, 0), veT = ds.reduce((t, x) => t + Math.min(x.ve, x.dat), 0);
      return { e, po: ds[0].po, ncc: [...new Set(ds.map((x) => x.ncc).filter(Boolean))].join(", "), nguoi_dat: ds[0].nguoi_dat, ngay_bh: ds[0].ngay_bh,
        gd, gd_txt: `${gd} · ${GD_TEN[gd] ?? gd}${ds.length > 1 ? ` (${nGd}/${ds.length} LK)` : ""}`, so_lk: ds.length,
        dat: datT, ve: veT, thieu: ds.reduce((t, x) => t + x.thieu, 0), du: pt(veT, datT), ...tongHop(ls) };
    }).sort((a, b) => b.tong - a.tong || b.thieu - a.thieu);
  }, [dongHien, loiTheoDong]);
  // ---- theo LK
  const lkRows = useMemo(() => dongHien.map((x) => ({ ...x, du: pt(Math.min(x.ve, x.dat), x.dat), ...tongHop(loiTheoDong.get(x.i) ?? []) }))
    .sort((a, b) => b.tong - a.tong), [dongHien, loiTheoDong]); // eslint-disable-line react-hooks/exhaustive-deps
  // ---- theo ma loi / ai loi
  const gom = (k: (l: Loi) => string) => {
    const m = new Map<string, Loi[]>();
    for (const l of loi) m.set(k(l), [...(m.get(k(l)) ?? []), l]);
    return [...m.entries()].map(([key, ds]) => ({ key, ben: ds[0].ben, ten: ds[0].ten, gd: ds[0].gd, so_po: new Set(ds.map((l) => l.e)).size, so_lk: new Set(ds.map((l) => l.i)).size, ...tongHop(ds) }))
      .sort((a, b) => b.tong - a.tong);
  };
  const maRows = useMemo(() => gom((l) => l.ma), [loi]); // eslint-disable-line react-hooks/exhaustive-deps
  const aiRows = useMemo(() => gom((l) => l.ai), [loi]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading || !d) return <><PageHeader title="Lỗi theo PO" /><Spinner /></>;

  const opt = (ds: [string, number][], nhan?: (k: string) => string) => ds.map(([v, n]) => ({ v, l: nhan ? nhan(v) : v, n }));
  const tat = d.loi;
  const tong = tongHop(loi);
  const datAll = dongHien.reduce((t, x) => t + x.dat, 0), veAll = dongHien.reduce((t, x) => t + Math.min(x.ve, x.dat), 0);
  const theoGd = GD.map(([k, l]) => ({ k, l, ncc: loi.filter((x) => x.gd === k && x.ben === "NCC").length, nb: loi.filter((x) => x.gd === k && x.ben === "NOI_BO").length }));
  const maxGd = Math.max(1, ...theoGd.map((g) => g.ncc + g.nb));

  const cotLoi = <T extends { ncc_n: number; nb_n: number; cho: number; vp: number; ma: [string, number][]; ai: [string, number][] }>(coAi = true): Col<T>[] => [
    { key: "ncc_n", header: "Đối tác", align: "right", loc: "so", gt: (r) => r.ncc_n, render: (r) => <SoBen n={r.ncc_n} ben="NCC" /> },
    { key: "nb_n", header: "Nội bộ", align: "right", loc: "so", gt: (r) => r.nb_n, render: (r) => <SoBen n={r.nb_n} ben="NOI_BO" /> },
    { key: "ma", header: "Lỗi gì (mã × lần)", loc: "chu", gt: (r) => r.ma.map(([m]) => `${m} ${tenMa.get(m)?.ten ?? ""}`).join(" "), sapXep: false, wrap: true, maxW: 255,
      render: (r) => <ChipMa xs={r.ma} tenMa={tenMa} /> },
    ...(coAi ? [{ key: "ai", header: "Ai lỗi (× lần)", loc: "chu", gt: (r: T) => r.ai.map(([a]) => a).join(" "), sapXep: false, wrap: true, maxW: 180,
      render: (r: T) => r.ai.length ? <span style={{ fontSize: 12 }}>{topTxt(r.ai, 2)}</span> : <span className="muted">—</span> } as Col<T>] : []),
    { key: "cho", header: "Cần GT / VP", align: "right", loc: "so", gt: (r) => r.cho + r.vp, render: (r) => !r.cho && !r.vp ? <span className="muted">—</span>
      : <span style={{ whiteSpace: "nowrap", ...SO }} title={`Cần giải trình ${r.cho} · Vi phạm (hết hạn) ${r.vp}`}><b style={{ color: r.cho ? TT.CHO.mau : "#86868b" }}>{r.cho}</b> / <b style={{ color: r.vp ? TT.VI_PHAM.mau : "#86868b" }}>{r.vp}</b></span> },
  ];
  const cotSl = <T extends { dat: number; ve: number; thieu: number; du: number | null }>(): Col<T>[] => [
    { key: "thieu", header: "Thiếu", align: "right", loc: "so", gt: (r) => r.thieu, render: (r) => r.thieu ? <b>{soLuong(r.thieu)}</b> : <span className="muted">0</span> },
    { key: "du", header: "Đáp ứng (về / đặt)", loc: "so", gt: (r) => r.du, render: (r) => <DapUng v={r.du} ve={r.ve} dat={r.dat} /> },
  ];
  const cotPo: Col<DongPo>[] = [
    { key: "po", header: "PO · người đặt", loc: "chu", gt: (r) => `${r.po} ${r.nguoi_dat}`, render: (r) => <><b style={{ color: "#0071e3" }}>{r.po}</b><div style={{ fontSize: 11.5, color: "#6e6e73" }}>{r.nguoi_dat}</div></> },
    { key: "ncc", header: "Nhà cung cấp", loc: "chon", gt: (r) => r.ncc, render: (r) => r.ncc || <span className="muted">—</span>, maxW: 150, wrap: true },
    { key: "gd", header: "Giai đoạn", loc: "chon", gt: (r) => `${r.gd} · ${GD_TEN[r.gd] ?? r.gd}`, render: (r) => <><span style={{ whiteSpace: "nowrap" }}>{r.gd} · {GD_TEN[r.gd] ?? r.gd}</span>{r.so_lk > 1 && <div style={{ fontSize: 11.5, color: "#6e6e73" }}>{r.gd_txt.split("(")[1]?.replace(")", "")}</div>}</> },
    ...cotSl<DongPo>(), ...cotLoi<DongPo>(),
  ];
  type DongLk = (typeof lkRows)[number];
  const cotLk: Col<DongLk>[] = [
    { key: "po", header: "PO", loc: "chu", gt: (r) => r.po, render: (r) => <b>{r.po}</b> },
    { key: "lk", header: "Linh kiện", loc: "chu", gt: (r) => `${r.lk} ${r.ten_lk}`, wrap: true, maxW: 240,
      render: (r) => <><b>{r.lk}</b><div className="muted" style={{ fontSize: 11 }}>{r.ten_lk}</div></> },
    { key: "ncc", header: "NCC", loc: "chon", gt: (r) => r.ncc, render: (r) => r.ncc || <span className="muted">—</span> },
    { key: "gd", header: "Giai đoạn", loc: "chon", gt: (r) => `${r.gd} · ${GD_TEN[r.gd] ?? r.gd}`, render: (r) => `${r.gd} · ${GD_TEN[r.gd] ?? r.gd}` },
    ...cotSl<DongLk>(), ...cotLoi<DongLk>(),
  ];
  type DongGom = (typeof maRows)[number];
  const cotMa: Col<DongGom>[] = [
    { key: "key", header: "Mã lỗi", loc: "chu", gt: (r) => `${r.key} ${r.ten}`, wrap: true, maxW: 320, render: (r) => <><b>{soMa(r.key)}</b> {r.ten}</> },
    { key: "gd", header: "Giai đoạn", loc: "chon", gt: (r) => r.gd ? `${r.gd} · ${GD_TEN[r.gd]}` : "—", render: (r) => r.gd ? `${r.gd} · ${GD_TEN[r.gd]}` : "—" },
    { key: "ben", header: "Bên", loc: "chon", gt: (r) => BEN[r.ben].l, render: (r) => <span style={{ color: BEN[r.ben].mau, fontWeight: 700 }}>{BEN[r.ben].l}</span> },
    { key: "tong", header: "Số lần", align: "right", loc: "so", gt: (r) => r.tong, render: (r) => <b>{soLuong(r.tong)}</b> },
    { key: "so_po", header: "Số PO", align: "right", loc: "so", gt: (r) => r.so_po, render: (r) => soLuong(r.so_po) },
    { key: "so_lk", header: "Số LK", align: "right", loc: "so", gt: (r) => r.so_lk, render: (r) => soLuong(r.so_lk) },
    { key: "ai", header: "Ai lỗi nhiều nhất", loc: "chu", gt: (r) => r.ai.map(([a]) => a).join(" "), sapXep: false, wrap: true, maxW: 255, render: (r) => <span style={{ fontSize: 12 }}>{topTxt(r.ai)}</span> },
    { key: "cho", header: "Cần GT", align: "right", loc: "so", gt: (r) => r.cho, render: (r) => r.cho || <span className="muted">—</span> },
    { key: "vp", header: "Vi phạm", align: "right", loc: "so", gt: (r) => r.vp, render: (r) => r.vp ? <b style={{ color: TT.VI_PHAM.mau }}>{r.vp}</b> : <span className="muted">—</span> },
  ];
  const cotAi: Col<DongGom>[] = [
    { key: "key", header: "Ai lỗi", loc: "chu", gt: (r) => r.key, render: (r) => <b>{r.key}</b> },
    { key: "ben", header: "Bên", loc: "chon", gt: (r) => BEN[r.ben].l, render: (r) => <span style={{ color: BEN[r.ben].mau, fontWeight: 700 }}>{BEN[r.ben].l}</span> },
    { key: "tong", header: "Số lần", align: "right", loc: "so", gt: (r) => r.tong, render: (r) => <b>{soLuong(r.tong)}</b> },
    { key: "so_po", header: "Số PO", align: "right", loc: "so", gt: (r) => r.so_po, render: (r) => soLuong(r.so_po) },
    { key: "ma", header: "Lỗi gì (mã × lần)", loc: "chu", gt: (r) => r.ma.map(([m]) => `${m} ${tenMa.get(m)?.ten ?? ""}`).join(" "), sapXep: false, wrap: true, maxW: 380, render: (r) => <ChipMa xs={r.ma} tenMa={tenMa} n={4} /> },
    { key: "cho", header: "Cần GT", align: "right", loc: "so", gt: (r) => r.cho, render: (r) => r.cho || <span className="muted">—</span> },
    { key: "vp", header: "Vi phạm", align: "right", loc: "so", gt: (r) => r.vp, render: (r) => r.vp ? <b style={{ color: TT.VI_PHAM.mau }}>{r.vp}</b> : <span className="muted">—</span> },
  ];

  const xuat = () => {
    const ngay = new Date().toISOString().slice(0, 10);
    const maTxt = (xs: [string, number][]) => xs.map(([m, v]) => `${m} ${tenMa.get(m)?.ten ?? ""} ×${v}`).join("; ");
    const loiCols = <T extends ReturnType<typeof tongHop>>(): ExportCol<T>[] => [
      { header: "Lỗi đối tác (lần)", get: (r) => r.ncc_n }, { header: "Lỗi nội bộ (lần)", get: (r) => r.nb_n }, { header: "Lỗi gì", get: (r) => maTxt(r.ma) },
      { header: "Ai lỗi", get: (r) => r.ai.map(([a, v]) => `${a} ×${v}`).join("; ") }, { header: "Cần giải trình", get: (r) => r.cho }, { header: "Vi phạm", get: (r) => r.vp },
    ];
    if (xem === "po") exportRowsToXlsx(poRows, [
      { header: "PO", get: (r) => r.po }, { header: "NCC", get: (r) => r.ncc }, { header: "Người đặt", get: (r) => r.nguoi_dat }, { header: "Ngày ban hành", get: (r) => r.ngay_bh },
      { header: "Giai đoạn", get: (r) => r.gd_txt }, { header: "SL đặt", get: (r) => r.dat }, { header: "SL về", get: (r) => r.ve }, { header: "Thiếu", get: (r) => r.thieu },
      { header: "Đáp ứng %", get: (r) => r.du ?? "" }, ...loiCols<DongPo>()], `loi-theo-po_${ngay}.xlsx`, "Theo PO");
    else if (xem === "lk") exportRowsToXlsx(lkRows, [
      { header: "PO", get: (r) => r.po }, { header: "Mã LK", get: (r) => r.lk }, { header: "Tên LK", get: (r) => r.ten_lk }, { header: "Kho", get: (r) => r.kho }, { header: "NCC", get: (r) => r.ncc },
      { header: "Giai đoạn", get: (r) => `${r.gd} ${GD_TEN[r.gd] ?? ""}` }, { header: "SL đặt", get: (r) => r.dat }, { header: "SL về", get: (r) => r.ve }, { header: "Thiếu", get: (r) => r.thieu },
      { header: "Đáp ứng %", get: (r) => r.du ?? "" }, ...loiCols<DongLk>()], `loi-theo-lk_${ngay}.xlsx`, "Theo LK");
    else exportRowsToXlsx(xem === "ma" ? maRows : aiRows, [
      { header: xem === "ma" ? "Mã lỗi" : "Ai lỗi", get: (r) => (xem === "ma" ? `${r.key} ${r.ten}` : r.key) }, { header: "Bên", get: (r) => BEN[r.ben].l },
      { header: "Số lần", get: (r) => r.tong }, { header: "Số PO", get: (r) => r.so_po }, { header: "Số LK", get: (r) => r.so_lk },
      { header: xem === "ma" ? "Ai lỗi" : "Lỗi gì", get: (r) => (xem === "ma" ? r.ai.map(([a, v]) => `${a} ×${v}`).join("; ") : maTxt(r.ma)) },
      { header: "Cần giải trình", get: (r) => r.cho }, { header: "Vi phạm", get: (r) => r.vp }], `loi-theo-${xem}_${ngay}.xlsx`, xem === "ma" ? "Theo mã lỗi" : "Theo ai lỗi");
  };

  const Tile = ({ l, v, sub, mau, onClick, on }: { l: string; v: ReactNode; sub?: ReactNode; mau: string; onClick?: () => void; on?: boolean }) => (
    <button onClick={onClick} disabled={!onClick} style={{ textAlign: "left", border: 0, borderRadius: 16, padding: "12px 16px", background: on ? "#fff" : "#f5f5f7",
      boxShadow: on ? "0 0 0 2px #0071e3" : "none", cursor: onClick ? "pointer" : "default", minWidth: 150, flex: "1 1 150px", transition: "box-shadow .15s, background .15s" }}>
      <div style={{ fontSize: 11, color: "#86868b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{l}</div>
      <div style={{ ...SO, fontSize: 30, fontWeight: 700, letterSpacing: "-.025em", color: mau, lineHeight: 1.15, marginTop: 2 }}>{v}</div>
      {sub && <div style={{ fontSize: 12, color: "#6e6e73" }}>{sub}</div>}
    </button>
  );
  const bat = (k: string, cur: string[], v: string) => dat(k, cur.length === 1 && cur[0] === v ? null : [v]);
  const XEM: [Xem, string][] = [["po", "Theo PO"], ["lk", "Theo linh kiện"], ["ma", "Theo mã lỗi"], ["ai", "Theo ai lỗi"]];

  return (
    <div>
      <PageHeader title="Lỗi theo PO" />
      {/* 1. Tong quan 1 giay: tong lan loi · doi tac · noi bo · can GT · vi pham · dap ung */}
      <Card><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Tile l="Tổng số lần lỗi" v={soLuong(tong.tong)} sub={`${soLuong(new Set(loi.map((l) => l.e)).size)} PO · ${soLuong(new Set(loi.map((l) => l.ai)).size)} người / NCC`} mau="#1d1d1f" />
        <Tile l="Lỗi đối tác (NCC)" v={soLuong(tong.ncc_n)} sub={tong.tong ? `${Math.round((tong.ncc_n / tong.tong) * 100)}% — bấm để lọc` : undefined} mau={BEN.NCC.mau}
          on={fBen.length === 1 && fBen[0] === "NCC"} onClick={() => bat("ben", fBen, "NCC")} />
        <Tile l="Lỗi nội bộ" v={soLuong(tong.nb_n)} sub={tong.tong ? `${Math.round((tong.nb_n / tong.tong) * 100)}% — bấm để lọc` : undefined} mau={BEN.NOI_BO.mau}
          on={fBen.length === 1 && fBen[0] === "NOI_BO"} onClick={() => bat("ben", fBen, "NOI_BO")} />
        <Tile l="Cần giải trình" v={soLuong(tong.cho)} sub="còn hạn 16 giờ LV" mau={TT.CHO.mau} on={fTt.length === 1 && fTt[0] === "CHO"} onClick={() => bat("tt", fTt, "CHO")} />
        <Tile l="Vi phạm" v={soLuong(tong.vp)} sub="hết hạn không giải trình" mau={TT.VI_PHAM.mau} on={fTt.length === 1 && fTt[0] === "VI_PHAM"} onClick={() => bat("tt", fTt, "VI_PHAM")} />
        <Tile l="Tỷ lệ đáp ứng" v={pt(veAll, datAll) == null ? "—" : `${pt(veAll, datAll)}%`} sub={`về ${soLuong(veAll)} / đặt ${soLuong(datAll)} · thiếu ${soLuong(datAll - veAll)}`} mau="#1d8a3c" />
      </div></Card>
      {/* 2. Loi theo giai doan: moi cot = 1 giai doan, cao = so lan loi, tach doi tac / noi bo; bam = loc giai doan */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <b style={{ fontSize: 17, letterSpacing: "-.02em" }}>Lỗi theo giai đoạn</b>
          <span style={{ fontSize: 12, color: "#6e6e73" }}><span style={{ color: BEN.NCC.dac }}>●</span> đối tác <span style={{ color: BEN.NOI_BO.dac, marginLeft: 8 }}>●</span> nội bộ · bấm 1 giai đoạn để lọc</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {theoGd.map((g, i) => {
            const on = fGd.includes(g.k);
            const n = g.ncc + g.nb;
            return (
              <button key={g.k} onClick={() => bat("gd", fGd, g.k)} title={`${g.k} ${g.l}: ${n} lần (đối tác ${g.ncc} · nội bộ ${g.nb})`}
                style={{ flex: "1 0 88px", border: 0, borderRadius: 14, background: on ? "#e8f1fc" : "transparent", cursor: "pointer", padding: "6px 0 8px", transition: "background .15s" }}>
                <div style={{ height: 54, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                  <div style={{ ...SO, fontSize: 13, fontWeight: 700, color: "#1d1d1f" }}>{n || ""}</div>
                  <div style={{ width: 30, borderRadius: "6px 6px 0 0", overflow: "hidden" }}>
                    <div style={{ height: Math.round((g.nb / maxGd) * 34), background: BEN.NOI_BO.dac }} />
                    <div style={{ height: Math.round((g.ncc / maxGd) * 34), background: BEN.NCC.dac }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
                  <div style={{ flex: 1, height: 3, background: i ? "#e3e3e8" : "transparent" }} />
                  <span style={{ width: 28, height: 28, borderRadius: 99, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
                    background: on ? "#0071e3" : n ? "#ffe7e5" : "#fff", color: on ? "#fff" : n ? "#d70015" : "#86868b", boxShadow: on || n ? "none" : "inset 0 0 0 2px #d1d1d6" }}>{g.k}</span>
                  <div style={{ flex: 1, height: 3, background: i < GD.length - 1 ? "#e3e3e8" : "transparent" }} />
                </div>
                <div style={{ fontSize: 12, marginTop: 4, fontWeight: on ? 650 : 500, color: on ? "#0071e3" : "#515154" }}>{g.l}</div>
                {n > 0 && <div style={{ ...SO, fontSize: 11, color: "#6e6e73" }}>{g.ncc ? <span style={{ color: BEN.NCC.mau }}>{g.ncc}</span> : null}{g.ncc && g.nb ? " · " : ""}{g.nb ? <span style={{ color: BEN.NOI_BO.mau }}>{g.nb}</span> : null}</div>}
              </button>
            );
          })}
        </div>
      </Card>
      {/* 3. Bo loc chung + 4 cach xem */}
      <Card>
        <FilterBar>
          <div role="tablist" style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 9, background: "rgba(118,118,128,.12)" }}>
            {XEM.map(([k, l]) => <button key={k} role="tab" aria-selected={xem === k} onClick={() => dat("xem", k === "po" ? null : k)}
              style={{ border: 0, borderRadius: 8, padding: "5px 14px", fontSize: 13, cursor: "pointer", color: "#1d1d1f", fontWeight: xem === k ? 600 : 500,
                background: xem === k ? "#fff" : "transparent", boxShadow: xem === k ? "0 1px 3px rgba(0,0,0,.12), 0 1px 1px rgba(0,0,0,.04)" : "none" }}>{l}</button>)}
          </div>
          <ChonNhieu placeholder="Mọi bên" width={150} value={fBen} onChange={(v) => dat("ben", v)} options={opt(dem(tat, (l) => l.ben), (k) => BEN[k as "NCC"].l)} />
          <ChonNhieu placeholder="Mọi mã lỗi" width={190} value={fMa} onChange={(v) => dat("ma", v)} options={opt(dem(tat, (l) => l.ma), (k) => `${soMa(k)} ${tenMa.get(k)?.ten ?? ""}`)} />
          <ChonNhieu placeholder="Mọi giai đoạn" width={160} value={fGd} onChange={(v) => dat("gd", v)} options={GD.map(([k, l]) => ({ v: k, l: `${k} · ${l}`, n: tat.filter((x) => x.gd === k).length }))} />
          <ChonNhieu placeholder="Mọi NCC" width={160} value={fNcc} onChange={(v) => dat("ncc", v)} options={opt(dem(d.dong, (x) => x.ncc))} />
          <ChonNhieu placeholder="Mọi người / NCC lỗi" width={180} value={fAi} onChange={(v) => dat("ai", v)} options={opt(dem(tat, (l) => l.ai))} />
          <ChonNhieu placeholder="Mọi trạng thái" width={160} value={fTt} onChange={(v) => dat("tt", v)} options={opt(dem(tat, (l) => l.tt), (k) => TT[k as Loi["tt"]].l)} />
          {coLoc && <RefreshFiltersBtn onClick={xoaLoc} />}
          {(xem === "po" || xem === "lk") && !coLoc && (
            <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center" }} title="Mặc định chỉ hiện PO / linh kiện có lỗi">
              <input type="checkbox" checked={hetPo} onChange={(e) => dat("het", e.target.checked ? "1" : null)} /> Cả PO không lỗi</label>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn sm" style={{ padding: "0 9px" }} onClick={() => (qc.invalidateQueries({ queryKey: ["loi-po"] }), qc.invalidateQueries({ queryKey: ["loi-po-dem"] }))} title="Tải lại"><I.refresh width={13} height={13} /></button>
          <button className="btn sm" style={{ padding: "0 9px" }} onClick={xuat} title="Xuất Excel bảng đang xem"><I.download width={14} height={14} /></button>
        </FilterBar>
        <div className="muted" style={{ fontSize: 12, margin: "2px 0 6px" }}>
          Đếm theo <b>số lần lỗi</b> (mỗi lần hệ thống / người giải trình ghi lỗi = 1 lần). <b style={{ color: BEN.NCC.mau }}>Đối tác</b> = chờ ngày DK, giao trễ, NCC báo trễ / hết hàng…;
          {" "}<b style={{ color: BEN.NOI_BO.mau }}>Nội bộ</b> = không thúc NCC, chậm duyệt, đặt sai… (đã giải trình thì theo "Do ai" đã chọn).
          {xem === "po" && " Bấm 1 PO → xem chi tiết từng linh kiện, tiến trình, lỗi."}{(xem === "ma" || xem === "ai") && " Bấm 1 dòng → xem các PO bị lỗi đó."}
        </div>
        {/* v0.139: man hep (< 980px) -> the; bam PO / linh kien -> popup chi tiet PO (luong ngang) */}
        {(() => {
          const veMa = (r: { key: string }) => setSp((s) => { const n = new URLSearchParams(s); n.delete("xem"); n.set("ma", r.key); return n; });
          const veAi = (r: { key: string }) => setSp((s) => { const n = new URLSearchParams(s); n.delete("xem"); n.set("ai", r.key); return n; });
          if (hep) return xem === "po" ? <DsThe cols={cotPo} rows={poRows} keyOf={(r) => r.e} onClick={(r) => setMoPo(r.e)} empty="Không có PO khớp bộ lọc." />
            : xem === "lk" ? <DsThe cols={cotLk} rows={lkRows} keyOf={(r) => r.i} onClick={(r) => setMoPo(r.e)} empty="Không có linh kiện khớp bộ lọc." />
            : xem === "ma" ? <DsThe cols={cotMa} rows={maRows} keyOf={(r) => r.key} onClick={veMa} empty="Không có lỗi khớp bộ lọc." />
            : <DsThe cols={cotAi} rows={aiRows} keyOf={(r) => r.key} onClick={veAi} empty="Không có lỗi khớp bộ lọc." />;
          return xem === "po" ? <DataTable cols={cotPo} rows={poRows} keyOf={(r) => r.e} pageSize={30} luuSoDong="loi-po" onRowClick={(r) => setMoPo(r.e)} empty="Không có PO khớp bộ lọc." />
            : xem === "lk" ? <DataTable cols={cotLk} rows={lkRows} keyOf={(r) => r.i} pageSize={30} luuSoDong="loi-po-lk" onRowClick={(r) => setMoPo(r.e)} empty="Không có linh kiện khớp bộ lọc." />
            : xem === "ma" ? <DataTable cols={cotMa} rows={maRows} keyOf={(r) => r.key} pageSize={30} onRowClick={veMa} empty="Không có lỗi khớp bộ lọc." />
            : <DataTable cols={cotAi} rows={aiRows} keyOf={(r) => r.key} pageSize={30} onRowClick={veAi} empty="Không có lỗi khớp bộ lọc." />;
        })()}
      </Card>
      {moPo != null && <PopupPo e={moPo} dong={d.dong} loi={d.loi} tenMa={tenMa} hep={hep} onClose={() => setMoPo(null)}
        onDayDu={() => { const e = moPo; setMoPo(null); qv.openEo(e, { loi: true }); }} onGiaiTrinh={(ds) => setGt(ds)} />}
      {gt && <GiaiTrinhDongModal dongs={gt.map((x) => ({ item_id: x.i, eo_id: x.e, ma_po: x.po, part_code: x.lk, part_name: x.ten_lk }))}
        onClose={() => setGt(null)} onSaved={() => { setGt(null); (qc.invalidateQueries({ queryKey: ["loi-po"] }), qc.invalidateQueries({ queryKey: ["loi-po-dem"] })); }} />}
    </div>
  );
}
