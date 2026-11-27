import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner, Modal, Popover } from "../components/ui";
import { DataTable, FilterBar, RefreshFiltersBtn, locVaSap, soCotLoc, type Col, type LocCot } from "../components/DataTable";
import { EoLink, DongLink, useQuickView, QvHeader, useAnPhu, KhuTieuDe, CotPhu } from "../components/quickview/QuickView";
import { useLop, laTrenCung } from "../lib/lop";
import { I } from "../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { gopTrung, lietKe } from "../lib/gopTrung";
import { boDau } from "../lib/tonDong";
import { GiaiTrinhModal, LichSuDong, NgayHangVeModal, QUY_TAC, TINH_TRANG, useDanhMuc, type Dong } from "./theodoi/shared";
import { GiaiTrinhNhieuModal, GiaiTrinhPoModal } from "./theodoi/GiaiTrinhPo";
import { khoGon } from "../lib/kho";
import { gomCa, useCaCeo } from "../lib/caCeo";

/**
 * "Vi phạm & giải trình" (/vi-pham) - theo doi rieng mang loi (backend routes/viPham.ts, migrations/0016).
 * Muc tieu 3-5 giay: dai bao "viec cua ban" theo vai tro -> the so (bam = loc) -> bang. 3 cach xem: theo loi (gom loi lap
 * cung loai tren 1 dong thanh 1 dong "x n lan"), theo PO (giai trinh chung ca PO), theo nguoi (xep hang nguoi vi pham).
 * Bam 1 dong -> chi tiet: vi sao muc nay, phai lam gi, cac lan vi pham, giai trinh, nhac nho, lich su day du.
 */
type L = Record<string, any>;
interface Data { rows: L[]; tat_ca: boolean; quan_ly: boolean; co_the_gt: boolean; me: string; vai_tro: string | null; qua_lau_gio: number; rat_lau_gio: number; danh_gia_luc: string | null }
type Nhom = { x: L; ds: L[] };

export const MUC: Record<string, { l: string; c: string; mau: string; thu: number; gt: string }> = {
  CEO: { l: "Cấp CEO", c: "reject", mau: "#8a0010", thu: 4, gt: "Dòng đang ở cấp CEO: lùi ngày dự kiến ≥ 3 lần, hoặc ngày dự kiến cách ngày đặt ≥ 30 ngày, hoặc ≥ 3 lỗi." },
  CAO: { l: "Cao", c: "reject", mau: "#d70015", thu: 3, gt: "Cùng loại lỗi lặp ≥ 3 lần trên dòng mà chưa xử lý / thành vi phạm (lần giải trình, khắc phục đúng hạn không tính), hoặc chờ giải trình ≥ 12 giờ làm việc (sắp hết hạn 16h)." },
  TB: { l: "Trung bình", c: "final", mau: "#ff6b00", thu: 2, gt: "Cùng loại lỗi lặp 2 lần chưa xử lý / thành vi phạm, hoặc chờ giải trình ≥ 8 giờ làm việc (quá lâu)." },
  THAP: { l: "Thấp", c: "review", mau: "#CA8A04", thu: 1, gt: "Lỗi lần đầu, mới phát sinh." },
};
/** Lam gi de het loi / khong bi lap lai - theo quy tac. */
const CACH_XU_LY: Record<string, string> = {
  R1: "Nhập ngày dự kiến cho dòng (nút “Ngày DK”), rồi giải trình (Do ai mặc định Nhà cung cấp; ảnh / thư bằng chứng tuỳ chọn).",
  R3: "Thứ 2 / thứ 4: tạo push đối tác cho dòng chưa có ngày dự kiến (LK đặt › tick › Push), hoặc nhắc bằng gọi điện / Zalo rồi bấm “📞 Đã nhắc đối tác” (ghi muộn trong 7 ngày vẫn tự bỏ lỗi). Có ngày dự kiến là hết lỗi lặp lại.",
  R4: "Đã quá ngày dự kiến mà chưa đủ hàng: nhập ngày dự kiến MỚI (nút “Ngày DK”), rồi giải trình (Do ai mặc định Nhà cung cấp). Không nhập → mỗi mốc quá hạn ghi thêm 1 lỗi.",
  R5: "Người duyệt: vào PO duyệt / từ chối ngay (lỗi tự đóng khi đã xử lý), rồi giải trình vì sao chậm. Chỉ chính người duyệt giải trình lỗi này.",
  TAY: "Lỗi ghi tay lúc giải trình (NCC trễ, hết hàng…) — đã có giải trình, chỉ để thống kê.",
};
const QT_DAI: Record<string, string> = {
  R1: "Sau khi EO ban hành (hoặc dòng thêm sau ban hành được duyệt) phải có ngày dự kiến trong 8 giờ làm việc với đối tác Karofi / Livotec / Korihome (dòng bắt đầu từ 08/11/2026), 16 giờ làm việc với hãng khác (T2–T6 8h, T7 4h, CN nghỉ).",
  R3: "Mỗi thứ 2 / thứ 4, dòng chưa từng có ngày dự kiến phải được push đối tác trong ngày (có mail với đối tác qua theodoimuahang@gmail.com, hoặc ghi nhận “Đã nhắc đối tác” bằng gọi điện / Zalo / tin nhắn trong kỳ cũng tính là đã push).",
  R4: "Quá ngày dự kiến mà hàng chưa về đủ → phải nhập ngày dự kiến mới trong 8 giờ làm việc.",
  R5: "Bước thẩm định / duyệt mua của PO, hoặc dòng thêm sau ban hành, chờ người duyệt quá 8 giờ làm việc từ lúc được giao (áp dụng từ 27/11/2026 08:00). Mỗi lượt chờ = 1 lỗi cho đúng người duyệt.",
  TAY: "Lỗi do người giải trình tự xác định.",
};
const MucBadge = ({ m }: { m: string }) => <span className={`badge ${MUC[m]?.c ?? "nhap"}`} title={MUC[m]?.gt} style={m === "CEO" ? { background: "#8a0010", color: "#fff" } : undefined}>{MUC[m]?.l ?? m}</span>;
/** v0.092: loi he thong tu dong (da khac phuc sau do / qua han giai trinh) - khong phai giai trinh that */
const tuDong = (l: L) => !!l.tu_dong;
/** v0.110 (chu he thong 2026-11-23): CHI loi het han giai trinh ma khong giai trinh moi la VI PHAM (backend baoCaoLoi vi_pham). */
const vp = (l: L) => !!l.vi_pham;
const TrangThai = ({ l }: { l: L }) => vp(l)
  ? <span className="badge reject" style={{ background: "#d70015", color: "#fff" }} title={`Hết hạn giải trình ${ngayGio(l.han_gt)} mà không giải trình → ghi nhận vi phạm`}>VI PHẠM · hết hạn GT</span>
  : l.trang_thai === "CHO_GIAI_TRINH"
  ? <span className="badge final" title={`Chưa phải vi phạm. Hạn giải trình ${ngayGio(l.han_gt)} — giải trình trước hạn thì không bị ghi vi phạm`}>Cần giải trình</span>
  : l.tu_dong === "CU" ? <span className="badge nhap" title={l.gt_noi_dung ?? ""}>Bỏ qua · lỗi cũ</span>
  : l.tu_dong ? <span className="badge nhap" title={l.gt_noi_dung ?? ""}>Đã khắc phục</span>
  : <span className="badge issued" title={l.gt_pham_vi === "PO" ? "Giải trình chung cả PO" : l.gt_pham_vi === "NHIEU" ? "Giải trình chung nhiều lỗi cùng loại" : undefined}>Đã giải trình{l.gt_pham_vi === "PO" ? " (PO)" : l.gt_pham_vi === "NHIEU" ? " (chung)" : ""}</span>;
const maPo = (l: L) => l.approval_code || l.eo_code;
const mucCao = (ds: L[]) => ds.reduce((m, l) => (MUC[l.muc]?.thu ?? 0) > (MUC[m]?.thu ?? 0) ? l.muc : m, "THAP");
const cho = (l: L) => l.trang_thai === "CHO_GIAI_TRINH" && !l.vi_pham;

/**
 * Gom theo VI PHAM GOP (v0.093, backend lib/maLoi khoaViPham): cung PO + cung loai + cung ky (R1 = ca PO; R3 = ngay kiem tra; R4 = ngay DK bi qua)
 * -> 1 dong bang, ds = moi dong linh kien cua vi pham. Dai dien = dong CON CHO (neu co) moi nhat.
 */
function gomLoi(rows: L[]): Nhom[] {
  return gopTrung(rows, (l) => l.vp_khoa ?? `${l.eo_item_id}|${l.quy_tac}|${l.id}`).map(({ ds }) => {
    const s = [...ds].sort((a, b) => Number(cho(b)) - Number(cho(a)) || String(b.han ?? b.created_at).localeCompare(String(a.han ?? a.created_at)));
    return { x: { ...s[0], muc: mucCao(s), tuoi_ngay: Math.max(...s.filter((y) => cho(y) === cho(s[0])).map((y) => y.tuoi_ngay)), tuoi_gio: Math.max(...s.filter((y) => cho(y) === cho(s[0])).map((y) => y.tuoi_gio ?? 0)), qua_lau: s.some((y) => y.qua_lau) }, ds: s };
  });
}
/** so VI PHAM (khoa khong trung) trong 1 tap loi */
const soVp = (ds: L[]) => new Set(ds.map((l) => l.vp_khoa ?? l.id)).size;
const soDong = (ds: L[]) => new Set(ds.map((l) => l.eo_item_id)).size;

