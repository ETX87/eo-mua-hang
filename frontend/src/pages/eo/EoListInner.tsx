import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useQuickView } from "../../components/quickview/QuickView";
import { DataTable, Pagination, FilterBar, RefreshFiltersBtn, soCotLoc, type Col, type LocCot, type SapCot } from "../../components/DataTable";
import { TypeBadge, Popover, MenuItem } from "../../components/ui";
import { TienTrinhPo, type GdPo } from "../../components/TienTrinhPo";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten, tuBayGio } from "../../lib/format";
import { STATUS_META } from "../../lib/nav";
import { MocTon } from "../../lib/tonDong";
import { exportRowsToXlsx, type ExportCol } from "../../lib/exportXlsx";
import { useGoiYDong, LY_DO_CHUAN } from "../../lib/goiY";
import { ChonNhieu, noiDs, tachDs } from "../../components/ChonNhieu";
import { actionsFor, ApprovalActionModal } from "./eoActions";
import { GiaiTrinhHangLoatModal } from "./GiaiTrinhHangLoat";
import { NutCongNhiemVu } from "./NutCongNhiemVu";

interface EoRow {
  id: number; eo_code: string; approval_code: string | null; tieu_de: string;
  loai_hinh: string | null; phong_ban: string | null; trang_thai: string;
  created_by: string; created_at: string; so_dong: number; tong_sl: number; final_approver_email: string | null;
  issued_at: string | null; ma_lk: string | null; so_dong_sau_bh: number; so_dong_chua_du: number; sl_ve: number;
  so_dong_cho_duyet: number; phieu_cho_toi_id: number | null; phieu_cho_toi_buoc: string | null; xong?: boolean;
  /** canh bao dieu hanh theo PO (backend lib/dieuHanh tomTatTheoPo, v0.084) - chi PO co dong dang mo trong pham vi theo doi */
  dh?: { do: number; vang: number; qua_dk: number; chua_dk: number; loi_cho: number; ceo: number; thuc7: number; thuc: number; thuc_luc: string | null;
    im_lang: number; td_luc: string | null; td_loai: string | null; td_ai: string | null; ly_do: string[]; mo: number } | null;
  doi_tac_po?: string | null;
  /** so dong dang o tung giai doan (backend lib/dieuHanh, v0.086) - cot Tien trinh */
  gd?: GdPo | null;
  /** trang thai vi pham theo PO (backend lib/dieuHanh VpPo, v0.104) - dem vi pham GOP nhu man Vi pham; null = PO ngoai pham vi theo doi */
  vp?: { tt: "CEO" | "CHO" | "VI_PHAM" | "DA_XL" | "KHONG"; tong: number; cho: number; vi_pham: number; da_gt: number; tu_dong: number; ceo: number; cao: number } | null;
}

const VP_TT: Record<string, { l: string; nen: string; mau: string }> = {
  // v0.110: "Cần giải trình" (còn hạn) ≠ "Có vi phạm" (hết hạn không giải trình); lỗi giải trình / khắc phục đúng hạn = không vi phạm
  CEO: { l: "🔴 Cấp CEO", nen: "#FEE2E2", mau: "#B91C1C" }, CHO: { l: "Cần giải trình", nen: "#FFEDD5", mau: "#C2410C" },
  VI_PHAM: { l: "Có vi phạm", nen: "#FEE2E2", mau: "#B91C1C" },
  DA_XL: { l: "✓ Xử lý trong hạn", nen: "#ECFDF5", mau: "#047857" }, KHONG: { l: "✓ Không có lỗi", nen: "transparent", mau: "var(--ok-ink)" },
};
const vpTomTat = (v: NonNullable<EoRow["vp"]>) => [v.ceo ? `${v.ceo} dòng cấp CEO` : "", v.vi_pham ? `${v.vi_pham} vi phạm (hết hạn không giải trình)` : "",
  v.cho ? `${v.cho} lỗi cần giải trình (còn hạn)` : "", v.da_gt ? `${v.da_gt} lỗi đã giải trình` : "", v.tu_dong ? `${v.tu_dong} lỗi đã khắc phục` : ""].filter(Boolean).join(" · ");

