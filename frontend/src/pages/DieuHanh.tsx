import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api } from "../api/client";
import { Card, PageHeader, Spinner } from "../components/ui";
import { DataTable, FilterBar, type Col } from "../components/DataTable";
import { useQuickView } from "../components/quickview/QuickView";
import { I } from "../lib/icons";
import { soLuong, ngay, ngayGio, ten, tuBayGio } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { ChonNhieu } from "../components/ChonNhieu";
import { BangTrachNhiem } from "./dieuhanh/BangTrachNhiem";

/** gia tri trong (NCC chua co...) trong bo loc chon nhieu */
const TRONG_K = "∅";
const khopPv = (ds: string[], v: string | null | undefined) => !ds.length || ds.includes(v || TRONG_K);

/**
 * MAN DIEU HANH (v0.084, yeu cau lanh dao 2026-11-18 - ../QUAN_TRI_DIEU_HANH.md): nhin 3-5 giay biet ton o dau, ai giu, ho da lam gi,
 * vi sao van ton; 1-2 cu bam ra danh sach can nhac. Du lieu GET /api/dieu-hanh (backend lib/dieuHanh.ts) - moi dong LK dang mo kem
 * muc DO / VANG / XANH + ly do; FE gom theo nguoi / NCC / kho de loc pham vi.
 */

type Muc = "DO" | "VANG" | "XANH";
interface Dong {
  id: number; eo: number; po: string; ma: string; ten: string; kho: string; ncc: string | null; nguoi: string | null;
  dat: number; ve: number; thieu: number; bd: string | null; ton: number;
  gd: string | null; gd_tre: boolean; tt: string; ndk: string | null; qua_dk: number; lui: number; ceo: string[];
  loi: number; loi_cho: number; loi_cho_ngay: number; qt: Record<string, number>; vp_cho: string[];
  thuc: number; thuc7: number; thuc_luc: string | null; phan_hoi: number; phan_hoi_luc: string | null; phan_hoi_tt: string | null;
  gt: number; gt_luc: string | null; gt_ai_ma: string | null; gt_loi_ma: string | null; gt_nd: string | null;
  td_luc: string | null; td_loai: string | null; td_ai: string | null; td7: number; im_lang: number;
  nhac: number; nhac_luc: string | null; muc: Muc; ly_do: string[]; diem: number;
  /** v0.122 bang trach nhiem: trang thai gui don NCC, ben dang giu, loi [khoa, ben N/B, tt C/V/G/T] */
  g4?: string | null; ben?: "NCC" | "NOI_BO"; vb?: [string, string, string][];
}
interface Gd { k: string; l: string; vai_tro: string; ben?: string; xong30: number; tre30: number; tre30_ai: { ai: string; n: number }[]; dang: number; dang_tre: number; dang_ai: { ai: string; n: number }[] }
interface Duyet { eo_id: number; po: string; tieu_de: string | null; buoc: string; ai: string | null; tu: string; gio: number; so_dong: number; nguoi_tao: string }
interface Data {
  luc: string; hom_nay: string; bo_qua_truoc: string; nguong: { im_lang_do: number; im_lang_vang: number; loi_cho_do: number };
  dong: Dong[]; giai_doan: Gd[]; xu_huong: { tuan: string; loi: number; gt: number; nhac: number }[];
  /** v0.110: vp = vi pham THAT (het han giai trinh ma khong giai trinh); n = moi loi; cho = loi con can giai trinh */
  loi30: { qt: string; ai: string | null; ncc: string | null; ben?: "NCC" | "NOI_BO"; cho: number; n: number; vp?: number }[];
  nguyen_nhan: { ai_ma: string; loi_ma: string; n: number }[]; do_phu: { tong_loi: number; da_gt: number; tu_dong?: number };
  dm: { loai: string; ma: string; ten: string }[]; duyet: Duyet[]; quan_ly: boolean;
}

const MUC: Record<Muc, { l: string; mau: string; nen: string }> = {
  DO: { l: "ĐỎ", mau: "#d70015", nen: "#ffe7e5" },
  VANG: { l: "VÀNG", mau: "#c26400", nen: "#fff1dc" },
  XANH: { l: "XANH", mau: "#1d8a3c", nen: "#e2f6e7" },
};
const TT: Record<string, string> = { CHO_NDK: "Chờ ngày DK", TRE_NDK: "Trễ hạn chưa có ngày DK", QUA_HAN_NDK: "Quá ngày DK", CHO_HANG: "Có ngày DK, chờ hàng" };
const QT_GD: Record<string, string> = { R3: "G4", R1: "G5", R4: "G6", R5: "G3" };
const QT_TEN: Record<string, string> = { R5: "R5 · Chậm duyệt (người duyệt)", R1: "R1 · Không có ngày DK đúng hạn", R3: "R3 · Không push NCC thứ 2/4", R4: "R4 · Quá ngày DK không cập nhật", TAY: "Lỗi ghi tay khi giải trình" };
const BUOC: Record<string, string> = { REVIEW: "Thẩm định", FINAL: "Duyệt mua", SAU_BH: "Dòng thêm sau BH" };
/** tieu chi loc nhanh (o suc khoe / ket luan) */
const TIEU_CHI: Record<string, { l: string; f: (d: Dong, n: Data["nguong"]) => boolean }> = {
  DO: { l: "Mức ĐỎ", f: (d) => d.muc === "DO" },
  VANG: { l: "Mức VÀNG", f: (d) => d.muc === "VANG" },
  QUA_DK: { l: "Quá ngày DK", f: (d) => d.tt === "QUA_HAN_NDK" },
  CHUA_DK: { l: "Chưa có ngày DK", f: (d) => d.tt === "TRE_NDK" || d.tt === "CHO_NDK" },
  IM_LANG: { l: "Im lặng ≥ 7 ngày", f: (d, n) => d.im_lang >= n.im_lang_do },
  LOI_CHO: { l: "Có lỗi chờ giải trình", f: (d) => d.loi_cho > 0 },
  CEO: { l: "Cấp CEO", f: (d) => d.ceo.length > 0 },
  KHONG_THUC: { l: "Không thúc NCC 7 ngày", f: (d) => d.thuc7 === 0 },
};
const pctTxt = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
/** gom ly do do ve nhan chung (khop backend lib/dieuHanh nhomLyDo) */
const nhomLyDo = (s: string) => s.startsWith("Cấp CEO") ? "Cấp CEO" : s.startsWith("Quá ngày DK") ? "Quá ngày DK" : s.startsWith("Trễ hạn") ? "Trễ hạn chưa có ngày DK"
  : s.includes("lỗi chờ giải trình") ? `Lỗi chờ giải trình ≥ ${12}h làm việc` : s.startsWith("Im lặng") ? "Im lặng ≥ 7 ngày" : s;
const thoiGianCho = (gio: number) => (gio < 24 ? `${gio} giờ` : `${Math.floor(gio / 24)} ngày${gio % 24 ? ` ${gio % 24} giờ` : ""}`);