const KPI_DEF: { k: string; l: string; sub: string; mau: string; loc: (l: L, d: Data) => boolean }[] = [
  { k: "cho", l: "Cần giải trình", sub: "còn trong hạn 16h LV — chưa là vi phạm", mau: "#c26400", loc: cho },
  { k: "vi_pham", l: "Vi phạm", sub: "hết hạn mà không giải trình", mau: "#d70015", loc: vp },
  { k: "qua_lau", l: "Quá lâu", sub: "chờ ≥ 8h làm việc (hạn 16h)", mau: "#c26400", loc: (l) => l.qua_lau },
  { k: "lap", l: "Lặp liên tiếp", sub: "cùng lỗi ≥ 2 lần, chưa xử lý", mau: "#ff6b00", loc: (l) => cho(l) && (l.so_lan_xau ?? l.so_lan) >= 2 },
  { k: "ceo", l: "Ca CEO đang theo dõi", sub: "ca (PO + mã CEO) — khớp màn PO tồn CEO", mau: "#8a0010", loc: (l) => l.ceo && l.tinh_trang !== "DONG" },
  { k: "cao", l: "Mức cao trở lên", sub: "Cao + CEO, chưa giải trình", mau: "#a3000f", loc: (l) => cho(l) && (l.muc === "CAO" || l.muc === "CEO") },
  { k: "da_7", l: "Đã giải trình 7 ngày", sub: "kết quả xử lý gần đây", mau: "#1d8a3c", loc: (l) => !cho(l) && !tuDong(l) && !!l.gt_luc && Date.now() - Date.parse(String(l.gt_luc).replace(" ", "T") + "+07:00") < 7 * 86400_000 },
];