/** Bo loc da luu CA NHAN (v0.086) - luu tren may nguoi dung (localStorage), khong dong bo giua cac may. 1 bo loc co the dat "mac dinh khi mo". */
interface LocLuu { l: string; chip: string; q: string; loc: LocCot; sap: SapCot; kho: string; doiTac: string; lyDo: string }
const KEY_LUU = "eo-loc-luu", KEY_MAC_DINH = "eo-loc-mac-dinh";
const docLuu = (): LocLuu[] => { try { return JSON.parse(localStorage.getItem(KEY_LUU) ?? "[]"); } catch { return []; } };
interface DsEo { rows: EoRow[]; total: number; tong_truoc_loc: number; tuy_chon: Record<string, string[]>; limit: number; offset: number }

/**
 * Nhom nhanh man Quan ly EO (backend routes/eo.ts CHIP_EO). Mac dinh "EO con ton" = chua ket thuc
 * (khong huy / tu choi, chua ban hanh hoac con dong chua ve du) - yeu cau 2026-11-07.
 */
const CHIP: { k: string; l: string; mau?: string; title?: string }[] = [
  { k: "con_ton", l: "EO còn tồn", title: "EO chưa kết thúc: chưa đóng / chưa hủy / chưa từ chối, đang trình duyệt hoặc đã ban hành nhưng hàng chưa về đủ" },
  { k: "cho_toi_duyet", l: "Chờ tôi duyệt", mau: "#DC2626", title: "Phiếu thẩm định / duyệt mua đang chờ bạn + EO bạn là người duyệt mua có dòng thêm sau ban hành chờ duyệt" },
  { k: "nhap_cua_toi", l: "Nháp / bị trả về của tôi", mau: "#C2410C" },
  { k: "dang_tham_dinh", l: "Đang thẩm định" },
  { k: "cho_duyet_cuoi", l: "Chờ duyệt mua" },
  { k: "da_ban_hanh", l: "Đã ban hành (còn chờ hàng)" },
  { k: "done", l: "Đủ hàng (DONE)", title: "Đã ban hành, mọi dòng đã về đủ SL đặt (kể cả dòng kết thúc sớm)" },
  { k: "sau_bh_cho", l: "Có dòng thêm sau BH chờ duyệt" },
  // v0.084 bang dieu hanh (../QUAN_TRI_DIEU_HANH.md): muc DO / im lang / loi cho giai trinh theo dong LK dang mo
  { k: "po_do", l: "PO có dòng ĐỎ", mau: "#DC2626", title: "Có dòng: cấp CEO / quá ngày DK / trễ hạn chưa có ngày DK / lỗi chờ giải trình ≥ 12h làm việc / im lặng ≥ 7 ngày" },
  { k: "po_im_lang", l: "PO im lặng ≥ 7 ngày", title: "Có dòng đang mở 7 ngày không ai tác động (cập nhật kế hoạch, push, mail NCC, gọi/Zalo, giải trình)" },
  { k: "po_loi_cho", l: "PO có lỗi chờ giải trình" },
  { k: "po_ceo", l: "PO cấp CEO", mau: "#B91C1C", title: "PO có dòng đang ở cấp CEO (lùi ngày DK ≥ 3 lần / ngày DK cách ngày đặt ≥ 30 ngày / ≥ 3 lỗi)" },
  { k: "tu_choi_huy", l: "Từ chối / Đã hủy" },
];
const CHIP_MAC_DINH = "con_ton";
/** Nhan gia tri loc cot Tien trinh (backend routes/eo.ts MOC_PO, v0.088): PO da ban hanh khop moi moc dang co dong o. */
const NHAN_MOC: Record<string, string> = {
  G1: "1 · Lập (nháp / bị trả về)", G2: "2 · Thẩm định", G3: "3 · Duyệt mua (kể cả dòng thêm sau BH chờ duyệt)", G5: "5 · Chờ có ngày dự kiến",
  G6: "6 · Chờ hàng (sản xuất & giao)", G8: "8 · Giao bù đến đủ", XONG: "✓ Đủ hàng", TU_CHOI: "Từ chối", DA_HUY: "Đã hủy",
};
const TAT_CA = "tat_ca";