/** nhung = dat trong man khac (khong ve tieu de trang rieng). v0.133: Dieu hanh lai la man rieng /dieu-hanh. */
export default function DieuHanh({ nhung }: { nhung?: boolean } = {}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dieu-hanh"], queryFn: () => api.get<Data>("/dieu-hanh"), refetchInterval: 180000 });
  // pham vi chon NHIEU (nguyen tac 2026-11-18) - [] = khong loc; gia tri trong = TRONG_K
  const [pv, setPv] = useState<{ nguoi: string[]; ncc: string[]; kho: string[] }>({ nguoi: [], ncc: [], kho: [] });
  const [tieuChi, setTieuChi] = useState("");
  const [gdChon, setGdChon] = useState("");
  // v0.122: tab mac dinh = Bang trach nhiem (NCC / noi bo) cho lanh dao
  // v0.129: tab nam tren URL (?tab=) - menu cap 2 "Tổng quan › Điều hành › …" o sidebar bam la doi tab
  // v0.134: "tong" = Ket luan nhanh + o suc khoe + luong giai doan (menu cap 2 rieng, mac dinh); tab khac = CHI bang (bo phan dau)
  type Tab = "tong" | "bang" | "nong" | "po" | "nguoi" | "ncc" | "nn" | "duyet";
  const [sp, setSp] = useSearchParams();
  const tab: Tab = (["tong", "bang", "nong", "po", "nguoi", "ncc", "nn", "duyet"] as const).find((k) => k === sp.get("tab")) ?? "tong";
  const setTab = (k: Tab) => setSp((s) => { const n = new URLSearchParams(s); n.set("tab", k); return n; }, { replace: true });
  // v0.118 tab Theo PO: bam so o 1 PO -> Diem nong chi dong cua PO do
  const [poChon, setPoChon] = useState<{ eo: number; po: string } | null>(null);
  const d = q.data;

  const dongPv = useMemo(() => (d?.dong ?? []).filter((x) => khopPv(pv.nguoi, x.nguoi) && khopPv(pv.ncc, x.ncc) && khopPv(pv.kho, x.kho)), [d, pv]);
  const dongDs = useMemo(() => {
    if (!d) return [];
    const tc = TIEU_CHI[tieuChi];
    return dongPv.filter((x) => (!tc || tc.f(x, d.nguong)) && (!gdChon || x.gd === gdChon) && (!poChon || x.eo === poChon.eo)).sort((a, b) => b.diem - a.diem);
  }, [d, dongPv, tieuChi, gdChon, poChon]);

  if (q.isLoading || !d) return <>{!nhung && <PageHeader title="Điều hành mua hàng" />}<Spinner text="Đang tổng hợp điều hành toàn hệ thống…" /></>;

  const loi30Pv = d.loi30.filter((l) => khopPv(pv.nguoi, l.ai) && khopPv(pv.ncc, l.ncc));
  const duyetPv = d.duyet.filter((x) => khopPv(pv.nguoi, x.ai) || (pv.nguoi.length > 0 && khopPv(pv.nguoi, x.nguoi_tao)));
  const dem = (f: (x: Dong) => boolean) => dongPv.filter(f).length;
  const soPo = (ds: Dong[]) => new Set(ds.map((x) => x.eo)).size;
  const doDs = dongPv.filter((x) => x.muc === "DO");
  const coLoc = !!(pv.nguoi.length || pv.ncc.length || pv.kho.length || tieuChi || gdChon || poChon);
  const xoaLoc = () => { setPv({ nguoi: [], ncc: [], kho: [] }); setTieuChi(""); setGdChon(""); setPoChon(null); };
  // v0.134: o so nam o tab "tong" -> luon mo Diem nong loc dung tieu chi
  const chonTc = (k: string) => { setTieuChi(k); setTab("nong"); };
  const dmTen = (loai: string, ma: string | null) => d.dm.find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";

  // ---- gom theo nguoi / NCC (theo pham vi dang loc)
  const theoNguoi = gomNguoi(dongPv, loi30Pv, duyetPv, d.nguong.im_lang_do);
  const theoNcc = gomNcc(dongPv, d.giai_doan);
  const theoPo = gomPo(dongPv);
  const gtPct = d.do_phu.tong_loi ? d.do_phu.da_gt / d.do_phu.tong_loi : 1;

  // ---- ket luan nhanh (cau tu sinh, bam duoc)
  const ketLuan: { icon: string; txt: ReactNode; onClick?: () => void; mau?: string }[] = [];
  ketLuan.push({
    icon: doDs.length ? "🔴" : "🟢", mau: doDs.length ? "#d70015" : "#1d8a3c", onClick: () => chonTc("DO"),
    txt: <><b>{soLuong(doDs.length)} / {soLuong(dongPv.length)}</b> dòng đang mở ở mức ĐỎ (<b>{pctTxt(doDs.length, dongPv.length)}</b>) — thuộc <b>{soPo(doDs)}</b> PO; {soLuong(dem((x) => x.muc === "VANG"))} dòng vàng.</>,
  });
  const lyDoDem = new Map<string, number>();
  for (const x of doDs) for (const l of new Set(x.ly_do.map(nhomLyDo))) lyDoDem.set(l, (lyDoDem.get(l) ?? 0) + 1);
  const lyDoTop = [...lyDoDem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (lyDoTop.length) ketLuan.push({ icon: "🧭", txt: <>Đỏ vì: {lyDoTop.map(([l, n], i) => <span key={l}>{i > 0 && " · "}<b>{l}</b> ({soLuong(n)} dòng)</span>)}.</> });
  const nguoiNhac = theoNguoi.filter((x) => x.dong > 0).sort((a, b) => b.do - a.do || b.loi_cho - a.loi_cho)[0];
  if (nguoiNhac && nguoiNhac.do > 0) ketLuan.push({
    icon: "👤", mau: "#d70015", onClick: () => { setPv({ ...pv, nguoi: [nguoiNhac.ai] }); setTieuChi("DO"); setTab("nong"); },
    txt: <>Cần nhắc ngay: <b>{ten(nguoiNhac.ai)}</b> — giữ {soLuong(nguoiNhac.dong)} dòng, <b>{soLuong(nguoiNhac.do)} đỏ</b>, {soLuong(nguoiNhac.loi_cho)} lỗi cần giải trình,
      chỉ <b>{pctTxt(nguoiNhac.td7_dong, nguoiNhac.dong)}</b> dòng có tác động 7 ngày qua{nguoiNhac.im_lang7 ? `, ${soLuong(nguoiNhac.im_lang7)} dòng im lặng ≥ 7 ngày` : ""}.</>,
  });
  const nccXau = theoNcc.filter((x) => x.do > 0).sort((a, b) => b.do - a.do)[0];
  if (nccXau) ketLuan.push({
    icon: "🏭", onClick: () => { setPv({ ...pv, ncc: [nccXau.ncc ?? TRONG_K] }); setTab("nong"); },
    txt: <>NCC đáng lo nhất: <b>{nccXau.ncc || "(trống)"}</b> — {soLuong(nccXau.do)} dòng đỏ, {soLuong(nccXau.qua_dk)} quá ngày DK, tồn lâu nhất {nccXau.ton_max} ngày,
      phản hồi {soLuong(nccXau.phan_hoi)} / {soLuong(nccXau.thuc)} lần thúc{nccXau.tre_g6 ? `, ${nccXau.tre_g6} dòng giao trễ hẹn 30 ngày qua` : ""}.</>,
  });
  ketLuan.push({
    icon: gtPct < 0.3 ? "⚠️" : "✅", mau: gtPct < 0.3 ? "#c26400" : undefined, onClick: () => setTab("nn"),
    txt: <>Kỷ luật giải trình: mới giải trình <b>{soLuong(d.do_phu.da_gt)} / {soLuong(d.do_phu.tong_loi)}</b> lỗi (<b>{pctTxt(d.do_phu.da_gt, d.do_phu.tong_loi)}</b>){d.do_phu.tu_dong ? <> · hệ thống tự đóng <b>{soLuong(d.do_phu.tu_dong)}</b> (đã khắc phục trong hạn — không tính vi phạm · hết hạn giải trình 16h làm việc — vi phạm)</> : null}
      {gtPct < 0.3 ? " — chưa đủ cơ sở kết luận nguyên nhân, phải ép giải trình trước." : "."}</>,
  });
  if (duyetPv.length) {
    const lau = [...duyetPv].sort((a, b) => b.gio - a.gio)[0];
    ketLuan.push({ icon: "⏳", onClick: () => setTab("duyet"), txt: <><b>{duyetPv.length}</b> phiếu duyệt đang treo — lâu nhất {lau.po} ({BUOC[lau.buoc]}) chờ <b>{ten(lau.ai)}</b> {thoiGianCho(lau.gio)}.</> });
  }

  const nhacNguoi = async (email: string) => {
    const nd = prompt(`Nhắc ${ten(email)} giải trình MỌI lỗi đang chờ. Lời nhắn (tuỳ chọn):`, "");
    if (nd === null) return;
    const r = await api.post<{ so_loi: number }>("/dieu-hanh/nhac-nguoi", { email, noi_dung: nd });
    alert(r.so_loi ? `Đã nhắc ${ten(email)}: ${soLuong(r.so_loi)} lỗi.` : "Người này không còn lỗi chờ giải trình.");
    qc.invalidateQueries({ queryKey: ["dieu-hanh"] });
  };

  const opts = (vals: (string | null)[], nhan = (v: string) => v) => {
    const m = new Map<string, number>();
    for (const v of vals) { const k = v || TRONG_K; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, l: v === TRONG_K ? "(trống)" : nhan(v), n }));
  };
  const S = ({ k, w, ph, o }: { k: keyof typeof pv; w: number; ph: string; o: { v: string; l: string; n: number }[] }) => (
    <ChonNhieu width={w} placeholder={ph} value={pv[k]} onChange={(v) => setPv({ ...pv, [k]: v })} options={o} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!nhung && <PageHeader title="Điều hành mua hàng" />}
      <FilterBar>
        {/* v0.135 (chu he thong "thu gon giao dien"): bo hang chip tab tren bang - chon bang o day / menu cap 2 */}
        <select className="select tb" style={{ width: 230, fontWeight: 700 }} value={tab} onChange={(e) => setTab(e.target.value as Tab)} title="Bảng đang xem (cũng chọn được ở menu bên trái)">
          {([["tong", "🧾 Kết luận & sức khoẻ"], ["bang", "📊 Trách nhiệm NCC / nội bộ"], ["nong", `🔥 Điểm nóng (${soLuong(dongDs.length)})`], ["po", `📦 Theo PO (${soLuong(theoPo.length)})`], ["nguoi", `👤 Theo người (${theoNguoi.length})`], ["ncc", `🏭 Theo NCC (${theoNcc.length})`],
            ["nn", "🧭 Nguyên nhân & xu hướng"], ["duyet", `⏳ Duyệt đang treo (${duyetPv.length})`]] as const).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <b style={{ fontSize: 13 }}>Phạm vi:</b>
        <S k="nguoi" w={210} ph="Mọi người phụ trách" o={opts(d.dong.map((x) => x.nguoi), (v) => ten(v))} />
        <S k="ncc" w={170} ph="Mọi NCC" o={opts(d.dong.map((x) => x.ncc))} />
        <S k="kho" w={200} ph="Mọi kho" o={opts(d.dong.map((x) => x.kho))} />
        {tieuChi && <span className="badge reject" style={{ cursor: "pointer" }} onClick={() => setTieuChi("")}>{TIEU_CHI[tieuChi].l} ×</span>}
        {gdChon && <span className="badge review" style={{ cursor: "pointer" }} onClick={() => setGdChon("")}>Giai đoạn {gdChon} ×</span>}
        {poChon && <span className="badge review" style={{ cursor: "pointer" }} onClick={() => setPoChon(null)}>PO {poChon.po} ×</span>}
        {coLoc && <button className="btn sm ghost" onClick={xoaLoc}><I.refresh width={13} height={13} /> Xóa lọc</button>}
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 11.5 }} title={`Chỉ tính PO ban hành từ ${ngay(d.bo_qua_truoc)} (cùng phạm vi với Theo dõi / Vi phạm)`}>Cập nhật {d.luc.slice(11, 16)} · PO từ {ngay(d.bo_qua_truoc)}</span>
        <button className="btn sm" onClick={() => q.refetch()} disabled={q.isFetching} title="Tải lại"><I.refresh width={13} height={13} /></button>
      </FilterBar>

      {tab === "tong" && <>
      {/* 1. KET LUAN NHANH */}
      <Card style={{ boxShadow: `0 0 0 2px ${doDs.length ? "#ff3b30" : "#2fb350"}, var(--shadow)` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <b style={{ fontSize: 15 }}>Kết luận nhanh</b>
          <span className="muted" style={{ fontSize: 11.5 }}>{coLoc ? "theo phạm vi đang lọc" : "toàn hệ thống"} · bấm từng câu để xem danh sách</span>
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          {ketLuan.map((k, i) => (
            <div key={i} onClick={k.onClick} className={k.onClick ? "dh-cau" : undefined} style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.5, cursor: k.onClick ? "pointer" : undefined, color: k.mau }}>
              <span style={{ width: 20, flexShrink: 0 }}>{k.icon}</span><span style={{ color: "var(--text)" }}>{k.txt}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 2. O SUC KHOE - bam = loc diem nong */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 8 }}>
        <O l="Dòng đang mở" v={soLuong(dongPv.length)} sub={`${soPo(dongPv)} PO · thiếu ${soLuong(dongPv.reduce((s, x) => s + x.thieu, 0))}`} onClick={() => { setTieuChi(""); setTab("nong"); }} />
        <O l="🔴 Mức ĐỎ" v={soLuong(doDs.length)} sub={pctTxt(doDs.length, dongPv.length)} mau={MUC.DO.mau} on={tieuChi === "DO"} onClick={() => chonTc("DO")} />
        <O l="🟡 Mức VÀNG" v={soLuong(dem((x) => x.muc === "VANG"))} mau={MUC.VANG.mau} on={tieuChi === "VANG"} onClick={() => chonTc("VANG")} />
        <O l="Quá ngày DK" v={soLuong(dem((x) => x.tt === "QUA_HAN_NDK"))} sub={`lùi ≥ 3 lần: ${dem((x) => x.lui >= 3)}`} mau={MUC.DO.mau} on={tieuChi === "QUA_DK"} onClick={() => chonTc("QUA_DK")} />
        <O l="Chưa có ngày DK" v={soLuong(dem((x) => x.tt === "TRE_NDK" || x.tt === "CHO_NDK"))} sub={`${dem((x) => x.tt === "TRE_NDK")} đã trễ hạn`} mau={MUC.VANG.mau} on={tieuChi === "CHUA_DK"} onClick={() => chonTc("CHUA_DK")} />
        <O l={`Im lặng ≥ ${d.nguong.im_lang_do} ngày`} v={soLuong(dem((x) => x.im_lang >= d.nguong.im_lang_do))} sub="không ai tác động" mau={MUC.DO.mau} on={tieuChi === "IM_LANG"} onClick={() => chonTc("IM_LANG")} />
        <O l="Không thúc NCC 7 ngày" v={soLuong(dem((x) => x.thuc7 === 0))} sub="push / mail / gọi = 0" on={tieuChi === "KHONG_THUC"} onClick={() => chonTc("KHONG_THUC")} />
        <O l="Lỗi cần giải trình" v={soLuong(new Set(dongPv.flatMap((x) => x.vp_cho ?? [])).size)} sub={`${dem((x) => x.loi_cho > 0)} dòng · đã GT ${pctTxt(d.do_phu.da_gt, d.do_phu.tong_loi)}`} mau={MUC.DO.mau} on={tieuChi === "LOI_CHO"} onClick={() => chonTc("LOI_CHO")} />
        <O l="Cấp CEO" v={soLuong(dem((x) => x.ceo.length > 0))} mau={MUC.DO.mau} on={tieuChi === "CEO"} onClick={() => chonTc("CEO")} />
        <O l="Duyệt đang treo" v={soLuong(duyetPv.length)} sub={duyetPv.length ? `lâu nhất ${thoiGianCho(Math.max(...duyetPv.map((x) => x.gio)))}` : "không có"} mau={duyetPv.length ? MUC.VANG.mau : undefined} onClick={() => setTab("duyet")} />
      </div>

      {/* 3. LUONG GIAI DOAN NGANG */}
      <LuongGiaiDoan gd={d.giai_doan} dong={dongPv} loi30={loi30Pv} chon={gdChon} onChon={(k) => { setGdChon(gdChon === k ? "" : k); setTab(["G2", "G3"].includes(k) ? "duyet" : "nong"); }} coLoc={!!(pv.nguoi.length || pv.ncc.length || pv.kho.length)} />

      </>}

      {/* 4. TAB CHI TIET - v0.134: chi hien khi chon 1 bang (menu cap 2), khong kem phan tong hop phia tren */}
      {tab !== "tong" && <Card style={{ padding: 12 }}>
        {tab === "bang" && <BangTrachNhiem dong={dongPv} duyet={duyetPv} />}
        {tab === "nong" && <DiemNong rows={dongDs} dmTen={dmTen}
          empty={["G1", "G2", "G3"].includes(gdChon) ? `${gdChon} là PO chưa ban hành (chưa vào theo dõi hàng về) — người đang giữ xem ở khung giai đoạn phía trên, phiếu chờ duyệt ở tab ⏳ Duyệt đang treo.` : undefined} />}
        {tab === "po" && <BangPo rows={theoPo} onXem={(r, tc) => { setPoChon({ eo: r.eo, po: r.po }); setTieuChi(tc); setTab("nong"); }} />}
        {tab === "nguoi" && <BangNguoi rows={theoNguoi} quanLy={d.quan_ly} onNhac={nhacNguoi} onXem={(ai, tc) => { setPv({ ...pv, nguoi: [ai] }); setTieuChi(tc); setTab("nong"); }} />}
        {tab === "ncc" && <BangNcc rows={theoNcc} onXem={(ncc, tc) => { setPv({ ...pv, ncc: [ncc || TRONG_K] }); setTieuChi(tc); setTab("nong"); }} />}
        {tab === "nn" && <NguyenNhan d={d} loi30={loi30Pv} dmTen={dmTen} />}
        {tab === "duyet" && <BangDuyet rows={duyetPv} />}
      </Card>}
    </div>
  );
}