/** v0.129: nhom trang thai (menu phu "Vi phạm & GT" + o chon tren thanh loc) - tt tren URL. mo = can GT + vi pham; xl = da GT + da khac phuc. */
const TT_DEF: { k: string; l: string; f: (l: L) => boolean }[] = [
  { k: "cho", l: "Cần giải trình (còn hạn)", f: cho },
  { k: "vi_pham", l: "Vi phạm (hết hạn không GT)", f: vp },
  { k: "mo", l: "Chưa xử lý (cần GT + vi phạm)", f: (l) => cho(l) || vp(l) },
  { k: "xl", l: "Đã xử lý (giải trình / khắc phục)", f: (l) => !cho(l) && !vp(l) },
  { k: "da", l: "Đã giải trình", f: (l) => !cho(l) && !vp(l) && !tuDong(l) },
  { k: "tu_dong", l: "Đã khắc phục (tự đóng)", f: (l) => tuDong(l) && !vp(l) },
];
const BEN: Record<string, { l: string; mau: string; nen: string }> = { NCC: { l: "Đối tác", mau: "#0062c4", nen: "#e8f1fc" }, NOI_BO: { l: "Nội bộ", mau: "#c26400", nen: "#fff1dc" } };
const BenBadge = ({ b }: { b?: string }) => b && BEN[b] ? <span style={{ background: BEN[b].nen, color: BEN[b].mau, fontWeight: 700, fontSize: 11.5, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap" }}>{BEN[b].l}</span> : <span className="muted">—</span>;
const ttTen = (l: L) => (vp(l) ? "Vi phạm" : cho(l) ? "Cần giải trình" : l.tu_dong === "CU" ? "Bỏ qua · lỗi cũ" : tuDong(l) ? "Đã khắc phục" : "Đã giải trình");
const THU_MA = (m: string) => (m?.startsWith("ER.MH-") ? Number(m.slice(6)) : 999);

/**
 * v0.129 (yeu cau 2026-11-27 "table giao dien chinh luon la uu tien, cong cu loc day xuong table - tham khao Don PO"):
 * 1 thanh thao tac gon (pham vi · nhom trang thai co so dem · cach xem · o tim · chu giai) roi BANG; loc ma loi / muc do / nguoi / kho /
 * doi tac / ngay = loc tren TIEU DE COT (DataTable). Menu phu o sidebar dat ?tt= / ?ben= / ?qt= (cap 2 = buoc / loai loi) / ?kieu=.
 */
export default function ViPham() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const qv = useQuickView();
  const dm = useDanhMuc();
  const q = useQuery({ queryKey: ["vi-pham"], queryFn: () => api.get<Data>("/vi-pham") });
  const d = q.data;
  const ceoQ = useCaCeo();
  const caCeoDang = useMemo(() => gomCa(ceoQ.data?.rows ?? []).filter((c) => c.muc !== "DA_XONG"), [ceoQ.data]);
  const set = (k: string, v: string) => setSp((s) => { const n = new URLSearchParams(s); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const xem = sp.get("xem") || (d && !d.quan_ly && !d.tat_ca ? "cua_toi" : d?.quan_ly ? "tat_ca" : "cua_toi");
  const kieu = sp.get("kieu") || "loi";
  const ben = sp.get("ben") ?? "";
  // menu "Lỗi đối tác / nội bộ" khong kem tt -> mac dinh "Chưa xử lý"; con lai mac dinh "Cần giải trình"
  const tt = sp.get("tt") ?? (ben ? "mo" : "cho");
  const kpi = sp.get("kpi") || "";
  const qt = useMemo(() => (sp.get("qt") ?? "").split("|").filter(Boolean), [sp]);
  const [tim, setTim] = useState("");
  // loc tieu de cot (bang Theo loi); ?ma= / ?nguoi= tu link ngoai (Bang ma loi, Viec cua toi) -> loc cot tuong ung
  const [locCot, setLocCot] = useState<LocCot>({});
  const maUrl = sp.get("ma") ?? "", nguoiUrl = sp.get("nguoi") ?? "";
  useEffect(() => {
    if (!maUrl && !nguoiUrl) return;
    setLocCot((l) => ({ ...l, ...(maUrl ? { ma: { chon: maUrl.split("|") } } : {}), ...(nguoiUrl ? { nguoi: { chon: [nguoiUrl] } } : {}) }));
  }, [maUrl, nguoiUrl]);
  const [chiTiet, setChiTiet] = useState<Nhom | null>(null);
  const [md, setMd] = useState<{ k: "gt"; x: L } | { k: "po"; eo: number } | { k: "nhac"; ids: number[]; ten: string } | { k: "ndk"; x: L } | { k: "nhieu"; nhom: Nhom[] } | null>(null);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [thongBao, setThongBao] = useState("");
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";

  // tap goc theo "Cua toi / Toan bo" - so dem nhom tren tap nay
  const goc = useMemo(() => (d?.rows ?? []).filter((l) => xem !== "cua_toi" || l.cua_toi), [d, xem]);
  // locChung = o tim + ben + loai loi (menu cap 2) - TRU trang thai (Theo ma loi tinh % giai trinh tren moi trang thai)
  const locChung = useMemo(() => {
    const w = boDau(tim).split(/\s+/).filter(Boolean);
    return goc.filter((l) => {
      if (ben && l.ben !== ben) return false;
      if (qt.length && !qt.includes(l.quy_tac)) return false;
      if (w.length) {
        const h = boDau(`${l.eo_code} ${l.approval_code ?? ""} ${l.part_code} ${l.part_name ?? ""} ${l.kho} ${l.doi_tac ?? ""} ${l.nguoi_vp ?? ""} ${l.nguoi_dat} ${QUY_TAC[l.quy_tac] ?? ""} ${l.ma_loi ?? ""} ${l.ten_ma ?? ""} ${l.gt_noi_dung ?? ""}`);
        if (!w.every((x) => h.includes(x))) return false;
      }
      return true;
    });
  }, [goc, ben, qt, tim]);
  const loc = useMemo(() => {
    const kd = KPI_DEF.find((x) => x.k === kpi);
    const td = TT_DEF.find((x) => x.k === tt);
    return locChung.filter((l) => (kd ? kd.loc(l, d!) : td ? td.f(l) : true));
  }, [locChung, kpi, tt, d]);
  const nhom = useMemo(() => gomLoi(loc).sort((a, b) => (Number(cho(b.x)) - Number(cho(a.x))) || (MUC[b.x.muc].thu - MUC[a.x.muc].thu) || b.x.tuoi_ngay - a.x.tuoi_ngay), [loc]);

  if (q.isLoading || !d) return <><PageHeader title="Vi phạm & giải trình" /><Spinner /></>;
  const dem = (k: string) => { const f = KPI_DEF.find((x) => x.k === k)!; return soVp(locChung.filter((l) => f.loc(l, d))); };
  const demTt = (k: string) => { const f = TT_DEF.find((x) => x.k === k); return soVp(f ? locChung.filter(f.f) : locChung); };
  const soCaCeo = (xem === "cua_toi" ? caCeoDang.filter((c) => c.dong.some((r) => r.nguoi_dat === d.me)) : caCeoDang).length;
  const choCua = goc.filter(cho);
  const soVpCho = soVp(choCua);
  const poCho = new Set(choCua.map((l) => l.eo_id)).size;
  const coLoc = !!(tim || kpi || ben || qt.length || soCotLoc(locCot));
  const xoaLoc = () => { setTim(""); setLocCot({}); setSp((s) => { const n = new URLSearchParams(s); ["kpi", "ben", "qt", "ma", "nguoi"].forEach((k) => n.delete(k)); return n; }, { replace: true }); };
  const xong = (msg?: string) => { setMd(null); if (msg) setThongBao(msg); qc.invalidateQueries({ queryKey: ["vi-pham"] }); qc.invalidateQueries({ queryKey: ["inbox-count"] }); qc.invalidateQueries({ queryKey: ["tl-dong"] }); qc.invalidateQueries({ queryKey: ["theo-doi"] }); qc.invalidateQueries({ queryKey: ["eo-dem"] }); };
  const khoaNhom = (n: Nhom) => n.x.vp_khoa ?? `${n.x.eo_item_id}|${n.x.quy_tac}|${n.x.id}`;
  const nhomChon = nhom.filter((n) => chon.has(khoaNhom(n)) && cho(n.x));
  const idsChon = nhomChon.flatMap((n) => n.ds.map((l) => l.id));
  const loaiChon = [...new Set(nhomChon.map((n) => n.x.quy_tac))];
  const coChon = d.quan_ly || d.co_the_gt;
  const loaiTatCa = (qt.length === 1 ? qt[0] : "") || nhom.find((n) => cho(n.x))?.x.quy_tac;
  const tatCaCungLoai = nhom.filter((n) => cho(n.x) && n.x.quy_tac === loaiTatCa);
  const choDong = (x: L): Dong => ({ ...x, item_id: x.eo_item_id, ma_phe_duyet: x.approval_code, nguoi_dat: x.nguoi_dat } as any);

  const colsLoi: Col<Nhom>[] = [
    { key: "act", header: coChon ? <input type="checkbox" title={`Chọn tất cả lỗi chờ loại “${QUY_TAC[loaiTatCa ?? ""] ?? ""}” đang hiển thị (lọc cột “Lỗi” để chọn loại khác)`} checked={chon.size > 0} onChange={(e) => setChon(e.target.checked ? new Set(tatCaCungLoai.map(khoaNhom)) : new Set())} /> : "",
      render: (n) => <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        {coChon && <input type="checkbox" disabled={!cho(n.x)} title={cho(n.x) ? "Chọn để giải trình chung / nhắc nhở" : undefined} checked={chon.has(khoaNhom(n))} onChange={() => setChon((s) => { const m = new Set(s); const k = khoaNhom(n); if (m.has(k)) m.delete(k); else m.add(k); return m; })} />}
        {cho(n.x) && d.co_the_gt && <button className="btn sm primary" title={soDong(n.ds) > 1 ? `1 nội dung giải trình cho cả vi phạm (${soDong(n.ds)} dòng)` : undefined}
          onClick={() => setMd(soDong(n.ds) > 1 ? { k: "nhieu", nhom: [n] } : { k: "gt", x: n.x })}>Giải trình</button>}
        <button className="btn sm ghost" title="Chi tiết" onClick={() => setChiTiet(n)}><I.eye width={14} height={14} /></button>
      </div> },
    { key: "muc", header: "Mức độ", loc: "chon", gt: (n) => n.x.muc, nhanChon: (v) => MUC[v]?.l ?? v, gtSap: (n) => MUC[n.x.muc]?.thu, render: (n) => <MucBadge m={n.x.muc} /> },
    { key: "tt", header: "Trạng thái", loc: "chon", gt: (n) => ttTen(n.x), render: (n) => <TrangThai l={n.x} /> },
    { key: "ben", header: "Bên chịu", loc: "chon", gt: (n) => n.x.ben ?? "", nhanChon: (v) => BEN[v]?.l ?? v, render: (n) => <BenBadge b={n.x.ben} /> },
    { key: "ma", header: "Mã lỗi · bước", loc: "chon", gt: (n) => n.x.ma_loi ?? "", gtSap: (n) => THU_MA(n.x.ma_loi), render: (n) => <span style={{ whiteSpace: "nowrap" }} title={n.x.ten_ma}><b style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{n.x.ma_loi}</b>{n.x.buoc ? <div className="muted" style={{ fontSize: 11 }}>{n.x.buoc}</div> : null}</span> },
    { key: "loi", header: "Lỗi", loc: "chon", gt: (n) => QUY_TAC[n.x.quy_tac] ?? n.x.quy_tac, maxW: 230, render: (n) => <span title={QT_DAI[n.x.quy_tac]}><b>{QUY_TAC[n.x.quy_tac] ?? n.x.quy_tac}</b>{n.x.loi_ma && n.x.quy_tac === "TAY" ? ` · ${tenDm("LOI", n.x.loi_ma)}` : ""}</span> },
    { key: "sodong", header: "Số dòng", loc: "so", gt: (n) => soDong(n.ds), align: "center", render: (n) => soDong(n.ds) > 1
      ? <span className="badge final" title={`Vi phạm gộp trên ${soDong(n.ds)} dòng của PO: ${lietKe(n.ds.map((y) => y.part_code), 20)}`}>{soDong(n.ds)} dòng</span> : <span className="muted">1</span> },
    { key: "lan", header: "Lần thứ", loc: "so", gt: (n) => n.x.so_lan, align: "center", render: (n) => n.x.so_lan > 1
      ? <span className="badge final" title={`Lỗi này lặp ${n.x.so_lan} lần trên dòng (mỗi lần vi phạm ghi 1 lỗi): ${lietKe(n.ds.map((y) => ngay(y.ngay_tham_chieu ?? y.han)), 8)}`}>× {n.ds.length}{n.x.so_lan > n.ds.length ? ` / ${n.x.so_lan}` : ""}</span> : <span className="muted">1</span> },
    { key: "po", header: "PO (mã phê duyệt)", loc: "chu", gt: (n) => `${maPo(n.x)} ${n.x.eo_code}`, render: (n) => <EoLink id={n.x.eo_id}>{maPo(n.x)}</EoLink> },
    { key: "lk", header: "Linh kiện", loc: "chu", gt: (n) => n.ds.map((y) => `${y.part_code} ${y.part_name ?? ""}`).join(" "), maxW: 220, render: (n) => soDong(n.ds) > 1
      ? <span title={lietKe(n.ds.map((y) => y.part_code), 30)}>{lietKe([...new Set(n.ds.map((y) => y.part_code))], 3)}</span>
      : <><DongLink id={n.x.eo_item_id} ma={n.x.part_code} /> <span className="muted" style={{ fontSize: 11.5 }}>{n.x.part_name}</span></> },
    { key: "kho", header: "Kho", loc: "chon", gt: (n) => n.x.kho ?? "", nhanChon: (v) => khoGon(v), maxW: 110, render: (n) => <span title={n.x.kho}>{khoGon(n.x.kho)}</span> },
    { key: "doi_tac", header: "Đối tác", loc: "chon", gt: (n) => n.x.doi_tac ?? "", maxW: 120, render: (n) => n.x.doi_tac || <span className="muted">—</span> },
    { key: "nguoi", header: "Người chịu", loc: "chon", gt: (n) => n.x.nguoi_vp ?? "", nhanChon: (v) => ten(v), render: (n) => <span title={n.x.nguoi_vp ?? ""}><b>{ten(n.x.nguoi_vp)}</b>{n.x.ai_ma && n.x.ai_ma !== "NGUOI_DAT" ? <div className="muted" style={{ fontSize: 11 }}>{tenDm("AI", n.x.ai_ma)}</div> : null}</span> },
    { key: "han", header: "Mốc lỗi", loc: "ngay", gt: (n) => n.x.ngay_tham_chieu ?? n.x.han, render: (n) => <span title={`Mốc lỗi (hạn của quy tắc): ${ngayGio(n.x.han)}`}>{ngay(n.x.ngay_tham_chieu ?? n.x.han)}</span> },
    { key: "han_gt", header: "Hạn giải trình", loc: "ngay", gt: (n) => n.x.han_gt, render: (n) => n.x.han_gt
      ? <span style={{ whiteSpace: "nowrap", color: cho(n.x) ? "#c26400" : vp(n.x) ? "var(--danger-ink)" : undefined, fontWeight: cho(n.x) ? 700 : undefined }}>{ngayGio(n.x.han_gt)}
        {cho(n.x) && <div style={{ fontSize: 11 }}>còn {n.x.con_gio_gt}h LV</div>}</span> : <span className="muted">—</span> },
    { key: "cho", header: "Chờ / phản hồi", loc: "so", gt: (n) => (cho(n.x) ? n.x.tuoi_gio : null), align: "right", render: (n) => cho(n.x)
      ? <b title={`Đã chờ ${n.x.tuoi_ngay} ngày lịch`} style={{ color: n.x.tuoi_gio >= d.rat_lau_gio ? "var(--danger-ink)" : n.x.tuoi_gio >= d.qua_lau_gio ? "#c26400" : undefined }}>{n.x.tuoi_gio}h LV</b>
      : <span className="muted" title="Số ngày từ hạn đến lúc giải trình">sau {n.x.tuoi_ngay} ngày</span> },
    { key: "nhac", header: "Nhắc", loc: "so", gt: (n) => n.x.so_nhac, align: "center", render: (n) => n.x.so_nhac ? <span title={`${n.x.so_nhac} lần nhắc trên dòng (${n.x.so_nhac_tay} nhắc tay) · gần nhất ${ngayGio(n.x.nhac_gan_nhat)}`}>{n.x.so_nhac}</span> : <span className="muted">0</span> },
    { key: "gt", header: "Giải trình / lý do", loc: "chu", gt: (n) => n.x.gt_noi_dung ?? "", maxW: 260, render: (n) => n.x.gt_noi_dung ? <span title={`${ten(n.x.gt_boi)} · ${ngayGio(n.x.gt_luc)}\n${n.x.gt_noi_dung}`}>{n.x.gt_noi_dung}</span> : <span className="muted">—</span> },
    { key: "ceo", header: "Cấp CEO vì", loc: "chu", gt: (n) => (n.x.ceo_ly_do ?? []).join(" "), maxW: 220, render: (n) => n.x.ceo ? <span style={{ color: "#8a0010", fontSize: 12 }} title={n.x.ceo_ly_do.join("\n")}>{n.x.ceo_ly_do.join(" · ")}</span> : <span className="muted">—</span> },
  ];

  // ------ theo PO
  const theoPo = gopTrung(loc, (l) => String(l.eo_id)).map(({ x, ds }) => ({
    x, ds, cho: soVp(ds.filter(cho)), vi_pham: soVp(ds.filter(vp)), dong: new Set(ds.map((l) => l.eo_item_id)).size, muc: mucCao(ds.filter(cho).length ? ds.filter(cho) : ds),
    qua_lau: ds.filter((l) => l.qua_lau).length, cho_lau: Math.max(0, ...ds.filter(cho).map((l) => l.tuoi_ngay)),
    ncc: soVp(ds.filter((l) => l.ben === "NCC")), nb: soVp(ds.filter((l) => l.ben !== "NCC")),
  })).sort((a, b) => b.cho - a.cho || MUC[b.muc].thu - MUC[a.muc].thu);
  const colsPo: Col<(typeof theoPo)[number]>[] = [
    { key: "act", header: "", render: (p) => <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      {p.cho > 0 && d.co_the_gt && p.x.quy_tac !== "R5" && <button className="btn sm primary" onClick={() => setMd({ k: "po", eo: p.x.eo_id })}>Giải trình cả PO</button>}
      {p.cho > 0 && d.quan_ly && <button className="btn sm" onClick={() => setMd({ k: "nhac", ids: p.ds.filter(cho).map((l) => l.id), ten: maPo(p.x) })}>Nhắc</button>}
    </div> },
    { key: "po", header: "PO (mã phê duyệt)", loc: "chu", gt: (p) => `${maPo(p.x)} ${p.x.eo_code}`, render: (p) => <EoLink id={p.x.eo_id}>{maPo(p.x)}</EoLink> },
    { key: "muc", header: "Mức cao nhất", loc: "chon", gt: (p) => p.muc, nhanChon: (v) => MUC[v]?.l ?? v, gtSap: (p) => MUC[p.muc]?.thu, render: (p) => <MucBadge m={p.muc} /> },
    { key: "cho", header: "Cần giải trình", loc: "so", gt: (p) => p.cho, align: "right", render: (p) => p.cho ? <b style={{ color: "#c26400" }}>{p.cho}</b> : <span className="muted">0</span> },
    { key: "vp", header: "Vi phạm", loc: "so", gt: (p) => p.vi_pham, align: "right", render: (p) => p.vi_pham ? <b style={{ color: "var(--danger-ink)" }}>{p.vi_pham}</b> : <span className="muted">0</span> },
    { key: "ben", header: "Lỗi đối tác / nội bộ", loc: "so", gt: (p) => p.ncc + p.nb, render: (p) => <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{p.ncc > 0 && <><BenBadge b="NCC" /> {p.ncc} </>}{p.nb > 0 && <><BenBadge b="NOI_BO" /> {p.nb}</>}</span> },
    { key: "tong", header: "Tổng lỗi", loc: "so", gt: (p) => p.ds.length, align: "right", render: (p) => p.ds.length },
    { key: "dong", header: "Số linh kiện có lỗi", loc: "so", gt: (p) => p.dong, align: "right", render: (p) => p.dong },
    { key: "lk", header: "Linh kiện", loc: "chu", gt: (p) => p.ds.map((l) => l.part_code).join(" "), maxW: 240, render: (p) => lietKe(p.ds.map((l) => l.part_code), 4) },
    { key: "lau", header: "Chờ lâu nhất", loc: "so", gt: (p) => (p.cho ? p.cho_lau : null), align: "right", render: (p) => p.cho ? `${p.cho_lau} ngày` : "—" },
    { key: "nguoi", header: "Người đặt", loc: "chon", gt: (p) => p.x.nguoi_dat ?? "", nhanChon: (v) => ten(v), render: (p) => ten(p.x.nguoi_dat) },
  ];

  // ------ theo nguoi
  const theoNguoi = gopTrung(loc, (l) => l.nguoi_vp ?? "").map(({ x, ds }) => {
    const da = ds.filter((l) => !cho(l));
    return { x, ds, cho: soVp(ds.filter(cho)), vi_pham: soVp(ds.filter(vp)), qua_lau: soVp(ds.filter((l) => l.qua_lau)), lap: soVp(ds.filter((l) => cho(l) && (l.so_lan_xau ?? l.so_lan) >= 2)),
      ceo: new Set(ds.filter((l) => l.ceo).map((l) => l.eo_item_id)).size, da: da.length, po: new Set(ds.map((l) => l.eo_id)).size,
      tb: da.length ? Math.round(da.reduce((s, l) => s + l.tuoi_ngay, 0) / da.length * 10) / 10 : null };
  }).sort((a, b) => b.cho - a.cho || b.vi_pham - a.vi_pham || b.ds.length - a.ds.length);
  const colsNguoi: Col<(typeof theoNguoi)[number]>[] = [
    { key: "act", header: "", render: (p) => <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <button className="btn sm" onClick={() => { setLocCot({ nguoi: { chon: [p.x.nguoi_vp ?? ""] } }); set("kieu", ""); }}>Xem lỗi</button>
      {p.cho > 0 && d.quan_ly && <button className="btn sm" onClick={() => setMd({ k: "nhac", ids: p.ds.filter(cho).map((l) => l.id), ten: ten(p.x.nguoi_vp) })}>Nhắc</button>}
    </div> },
    { key: "nguoi", header: "Người chịu lỗi", loc: "chon", gt: (p) => p.x.nguoi_vp ?? "", nhanChon: (v) => ten(v), render: (p) => <b title={p.x.nguoi_vp}>{ten(p.x.nguoi_vp) || "—"}</b> },
    { key: "cho", header: "Cần giải trình", loc: "so", gt: (p) => p.cho, align: "right", render: (p) => p.cho ? <b style={{ color: "#c26400" }}>{p.cho}</b> : <span className="muted">0</span> },
    { key: "vp", header: "Vi phạm", loc: "so", gt: (p) => p.vi_pham, align: "right", render: (p) => p.vi_pham ? <b style={{ color: "var(--danger-ink)" }} title="Hết hạn giải trình mà không giải trình">{p.vi_pham}</b> : <span className="muted">0</span> },
    { key: "lau", header: `Quá lâu (≥ ${d.qua_lau_gio}h LV)`, loc: "so", gt: (p) => p.qua_lau, align: "right", render: (p) => p.qua_lau || <span className="muted">0</span> },
    { key: "lap", header: "Lặp liên tiếp", loc: "so", gt: (p) => p.lap, align: "right", render: (p) => p.lap || <span className="muted">0</span> },
    { key: "ceo", header: "Dòng cấp CEO", loc: "so", gt: (p) => p.ceo, align: "right", render: (p) => p.ceo || <span className="muted">0</span> },
    { key: "tong", header: "Tổng lỗi", loc: "so", gt: (p) => p.ds.length, align: "right", render: (p) => p.ds.length },
    { key: "po", header: "Số PO", loc: "so", gt: (p) => p.po, align: "right", render: (p) => p.po },
    { key: "da", header: "Đã giải trình", loc: "so", gt: (p) => p.da, align: "right", render: (p) => p.da },
    { key: "tb", header: "TB ngày đến khi giải trình", loc: "so", gt: (p) => p.tb, align: "right", render: (p) => p.tb ?? "—" },
  ];

  // ------ theo MA LOI (v0.091): tong hop tren MOI trang thai -> bam "Xem chi tiết" = loc ma + Theo loi
  const theoMa = gopTrung(locChung, (l) => l.ma_loi ?? l.quy_tac).map(({ x, ds: dsDong }) => {
    const vps = gomLoi(dsDong);
    const ds: L[] = vps.map((v) => ({ ...v.x, _tt: v.ds.some(cho) ? "cho" : v.ds.some(vp) ? "vp" : v.ds.some((l) => !tuDong(l)) ? "da" : "tu" }));
    const choN = ds.filter((v) => v._tt === "cho").length, tu = ds.filter((v) => v._tt === "tu").length, vpN = ds.filter((v) => v._tt === "vp").length, da = ds.length - choN - tu - vpN;
    const dem = (f: (l: L) => string | null) => { const m = new Map<string, number>(); for (const l of ds) { const k = f(l); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    return { x, ds, cho: choN, vp: vpN, da, tu, pct: ds.length ? Math.round((da / ds.length) * 100) : 0, qua_lau: ds.filter((l) => l.qua_lau).length,
      po: new Set(ds.map((l) => l.eo_id)).size, dong: soDong(dsDong), nguoi: dem((l) => l.nguoi_vp), ai: dem((l) => l.gt_ai_ma) };
  }).sort((a, b) => THU_MA(a.x.ma_loi ?? "") - THU_MA(b.x.ma_loi ?? ""));
  const xemMa = (ma: string) => { setLocCot({ ma: { chon: [ma] } }); setSp((s) => { const n = new URLSearchParams(s); n.set("tt", "tat_ca"); ["kpi", "kieu"].forEach((k) => n.delete(k)); return n; }, { replace: true }); };
  const colsMa: Col<(typeof theoMa)[number]>[] = [
    { key: "act", header: "", render: (p) => <button className="btn sm" onClick={(e) => { e.stopPropagation(); xemMa(p.x.ma_loi); }}>Xem chi tiết</button> },
    { key: "ma", header: "Mã lỗi", loc: "chu", gt: (p) => p.x.ma_loi, render: (p) => <b style={{ fontFamily: "ui-monospace, monospace" }}>{p.x.ma_loi}</b> },
    { key: "ten", header: "Tên lỗi", loc: "chu", gt: (p) => p.x.ten_ma, maxW: 280, render: (p) => p.x.ten_ma },
    { key: "buoc", header: "Bước", loc: "chon", gt: (p) => p.x.buoc ?? "", render: (p) => p.x.buoc ?? <span className="muted">—</span> },
    { key: "ben", header: "Bên chịu", loc: "chon", gt: (p) => p.x.ben ?? "", nhanChon: (v) => BEN[v]?.l ?? v, render: (p) => <BenBadge b={p.x.ben} /> },
    { key: "tong", header: "Lỗi", loc: "so", gt: (p) => p.ds.length, align: "right", render: (p) => <b title="Số lỗi (gộp: cùng lỗi, cùng PO, cùng kỳ) — mọi trạng thái">{soLuong(p.ds.length)}</b> },
    { key: "vp", header: "Vi phạm", loc: "so", gt: (p) => p.vp, align: "right", render: (p) => p.vp ? <b style={{ color: "var(--danger-ink)" }} title="Hết hạn giải trình mà không giải trình">{soLuong(p.vp)}</b> : <span className="muted">0</span> },
    { key: "cho", header: "Cần GT", loc: "so", gt: (p) => p.cho, align: "right", render: (p) => p.cho ? <b style={{ color: "#c26400" }}>{soLuong(p.cho)}</b> : <span className="muted">0</span> },
    { key: "da", header: "Đã GT", loc: "so", gt: (p) => p.da, align: "right", render: (p) => soLuong(p.da) },
    { key: "tu", header: "Đã khắc phục", loc: "so", gt: (p) => p.tu, align: "right", render: (p) => p.tu ? <span title="Hệ thống tự đóng vì đã khắc phục trong hạn — không tính vi phạm">{soLuong(p.tu)}</span> : <span className="muted">0</span> },
    { key: "pct", header: "% giải trình", loc: "so", gt: (p) => p.pct, align: "right", render: (p) => <b style={{ color: p.pct < 30 ? "var(--danger-ink)" : p.pct < 70 ? "#c26400" : "var(--ok-ink)" }}>{p.pct}%</b> },
    { key: "lau", header: `Chờ ≥ ${d.qua_lau_gio}h LV`, loc: "so", gt: (p) => p.qua_lau, align: "right", render: (p) => p.qua_lau || <span className="muted">0</span> },
    { key: "po", header: "Số PO · dòng", loc: "so", gt: (p) => p.po, align: "right", render: (p) => <>{p.po}<span className="muted"> · {p.dong}</span></> },
    { key: "nguoi", header: "Bị gán nhiều nhất", maxW: 200, render: (p) => p.nguoi.slice(0, 3).map(([k, n]) => `${ten(k)} (${n})`).join(", ") || "—" },
    { key: "ai", header: "Nguyên nhân theo giải trình", maxW: 220, render: (p) => p.ai.length ? p.ai.slice(0, 3).map(([k, n]) => `${tenDm("AI", k)} (${n})`).join(", ") : <span className="muted">chưa có giải trình</span> },
  ];

  // Excel: dung cac loi DANG HIEN (ap ca loc cot bang Theo loi)
  const xuat = () => exportRowsToXlsx(kieu === "loi" ? locVaSap(nhom, colsLoi, locCot, null).flatMap((n) => n.ds) : loc, [
    { header: "Mã lỗi", get: (l) => l.ma_loi }, { header: "Tên mã lỗi", get: (l) => l.ten_ma }, { header: "Bước", get: (l) => l.buoc },
    { header: "Bên chịu", get: (l) => BEN[l.ben]?.l ?? "" },
    { header: "Mức độ", get: (l) => MUC[l.muc]?.l }, { header: "Trạng thái", get: (l) => vp(l) ? "Vi phạm (hết hạn không giải trình)" : cho(l) ? "Cần giải trình" : l.tu_dong === "CU" ? "Bỏ qua (lỗi cũ trước 01/11 / chốt trước đào tạo 20/11/2026)" : tuDong(l) ? "Đã khắc phục" : "Đã giải trình" },
    { header: "Hạn giải trình", get: (l) => ngayGio(l.han_gt) },
    { header: "Lỗi", get: (l) => QUY_TAC[l.quy_tac] ?? l.quy_tac }, { header: "Lần thứ", get: (l) => `${l.lan_thu}/${l.so_lan}` },
    { header: "Mã phê duyệt", get: (l) => l.approval_code }, { header: "Mã EO", get: (l) => l.eo_code },
    { header: "Mã linh kiện", get: (l) => l.part_code }, { header: "Tên linh kiện", get: (l) => l.part_name }, { header: "Kho", get: (l) => l.kho }, { header: "Đối tác", get: (l) => l.doi_tac },
    { header: "Người chịu lỗi", get: (l) => l.nguoi_vp }, { header: "Ai (loại)", get: (l) => tenDm("AI", l.ai_ma) }, { header: "Lỗi gì", get: (l) => tenDm("LOI", l.loi_ma) },
    { header: "Ngày lỗi", get: (l) => ngay(l.ngay_tham_chieu ?? l.han) }, { header: "Mốc lỗi", get: (l) => ngayGio(l.han) },
    { header: "Số ngày chờ / đến khi giải trình", get: (l) => l.tuoi_ngay }, { header: "Giờ làm việc chờ / đến khi giải trình", get: (l) => l.tuoi_gio }, { header: "Số lần nhắc (dòng)", get: (l) => l.so_nhac },
    { header: "Tự đóng", get: (l) => (l.tu_dong === "QUA_HAN" ? "Hết hạn giải trình - vi phạm" : l.tu_dong === "CU" ? "Bỏ qua - lỗi cũ" : l.tu_dong ? "Đã khắc phục" : "") }, { header: "Giải trình", get: (l) => l.gt_noi_dung }, { header: "Giải trình bởi", get: (l) => l.gt_boi }, { header: "Giải trình lúc", get: (l) => ngayGio(l.gt_luc) },
    { header: "Cấp CEO vì", get: (l) => (l.ceo_ly_do ?? []).join("; ") },
  ], `vi-pham_${new Date().toISOString().slice(0, 10)}.xlsx`, "Vi pham");

  // nhom trang thai + nhom canh bao (KPI cu) gop 1 o chon co so dem - gia tri "tt:x" / "kpi:x"
  const nhomVal = kpi ? `kpi:${kpi}` : `tt:${TT_DEF.some((x) => x.k === tt) ? tt : "tat_ca"}`;
  const datNhom = (v: string) => {
    const [loai, k] = v.split(":");
    setSp((s) => { const n = new URLSearchParams(s); if (loai === "kpi") { n.set("kpi", k); n.delete("tt"); } else { n.delete("kpi"); if (k === (ben ? "mo" : "cho")) n.delete("tt"); else n.set("tt", k); } return n; }, { replace: true });
    setChon(new Set());
  };
  const soHien = kieu === "ma" ? theoMa.length : kieu === "po" ? theoPo.length : kieu === "nguoi" ? theoNguoi.length : nhom.length;
  const donVi = kieu === "ma" ? "mã lỗi" : kieu === "po" ? "PO" : kieu === "nguoi" ? "người" : "lỗi";

  return (
    <>
      <PageHeader title="Vi phạm & giải trình" />
      <Card>
        {/* thanh thao tac gon (giong Don PO): pham vi · nhom · cach xem · tim · loc dang ap · so dong · thao tac */}
        <FilterBar>
          <div className="seg" role="tablist">
            {[["cua_toi", `Của tôi (${soVp((d.rows ?? []).filter((l) => l.cua_toi && cho(l)))})`], ["tat_ca", d.tat_ca ? "Toàn bộ" : "Phạm vi của tôi"]].map(([k, t]) => (
              <button key={k} role="tab" aria-selected={xem === k} className={xem === k ? "on" : ""}
                onClick={() => { set("xem", k); setChon(new Set()); }}>{t}</button>
            ))}
          </div>
          <select className="select tb" style={{ width: 250, borderColor: nhomVal !== "tt:cho" ? "var(--brand-yellow-btn)" : undefined }} value={nhomVal} onChange={(e) => datNhom(e.target.value)} title="Nhóm trạng thái / cảnh báo (số = vi phạm gộp theo bộ lọc hiện tại)">
            <optgroup label="Trạng thái">
              {TT_DEF.map((x) => <option key={x.k} value={`tt:${x.k}`}>{x.l} ({soLuong(demTt(x.k))})</option>)}
              <option value="tt:tat_ca">Mọi trạng thái ({soLuong(demTt(""))})</option>
            </optgroup>
            <optgroup label="Cảnh báo">
              {KPI_DEF.map((k) => <option key={k.k} value={`kpi:${k.k}`} title={k.sub}>{k.l} ({soLuong(k.k === "ceo" ? soCaCeo : dem(k.k))}{k.k === "ceo" ? " ca" : ""})</option>)}
            </optgroup>
          </select>
          <select className="select tb" style={{ width: 175 }} value={kieu} onChange={(e) => set("kieu", e.target.value === "loi" ? "" : e.target.value)} title="Cách xem">
            <option value="loi">Xem: theo lỗi</option><option value="po">Xem: theo PO</option><option value="nguoi">Xem: theo người</option><option value="ma">Xem: theo mã lỗi</option>
          </select>
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
            <I.search width={15} height={15} style={{ position: "absolute", left: 11, top: 9, color: "var(--text-faint)" }} />
            <input className="input tb" style={{ paddingLeft: 32 }} placeholder="Tìm mã PO, mã / tên LK, người, nội dung giải trình…" value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
          {ben && <span className="qv-chip on" style={{ display: "inline-flex", gap: 4 }} title="Bên chịu lỗi (menu Lỗi đối tác / Lỗi nội bộ)">Bên chịu: {BEN[ben]?.l ?? ben}<span role="button" style={{ cursor: "pointer" }} onClick={() => set("ben", "")}>×</span></span>}
          {qt.length > 0 && <span className="qv-chip on" style={{ display: "inline-flex", gap: 4 }} title="Loại lỗi (menu cấp 2)">{qt.map((k) => QUY_TAC[k] ?? k).join(", ")}<span role="button" style={{ cursor: "pointer" }} onClick={() => set("qt", "")}>×</span></span>}
          {coLoc && <RefreshFiltersBtn onClick={xoaLoc} />}
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }} title={xem === "cua_toi" ? `Bạn có ${soVpCho} lỗi cần giải trình trên ${poCho} PO — giải trình trước hạn 16 giờ làm việc thì không bị ghi vi phạm` : undefined}>
            <b style={{ color: "var(--text)" }}>{soLuong(soHien)}</b> {donVi}{xem === "cua_toi" && soVpCho > 0 ? <> · <b style={{ color: "#c26400" }}>{soVpCho} cần GT</b> / {poCho} PO</> : null}</span>
          {kieu === "loi" && idsChon.length > 0 && <>
            <span className="qv-chip on" style={{ display: "inline-flex", gap: 4 }}>Đã chọn {nhomChon.length} · {idsChon.length} lỗi{loaiChon.length > 1 ? ` · ${loaiChon.length} loại` : ""}<span role="button" style={{ cursor: "pointer" }} onClick={() => setChon(new Set())}>×</span></span>
            {d.co_the_gt && <button className="btn sm primary" disabled={loaiChon.length > 1} title={loaiChon.length > 1 ? "Chỉ giải trình chung được các lỗi cùng loại — bỏ chọn bớt hoặc lọc cột Lỗi" : "1 nội dung giải trình cho mọi lỗi đã chọn"}
              onClick={() => setMd({ k: "nhieu", nhom: nhomChon })}>Giải trình chung</button>}
            {d.quan_ly && <button className="btn sm" onClick={() => setMd({ k: "nhac", ids: idsChon, ten: `${chon.size} nhóm lỗi đã chọn` })}><I.bell width={14} height={14} /> Nhắc nhở</button>}
          </>}
          {xem === "cua_toi" && choCua.length > 0 && d.co_the_gt && kieu === "loi" && !idsChon.length && <button className="btn sm" onClick={() => { const n = gomLoi(choCua).sort((a, b) => MUC[b.x.muc].thu - MUC[a.x.muc].thu)[0]; if (n) setMd({ k: "gt", x: n.x }); }}>Giải trình lỗi nặng nhất</button>}
          <button className="btn sm" style={{ padding: "0 9px" }} onClick={xuat} title="Xuất các lỗi đang lọc ra Excel"><I.download width={14} height={14} /></button>
          <Popover align="right" width={460} btnClass="btn sm ghost" title="Chú giải mức độ, lỗi / vi phạm" label={<I.help width={15} height={15} />}>
            <div style={{ fontSize: 12, lineHeight: 1.55 }}>
              <div><b>Lỗi</b> = chạm quy tắc, phải giải trình trong 16 giờ làm việc. <b>Vi phạm</b> = hết hạn mà không giải trình. Đếm gộp: cùng lỗi, cùng PO, cùng kỳ.</div>
              <div style={{ marginTop: 4 }}><b>Bên chịu:</b> <BenBadge b="NCC" /> chưa có / quá ngày DK (R1, R4) · <BenBadge b="NOI_BO" /> không thúc NCC (R3), chậm duyệt (R5). Đã giải trình thì theo “Do ai” đã chọn.</div>
              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>{Object.entries(MUC).sort((a, b) => b[1].thu - a[1].thu).map(([k, m]) => <div key={k}><MucBadge m={k} /> {m.gt}</div>)}</div>
              <div className="muted" style={{ marginTop: 6 }}>Lọc / sắp xếp từng cột: bấm biểu tượng phễu / tiêu đề cột.{d.danh_gia_luc ? ` Kiểm tra lỗi lúc ${ngayGio(d.danh_gia_luc)}.` : ""}{" "}Ca CEO: <Link to="/ca-ceo">PO tồn CEO →</Link></div>
            </div>
          </Popover>
        </FilterBar>
        {thongBao && <div className="qv-alert ok" style={{ display: "block", marginBottom: 8 }}>{thongBao} <span role="button" style={{ cursor: "pointer", marginLeft: 8 }} onClick={() => setThongBao("")}>×</span></div>}

        {kieu === "ma" ? <DataTable cols={colsMa} rows={theoMa} keyOf={(p) => p.x.ma_loi ?? p.x.quy_tac} pageSize={20} timKiem={false} onRowClick={(p) => xemMa(p.x.ma_loi)} empty="Không có lỗi theo bộ lọc." />
          : kieu === "po" ? <DataTable cols={colsPo} rows={theoPo} keyOf={(p) => p.x.eo_id} pageSize={15} timKiem={false} onRowClick={(p) => qv.openEo(p.x.eo_id)} empty="Không có lỗi theo bộ lọc." />
          : kieu === "nguoi" ? <DataTable cols={colsNguoi} rows={theoNguoi} keyOf={(p) => p.x.nguoi_vp ?? "-"} pageSize={15} timKiem={false} empty="Không có lỗi theo bộ lọc." />
          : <DataTable cols={colsLoi} rows={nhom} keyOf={khoaNhom} pageSize={15} timKiem={false} onRowClick={(n) => setChiTiet(n)} loc={locCot} onLoc={setLocCot}
              empty={xem === "cua_toi" && tt === "cho" && !coLoc ? "✓ Bạn không có lỗi chờ giải trình." : "Không có lỗi theo bộ lọc."} />}
      </Card>

      {chiTiet && <ChiTietViPham n={chiTiet} d={d} tenDm={tenDm} onClose={() => setChiTiet(null)}
        onGt={() => setMd({ k: "gt", x: chiTiet.x })} onPo={() => setMd({ k: "po", eo: chiTiet.x.eo_id })} onNdk={() => setMd({ k: "ndk", x: chiTiet.x })}
        onNhac={() => setMd({ k: "nhac", ids: chiTiet.ds.filter(cho).map((l) => l.id), ten: `${chiTiet.x.part_code} (${maPo(chiTiet.x)})` })}
        onDong={() => qv.openDong(chiTiet.x.eo_item_id)} />}
      {md?.k === "gt" && <GiaiTrinhModal dong={choDong(md.x)} onClose={() => setMd(null)} onSaved={() => { setChiTiet(null); xong("Đã gửi giải trình."); }} />}
      {md?.k === "po" && <GiaiTrinhPoModal eoId={md.eo} onClose={() => setMd(null)} onSaved={(kq) => { setChiTiet(null); xong(`Đã giải trình chung cả PO: ${kq.so_loi} lỗi trên ${kq.so_dong} linh kiện.`); }} />}
      {md?.k === "ndk" && <NgayHangVeModal dong={choDong(md.x)} onClose={() => setMd(null)} onSaved={() => xong()} />}
      {md?.k === "nhieu" && <GiaiTrinhNhieuModal nhom={md.nhom} onClose={() => setMd(null)} onSaved={(kq) => { setChon(new Set()); xong(`Đã giải trình chung ${kq.so_loi} lỗi trên ${kq.so_dong} linh kiện (${kq.so_po} PO).`); }} />}
      {md?.k === "nhac" && <NhacNhoModal ids={md.ids} ten={md.ten} onClose={() => setMd(null)} onSaved={(m) => { setChon(new Set()); xong(m); }} />}
    </>
  );
}

function NhacNhoModal({ ids, ten: tenNhom, onClose, onSaved }: { ids: number[]; ten: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [noiDung, setNoiDung] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const gui = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ so_loi: number; so_nguoi: number }>("/vi-pham/nhac-nho", { loi_ids: ids, noi_dung: noiDung.trim() || undefined });
      onSaved(`Đã nhắc ${r.so_loi} lỗi (${r.so_nguoi} thông báo gửi tới người vi phạm).`);
    } catch (e: any) { setErr(e?.body?.error === "FORBIDDEN" ? "Chỉ quản lý (Admin / KH cung ứng / Theo dõi tiến độ) được nhắc nhở." : "Lỗi gửi nhắc nhở."); setBusy(false); }
  };
  return (
    <Modal title={`Nhắc giải trình — ${tenNhom}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={gui}>{busy ? "Đang gửi..." : `Gửi nhắc (${ids.length} lỗi)`}</button></>}>
      <div style={{ fontSize: 13 }}>
        <div className="muted" style={{ marginBottom: 8 }}>Người chịu lỗi nhận thông báo (chuông trên thanh trên cùng). Lần nhắc được lưu vào lịch sử từng lỗi.</div>
        <label className="field-label">Lời nhắn (tuỳ chọn)</label>
        <textarea className="textarea" value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="vd: Giải trình trước 17h hôm nay" />
        {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>
    </Modal>
  );
}

/**
 * Chi tiet 1 loi / vi pham gop (v0.132, chu he thong 27/11/2026 "giao dien nay kho nhin qua, tieu de dung to dam len, tim phuong an khac de nhin hon"):
 * cung bo cuc popup chi tiet (95%, 2 khu - v0.131). Dau: 1 dong nhan (muc · trang thai · ben chiu) + LUONG NGANG cua loi
 * (Phat sinh → Nhac nho → Han giai trinh → Ket qua; moc dang cho to noi). Khu CHINH: ket luan 1 cau, vi sao / phai lam gi, thong tin dong (nhan nhat, khong to dam),
 * "▾ Xem chi tiết" = cac lan loi + loi khac tren LK. Khu PHU: nhac nho + lich su linh kien (bo muc loi trung). Nut thao tac o chan.
 */
function ChiTietViPham({ n, d, tenDm, onClose, onGt, onPo, onNdk, onNhac, onDong }: {
  n: Nhom; d: Data; tenDm: (loai: string, ma: string | null) => string; onClose: () => void;
  onGt: () => void; onPo: () => void; onNdk: () => void; onNhac: () => void; onDong: () => void;
}) {
  const x = n.x;
  const { z, id } = useLop();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && laTrenCung(id.current) && !document.querySelector(".hop-loc, [data-modal='']")) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, id]);
  const [anPhu, setAnPhu] = useAnPhu();
  const [moCt, setMoCt] = useState(false);
  const nn = useQuery({ queryKey: ["vi-pham-nhac", x.eo_item_id], queryFn: () => api.get<any[]>(`/vi-pham/dong/${x.eo_item_id}/nhac-nho`) });
  const cungDong = d.rows.filter((l) => l.eo_item_id === x.eo_item_id);
  const choN = n.ds.filter(cho).length;
  const lyDoMuc = x.muc === "CEO" ? `Dòng đang cấp CEO: ${x.ceo_ly_do.join("; ")}.`
    : x.muc === "CAO" ? (x.so_lan >= 3 ? `Lỗi này đã lặp ${x.so_lan} lần trên linh kiện.` : `Chờ giải trình ${x.tuoi_gio} giờ làm việc (≥ ${d.rat_lau_gio}).`)
    : x.muc === "TB" ? (x.so_lan >= 2 ? `Lỗi này đã lặp ${x.so_lan} lần.` : `Chờ giải trình ${x.tuoi_gio} giờ làm việc (≥ ${d.qua_lau_gio}).`)
    : "Lỗi lần đầu.";

  // ---- luong ngang cua loi: da qua (mau) / dang cho (to noi) / chua toi (xam) / bo qua (net dut)
  type Moc = { l: string; t: string; tt: "qua" | "dang" | "chua" | "bo" | "xau"; tip: string };
  const soNhac = nn.data?.length ?? x.so_nhac ?? 0;
  const ketQua: Moc = vp(x) ? { l: "Vi phạm", t: `hết hạn ${ngayGio(x.han_gt)}`, tt: "xau", tip: "Hết hạn giải trình mà không giải trình → ghi nhận vi phạm" }
    : cho(x) ? { l: "Giải trình", t: "chưa có", tt: "chua", tip: "Giải trình hoặc khắc phục trước hạn thì không bị ghi vi phạm" }
    : x.tu_dong === "CU" ? { l: "Bỏ qua", t: "lỗi cũ", tt: "bo", tip: x.gt_noi_dung ?? "" }
    : tuDong(x) ? { l: "Đã khắc phục", t: ngayGio(x.gt_luc), tt: "qua", tip: x.gt_noi_dung ?? "Hệ thống tự đóng vì đã khắc phục trong hạn" }
    : { l: "Đã giải trình", t: ngayGio(x.gt_luc), tt: "qua", tip: `${ten(x.gt_boi)} · ${x.gt_noi_dung ?? ""}` };
  const mocs: Moc[] = [
    { l: "Phát sinh lỗi", t: ngayGio(x.han), tt: "qua", tip: `${QUY_TAC[x.quy_tac] ?? x.quy_tac} — mốc lỗi ${ngayGio(x.han)}` },
    { l: soNhac ? `Nhắc nhở ×${soNhac}` : "Nhắc nhở", t: soNhac ? ngayGio((nn.data ?? [])[0]?.created_at ?? x.nhac_gan_nhat) : "chưa nhắc", tt: soNhac ? "qua" : "bo", tip: soNhac ? `${soNhac} lần nhắc · gần nhất ${ngayGio((nn.data ?? [])[0]?.created_at ?? x.nhac_gan_nhat)}` : "Chưa có lần nhắc nào" },
    ...(x.han_gt ? [{ l: "Hạn giải trình", t: cho(x) ? `${ngayGio(x.han_gt)} · còn ${x.con_gio_gt}h LV` : ngayGio(x.han_gt), tt: cho(x) ? "dang" : "qua", tip: `Hạn = mốc lỗi + ${16} giờ làm việc` } as Moc] : []),
    ketQua,
  ];
  const MAU_MOC = { qua: "#1d8a3c", dang: "#ff6b00", chua: "#d2d2d7", bo: "#86868b", xau: "#d70015" } as const;

  const L = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "14px 0 6px" }}>{children}</div>;
  const Tt = ({ k, v }: { k: string; v: ReactNode }) => <div style={{ minWidth: 0 }}><div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{k}</div><div style={{ fontSize: 13, marginTop: 1 }}>{v || "—"}</div></div>;
  const ben = BEN[x.ben];

  return (
    <div className="qv-overlay" style={{ zIndex: z }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qv-panel">
        <div className="qv-head">
          <QvHeader coTruoc={false} onClose={onClose} onCloseAll={onClose} actions={<>
            {choN > 0 && d.co_the_gt && <button className="btn sm primary" onClick={onGt}><I.edit width={13} height={13} /> Giải trình{choN > 1 ? ` (${choN} lần)` : ""}</button>}
            {choN > 0 && d.co_the_gt && x.quy_tac !== "R5" && <button className="btn sm" onClick={onPo}>Giải trình cả PO</button>}
            {choN > 0 && (x.quy_tac === "R1" || x.quy_tac === "R4") && d.co_the_gt && <button className="btn sm" onClick={onNdk}><I.calendar width={13} height={13} /> Cập nhật ngày DK</button>}
            {choN > 0 && d.quan_ly && <button className="btn sm" onClick={onNhac}><I.bell width={13} height={13} /> Nhắc nhở</button>}
            <button className="btn sm" onClick={onDong}>Mở đơn hàng</button>
          </>}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 13 }}>{vp(x) ? "Vi phạm" : "Lỗi"}</span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{QUY_TAC[x.quy_tac] ?? x.quy_tac}</span>
              <MucBadge m={x.muc} /><TrangThai l={x} />{ben && <BenBadge b={x.ben} />}
              {x.so_lan > 1 && <span className="badge final">lặp {x.so_lan} lần</span>}
            </div>
            <div className="muted qv-meta" style={{ fontSize: 12.5, marginTop: 3, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>PO <EoLink id={x.eo_id}>{maPo(x)}</EoLink></span>
              <span>LK <DongLink id={x.eo_item_id} ma={x.part_code} /> {x.part_name}</span>
              <span>Mã lỗi {x.ma_loi}{x.buoc ? ` · bước ${x.buoc}` : ""}</span>
              <span>Người chịu <span style={{ color: "var(--text)" }}>{ten(x.nguoi_vp)}</span></span>
            </div>
          </QvHeader>
        </div>

        <div className={`qv-body${anPhu ? " an-phu" : ""}`}>
          <div className="qv-col">
            <KhuTieuDe loai="chinh">📌 Theo dõi chính</KhuTieuDe>
            {/* luong ngang cua loi */}
            <div className="qv-quytrinh" style={{ display: "flex", alignItems: "flex-start", padding: "14px 18px 10px" }}>
              {mocs.map((m, i) => (
                <div key={i} title={m.tip} style={{ flex: 1, minWidth: 0, position: "relative", textAlign: "center" }}>
                  {i > 0 && <div style={{ position: "absolute", top: 9, right: "50%", width: "100%", height: 3, background: m.tt === "chua" || m.tt === "bo" ? "#e8e8ed" : MAU_MOC[m.tt], zIndex: 0 }} />}
                  <div style={{ position: "relative", zIndex: 1, margin: "0 auto", width: m.tt === "dang" || m.tt === "xau" ? 22 : 18, height: m.tt === "dang" || m.tt === "xau" ? 22 : 18, marginTop: m.tt === "dang" || m.tt === "xau" ? -2 : 0,
                    borderRadius: "50%", background: m.tt === "bo" ? "#fff" : MAU_MOC[m.tt], border: m.tt === "bo" ? "2px dashed #86868b" : "3px solid #fff",
                    boxShadow: m.tt === "dang" ? "0 0 0 4px #ffd8a8" : m.tt === "xau" ? "0 0 0 4px #ffd0cc" : "0 0 0 1px #e8e8ed" }} />
                  <div style={{ fontSize: 12.5, marginTop: 6, color: m.tt === "dang" ? "#c26400" : m.tt === "xau" ? "#d70015" : m.tt === "chua" || m.tt === "bo" ? "var(--text-muted)" : "var(--text)", fontWeight: m.tt === "dang" || m.tt === "xau" ? 700 : 500 }}>{m.l}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{m.t}</div>
                </div>
              ))}
            </div>
            <div className="qv-scroll" style={{ padding: "4px 18px 16px", fontSize: 13, lineHeight: 1.55 }}>
              {/* ket luan 1 cau - nen nhat, khong khung dam */}
              <div style={{ padding: "8px 12px", borderRadius: 10, marginTop: 8, background: vp(x) ? "#fff2f1" : cho(x) ? "#fff6e8" : "#effaf1", color: vp(x) ? "#a3000f" : cho(x) ? "#9A3412" : "#176e30" }}>
                {vp(x) ? <>Hết hạn giải trình {ngayGio(x.han_gt)} mà không có giải trình → ghi nhận vi phạm, không giải trình được nữa.</>
                  : cho(x) ? <>Cần giải trình — chưa phải vi phạm. Còn {x.con_gio_gt} giờ làm việc (hạn {ngayGio(x.han_gt)}). Giải trình hoặc khắc phục trước hạn thì không bị ghi vi phạm.</>
                  : x.tu_dong === "CU" ? <>Lỗi cũ / vi phạm chốt trước đào tạo 20/11/2026 — hệ thống tự bỏ, không tính vi phạm.</>
                  : tuDong(x) ? <>Hệ thống tự đóng vì đã khắc phục trong hạn — không tính vi phạm.</>
                  : x.quy_tac === "TAY" ? <>Lỗi do người giải trình tự ghi nhận — không tính vi phạm.</>
                  : <>Đã giải trình lúc {ngayGio(x.gt_luc)}, trước hạn — không tính vi phạm.</>}
              </div>
              {x.ceo && <div style={{ marginTop: 6, color: "#8a0010" }}>Cấp CEO vì: {x.ceo_ly_do.join(" · ")} <span className="muted">(hệ thống tự tính, không có hạn giải trình)</span></div>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><L>Vì sao có lỗi</L><div>{QT_DAI[x.quy_tac]}</div><div className="muted" style={{ marginTop: 4 }}>Mức {MUC[x.muc].l}: {lyDoMuc}</div></div>
                <div><L>Cần làm gì</L><div>{CACH_XU_LY[x.quy_tac]}</div></div>
              </div>

              <L>Thông tin dòng linh kiện</L>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "10px 16px", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                <Tt k="Kho · đối tác" v={`${khoGon(x.kho)} · ${x.doi_tac || "—"}`} />
                <Tt k="Tình trạng dòng" v={x.tinh_trang ? TINH_TRANG[x.tinh_trang as Dong["tinh_trang"]]?.l : ""} />
                <Tt k="Ngày dự kiến · số lần lùi" v={`${ngay(x.ngay_du_kien) || "Chưa có"} · ${x.so_lan_lui} lần`} />
                <Tt k="Đã về / đặt" v={x.so_luong_dat != null ? `${soLuong(x.sl_ve)} / ${soLuong(x.so_luong_dat)}` : ""} />
                <Tt k="Người chịu lỗi" v={`${ten(x.nguoi_vp)}${x.ai_ma ? ` (${tenDm("AI", x.ai_ma)})` : ""}`} />
                <Tt k="Người đặt" v={ten(x.nguoi_dat)} />
                <Tt k="Bên chịu" v={ben?.l} />
                <Tt k="Giải trình" v={x.gt_noi_dung ? `${x.gt_noi_dung} — ${ten(x.gt_boi)}` : ""} />
              </div>

              <div style={{ marginTop: 14 }}>
                <button type="button" className="btn ghost sm" onClick={() => setMoCt(!moCt)}>{moCt ? "▴ Thu gọn" : `▾ Xem chi tiết — các lần lỗi (${n.ds.length})${cungDong.length > n.ds.length ? " · lỗi khác trên linh kiện" : ""}`}</button>
              </div>
              {moCt && <>
                <L>Các lần lỗi ({n.ds.length}{x.so_lan > n.ds.length ? ` · tổng ${x.so_lan} lần gồm cả đã giải trình` : ""})</L>
                <div className="tbl-wrap"><table className="tbl tbl-dense">
                  <thead><tr><th>Lần</th><th>Ngày lỗi</th><th>Mốc lỗi</th><th>Hạn giải trình</th><th>Trạng thái</th><th>Chờ / phản hồi</th><th>Giải trình</th></tr></thead>
                  <tbody>{[...n.ds].reverse().map((l) => (
                    <tr key={l.id}><td>{l.lan_thu}/{l.so_lan}</td><td>{ngay(l.ngay_tham_chieu ?? l.han)}</td><td>{ngayGio(l.han)}</td><td>{l.han_gt ? ngayGio(l.han_gt) : "—"}</td><td><TrangThai l={l} /></td>
                      <td>{cho(l) ? `${l.tuoi_gio}h LV` : `sau ${l.tuoi_ngay} ngày`}</td>
                      <td style={{ fontSize: 12 }}>{l.gt_noi_dung ? <>{l.gt_noi_dung} <span className="muted">— {ten(l.gt_boi)} {ngayGio(l.gt_luc)}{l.gt_co_anh ? " · 📷" : ""}</span></> : "—"}</td></tr>
                  ))}</tbody>
                </table></div>
                {cungDong.length > n.ds.length && <>
                  <L>Lỗi khác trên linh kiện này</L>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {gopTrung(cungDong.filter((l) => !n.ds.includes(l)), (l) => `${l.quy_tac}|${l.trang_thai}`).map(({ x: l, ds }) => (
                      <span key={l.id} className={`badge ${vp(l) ? "reject" : cho(l) ? "final" : "nhap"}`}>{QUY_TAC[l.quy_tac]}{ds.length > 1 ? ` × ${ds.length}` : ""} · {vp(l) ? "vi phạm" : cho(l) ? "cần GT" : "đã xử lý"}</span>
                    ))}
                  </div>
                </>}
              </>}
            </div>
          </div>

          <CotPhu an={anPhu} setAn={setAnPhu} tieuDe="Nhắc nhở · lịch sử">
            <div className="qv-phu-sec" style={{ fontSize: 12.5 }}>
              <div className="muted" style={{ marginBottom: 4 }}>Nhắc nhở ({nn.data?.length ?? 0})</div>
              {nn.isLoading ? <span className="muted">Đang tải…</span> : !(nn.data ?? []).length ? <div className="muted">Chưa có lần nhắc nào.</div> : (
                (nn.data ?? []).map((r) => (
                  <div key={r.id} style={{ padding: "3px 0" }}>
                    <span className="muted">{ngayGio(r.created_at)}</span> · {r.kenh === "TAY" ? `${ten(r.created_by)} nhắc` : "Hệ thống tự nhắc"} → {ten(r.den_email)}{r.noi_dung ? <span className="muted"> · {r.noi_dung}</span> : null}
                  </div>
                ))
              )}
            </div>
            <div className="qv-scroll" style={{ padding: "0 12px 12px" }}>
              <LichSuDong boLoi dong={{ item_id: x.eo_item_id, part_name: x.part_name, kho: x.kho, doi_tac: x.doi_tac, so_luong_dat: x.so_luong_dat ?? 0, sl_nhap_amis: x.sl_ve ?? 0, bat_dau: null, han_ngay_du_kien: null }} />
            </div>
          </CotPhu>
        </div>
      </div>
    </div>
  );
}