const EXPORT_COLS: ExportCol<EoRow>[] = [
  { header: "Mã EO", get: (r) => r.eo_code },
  { header: "Mã phê duyệt", get: (r) => r.approval_code },
  { header: "Tiêu đề", get: (r) => r.tieu_de },
  { header: "Loại hình", get: (r) => r.loai_hinh },
  { header: "Phòng ban", get: (r) => r.phong_ban },
  { header: "Trạng thái", get: (r) => STATUS_META[r.trang_thai]?.label ?? r.trang_thai },
  { header: "Người tạo", get: (r) => ten(r.created_by) },
  { header: "Ngày tạo", get: (r) => ngay(r.created_at) },
  { header: "Số dòng LK", get: (r) => r.so_dong },
  { header: "Tổng SL đặt", get: (r) => r.tong_sl },
  { header: "Ngày ban hành", get: (r) => ngay(r.issued_at) },
  { header: "Người duyệt mua", get: (r) => ten(r.final_approver_email) },
  { header: "Đối tác", get: (r) => r.doi_tac_po ?? "" },
  { header: "Dòng đỏ", get: (r) => r.dh?.do ?? "" },
  { header: "Dòng vàng", get: (r) => r.dh?.vang ?? "" },
  { header: "Lý do đỏ", get: (r) => r.dh?.ly_do.join("; ") ?? "" },
  { header: "Lỗi chờ GT", get: (r) => r.dh?.loi_cho ?? "" },
  { header: "Trạng thái vi phạm", get: (r) => (r.vp ? VP_TT[r.vp.tt].l.replace(/^(🔴|✓) /u, "") : "") },
  { header: "Số vi phạm (hết hạn không GT)", get: (r) => r.vp?.vi_pham ?? "" }, { header: "Lỗi cần giải trình", get: (r) => r.vp?.cho ?? "" },
  { header: "Lỗi đã giải trình", get: (r) => r.vp?.da_gt ?? "" }, { header: "Lỗi đã khắc phục", get: (r) => r.vp?.tu_dong ?? "" },
  { header: "Dòng cấp CEO", get: (r) => r.vp?.ceo ?? "" },
  { header: "Thúc NCC 7 ngày", get: (r) => r.dh?.thuc7 ?? "" },
  { header: "Im lặng (ngày)", get: (r) => r.dh?.im_lang ?? "" },
  { header: "Hoạt động cuối", get: (r) => (r.dh?.td_luc ? `${r.dh.td_loai} · ${ten(r.dh.td_ai)} · ${ngayGio(r.dh.td_luc)}` : "") },
];