function O({ l, v, sub, mau, on, onClick }: { l: string; v: ReactNode; sub?: string; mau?: string; on?: boolean; onClick?: () => void }) {
  return (
    <div className="ql-o" onClick={onClick} style={{ cursor: "pointer", background: on ? "#fff" : undefined, boxShadow: on ? "0 0 0 2px var(--ocean-600)" : undefined }}>
      <div className="ql-l">{l}</div>
      <div className="ql-v" style={{ color: mau }}>{v}</div>
      {sub && <div className="ql-s">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ luong giai doan ngang (dung lai class ttq-* cua components/TienTrinh)
function LuongGiaiDoan({ gd, dong, loi30, chon, onChon, coLoc }: { gd: Gd[]; dong: Dong[]; loi30: Data["loi30"]; chon: string; onChon: (k: string) => void; coLoc: boolean }) {
  const [mo, setMo] = useState(false);
  // G4-G8 theo pham vi (tu dong dang mo); G1-G3 (chua ban hanh) luon toan he thong
  const nut = gd.map((g) => {
    const tuDong = ["G4", "G5", "G6", "G7", "G8"].includes(g.k);
    const ds = dong.filter((x) => x.gd === g.k);
    const dang = coLoc && tuDong ? ds.length : g.dang;
    const tre = coLoc && tuDong ? ds.filter((x) => x.gd_tre).length : g.dang_tre;
    const loi = loi30.filter((l) => QT_GD[l.qt] === g.k);
    return { g, dang, tre, loi: loi.reduce((s, l) => s + l.n, 0), loiCho: loi.reduce((s, l) => s + l.cho, 0) };
  });
  const sel = gd.find((g) => g.k === chon);
  return (
    <Card>
      <div className="tt-wrap ttq-gon" style={{ border: "none", padding: 0 }}>
        <div className="ttq-nhan"><b>Đơn đang ở</b><span className="muted" style={{ fontSize: 11 }}>bấm mốc để lọc</span></div>
        <div className="ttq-line" style={{ marginTop: 0, flex: 1, minWidth: 0 }}>
          {nut.map((n, i) => {
            const tt = n.tre ? { nen: "#ff3b30", vien: "#d70015", chu: "#fff" } : n.dang ? { nen: "#ff9500", vien: "#c26400", chu: "#fff" } : { nen: "#2fb350", vien: "#1d8a3c", chu: "#fff" };
            return (
              <div key={n.g.k} className="ttq-nut" onClick={() => onChon(n.g.k)} style={{ cursor: "pointer", opacity: chon && chon !== n.g.k ? 0.5 : 1 }}
                title={`${n.g.k} ${n.g.l} — ${n.g.vai_tro}\n${n.dang} dòng đang ở, ${n.tre} trễ hạn\nLỗi 30 ngày: ${n.loi} (${n.loiCho} chờ giải trình)\n30 ngày: ${n.g.xong30} dòng qua bước, ${n.g.tre30} trễ hạn`}>
                {i > 0 && <div className="ttq-noi" style={{ background: "#e8e8ed" }} />}
                <div className={`ttq-cham${chon === n.g.k ? " on" : ""}`} style={{ background: tt.nen, borderColor: tt.vien, color: tt.chu, borderStyle: n.g.k === "G4" || n.g.k === "G7" ? "dashed" : "solid" }}>
                  {n.g.k.slice(1)}
                  {n.loiCho > 0 && <span className="ttq-loi" style={{ background: "#d70015" }}>{n.loiCho > 999 ? "999+" : n.loiCho}</span>}
                </div>
                <div className="ttq-ten" style={{ fontWeight: n.dang ? 800 : 600 }}>{n.g.l}</div>
                <div className="ttq-phu" style={{ color: n.tre ? "var(--danger-ink)" : undefined }}>{n.dang ? `${soLuong(n.dang)} đang${n.tre ? ` · ${soLuong(n.tre)} trễ` : ""}` : "—"}</div>
              </div>
            );
          })}
        </div>
        <div className="ttq-tt"><button className="btn ghost sm" onClick={() => setMo(!mo)}>{mo ? "▴ Thu gọn" : "▾ Xem chi tiết"}</button></div>
      </div>
      {(mo || sel) && (
        <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr" : "repeat(auto-fill, minmax(250px, 1fr))", gap: 8, marginTop: 10 }}>
          {(sel ? [sel] : gd).map((g) => {
            const n = nut.find((x) => x.g.k === g.k)!;
            return (
              <div key={g.k} className="card card-pad" style={{ background: "var(--panel-2)" }}>
                <b>{g.k} · {g.l}</b> <span className="muted" style={{ fontSize: 12 }}>— chịu trách nhiệm: {g.vai_tro}</span>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  Đang ở <b>{soLuong(n.dang)}</b> dòng{n.tre ? <>, <b style={{ color: "var(--danger-ink)" }}>{soLuong(n.tre)} trễ hạn</b></> : ""} ·
                  30 ngày: {soLuong(g.xong30)} dòng qua bước, <b style={{ color: g.tre30 ? "var(--danger-ink)" : undefined }}>{soLuong(g.tre30)} trễ</b> (đúng hạn {pctTxt(g.xong30 - g.tre30, g.xong30)}) ·
                  lỗi 30 ngày {soLuong(n.loi)} ({soLuong(n.loiCho)} chờ GT)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6, fontSize: 12 }}>
                  <div><div className="muted">Đang giữ (người / NCC)</div>{g.dang_ai.length ? g.dang_ai.slice(0, 6).map((x) => <div key={x.ai} style={{ display: "flex", justifyContent: "space-between" }}><span>{tenAi(x.ai)}</span><b>{soLuong(x.n)}</b></div>) : <span className="muted">—</span>}</div>
                  <div><div className="muted">Làm trễ 30 ngày</div>{g.tre30_ai.length ? g.tre30_ai.slice(0, 6).map((x) => <div key={x.ai} style={{ display: "flex", justifyContent: "space-between" }}><span>{tenAi(x.ai)}</span><b style={{ color: "var(--danger-ink)" }}>{soLuong(x.n)}</b></div>) : <span className="muted">không có</span>}</div>
                </div>
                {!coLoc || ["G4", "G5", "G6", "G7", "G8"].includes(g.k) ? null : <div className="muted" style={{ fontSize: 11 }}>G1–G3 luôn tính toàn hệ thống (đơn chưa ban hành).</div>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
const tenAi = (ai: string) => (ai.includes("@") ? ten(ai) : ai);

// ------------------------------------------------------------------ diem nong
function DiemNong({ rows, dmTen, empty }: { rows: Dong[]; dmTen: (loai: string, ma: string | null) => string; empty?: string }) {
  const qv = useQuickView();
  const cols: Col<Dong>[] = [
    { key: "muc", header: "Mức", loc: "chon", gt: (r) => r.muc, nhanChon: (v) => MUC[v as Muc]?.l ?? v, gtSap: (r) => r.diem, maxW: 230,
      render: (r) => <span title={r.ly_do.join("\n") || "Ổn"} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <span style={{ background: MUC[r.muc].nen, color: MUC[r.muc].mau, fontWeight: 700, fontSize: 11, borderRadius: 8, padding: "1px 6px" }}>{MUC[r.muc].l}</span>
        <span style={{ fontSize: 12, color: MUC[r.muc].mau }}>{r.ly_do[0] ?? ""}{r.ly_do.length > 1 ? ` +${r.ly_do.length - 1}` : ""}</span></span> },
    { key: "po", header: "PO", loc: "chu", gt: (r) => r.po, render: (r) => <span className="cell-link" onClick={(e) => { e.stopPropagation(); qv.openEo(r.eo); }}>{r.po}</span> },
    { key: "ma", header: "Mã LK", loc: "chu", gt: (r) => `${r.ma} ${r.ten}`, gtSap: (r) => r.ma, maxW: 170, render: (r) => <><b style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.ma}</b><div className="muted" style={{ fontSize: 11 }}>{r.ten}</div></> },
    { key: "ncc", header: "NCC", loc: "chon", gt: (r) => r.ncc ?? "", render: (r) => r.ncc ?? "—" },
    { key: "nguoi", header: "Người đặt", loc: "chon", gt: (r) => r.nguoi ?? "", nhanChon: (v) => ten(v), maxW: 110, render: (r) => ten(r.nguoi) },
    { key: "gd", header: "Giai đoạn", loc: "chon", gt: (r) => r.gd ?? "", render: (r) => <span style={{ color: r.gd_tre ? "var(--danger-ink)" : undefined }}>{r.gd}{r.gd_tre ? " · trễ" : ""}</span> },
    { key: "ton", header: "Tồn", loc: "so", gt: (r) => r.ton, align: "right", render: (r) => <b style={{ color: r.ton > 30 ? "var(--danger-ink)" : r.ton > 14 ? "var(--warn-ink)" : undefined }}>{r.ton} ng</b> },
    { key: "ndk", header: "Ngày DK", loc: "ngay", gt: (r) => r.ndk, render: (r) => r.ndk ? <>{ngay(r.ndk)}<div style={{ fontSize: 11, color: r.qua_dk ? "var(--danger-ink)" : "var(--text-muted)" }}>{r.qua_dk ? `quá ${r.qua_dk} ng` : TT[r.tt] ?? ""}{r.lui ? ` · lùi ${r.lui}` : ""}</div></> : <span style={{ color: r.tt === "TRE_NDK" ? "var(--danger-ink)" : "var(--warn-ink)", fontSize: 12 }}>{TT[r.tt]}</span> },
    { key: "thieu", header: "Thiếu / đặt", loc: "so", gt: (r) => r.thieu, align: "right", render: (r) => <>{soLuong(r.thieu)}<div className="muted" style={{ fontSize: 11 }}>/ {soLuong(r.dat)}</div></> },
    { key: "loi_cho", header: "Lỗi chờ GT", loc: "so", gt: (r) => r.loi_cho, align: "right",
      render: (r) => r.loi_cho ? <span title={Object.entries(r.qt).map(([k, n]) => `${QT_TEN[k] ?? k}: ${n}`).join("\n")}><b style={{ color: "var(--danger-ink)" }}>{r.loi_cho}</b><span className="muted">/{r.loi}</span><div className="muted" style={{ fontSize: 11 }}>{r.loi_cho_ngay} ngày</div></span> : <span className="muted">{r.loi ? `0/${r.loi}` : "—"}</span> },
    { key: "thuc", header: "Thúc NCC", loc: "so", gt: (r) => r.thuc7, gtSap: (r) => r.thuc7 * 10000 + r.thuc, align: "right",
      render: (r) => <span title="Push + mail gửi NCC + gọi/Zalo ghi nhận"><b style={{ color: r.thuc7 ? "var(--ok-ink)" : "var(--danger-ink)" }}>{r.thuc7}</b><span className="muted"> /7ng · {r.thuc}</span><div className="muted" style={{ fontSize: 11 }}>{r.thuc_luc ? tuBayGio(r.thuc_luc) : "chưa thúc"}</div></span> },
    { key: "phan_hoi", header: "NCC phản hồi gần nhất", loc: "chu", gt: (r) => r.phan_hoi_tt ?? "", maxW: 220,
      render: (r) => r.phan_hoi_tt ? <span title={r.phan_hoi_tt}><span style={{ fontSize: 12 }}>{r.phan_hoi_tt}</span><div className="muted" style={{ fontSize: 11 }}>{r.phan_hoi} lần · {tuBayGio(r.phan_hoi_luc)}</div></span> : <span className="muted" style={{ fontSize: 12 }}>chưa phản hồi</span> },
    { key: "gt", header: "Giải trình gần nhất", loc: "chu", gt: (r) => `${dmTen("AI", r.gt_ai_ma)} ${dmTen("LOI", r.gt_loi_ma)} ${r.gt_nd ?? ""}`, maxW: 220,
      render: (r) => r.gt_nd ? <span title={r.gt_nd}><span style={{ fontSize: 11.5, fontWeight: 700 }}>{dmTen("AI", r.gt_ai_ma)} · {dmTen("LOI", r.gt_loi_ma)}</span><div style={{ fontSize: 12 }}>{r.gt_nd}</div></span> : <span className="muted" style={{ fontSize: 12 }}>chưa giải trình</span> },
    { key: "im_lang", header: "Hoạt động cuối", loc: "so", gt: (r) => r.im_lang, maxW: 190,
      render: (r) => <span title={r.td_luc ? `${r.td_loai} · ${ten(r.td_ai) || "—"} · ${ngayGio(r.td_luc)}` : "Chưa có tác động nào từ khi đặt"}>
        <b style={{ color: r.im_lang >= 7 ? "var(--danger-ink)" : r.im_lang >= 3 ? "var(--warn-ink)" : "var(--ok-ink)" }}>Im lặng {r.im_lang} ng</b>
        <div className="muted" style={{ fontSize: 11 }}>{r.td_loai ? `${r.td_loai}${r.td_ai ? ` · ${ten(r.td_ai)}` : ""}` : "chưa tác động"}</div></span> },
    { key: "nhac", header: "Bị nhắc", loc: "so", gt: (r) => r.nhac, align: "right", render: (r) => r.nhac ? <span title={`Lần cuối ${ngayGio(r.nhac_luc)}`}>{r.nhac}</span> : <span className="muted">—</span> },
  ];
  const xuat = () => exportRowsToXlsx(rows, [
    { header: "Mức", get: (r) => MUC[r.muc].l }, { header: "Lý do", get: (r) => r.ly_do.join("; ") }, { header: "PO", get: (r) => r.po },
    { header: "Mã LK", get: (r) => r.ma }, { header: "Tên LK", get: (r) => r.ten }, { header: "Kho", get: (r) => r.kho }, { header: "NCC", get: (r) => r.ncc },
    { header: "Người đặt", get: (r) => ten(r.nguoi) }, { header: "Giai đoạn", get: (r) => r.gd }, { header: "Tồn (ngày)", get: (r) => r.ton },
    { header: "Ngày DK", get: (r) => ngay(r.ndk) }, { header: "Quá DK (ngày)", get: (r) => r.qua_dk }, { header: "Số lần lùi", get: (r) => r.lui },
    { header: "SL đặt", get: (r) => r.dat }, { header: "SL thiếu", get: (r) => r.thieu }, { header: "Lỗi", get: (r) => r.loi }, { header: "Lỗi chờ GT", get: (r) => r.loi_cho },
    { header: "Thúc NCC 7 ngày", get: (r) => r.thuc7 }, { header: "Thúc NCC tổng", get: (r) => r.thuc }, { header: "Thúc cuối", get: (r) => ngayGio(r.thuc_luc) },
    { header: "NCC phản hồi", get: (r) => r.phan_hoi_tt }, { header: "Giải trình gần nhất", get: (r) => r.gt_nd },
    { header: "Hoạt động cuối", get: (r) => r.td_loai }, { header: "Người", get: (r) => ten(r.td_ai) }, { header: "Lúc", get: (r) => ngayGio(r.td_luc) },
    { header: "Im lặng (ngày)", get: (r) => r.im_lang }, { header: "Bị nhắc", get: (r) => r.nhac },
  ], "diem_nong.xlsx", "Diem nong");
  return (
    <DataTable cols={cols} rows={rows} keyOf={(r) => r.id} pageSize={20} onRowClick={(r) => qv.openDong(r.id)} empty={empty ?? "Không có dòng nào khớp — tốt!"}
      congCu={<><button className="btn sm" style={{ padding: "0 9px" }} onClick={xuat} title="Xuất Excel danh sách đang lọc"><I.download width={14} height={14} /></button>
        <span className="muted" style={{ cursor: "help" }} title="Sắp theo mức độ ưu tiên (đỏ → vàng, cấp CEO, quá DK, lỗi chờ, im lặng, tồn). Bấm dòng → popup đơn hàng.">ⓘ</span></>} />
  );
}

// ------------------------------------------------------------------ theo nguoi
interface Nguoi { ai: string; po: number; dong: number; thieu: number; do: number; vang: number; qua_dk: number; chua_dk: number; ceo: number; loi_cho: number; loi_cho_max: number;
  loi30: number; loi30_cho: number; vp30: number; td7_dong: number; thuc7: number; im_lang7: number; nhac: number; td_luc: string | null; duyet: number; duyet_max: number }
function gomNguoi(dong: Dong[], loi30: Data["loi30"], duyet: Duyet[], imLangDo: number): Nguoi[] {
  const m = new Map<string, Nguoi & { _po: Set<number>; _vp: Set<string> }>();
  const lay = (ai: string) => { let x = m.get(ai); if (!x) { x = { ai, po: 0, dong: 0, thieu: 0, do: 0, vang: 0, qua_dk: 0, chua_dk: 0, ceo: 0, loi_cho: 0, loi_cho_max: 0, loi30: 0, loi30_cho: 0, vp30: 0, td7_dong: 0, thuc7: 0, im_lang7: 0, nhac: 0, td_luc: null, duyet: 0, duyet_max: 0, _po: new Set(), _vp: new Set() }; m.set(ai, x); } return x; };
  for (const d of dong) {
    const x = lay(d.nguoi ?? "");
    x._po.add(d.eo); x.dong += 1; x.thieu += d.thieu;
    if (d.muc === "DO") x.do += 1; else if (d.muc === "VANG") x.vang += 1;
    if (d.tt === "QUA_HAN_NDK") x.qua_dk += 1;
    if (d.tt === "TRE_NDK" || d.tt === "CHO_NDK") x.chua_dk += 1;
    if (d.ceo.length) x.ceo += 1;
    for (const k of d.vp_cho ?? []) x._vp.add(k); x.loi_cho_max = Math.max(x.loi_cho_max, d.loi_cho_ngay);
    if (d.td7 > 0) x.td7_dong += 1;
    x.thuc7 += d.thuc7; x.nhac += d.nhac;
    if (d.im_lang >= imLangDo) x.im_lang7 += 1;
    if (d.td_luc && (!x.td_luc || d.td_luc > x.td_luc)) x.td_luc = d.td_luc;
  }
  for (const l of loi30) { const x = lay(l.ai ?? ""); x.loi30 += l.n; x.loi30_cho += l.cho; x.vp30 += l.vp ?? 0; }
  for (const p of duyet) { if (!p.ai) continue; const x = lay(p.ai); x.duyet += 1; x.duyet_max = Math.max(x.duyet_max, p.gio); }
  // v0.093: loi cho = VI PHAM GOP (PO + loai + ky) khong trung giua cac dong
  return [...m.values()].map(({ _po, _vp, ...x }) => ({ ...x, po: _po.size, loi_cho: _vp.size })).sort((a, b) => b.do - a.do || b.loi_cho - a.loi_cho || b.dong - a.dong);
}
function BangNguoi({ rows, quanLy, onNhac, onXem }: { rows: Nguoi[]; quanLy: boolean; onNhac: (ai: string) => void; onXem: (ai: string, tieuChi: string) => void }) {
  const L = (ai: string, tc: string, v: ReactNode, mau?: string) => <span className="cell-link" style={{ color: mau, fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); onXem(ai, tc); }}>{v}</span>;
  const cols: Col<Nguoi>[] = [
    { key: "ai", header: "Người phụ trách", loc: "chon", gt: (r) => r.ai, nhanChon: (v) => ten(v) || "(không rõ)", maxW: 150, render: (r) => <b>{ten(r.ai) || "(không rõ)"}</b> },
    { key: "dong", header: "Đang giữ", loc: "so", gt: (r) => r.dong, align: "right", render: (r) => <>{soLuong(r.dong)} dòng<div className="muted" style={{ fontSize: 11 }}>{r.po} PO · thiếu {soLuong(r.thieu)}</div></> },
    { key: "do", header: "🔴 Đỏ", loc: "so", gt: (r) => r.do, align: "right", render: (r) => r.do ? L(r.ai, "DO", <>{soLuong(r.do)}<span className="muted" style={{ fontWeight: 400 }}> ({pctTxt(r.do, r.dong)})</span></>, MUC.DO.mau) : <span className="muted">0</span> },
    { key: "vang", header: "🟡 Vàng", loc: "so", gt: (r) => r.vang, align: "right", render: (r) => r.vang ? L(r.ai, "VANG", soLuong(r.vang), MUC.VANG.mau) : <span className="muted">0</span> },
    { key: "qua_dk", header: "Quá DK", loc: "so", gt: (r) => r.qua_dk, align: "right", render: (r) => r.qua_dk ? L(r.ai, "QUA_DK", soLuong(r.qua_dk), MUC.DO.mau) : <span className="muted">0</span> },
    { key: "chua_dk", header: "Chưa có DK", loc: "so", gt: (r) => r.chua_dk, align: "right", render: (r) => r.chua_dk ? L(r.ai, "CHUA_DK", soLuong(r.chua_dk)) : <span className="muted">0</span> },
    { key: "ceo", header: "Cấp CEO", loc: "so", gt: (r) => r.ceo, align: "right", render: (r) => r.ceo ? L(r.ai, "CEO", soLuong(r.ceo), MUC.DO.mau) : <span className="muted">0</span> },
    { key: "vp30", header: "Vi phạm 30 ng", loc: "so", gt: (r) => r.vp30, align: "right",
      render: (r) => r.vp30 ? <b style={{ color: "var(--danger-ink)" }} title="Lỗi hết hạn giải trình (16 giờ làm việc) mà không giải trình trong 30 ngày">{soLuong(r.vp30)}</b> : <span className="muted">0</span> },
    { key: "loi_cho", header: "Lỗi cần GT", loc: "so", gt: (r) => r.loi_cho, align: "right", render: (r) => r.loi_cho ? <>{L(r.ai, "LOI_CHO", soLuong(r.loi_cho), MUC.DO.mau)}<div className="muted" style={{ fontSize: 11 }}>lâu nhất {r.loi_cho_max} ng</div></> : <span className="muted">0</span> },
    { key: "gt_pct", header: "Giải trình 30 ng", loc: "so", gt: (r) => (r.loi30 ? Math.round(((r.loi30 - r.loi30_cho) / r.loi30) * 100) : null), align: "right",
      render: (r) => r.loi30 ? <span title={`${r.loi30} lỗi phát sinh 30 ngày, ${r.loi30 - r.loi30_cho} đã giải trình`} style={{ fontWeight: 700, color: r.loi30_cho / r.loi30 > 0.7 ? "var(--danger-ink)" : undefined }}>{pctTxt(r.loi30 - r.loi30_cho, r.loi30)}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{r.loi30 - r.loi30_cho}/{r.loi30} lỗi</div></span> : <span className="muted">—</span> },
    { key: "td7", header: "Quyết liệt 7 ng", loc: "so", gt: (r) => (r.dong ? Math.round((r.td7_dong / r.dong) * 100) : null), align: "right",
      render: (r) => r.dong ? <span title="% dòng đang giữ có ít nhất 1 tác động (cập nhật KH / push / mail / gọi / giải trình) trong 7 ngày"><b style={{ color: r.td7_dong / r.dong < 0.5 ? "var(--danger-ink)" : "var(--ok-ink)" }}>{pctTxt(r.td7_dong, r.dong)}</b><div className="muted" style={{ fontSize: 11 }}>thúc NCC {soLuong(r.thuc7)} lần</div></span> : <span className="muted">—</span> },
    { key: "im_lang7", header: "Im lặng ≥ 7 ng", loc: "so", gt: (r) => r.im_lang7, align: "right", render: (r) => r.im_lang7 ? L(r.ai, "IM_LANG", soLuong(r.im_lang7), MUC.DO.mau) : <span className="muted">0</span> },
    { key: "nhac", header: "Bị nhắc", loc: "so", gt: (r) => r.nhac, align: "right", render: (r) => r.nhac ? soLuong(r.nhac) : <span className="muted">0</span> },
    { key: "duyet", header: "Duyệt treo", loc: "so", gt: (r) => r.duyet, align: "right", render: (r) => r.duyet ? <span style={{ color: "var(--warn-ink)", fontWeight: 700 }}>{r.duyet}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>lâu nhất {thoiGianCho(r.duyet_max)}</div></span> : <span className="muted">0</span> },
    { key: "td_luc", header: "Tác động cuối", loc: "ngay", gt: (r) => r.td_luc, render: (r) => r.td_luc ? tuBayGio(r.td_luc) : <span className="muted">—</span> },
    { key: "act", header: "", render: (r) => quanLy && r.loi_cho > 0 && r.ai ? <button className="btn sm" title="Nhắc người này giải trình MỌI lỗi đang chờ (gửi thông báo + ghi nhận)" onClick={(e) => { e.stopPropagation(); onNhac(r.ai); }}><I.bell width={13} height={13} /> Nhắc</button> : null },
  ];
  return (
    <DataTable cols={cols} rows={rows} keyOf={(r) => r.ai} pageSize={20} onRowClick={(r) => onXem(r.ai, "")}
      congCu={<span className="muted" style={{ cursor: "help" }} title="Người phụ trách = người lập PO (giữ dòng sau ban hành) hoặc người đang giữ phiếu duyệt. Lỗi do hệ thống gán mặc định cho người lập PO — nguyên nhân thật xem tab Nguyên nhân. Bấm số → danh sách dòng của người đó.">ⓘ Cách tính người phụ trách</span>} />
  );
}

// ------------------------------------------------------------------ theo PO (v0.118, yeu cau 2026-11-23 "bo sung tab theo PO")
// Gom dong LK dang mo (theo pham vi dang loc) theo PO: muc nang nhat, so dong do / qua DK / cap CEO / loi cho, ton, thuc NCC, hoat dong cuoi.
interface Po { eo: number; po: string; muc: Muc; nguoi: string[]; ncc: string[]; kho: string[]; dong: number; thieu: number; do: number; vang: number;
  qua_dk: number; ceo: number; loi_cho: number; ton_max: number; lui: number; thuc7: number; khong_thuc7: number;
  td_luc: string | null; td_loai: string | null; td_ai: string | null; diem: number }
const HANG_MUC: Record<Muc, number> = { DO: 2, VANG: 1, XANH: 0 };
function gomPo(dong: Dong[]): Po[] {
  const m = new Map<number, Po & { _ng: Set<string>; _ncc: Set<string>; _kho: Set<string> }>();
  for (const d of dong) {
    let x = m.get(d.eo);
    if (!x) {
      x = { eo: d.eo, po: d.po, muc: "XANH", nguoi: [], ncc: [], kho: [], dong: 0, thieu: 0, do: 0, vang: 0, qua_dk: 0, ceo: 0, loi_cho: 0, ton_max: 0, lui: 0,
        thuc7: 0, khong_thuc7: 0, td_luc: null, td_loai: null, td_ai: null, diem: 0, _ng: new Set(), _ncc: new Set(), _kho: new Set() };
      m.set(d.eo, x);
    }
    x.dong += 1; x.thieu += d.thieu; x.diem += d.diem;
    if (HANG_MUC[d.muc] > HANG_MUC[x.muc]) x.muc = d.muc;
    if (d.muc === "DO") x.do += 1;
    if (d.muc === "VANG") x.vang += 1;
    if (d.tt === "QUA_HAN_NDK") x.qua_dk += 1;
    if (d.ceo.length) x.ceo += 1;
    x.loi_cho += d.loi_cho; x.ton_max = Math.max(x.ton_max, d.ton); x.lui = Math.max(x.lui, d.lui);
    x.thuc7 += d.thuc7;
    if (d.thuc7 === 0) x.khong_thuc7 += 1;
    if (d.td_luc && (!x.td_luc || d.td_luc > x.td_luc)) { x.td_luc = d.td_luc; x.td_loai = d.td_loai; x.td_ai = d.td_ai; }
    if (d.nguoi) x._ng.add(d.nguoi);
    if (d.ncc) x._ncc.add(d.ncc);
    if (d.kho) x._kho.add(d.kho);
  }
  return [...m.values()].map(({ _ng, _ncc, _kho, ...x }) => ({ ...x, nguoi: [..._ng], ncc: [..._ncc], kho: [..._kho] }))
    .sort((a, b) => HANG_MUC[b.muc] - HANG_MUC[a.muc] || b.do - a.do || b.diem - a.diem);
}
function BangPo({ rows, onXem }: { rows: Po[]; onXem: (r: Po, tc: string) => void }) {
  const qv = useQuickView();
  const L = (r: Po, tc: string, v: ReactNode, mau?: string) => (
    <span className="cell-link" style={{ color: mau, fontWeight: 700 }} title="Xem các dòng này ở Điểm nóng" onClick={(e) => { e.stopPropagation(); onXem(r, tc); }}>{v}</span>
  );
  const so0 = <span className="muted">0</span>;
  const dsTxt = (ds: string[], f: (v: string) => string = (v) => v) => (ds.length === 0 ? "—" : ds.length === 1 ? f(ds[0]) : `${f(ds[0])} +${ds.length - 1}`);
  const cols: Col<Po>[] = [
    { key: "po", header: "PO", loc: "chu", gt: (r) => r.po, render: (r) => <span className="cell-link" style={{ fontWeight: 700 }}>{r.po}</span> },
    { key: "muc", header: "Mức", loc: "chon", gt: (r) => MUC[r.muc].l, gtSap: (r) => HANG_MUC[r.muc],
      render: (r) => <span className="badge" style={{ background: MUC[r.muc].nen, color: MUC[r.muc].mau, fontWeight: 700 }}>{MUC[r.muc].l}</span> },
    { key: "nguoi", header: "Người phụ trách", loc: "chu", gt: (r) => r.nguoi.map((v) => ten(v)).join(", "), render: (r) => <span title={r.nguoi.map((v) => ten(v)).join(", ")}>{dsTxt(r.nguoi, ten)}</span> },
    { key: "ncc", header: "NCC", loc: "chu", gt: (r) => r.ncc.join(", "), render: (r) => <span title={r.ncc.join(", ")}>{dsTxt(r.ncc)}</span> },
    { key: "kho", header: "Kho", loc: "chu", gt: (r) => r.kho.join(", "), render: (r) => <span title={r.kho.join(", ")}>{dsTxt(r.kho)}</span> },
    { key: "dong", header: "Dòng mở", loc: "so", gt: (r) => r.dong, align: "right", render: (r) => <>{L(r, "", soLuong(r.dong))}<div className="muted" style={{ fontSize: 11 }}>thiếu {soLuong(r.thieu)}</div></> },
    { key: "do", header: "🔴 Đỏ", loc: "so", gt: (r) => r.do, align: "right", render: (r) => (r.do ? L(r, "DO", soLuong(r.do), MUC.DO.mau) : so0) },
    { key: "qua_dk", header: "Quá DK", loc: "so", gt: (r) => r.qua_dk, align: "right", render: (r) => (r.qua_dk ? L(r, "QUA_DK", soLuong(r.qua_dk), MUC.DO.mau) : so0) },
    { key: "ceo", header: "Cấp CEO", loc: "so", gt: (r) => r.ceo, align: "right", render: (r) => (r.ceo ? L(r, "CEO", soLuong(r.ceo), MUC.DO.mau) : so0) },
    { key: "loi_cho", header: "Lỗi chờ GT", loc: "so", gt: (r) => r.loi_cho, align: "right", render: (r) => (r.loi_cho ? <b style={{ color: MUC.VANG.mau }}>{soLuong(r.loi_cho)}</b> : so0) },
    { key: "ton_max", header: "Tồn max", loc: "so", gt: (r) => r.ton_max, align: "right",
      render: (r) => <>{r.ton_max} ng{r.lui > 0 && <div className="muted" style={{ fontSize: 11 }}>lùi DK tới {r.lui} lần</div>}</> },
    { key: "khong_thuc7", header: "Dòng không thúc 7 ng", loc: "so", gt: (r) => r.khong_thuc7, align: "right",
      render: (r) => (r.khong_thuc7 ? L(r, "KHONG_THUC", soLuong(r.khong_thuc7), MUC.VANG.mau) : so0) },
    { key: "td_luc", header: "Hoạt động cuối", loc: "ngay", gt: (r) => r.td_luc ?? "", render: (r) => (r.td_luc
      ? <span>{tuBayGio(r.td_luc)}<div className="muted" style={{ fontSize: 11 }}>{r.td_loai ?? ""}{r.td_ai ? ` · ${ten(r.td_ai)}` : ""}</div></span>
      : <span style={{ color: "var(--danger-ink)" }}>chưa tác động</span>) },
  ];
  return <DataTable cols={cols} rows={rows} keyOf={(r) => r.eo} pageSize={20} onRowClick={(r) => qv.openEo(r.eo)} empty="Không có PO nào đang mở trong phạm vi lọc." />;
}

// ------------------------------------------------------------------ theo NCC
interface Ncc { ncc: string; dong: number; po: number; thieu: number; do: number; qua_dk: number; ceo: number; lui_tb: number; ton_tb: number; ton_max: number;
  thuc: number; thuc7: number; phan_hoi: number; phan_hoi_luc: string | null; khong_thuc7: number; tre_g6: number }
function gomNcc(dong: Dong[], gd: Gd[]): Ncc[] {
  const m = new Map<string, Ncc & { _po: Set<number>; _lui: number; _ton: number }>();
  for (const d of dong) {
    const k = d.ncc ?? "";
    let x = m.get(k);
    if (!x) { x = { ncc: k, dong: 0, po: 0, thieu: 0, do: 0, qua_dk: 0, ceo: 0, lui_tb: 0, ton_tb: 0, ton_max: 0, thuc: 0, thuc7: 0, phan_hoi: 0, phan_hoi_luc: null, khong_thuc7: 0, tre_g6: 0, _po: new Set(), _lui: 0, _ton: 0 }; m.set(k, x); }
    x._po.add(d.eo); x.dong += 1; x.thieu += d.thieu; if (d.muc === "DO") x.do += 1; if (d.tt === "QUA_HAN_NDK") x.qua_dk += 1; if (d.ceo.length) x.ceo += 1;
    x._lui += d.lui; x._ton += d.ton; x.ton_max = Math.max(x.ton_max, d.ton); x.thuc += d.thuc; x.thuc7 += d.thuc7; x.phan_hoi += d.phan_hoi;
    if (d.thuc7 === 0) x.khong_thuc7 += 1;
    if (d.phan_hoi_luc && (!x.phan_hoi_luc || d.phan_hoi_luc > x.phan_hoi_luc)) x.phan_hoi_luc = d.phan_hoi_luc;
  }
  // giao tre 30 ngay = so dong qua G6 (cho SX & giao) bi tre hen, quy cho NCC (lib/dieuHanh thongKeGiaiDoan: "NCC: <ten>")
  const g6 = gd.find((g) => g.k === "G6");
  return [...m.values()].map(({ _po, _lui, _ton, ...x }) => ({
    ...x, po: _po.size, lui_tb: Math.round((_lui / x.dong) * 10) / 10, ton_tb: Math.round(_ton / x.dong),
    tre_g6: g6?.tre30_ai.find((a) => a.ai === `NCC: ${x.ncc || "(trống)"}`)?.n ?? 0,
  })).sort((a, b) => b.do - a.do || b.dong - a.dong);
}
function BangNcc({ rows, onXem }: { rows: Ncc[]; onXem: (ncc: string, tc: string) => void }) {
  const L = (ncc: string, tc: string, v: ReactNode, mau?: string) => <span className="cell-link" style={{ color: mau, fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); onXem(ncc, tc); }}>{v}</span>;
  const cols: Col<Ncc>[] = [
    { key: "ncc", header: "NCC", loc: "chon", gt: (r) => r.ncc, render: (r) => <b>{r.ncc || "(trống)"}</b> },
    { key: "dong", header: "Dòng mở", loc: "so", gt: (r) => r.dong, align: "right", render: (r) => <>{soLuong(r.dong)}<div className="muted" style={{ fontSize: 11 }}>{r.po} PO · thiếu {soLuong(r.thieu)}</div></> },
    { key: "do", header: "🔴 Đỏ", loc: "so", gt: (r) => r.do, align: "right", render: (r) => r.do ? L(r.ncc, "DO", <>{soLuong(r.do)}<span className="muted" style={{ fontWeight: 400 }}> ({pctTxt(r.do, r.dong)})</span></>, MUC.DO.mau) : <span className="muted">0</span> },
    { key: "qua_dk", header: "Quá DK", loc: "so", gt: (r) => r.qua_dk, align: "right", render: (r) => r.qua_dk ? L(r.ncc, "QUA_DK", soLuong(r.qua_dk), MUC.DO.mau) : <span className="muted">0</span> },
    { key: "ceo", header: "Cấp CEO", loc: "so", gt: (r) => r.ceo, align: "right", render: (r) => r.ceo ? L(r.ncc, "CEO", soLuong(r.ceo), MUC.DO.mau) : <span className="muted">0</span> },
    { key: "lui_tb", header: "Lùi DK TB", loc: "so", gt: (r) => r.lui_tb, align: "right", render: (r) => <span style={{ color: r.lui_tb >= 1 ? "var(--danger-ink)" : undefined }}>{r.lui_tb}</span> },
    { key: "ton_tb", header: "Tồn TB / max", loc: "so", gt: (r) => r.ton_tb, align: "right", render: (r) => <>{r.ton_tb} ng<div className="muted" style={{ fontSize: 11 }}>max {r.ton_max} ng</div></> },
    { key: "thuc", header: "Đã thúc", loc: "so", gt: (r) => r.thuc, align: "right", render: (r) => <>{soLuong(r.thuc)}<div className="muted" style={{ fontSize: 11 }}>7 ngày: {soLuong(r.thuc7)}</div></> },
    { key: "khong_thuc7", header: "Dòng không thúc 7 ng", loc: "so", gt: (r) => r.khong_thuc7, align: "right", render: (r) => r.khong_thuc7 ? L(r.ncc, "KHONG_THUC", soLuong(r.khong_thuc7), MUC.VANG.mau) : <span className="muted">0</span> },
    { key: "phan_hoi", header: "NCC phản hồi", loc: "so", gt: (r) => (r.thuc ? Math.round((r.phan_hoi / r.thuc) * 100) : null), align: "right",
      render: (r) => <span title="Mail nhận từ NCC gắn dòng / số lần thúc">{soLuong(r.phan_hoi)} / {soLuong(r.thuc)}<div className="muted" style={{ fontSize: 11 }}>{r.phan_hoi_luc ? `cuối ${tuBayGio(r.phan_hoi_luc)}` : "chưa phản hồi"}</div></span> },
    { key: "tre_g6", header: "Giao trễ 30 ng", loc: "so", gt: (r) => r.tre_g6 ?? 0, align: "right", render: (r) => r.tre_g6 ? <b style={{ color: "var(--danger-ink)" }}>{r.tre_g6}</b> : <span className="muted">0</span> },
  ];
  return <DataTable cols={cols} rows={rows} keyOf={(r) => r.ncc} pageSize={20} onRowClick={(r) => onXem(r.ncc, "")} />;
}

// ------------------------------------------------------------------ nguyen nhan & xu huong
function NguyenNhan({ d, loi30, dmTen }: { d: Data; loi30: Data["loi30"]; dmTen: (loai: string, ma: string | null) => string }) {
  const theoQt = new Map<string, { n: number; cho: number; vp: number }>();
  for (const l of loi30) { const x = theoQt.get(l.qt) ?? { n: 0, cho: 0, vp: 0 }; x.n += l.n; x.cho += l.cho; x.vp += l.vp ?? 0; theoQt.set(l.qt, x); }
  const tongQt = [...theoQt.values()].reduce((s, x) => s + x.n, 0);
  const ganCho = new Map<string, number>();
  for (const l of loi30) ganCho.set(l.ai ?? "", (ganCho.get(l.ai ?? "") ?? 0) + l.n);
  const theoAi = new Map<string, number>();
  for (const r of d.nguyen_nhan) theoAi.set(r.ai_ma, (theoAi.get(r.ai_ma) ?? 0) + r.n);
  const tongGt = d.nguyen_nhan.reduce((s, r) => s + r.n, 0);
  const phu = d.do_phu.tong_loi ? d.do_phu.da_gt / d.do_phu.tong_loi : 1;
  const Thanh = ({ l, n, tong, mau, sub }: { l: ReactNode; n: number; tong: number; mau: string; sub?: ReactNode }) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span>{l}</span><b>{soLuong(n)} <span className="muted" style={{ fontWeight: 400 }}>({pctTxt(n, tong)})</span></b></div>
      <div style={{ height: 7, background: "var(--panel-2)", borderRadius: 4 }}><div style={{ width: `${tong ? (n / tong) * 100 : 0}%`, height: "100%", background: mau, borderRadius: 4 }} /></div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
  return (
    <>
    <TrachNhiem d={d} loi30={loi30} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
      <div>
        <b>Độ tin cậy của nguyên nhân</b>
        <div style={{ fontSize: 28, fontWeight: 700, color: phu < 0.3 ? "var(--danger-ink)" : "var(--ok-ink)" }}>{pctTxt(d.do_phu.da_gt, d.do_phu.tong_loi)}</div>
        <div className="muted" style={{ fontSize: 12 }}>lỗi đã được giải trình ({soLuong(d.do_phu.da_gt)} / {soLuong(d.do_phu.tong_loi)}).
          {phu < 0.3 && <b style={{ color: "var(--danger-ink)" }}> Dưới 30% → các tỷ lệ nguyên nhân bên cạnh chỉ là mẫu nhỏ, chưa dùng để kết luận. Ưu tiên ép giải trình.</b>}</div>
        <div style={{ marginTop: 12 }}><b>Lỗi phát sinh 30 ngày theo quy tắc</b></div>
        {[...theoQt.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, x]) => (
          <Thanh key={k} l={`${QT_TEN[k] ?? k}${QT_GD[k] ? ` (${QT_GD[k]})` : ""}`} n={x.n} tong={tongQt} mau="#ff7b73" sub={`${soLuong(x.cho)} cần giải trình · ${soLuong(x.vp)} vi phạm (hết hạn không GT)`} />
        ))}
        {theoQt.get("R3") && tongQt && theoQt.get("R3")!.n / tongQt > 0.5 && (
          <div style={{ fontSize: 11.5, background: "#fff1dc", borderRadius: 8, padding: "6px 8px", marginTop: 4 }}>
            R3 chiếm hơn nửa số lỗi: hệ thống chỉ coi là "đã push" khi hộp thư theo dõi đồng bộ mail <b>khớp mã nhắc hoặc gắn được dòng</b>, hoặc có ghi nhận gọi/Zalo. Mail thúc NCC không ghi mã PO + mã LK
            sẽ không được nhận — cần soát cách gửi mail trước khi kết luận nhân viên không thúc.
          </div>
        )}
      </div>
      <div>
        <b>Hệ thống gán lỗi cho (30 ngày)</b>
        {[...ganCho.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ai, n]) => <Thanh key={ai} l={ten(ai) || "(không rõ)"} n={n} tong={tongQt} mau="#ffa040" />)}
        <div style={{ marginTop: 12 }}><b>Nguyên nhân thật theo giải trình — "do ai"</b> <span className="muted" style={{ fontSize: 11 }}>({soLuong(tongGt)} giải trình)</span></div>
        {tongGt === 0 ? <div className="muted" style={{ fontSize: 12 }}>Chưa có giải trình nào.</div>
          : [...theoAi.entries()].sort((a, b) => b[1] - a[1]).map(([ma, n]) => <Thanh key={ma} l={dmTen("AI", ma)} n={n} tong={tongGt} mau="#5ea9ff"
            sub={d.nguyen_nhan.filter((x) => x.ai_ma === ma).slice(0, 3).map((x) => `${dmTen("LOI", x.loi_ma)}: ${x.n}`).join(" · ")} />)}
      </div>
      <div>
        <b>Xu hướng theo tuần</b> <span className="muted" style={{ fontSize: 11 }}>lỗi phát sinh vs giải trình vs nhắc — giải trình phải bám sát lỗi</span>
        <div style={{ height: 240, marginTop: 6 }}>
          <ResponsiveContainer>
            <ComposedChart data={d.xu_huong.map((x) => ({ ...x, nhan: `${x.tuan.slice(8, 10)}/${x.tuan.slice(5, 7)}` }))} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#EEE" vertical={false} />
              <XAxis dataKey="nhan" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="loi" name="Lỗi phát sinh" fill="#ffb3ad" radius={[3, 3, 0, 0]} />
              <Bar dataKey="gt" name="Giải trình" fill="#a6e3b4" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="nhac" name="Nhắc nhở" stroke="#ff9500" strokeWidth={2} dot={{ r: 2.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>Tuần bắt đầu Chủ nhật. Lỗi tính PO ban hành từ {ngay(d.bo_qua_truoc)}.</div>
      </div>
    </div>
    </>
  );
}

/**
 * v0.121 (chu he thong 2026-11-26): TRACH NHIEM theo ben - moi giai doan co ben chiu: len PO / tham dinh / duyet / gui mail / nhap kho = NOI BO;
 * tu khi gui mail den khi hang ve (cho ngay DK, cho giao, giao bu) = NCC. Loi he thong: ben theo "Do ai" cua giai trinh that, chua giai trinh
 * -> mac dinh theo giai doan (R1/R4 NCC, R3 noi bo). KHONG GIAI TRINH (het han) = loi rieng cua nguoi phai giai trinh, tach khoi 2 ben.
 */
function TrachNhiem({ d, loi30 }: { d: Data; loi30: Data["loi30"] }) {
  const BEN = { NOI_BO: { l: "Nội bộ công ty", mau: "#ff9500", nen: "#fff6e8" }, NCC: { l: "Nhà cung cấp", mau: "#0a84ff", nen: "#e8f1fc" } } as const;
  const tk = (b: "NOI_BO" | "NCC") => {
    const gd = d.giai_doan.filter((g) => (g.ben ?? (["G5", "G6", "G8"].includes(g.k) ? "NCC" : "NOI_BO")) === b);
    const loi = loi30.filter((l) => (l.ben ?? "NOI_BO") === b);
    return { gd, tre30: gd.reduce((s, g) => s + g.tre30, 0), xong30: gd.reduce((s, g) => s + g.xong30, 0), dangTre: gd.reduce((s, g) => s + g.dang_tre, 0),
      loi: loi.reduce((s, l) => s + l.n, 0) };
  };
  const nb = tk("NOI_BO"), ncc = tk("NCC");
  const vpNguoi = new Map<string, number>();
  for (const l of loi30) if (l.vp) vpNguoi.set(l.ai ?? "", (vpNguoi.get(l.ai ?? "") ?? 0) + l.vp);
  const vp = [...vpNguoi.values()].reduce((s, n) => s + n, 0);
  const Khoi = ({ b, x }: { b: "NOI_BO" | "NCC"; x: ReturnType<typeof tk> }) => (
    <div style={{ background: BEN[b].nen, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontWeight: 700, color: BEN[b].mau }}>{BEN[b].l}</div>
      <div style={{ display: "flex", gap: 16, margin: "6px 0", flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{soLuong(x.dangTre)}</div><div className="muted" style={{ fontSize: 11 }}>dòng đang trễ</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{soLuong(x.tre30)}</div><div className="muted" style={{ fontSize: 11 }}>lượt trễ bước 30 ngày / {soLuong(x.xong30)} ({pctTxt(x.tre30, x.xong30)})</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>{soLuong(x.loi)}</div><div className="muted" style={{ fontSize: 11 }}>lỗi 30 ngày (vi phạm gộp)</div></div>
      </div>
      {x.gd.map((g) => (
        <div key={g.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: "1px dashed #e8e8ed", padding: "3px 0" }}
          title={g.tre30_ai.length ? `Làm trễ 30 ngày:\n${g.tre30_ai.map((a) => `${tenAi(a.ai)}: ${a.n}`).join("\n")}` : "Không có lượt trễ trong 30 ngày"}>
          <span>{g.k} {g.l} <span className="muted">· {g.vai_tro}</span></span>
          <span><b style={{ color: g.dang_tre ? "var(--danger-ink)" : undefined }}>{soLuong(g.dang_tre)}</b> đang trễ · {soLuong(g.tre30)} trễ / 30 ng</span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ marginBottom: 16 }}>
      <b>Trách nhiệm chậm trễ theo bên</b> <span className="muted" style={{ fontSize: 11 }}>
        lên PO / duyệt / gửi mail / nhập kho = nội bộ · từ khi gửi mail yêu cầu đến khi hàng về = nhà cung cấp · chậm giải trình tính riêng</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginTop: 6 }}>
        <Khoi b="NOI_BO" x={nb} />
        <Khoi b="NCC" x={ncc} />
        <div style={{ background: "#fff2f1", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontWeight: 700, color: "var(--danger-ink)" }}>Không giải trình đúng hạn</div>
          <div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 0" }}>{soLuong(vp)}</div>
          <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>vi phạm 30 ngày — hết 16 giờ làm việc không giải trình, lỗi của người phải giải trình (tính riêng, không cộng vào 2 bên)</div>
          {[...vpNguoi.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ai, n]) => (
            <div key={ai} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{ten(ai) || "(không rõ)"}</span><b>{soLuong(n)}</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ duyet dang treo
function BangDuyet({ rows }: { rows: Duyet[] }) {
  const qv = useQuickView();
  const cols: Col<Duyet>[] = [
    { key: "po", header: "PO", loc: "chu", gt: (r) => `${r.po} ${r.tieu_de ?? ""}`, maxW: 220, render: (r) => <><span className="cell-link">{r.po}</span><div className="muted" style={{ fontSize: 11 }}>{r.tieu_de}</div></> },
    { key: "buoc", header: "Bước", loc: "chon", gt: (r) => r.buoc, nhanChon: (v) => BUOC[v] ?? v, render: (r) => BUOC[r.buoc] ?? r.buoc },
    { key: "ai", header: "Đang chờ", loc: "chon", gt: (r) => r.ai ?? "", nhanChon: (v) => ten(v), render: (r) => <b>{ten(r.ai)}</b> },
    { key: "gio", header: "Đã chờ", loc: "so", gt: (r) => r.gio, align: "right", render: (r) => <b style={{ color: r.gio >= 48 ? "var(--danger-ink)" : r.gio >= 24 ? "var(--warn-ink)" : undefined }}>{thoiGianCho(r.gio)}</b> },
    { key: "tu", header: "Từ lúc", loc: "ngay", gt: (r) => r.tu, render: (r) => ngayGio(r.tu) },
    { key: "so_dong", header: "Số dòng", loc: "so", gt: (r) => r.so_dong, align: "right", render: (r) => soLuong(r.so_dong) },
    { key: "nguoi_tao", header: "Người lập", loc: "chon", gt: (r) => r.nguoi_tao, nhanChon: (v) => ten(v), render: (r) => ten(r.nguoi_tao) },
  ];
  return <DataTable cols={cols} rows={[...rows].sort((a, b) => b.gio - a.gio)} keyOf={(r) => `${r.eo_id}-${r.buoc}-${r.ai}`} pageSize={20} onRowClick={(r) => qv.openEo(r.eo_id)} empty="Không có phiếu duyệt nào đang treo." />;
}