/** actions: nut them o cuoi thanh loc (vd "Tao EO" o trang Danh sach EO - trang khong co dong tieu de rieng). */
export default function EoListInner({ compact, actions }: { compact?: boolean; actions?: ReactNode }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  // bo loc mac dinh ca nhan: chi ap khi vao man khong kem ?chip (link tu noi khac giu dung bo loc cua link)
  const [luu, setLuu] = useState<LocLuu[]>(docLuu);
  const [macDinh, setMacDinh] = useState(() => localStorage.getItem(KEY_MAC_DINH) ?? "");
  const [md] = useState<LocLuu | undefined>(() => (compact || sp.get("chip") ? undefined : docLuu().find((x) => x.l === localStorage.getItem(KEY_MAC_DINH))));
  const [chip, setChip] = useState(sp.get("chip") ?? md?.chip ?? (compact ? TAT_CA : CHIP_MAC_DINH));
  const [duyet, setDuyet] = useState<{ row: any; action: string } | null>(null);
  const dem = useQuery({ queryKey: ["eo-dem"], queryFn: () => api.get<Record<string, number>>("/eo/dem"), enabled: !compact });
  // thuong dung: o tim + nhom nhanh + loc / sap tren tieu de cot. It dung (an, bam "Bộ lọc khác"): kho, doi tac, ly do PS cua dong LK.
  const [q, setQ] = useState(md?.q ?? "");
  const [loc, setLoc] = useState<LocCot>(md?.loc ?? {});
  const [sap, setSap] = useState<SapCot>(md?.sap ?? null);
  const [kho, setKho] = useState(md?.kho ?? "");
  const [doiTac, setDoiTac] = useState(md?.doiTac ?? "");
  const [lyDo, setLyDo] = useState(md?.lyDo ?? "");
  const goiY = useGoiYDong();
  const khos = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho"), enabled: !compact });
  const limit = 20;
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [gtLoat, setGtLoat] = useState(false);
  const soItDung = [kho, doiTac, lyDo].filter((x) => x.trim()).length;

  const filterParams = () => {
    const p = new URLSearchParams();
    if (chip && chip !== TAT_CA) p.set("chip", chip);
    if (q.trim()) p.set("q", q.trim());
    if (kho) p.set("kho", kho);
    if (doiTac.trim()) p.set("doi_tac", doiTac.trim());
    if (lyDo.trim()) p.set("ly_do", lyDo.trim());
    if (soCotLoc(loc)) p.set("loc", JSON.stringify(loc));
    if (sap) p.set("sap", `${sap.k}:${sap.tang ? "asc" : "desc"}`);
    return p;
  };
  const params = filterParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const list = useQuery({ queryKey: ["eo-list", params.toString()], queryFn: () => api.get<DsEo>("/eo?" + params.toString()) });

  const qv = useQuickView();
  const rows = list.data?.rows ?? [];

  const cols: Col<EoRow>[] = [
    { key: "eo_code", header: "Mã EO · 3TDO", loc: "chu", render: (r) => <><span className="cell-link">{r.eo_code}</span><div className="muted" style={{ fontSize: 11 }}>{r.approval_code || "chưa ban hành"}</div></> },
    { key: "tieu_de", header: "Tiêu đề", loc: "chu", maxW: 190, render: (r) => r.tieu_de || "—" },
    { key: "loai_hinh", header: "Loại hình", loc: "chon", render: (r) => <TypeBadge loai={r.loai_hinh} /> },
    { key: "phong_ban", header: "Phòng ban", loc: "chon", maxW: 115, render: (r) => r.phong_ban || "" },
    { key: "ma_lk", header: "Mã linh kiện", loc: "chu", maxW: 150, render: (r) => r.ma_lk ? <span title={r.ma_lk}>{r.ma_lk}{r.so_dong > 4 ? ", …" : ""}</span> : <span className="muted">—</span> },
    // v0.086: "Đã ban hành" chi la 1 giai doan -> luong tien trinh gon (moc dang xu ly + so dong + tre); loc / sap van theo trang thai duyet
    { key: "trang_thai", header: "Tiến trình", loc: "chon", nhanChon: (v) => NHAN_MOC[v] ?? v, render: (r) => <TienTrinhPo trangThai={r.trang_thai} xong={r.xong} gd={r.gd} /> },
    {
      // ton: EO da ban hanh con dong chua ve du -> tinh tu ngay ban hanh; EO dang cho duyet -> tinh tu ngay tao
      key: "ton", header: "Tồn", loc: "chon", render: (r) => r.trang_thai === "ISSUED"
        ? (r.so_dong_chua_du > 0 ? <><MocTon tu={r.issued_at} nho /><div className="muted" style={{ fontSize: 11 }}>{r.so_dong_chua_du} dòng chưa đủ</div></> : <span style={{ color: "var(--ok-ink)", fontSize: 12 }}>✓ về đủ</span>)
        : ["IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(r.trang_thai) ? <><MocTon tu={r.created_at} nho /><div className="muted" style={{ fontSize: 11 }}>chờ duyệt</div></> : <span className="muted">—</span>,
    },
    {
      // v0.084: canh bao dieu hanh - so dong DO / VANG + ly do (re chuot); bam -> man Dieu hanh loc PO? (mo popup PO de xem tung dong)
      key: "canh_bao", header: "Cảnh báo", loc: "so", render: (r) => !r.dh ? <span className="muted">—</span> : (
        <span title={[r.dh.ly_do.length ? `Đỏ vì: ${r.dh.ly_do.join("; ")}` : "", `${r.dh.mo} dòng đang mở · quá DK ${r.dh.qua_dk} · chưa có DK ${r.dh.chua_dk} · cấp CEO ${r.dh.ceo}`].filter(Boolean).join("\n")}
          style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {r.dh.do > 0 && <span style={{ background: "#FEE2E2", color: "#DC2626", fontWeight: 800, fontSize: 11, borderRadius: 6, padding: "1px 6px" }}>{r.dh.do} đỏ</span>}
          {r.dh.vang > 0 && <span style={{ background: "#FEF3C7", color: "#B45309", fontWeight: 700, fontSize: 11, borderRadius: 6, padding: "1px 6px" }}>{r.dh.vang} vàng</span>}
          {!r.dh.do && !r.dh.vang && <span style={{ color: "var(--ok-ink)", fontSize: 12 }}>✓ ổn</span>}
          {(r.dh.qua_dk > 0 || r.dh.ceo > 0) && <div className="muted" style={{ fontSize: 10.5, width: "100%" }}>{r.dh.qua_dk ? `quá DK ${r.dh.qua_dk}` : ""}{r.dh.qua_dk && r.dh.ceo ? " · " : ""}{r.dh.ceo ? `CEO ${r.dh.ceo}` : ""}</div>}
        </span>),
    },
    {
      // v0.104: trang thai VI PHAM cua PO (CEO / cho giai trinh / da xu ly / khong) + so vi pham gop - cung cach dem voi man Vi pham
      key: "vi_pham", header: "Vi phạm", loc: "chon", maxW: 170, render: (r) => {
        if (!r.vp) return <span className="muted" title="PO ngoài phạm vi theo dõi vi phạm">—</span>;
        const m = VP_TT[r.vp.tt];
        return (
          <span title={vpTomTat(r.vp) || "Chưa có lỗi"} style={{ display: "inline-block", lineHeight: 1.35 }}>
            <span style={{ background: m.nen, color: m.mau, fontWeight: 800, fontSize: 11.5, borderRadius: 6, padding: r.vp.tt === "KHONG" ? 0 : "1px 6px", whiteSpace: "nowrap" }}>
              {m.l}{r.vp.tt === "CEO" && r.vp.ceo > 1 ? ` · ${r.vp.ceo} dòng` : ""}</span>
            {r.vp.tong > 0 && <div style={{ fontSize: 11, whiteSpace: "nowrap" }}>
              {r.vp.vi_pham > 0 && <b style={{ color: "var(--danger-ink)" }}>{soLuong(r.vp.vi_pham)} vi phạm</b>}
              {r.vp.cho > 0 && <>{r.vp.vi_pham > 0 ? " · " : ""}<b style={{ color: "#C2410C" }}>{soLuong(r.vp.cho)} cần GT</b></>}
              {r.vp.da_gt + r.vp.tu_dong > 0 && <span className="muted">{r.vp.vi_pham + r.vp.cho > 0 ? " · " : ""}{r.vp.da_gt + r.vp.tu_dong} đã xử lý</span>}
            </div>}
          </span>
        );
      },
    },
    {
      key: "thuc", header: "Thúc NCC", loc: "so", align: "right", render: (r) => !r.dh ? <span className="muted">—</span> : (
        <span title={`Push + mail gửi NCC + gọi/Zalo: 7 ngày ${r.dh.thuc7} · tổng ${r.dh.thuc}${r.dh.thuc_luc ? ` · lần cuối ${ngayGio(r.dh.thuc_luc)}` : ""}`}>
          <b style={{ color: r.dh.thuc7 ? "var(--ok-ink)" : "var(--danger-ink)" }}>{r.dh.thuc7}</b><span className="muted"> /7ng</span>
          <div className="muted" style={{ fontSize: 11 }}>{r.dh.thuc_luc ? tuBayGio(r.dh.thuc_luc) : "chưa thúc"}</div></span>),
    },
    {
      key: "im_lang", header: "Hoạt động cuối", loc: "so", maxW: 150, render: (r) => !r.dh ? <span className="muted">—</span> : (
        <span title={r.dh.td_luc ? `${r.dh.td_loai} · ${ten(r.dh.td_ai) || "—"} · ${ngayGio(r.dh.td_luc)}\nIm lặng lâu nhất trong các dòng: ${r.dh.im_lang} ngày` : "Chưa có tác động nào"}>
          <b style={{ color: r.dh.im_lang >= 7 ? "var(--danger-ink)" : r.dh.im_lang >= 3 ? "var(--warn-ink)" : "var(--ok-ink)" }}>Im lặng {r.dh.im_lang} ng</b>
          <div className="muted" style={{ fontSize: 11 }}>{r.dh.td_loai ? `${r.dh.td_loai}${r.dh.td_ai ? ` · ${ten(r.dh.td_ai)}` : ""}` : "chưa tác động"}</div></span>),
    },
    // v0.095: doi tac cua PO (moi dong cung 1 doi tac -> ten; khac nhau -> "Nhieu doi tac") - loc chon nhieu de vd chi PO Karofi
    { key: "doi_tac_po", header: "Đối tác", loc: "chon", maxW: 140, render: (r) => r.doi_tac_po
      ? <span style={{ fontWeight: r.doi_tac_po === "Nhiều đối tác" ? 400 : 700, color: r.doi_tac_po === "Nhiều đối tác" ? "var(--text-muted)" : undefined }}>{r.doi_tac_po}</span> : <span className="muted">—</span> },
    { key: "created_by", header: "Người tạo", loc: "chon", nhanChon: (v) => ten(v), maxW: 110, render: (r) => ten(r.created_by) },
    { key: "created_at", header: "Ngày tạo", loc: "ngay", render: (r) => ngay(r.created_at) },
    { key: "so_dong", header: "Dòng · SL", loc: "so", align: "right", render: (r) => <>{soLuong(r.so_dong)}<div className="muted" style={{ fontSize: 11 }}>{soLuong(r.tong_sl)}</div>{r.so_dong_sau_bh > 0 && <div title="Dòng thêm sau khi EO ban hành" style={{ fontSize: 10.5, color: "var(--orange-ink, #C2410C)" }}>+{r.so_dong_sau_bh} sau BH</div>}</> },
    { key: "issued", header: "Ban hành", loc: "ngay", render: (r) => r.issued_at ? ngay(r.issued_at) : <span className="muted">—</span> },
    {
      key: "pct", header: "% về", loc: "so", align: "right", render: (r) => {
        if (r.trang_thai !== "ISSUED" || !r.tong_sl) return <span className="muted">—</span>;
        const p = Math.round((r.sl_ve / r.tong_sl) * 100);
        return <span title={`Về ${soLuong(r.sl_ve)} / đặt ${soLuong(r.tong_sl)}`} style={{ fontWeight: 700, color: p >= 100 ? "var(--ok-ink)" : p >= 70 ? "var(--warn-ink)" : "var(--danger-ink)" }}>{p}%</span>;
      },
    },
    { key: "final", header: "Người duyệt mua", loc: "chon", nhanChon: (v) => ten(v), maxW: 100, render: (r) => ten(r.final_approver_email) },
    {
      key: "act", header: "", align: "center", render: (r) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <button className="btn ghost sm" title="Xem / thao tác EO" onClick={() => qv.openEo(r.id)}><I.eye width={15} height={15} /></button>
          {r.phieu_cho_toi_id && r.phieu_cho_toi_buoc && actionsFor(r.phieu_cho_toi_buoc).map((a) => (
            <button key={a.key} className={`btn sm ${a.cls || ""}`} title={`${r.phieu_cho_toi_buoc === "FINAL" ? "Duyệt mua" : "Thẩm định"} — ${a.label}`}
              onClick={() => setDuyet({ row: { id: r.phieu_cho_toi_id, eo_code: r.eo_code }, action: a.key })}>{a.label}</button>
          ))}
          {r.so_dong_cho_duyet > 0 && <button className="btn sm" title="Dòng thêm sau ban hành chờ duyệt — mở EO để duyệt / từ chối từng dòng" onClick={() => qv.openEo(r.id)}>{r.so_dong_cho_duyet} dòng chờ duyệt</button>}
        </div>
      ),
    },
  ];

  // v0.084 (yeu cau lanh dao): cot trang thai / canh bao / hanh dong dat sat ma PO - nhin ngay khong can cuon ngang; thong tin phu ra sau
  const THU_TU_COT = ["eo_code", "doi_tac_po", "trang_thai", "vi_pham", "canh_bao", "ton", "pct", "thuc", "im_lang", "tieu_de", "ma_lk", "so_dong", "created_by", "issued", "final", "loai_hinh", "phong_ban", "created_at", "act"];
  cols.sort((a, b) => (THU_TU_COT.indexOf(a.key) + 1 || 99) - (THU_TU_COT.indexOf(b.key) + 1 || 99));

  const datChip = (k: string) => { setChip(k); setOffset(0); };
  const ghiLuu = (ds: LocLuu[]) => { setLuu(ds); localStorage.setItem(KEY_LUU, JSON.stringify(ds)); };
  const luuHienTai = () => {
    const l = prompt("Tên bộ lọc (vd: PO đỏ của tôi, Karofi còn tồn…):")?.trim();
    if (!l) return;
    ghiLuu([...luu.filter((x) => x.l !== l), { l, chip, q, loc, sap, kho, doiTac, lyDo }]);
  };
  const apLuu = (x: LocLuu) => { setChip(x.chip); setQ(x.q); setLoc(x.loc ?? {}); setSap(x.sap ?? null); setKho(x.kho ?? ""); setDoiTac(x.doiTac ?? ""); setLyDo(x.lyDo ?? ""); setOffset(0); };
  const datMacDinh = (l: string) => { const v = macDinh === l ? "" : l; setMacDinh(v); if (v) localStorage.setItem(KEY_MAC_DINH, v); else localStorage.removeItem(KEY_MAC_DINH); };
  const xoaLuu = (l: string) => { ghiLuu(luu.filter((x) => x.l !== l)); if (macDinh === l) datMacDinh(l); };
  const reset = () => { setQ(""); setLoc({}); setSap(null); setKho(""); setDoiTac(""); setLyDo(""); setOffset(0); };

  const doExport = async () => {
    setExporting(true);
    try {
      const exportParams = filterParams();
      exportParams.set("limit", "500");
      const all: EoRow[] = [];
      let off = 0;
      while (true) {
        exportParams.set("offset", String(off));
        const page = await api.get<DsEo>("/eo?" + exportParams.toString());
        all.push(...page.rows);
        if (all.length >= page.total || page.rows.length === 0) break;
        off += 500;
      }
      exportRowsToXlsx(all, EXPORT_COLS, "danh-sach-eo.xlsx");
    } finally {
      setExporting(false);
    }
  };

  // v0.063: thanh thao tac gon 1 dong (uu tien man hinh cho du lieu) - nhom nhanh = o chon, bo loc it dung = bang xo xuong
  const chipDang = CHIP.find((c) => c.k === chip);
  const canhBao = CHIP.filter((c) => c.mau && (dem.data?.[c.k] ?? 0) > 0 && c.k !== chip);
  return (
    <div>
      <FilterBar>
        {!compact && (
          <select className="select tb" style={{ width: 230, borderColor: chip !== CHIP_MAC_DINH ? "var(--brand-yellow-btn)" : undefined, color: chipDang?.mau }}
            value={chip} title={chipDang?.title ?? "Nhóm nhanh"} onChange={(e) => datChip(e.target.value)}>
            {CHIP.map((c) => <option key={c.k} value={c.k} title={c.title}>{c.l} ({soLuong(dem.data?.[c.k] ?? 0)})</option>)}
            <option value={TAT_CA}>Tất cả ({soLuong(dem.data?.tat_ca ?? 0)})</option>
          </select>
        )}
        {!compact && canhBao.map((c) => (
          <button key={c.k} className="btn sm ghost" title={c.title} style={{ color: c.mau, fontWeight: 700, padding: "0 8px" }} onClick={() => datChip(c.k)}>{c.l} ({soLuong(dem.data?.[c.k] ?? 0)})</button>
        ))}
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <I.search width={15} height={15} style={{ position: "absolute", left: 11, top: 9, color: "var(--text-faint)" }} />
          <input className="input tb" style={{ paddingLeft: 32 }} placeholder="Tìm mã EO, 3TDO, tiêu đề, mã / tên linh kiện…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        </div>
        {!compact && (
          <Popover width={300} active={soItDung > 0} title="Bộ lọc ít dùng: kho, đối tác, lý do phát sinh của dòng linh kiện"
            label={<><I.filter width={13} height={13} /> Lọc khác{soItDung ? ` (${soItDung})` : ""}</>}>
            <div style={{ display: "grid", gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>EO có dòng linh kiện:</span>
              {/* chon NHIEU (nguyen tac 2026-11-18) - state van la chuoi noi "|" de bo loc da luu (1 gia tri) cu van dung */}
              <ChonNhieu width="100%" placeholder="Mọi kho" title="Kho" value={tachDs(kho)} onChange={(v) => { setKho(noiDs(v)); setOffset(0); }}
                options={(khos.data ?? []).filter((k: any) => k.active !== 0).map((k: any) => k.ten_kho)} />
              <ChonNhieu width="100%" placeholder="Mọi đối tác" title="Đối tác" value={tachDs(doiTac)} onChange={(v) => { setDoiTac(noiDs(v)); setOffset(0); }}
                options={goiY.data?.doi_tac ?? []} />
              <ChonNhieu width="100%" placeholder="Mọi lý do PS" title="Lý do PS" value={tachDs(lyDo)} onChange={(v) => { setLyDo(noiDs(v)); setOffset(0); }}
                options={goiY.data?.ly_do?.length ? goiY.data.ly_do : LY_DO_CHUAN} />
            </div>
          </Popover>
        )}
        {!compact && (
          <Popover width={320} active={luu.length > 0} title="Bộ lọc cá nhân lưu trên máy này (nhóm nhanh + ô tìm + lọc cột + sắp xếp + lọc khác)"
            label={<>★ Đã lưu{luu.length ? ` (${luu.length})` : ""}</>}>
            <div style={{ display: "grid", gap: 2 }}>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Bộ lọc của bạn — lưu trên máy này. ☆ = mở màn là tự áp.</div>
              {luu.length === 0 && <div className="muted" style={{ fontSize: 12 }}>Chưa có bộ lọc nào.</div>}
              {luu.map((x) => (
                <div key={x.l} style={{ display: "flex", alignItems: "center" }}>
                  <MenuItem onClick={() => apLuu(x)}>{x.l}</MenuItem>
                  <button className="btn ghost sm" title={macDinh === x.l ? "Bỏ mặc định" : "Đặt làm mặc định khi mở Đơn PO"} style={{ color: macDinh === x.l ? "#D97706" : undefined }}
                    onClick={() => datMacDinh(x.l)}>{macDinh === x.l ? "★" : "☆"}</button>
                  <button className="btn ghost sm" title="Xóa bộ lọc đã lưu" onClick={() => xoaLuu(x.l)}><I.x width={12} height={12} /></button>
                </div>
              ))}
              <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={luuHienTai}>＋ Lưu bộ lọc hiện tại</button>
            </div>
          </Popover>
        )}
        {(q || soItDung > 0 || soCotLoc(loc) > 0 || sap) && <RefreshFiltersBtn onClick={reset} />}
        <div style={{ flex: 1 }} />
        {list.data && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}><b style={{ color: "var(--text)" }}>{soLuong(list.data.total)}</b> EO</span>}
        {!compact && <button className="btn sm" onClick={() => setGtLoat(true)}
          title="Giải trình hàng loạt các lỗi cần giải trình (còn hạn) của MỌI PO đang lọc (vd lọc cột Đối tác = Karofi)">✎ Giải trình hàng loạt</button>}
        <button className="btn sm" style={{ padding: "0 9px" }} disabled={exporting} onClick={doExport} title="Xuất Excel các EO đang lọc (Lọc / sắp xếp từng cột: bấm phễu / tiêu đề cột)">
          <I.download width={14} height={14} />{exporting ? " Đang xuất..." : ""}</button>
        {!compact && <NutCongNhiemVu />}
        {actions}
      </FilterBar>

      <DataTable timKiem={false} cols={cols} rows={rows} keyOf={(r) => r.id} onRowClick={(r) => qv.openEo(r.id)} empty="Chưa có EO nào khớp bộ lọc"
        ngoai loc={loc} onLoc={(l) => { setLoc(l); setOffset(0); }} sap={sap} onSap={(s) => { setSap(s); setOffset(0); }}
        tuyChon={list.data?.tuy_chon} tongGoc={list.data?.tong_truoc_loc} tongSauLoc={list.data?.total} />
      {gtLoat && <GiaiTrinhHangLoatModal params={filterParams()} onClose={() => setGtLoat(false)}
        moTa={[chipDang?.l, loc.doi_tac_po?.chon?.length ? `đối tác ${loc.doi_tac_po.chon.join(", ")}` : "", q.trim() ? `tìm "${q.trim()}"` : ""].filter(Boolean).join(" · ")} />}
      {duyet && <ApprovalActionModal act={duyet} onClose={() => setDuyet(null)} onDone={() => { setDuyet(null); ["eo-list", "eo-dem", "inbox-count", "inbox"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }} />}

      {list.data && (
        <Pagination
          total={list.data.total} limit={limit} offset={offset}
          onPage={compact ? () => nav("/eo") : setOffset}
        />
      )}
    </div>
  );
}
