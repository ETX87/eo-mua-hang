import { STATUS_META } from "../lib/nav";
import { useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner, Modal, StatusBadge, Popover, MenuItem } from "../components/ui";
import { DataTable, locVaSap, soCotLoc, type Col, type KieuLoc, type LocCot, type SapCot } from "../components/DataTable";
import { EoLink, PartLink, DongLink, useQuickView } from "../components/quickview/QuickView";
import { I } from "../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { MocTon, MOC_TON, mocCua, soNgayTon, khopTim } from "../lib/tonDong";
import { GdBadge, gioTxt } from "../lib/giaiDoan";
import { TienTrinhGon, ceoTxt } from "../components/TienTrinh";
import { BaNgay, ChuGiaiNgay } from "../lib/ngay";
import { TINH_TRANG, NgayHangVeModal, GiaiTrinhModal, LichSuModal, taoPushDoiTac, PushKetQua, LienHeDoiTacModal, type Dong } from "./theodoi/shared";
import { KrfGoiYModal, useGoiYKrf } from "./theodoi/KrfGoiY";
import { BangLoiModal } from "./theodoi/BangLoi";
import { GiaiTrinhDongModal } from "./theodoi/GiaiTrinhPo";
import { KeHoachExcelModal } from "./donhang/KeHoachExcelModal";
import BaoCaoGiaiDoan from "./reports/BaoCaoGiaiDoan";
import ReportTuan from "./reports/ReportTuan";
import ReportLuyKe from "./reports/ReportLuyKe";
import { Kho, khoGon } from "../lib/kho";
import { taiSoDonHang } from "../lib/sdhCache";

/**
 * "LK đặt" (/don-hang, truoc la "Quan ly don hang"): MOI dong linh kien tren EO (moi trang thai) - 1 man cho ca xem lan thao tac.
 * v0.062: mac dinh nhom "Còn chờ hàng"; loc + sap xep kieu Excel tren tieu de MOI cot (LOC_COT); o tren chi con bo loc thuong dung
 * (o tim + nhom nhanh), bo loc it dung an sau "Bộ lọc khác". Bo loc cu trung voi loc cot da bo - van nhan tu link (?gd=, ?ton=...).
 * Gop (v0.050, ../UI_GOP_2_MAN_HINH.md): So don hang + Theo doi linh kien dat + Canh bao CEO + Ke hoach hang ve
 * + Ke hoach tuan (trang con /don-hang/ke-hoach-tuan) + 3 bao cao (tab Bao cao).
 * Chon cot (bo cot mau), bo loc + nhom nhanh co so dem, luu bo loc, 8 giai doan; thao tac dong: ngay NM/DK, giai trinh,
 * lich su, tick -> push doi tac, ngay KRF tu mail, nhap KH Excel. Du lieu: GET /api/so-don-hang (bao cao 0.1 + theo doi, cache).
 */
type Row = Record<string, any>;
interface CotDef { k: string; l: string; nhom: string; get: (r: Row) => string | number | null | undefined; render?: (r: Row) => ReactNode; align?: "right" | "center"; maxW?: number }

const MO = ["Hàng chưa về", "Chưa đủ hàng"];
const ngayDatCua = (r: Row) => (r.sau_ban_hanh ? r.ngay_tao : r.ngay_ban_hanh ?? r.ngay_tao);
const TT = (r: Row) => TINH_TRANG[r.tinh_trang as Dong["tinh_trang"]];
const TT_MAU: Record<string, string> = { "Kết thúc": "issued", "Kết thúc sớm": "issued", "Đơn trên EO bị hủy": "nhap", "Chưa đủ hàng": "final", "Hàng chưa về": "reject", "Chưa ban hành": "nhap" };
function cotDefs(giaiDoan: { k: string; l: string; vai_tro: string }[], sla: Record<string, number>): CotDef[] {
  const gdCols: CotDef[] = giaiDoan.map((g) => ({
    k: `gd_${g.k}`, l: `${g.k} ${g.l} (giờ LV)`, nhom: "Giai đoạn", align: "right",
    get: (r) => r.gd_gio_tung?.[g.k] ?? "",
    render: (r) => {
      const v = r.gd_gio_tung?.[g.k];
      if (v == null) return <span className="muted">—</span>;
      const dang = r.gd_moc?.[g.k] && !r.gd_moc[g.k].kt;
      return <span title={`${g.l} — ${g.vai_tro}${sla[g.k] != null ? ` · hạn ${sla[g.k]} giờ làm việc` : g.k === "G6" ? " · hạn = ngày dự kiến lần đầu" : ""}${dang ? " · đang chạy" : ""}`}
        style={{ color: r.gd_tre_tung?.[g.k] ? "var(--danger-ink)" : undefined, fontWeight: r.gd_tre_tung?.[g.k] ? 700 : 400, fontStyle: dang ? "italic" : undefined }}>{gioTxt(v)}{dang ? "…" : ""}</span>;
    },
  }));
  return [
    // ---- EO
    { k: "ma_phe_duyet", l: "Mã phê duyệt / EO", nhom: "EO", get: (r) => r.ma_phe_duyet || r.eo_code, render: (r) => <><EoLink id={r.eo_id}>{r.ma_phe_duyet || r.eo_code}</EoLink>{r.ma_phe_duyet && <div className="muted" style={{ fontSize: 11 }}>{r.eo_code}</div>}</> },
    { k: "tieu_de", l: "Tiêu đề EO", nhom: "EO", get: (r) => r.tieu_de, maxW: 180 },
    { k: "trang_thai_eo", l: "Trạng thái EO", nhom: "EO", get: (r) => r.trang_thai_eo, render: (r) => <StatusBadge status={r.trang_thai_eo} /> },
    { k: "loai_hinh", l: "Loại hình", nhom: "EO", get: (r) => r.loai_hinh, maxW: 130 },
    { k: "phong_ban", l: "Phòng ban", nhom: "EO", get: (r) => r.phong_ban, maxW: 120 },
    { k: "nguoi_tao", l: "Người tạo EO", nhom: "EO", get: (r) => r.nguoi_tao, render: (r) => ten(r.nguoi_tao) },
    { k: "nguoi_duyet_cuoi", l: "Người duyệt mua", nhom: "EO", get: (r) => r.nguoi_duyet_cuoi, render: (r) => ten(r.nguoi_duyet_cuoi) },
    { k: "ngay_ban_hanh", l: "Ngày ban hành", nhom: "EO", get: (r) => ngay(r.ngay_ban_hanh) },
    // ---- dong linh kien
    { k: "part_code", l: "Mã linh kiện", nhom: "Linh kiện", get: (r) => r.part_code, render: (r) => <><DongLink id={r.item_id} ma={r.part_code} />{r.part_code_goc && <div className="muted" style={{ fontSize: 10.5 }}>thay từ {r.part_code_goc}</div>}</> },
    { k: "part_name", l: "Tên linh kiện", nhom: "Linh kiện", get: (r) => r.part_name, maxW: 200 },
    { k: "kho", l: "Kho", nhom: "Linh kiện", get: (r) => r.kho, render: (r) => <Kho t={r.kho} />, maxW: 150 },
    { k: "doi_tac", l: "Đối tác (NCC)", nhom: "Linh kiện", get: (r) => r.doi_tac, maxW: 120 },
    { k: "so_luong_dat", l: "SL đặt", nhom: "Linh kiện", get: (r) => r.so_luong_dat, render: (r) => soLuong(r.so_luong_dat), align: "right" },
    { k: "don_gia", l: "Đơn giá dự kiến", nhom: "Linh kiện", get: (r) => r.don_gia_du_kien, render: (r) => r.don_gia_du_kien != null ? soLuong(r.don_gia_du_kien) : "", align: "right" },
    { k: "ly_do_ps", l: "Lý do PS", nhom: "Linh kiện", get: (r) => r.ly_do_ps, maxW: 140 },
    { k: "ghi_chu", l: "Ghi chú", nhom: "Linh kiện", get: (r) => r.ghi_chu, maxW: 160 },
    { k: "id_crm", l: "ID CRM", nhom: "Linh kiện", get: (r) => r.id_crm },
    { k: "id_dat_hang", l: "ID đặt hàng", nhom: "Linh kiện", get: (r) => r.id_dat_hang },
    { k: "id_dat_lk", l: "ID dòng", nhom: "Linh kiện", get: (r) => r.id_dat_lk },
    { k: "phan_loai", l: "Thời điểm thêm", nhom: "Linh kiện", get: (r) => r.phan_loai_thoi_diem_dat, maxW: 150 },
    { k: "ngay_tao", l: "Ngày tạo dòng", nhom: "Linh kiện", get: (r) => ngay(r.ngay_tao) },
    // ---- tien do
    { k: "trang_thai_don_hang", l: "Tình trạng đơn", nhom: "Tiến độ", get: (r) => r.trang_thai_don_hang, render: (r) => <span className={`badge ${TT_MAU[r.trang_thai_don_hang] ?? "nhap"}`}>{r.trang_thai_don_hang}</span> },
    { k: "canh_bao", l: "Cảnh báo", nhom: "Tiến độ", get: (r) => r.canh_bao, render: (r) => r.canh_bao ? <span style={{ color: r.canh_bao === "Quá dự kiến" ? "var(--danger-ink)" : undefined, fontSize: 12 }}>{r.canh_bao}</span> : "" },
    { k: "ton", l: "Tồn (từ ngày đặt)", nhom: "Tiến độ", get: (r) => MO.includes(r.trang_thai_don_hang) ? Math.floor(soNgayTon(ngayDatCua(r)) ?? 0) : "", render: (r) => MO.includes(r.trang_thai_don_hang) ? <MocTon tu={ngayDatCua(r)} nho /> : <span className="muted">—</span> },
    { k: "ngay_nm", l: "Ngày NM cam kết", nhom: "Tiến độ", get: (r) => ngay(r.ngay_nm_cam_ket) },
    { k: "dk_dau", l: "Ngày dự kiến lần đầu", nhom: "Tiến độ", get: (r) => ngay(r.ngay_du_kien_lan_dau) },
    { k: "dk_gan_nhat", l: "Ngày dự kiến gần nhất", nhom: "Tiến độ", get: (r) => ngay(r.ngay_du_kien_gan_nhat) },
    { k: "so_lan_doi", l: "Số lần đổi ngày DK", nhom: "Tiến độ", get: (r) => r.so_lan_doi_ngay_du_kien, align: "right" },
    { k: "sl_ve", l: "Đã về (AMIS đúng EO)", nhom: "Tiến độ", get: (r) => r.sl_nhap_amis_dung_eo, render: (r) => soLuong(r.sl_nhap_amis_dung_eo), align: "right" },
    { k: "con_thieu", l: "Còn thiếu", nhom: "Tiến độ", get: (r) => r.so_luong_con_thieu, render: (r) => r.so_luong_con_thieu ? <b>{soLuong(r.so_luong_con_thieu)}</b> : "0", align: "right" },
    { k: "sai_thua", l: "Đối chiếu sai/thừa", nhom: "Tiến độ", get: (r) => r.doi_chieu_sai_thua, align: "right" },
    { k: "ngay_ve_eo", l: "Ngày hàng về (theo EO)", nhom: "Tiến độ", get: (r) => ngay(r.ngay_nhap_kho_amis_theo_eo) },
    { k: "ngay_ve_kho", l: "Ngày hàng về (theo kho + mã)", nhom: "Tiến độ", get: (r) => ngay(r.ngay_nhap_kho_amis) },
    { k: "ngay_ve_tq", l: "Ngày hàng về (toàn quốc)", nhom: "Tiến độ", get: (r) => ngay(r.ngay_nhap_toan_quoc_amis) },
    { k: "toc_do", l: "Tốc độ hàng về", nhom: "Tiến độ", get: (r) => r.toc_do_hang_ve },
    { k: "tg_xu_ly", l: "Thời gian xử lý (ngày)", nhom: "Tiến độ", get: (r) => r.thoi_gian_xu_ly_ngay, align: "right" },
    { k: "dat_ve_thieu", l: "Đặt / Về / Thiếu", nhom: "Tiến độ", align: "right", get: (r) => `${r.so_luong_dat} / ${r.sl_nhap_amis_dung_eo} / ${r.so_luong_con_thieu}`, render: (r) => <span style={{ whiteSpace: "nowrap" }}>{soLuong(r.so_luong_dat)} / {soLuong(r.sl_nhap_amis_dung_eo)} / <b>{soLuong(r.so_luong_con_thieu)}</b></span> },
    { k: "so_loi", l: "Lỗi theo dõi", nhom: "Tiến độ", get: (r) => r.so_loi, render: (r) => r.so_loi ? <span className={`badge ${r.so_loi_cho_gt ? "reject" : "nhap"}`}>{r.so_loi}{r.so_loi_cho_gt ? ` (${r.so_loi_cho_gt} chờ)` : ""}</span> : "", align: "center" },
    // ---- theo doi (quy tac ngay du kien - lib/theoDoi; chi dong EO da ban hanh trong pham vi theo doi)
    { k: "td_tinh_trang", l: "Tình trạng theo dõi", nhom: "Theo dõi", get: (r) => r.tinh_trang ? `${TT(r)?.l ?? r.tinh_trang}${r.ceo_ly_do?.length ? " · Cấp CEO" : ""}` : "",
      render: (r) => r.tinh_trang ? <><span className={`badge ${TT(r)?.c ?? "nhap"}`}>{TT(r)?.l ?? r.tinh_trang}</span>{r.ceo_ly_do?.length > 0 && <span className="badge reject" title={ceoTxt(r.ceo_chi_tiet, r.ceo_ly_do)} style={{ marginLeft: 4 }}>Cấp CEO</span>}</> : <span className="muted">—</span> },
    { k: "ba_ngay", l: "Ngày NM / dự kiến / hàng về", nhom: "Theo dõi", get: (r) => [ngay(r.ngay_nm_cam_ket), ngay(r.ngay_du_kien_gan_nhat), ngay(r.ngay_hang_ve ?? r.ngay_nhap_kho_amis_theo_eo)].join(" | "),
      render: (r) => <span style={{ whiteSpace: "nowrap" }}><BaNgay nm={r.ngay_nm_cam_ket} dk={r.ngay_du_kien_gan_nhat} ve={r.ngay_hang_ve ?? r.ngay_nhap_kho_amis_theo_eo} veDu={!!r.ngay_ve_du} />{r.han_cap_nhat_lai && <div style={{ fontSize: 11, color: "var(--danger)" }}>cập nhật trước {ngayGio(r.han_cap_nhat_lai)}</div>}</span> },
    { k: "han_ndk", l: "Hạn có ngày dự kiến", nhom: "Theo dõi", get: (r) => r.theo_doi ? (r.ap_dung ? ngayGio(r.han_ngay_du_kien) : "không áp dụng quy tắc") : "" },
    { k: "so_lan_lui", l: "Số lần lùi ngày DK", nhom: "Theo dõi", align: "center", get: (r) => r.so_lan_lui || "" },
    { k: "ceo", l: "Lý do cấp CEO (diễn giải)", nhom: "Theo dõi", get: (r) => ceoTxt(r.ceo_chi_tiet, r.ceo_ly_do),
      render: (r) => r.ceo_ly_do?.length ? <div title={ceoTxt(r.ceo_chi_tiet, r.ceo_ly_do)} style={{ color: "var(--danger)", fontSize: 12, minWidth: 200, whiteSpace: "normal" }}>
        {(r.ceo_chi_tiet?.length ? r.ceo_chi_tiet : r.ceo_ly_do.map((x: string) => ({ tieu_de: x, gia_tri: "", nguong: "" }))).map((c: any, i: number) =>
          <div key={i}>• {c.tieu_de}{c.gia_tri ? <>: <b>{c.gia_tri}</b> <span className="muted">({c.nguong})</span></> : null}</div>)}</div> : "" },
    { k: "tien_trinh", l: "Tiến trình 8 giai đoạn", nhom: "Giai đoạn", get: (r) => r.gd_hien_tai_ten ? `${r.gd_hien_tai} ${r.gd_hien_tai_ten}` : "", render: (r) => <TienTrinhGon r={r} soLoi={r.so_loi} loiCho={r.so_loi_cho_gt} /> },
    // ---- giai doan
    { k: "gd_hien_tai", l: "Giai đoạn hiện tại", nhom: "Giai đoạn", get: (r) => r.gd_hien_tai_ten ? `${r.gd_hien_tai} ${r.gd_hien_tai_ten}${r.gd_tre ? " (trễ)" : ""}` : "", render: (r) => <GdBadge r={r} /> },
    { k: "g4_tt", l: "G4 Gửi đơn NCC (mail)", nhom: "Giai đoạn", get: (r) => ({ DA_GUI: "Đã gửi", CHUA_GHI_NHAN: "Chưa ghi nhận mail", TRE: "Trễ" } as any)[r.g4_trang_thai] ?? "", render: (r) => r.g4_trang_thai === "DA_GUI" ? <span className="badge issued">Đã gửi</span> : r.g4_trang_thai === "TRE" ? <span className="badge reject">Chưa thấy mail · trễ</span> : r.g4_trang_thai ? <span className="badge nhap">Chưa ghi nhận</span> : <span className="muted">—</span> },
    ...gdCols,
    { k: "so_lan_tra_ve", l: "Số lần EO bị trả về", nhom: "Giai đoạn", get: (r) => r.so_lan_tra_ve, align: "right" },
  ];
}

/** Loc kieu Excel tung cot (DataTable): kieu + gia tri tho (ngay ISO, so) - mac dinh gia tri = get. Cot khong co o day: chi sap xep. */
type LocMot = { loc: KieuLoc; gt?: (r: Row) => unknown; gtSap?: (r: Row) => unknown; nhan?: (v: string) => string };
const ST = (v: string) => STATUS_META[v]?.label ?? v;
const LOC_COT: Record<string, LocMot> = {
  ma_phe_duyet: { loc: "chu", gt: (r) => `${r.ma_phe_duyet ?? ""} ${r.eo_code ?? ""}` }, tieu_de: { loc: "chu" },
  trang_thai_eo: { loc: "chon", nhan: ST }, loai_hinh: { loc: "chon" }, phong_ban: { loc: "chon" },
  nguoi_tao: { loc: "chon", nhan: (v) => ten(v) }, nguoi_duyet_cuoi: { loc: "chon", nhan: (v) => ten(v) },
  ngay_ban_hanh: { loc: "ngay", gt: (r) => r.ngay_ban_hanh },
  part_code: { loc: "chu", gt: (r) => `${r.part_code ?? ""} ${r.part_code_goc ?? ""}` }, part_name: { loc: "chu" },
  kho: { loc: "chon", nhan: (v) => (khoGon(v) !== v ? `${khoGon(v)} — ${v}` : v) }, doi_tac: { loc: "chon" }, so_luong_dat: { loc: "so" }, don_gia: { loc: "so" },
  ly_do_ps: { loc: "chon" }, ghi_chu: { loc: "chu" }, id_crm: { loc: "chu" }, id_dat_hang: { loc: "chu" }, id_dat_lk: { loc: "chu" },
  phan_loai: { loc: "chon" }, ngay_tao: { loc: "ngay", gt: (r) => r.ngay_tao },
  trang_thai_don_hang: { loc: "chon" }, canh_bao: { loc: "chon" },
  ton: { loc: "chon", gt: (r) => (MO.includes(r.trang_thai_don_hang) ? mocCua(soNgayTon(ngayDatCua(r)))?.l ?? "" : ""),
    gtSap: (r) => (MO.includes(r.trang_thai_don_hang) ? soNgayTon(ngayDatCua(r)) : null) },
  ngay_nm: { loc: "ngay", gt: (r) => r.ngay_nm_cam_ket }, dk_dau: { loc: "ngay", gt: (r) => r.ngay_du_kien_lan_dau },
  dk_gan_nhat: { loc: "ngay", gt: (r) => r.ngay_du_kien_gan_nhat }, so_lan_doi: { loc: "so" }, sl_ve: { loc: "so" }, con_thieu: { loc: "so" },
  sai_thua: { loc: "so" }, ngay_ve_eo: { loc: "ngay", gt: (r) => r.ngay_nhap_kho_amis_theo_eo }, ngay_ve_kho: { loc: "ngay", gt: (r) => r.ngay_nhap_kho_amis },
  ngay_ve_tq: { loc: "ngay", gt: (r) => r.ngay_nhap_toan_quoc_amis }, toc_do: { loc: "chon" }, tg_xu_ly: { loc: "so" },
  dat_ve_thieu: { loc: "so", gt: (r) => r.so_luong_con_thieu }, so_loi: { loc: "so" },
  td_tinh_trang: { loc: "chon" }, ba_ngay: { loc: "ngay", gt: (r) => r.ngay_du_kien_gan_nhat }, han_ndk: { loc: "ngay", gt: (r) => r.han_ngay_du_kien },
  so_lan_lui: { loc: "so", gt: (r) => r.so_lan_lui ?? 0 }, ceo: { loc: "chu" },
  tien_trinh: { loc: "chon" }, gd_hien_tai: { loc: "chon" }, g4_tt: { loc: "chon" }, so_lan_tra_ve: { loc: "so" },
};
const locCua = (k: string): LocMot | undefined => (k.startsWith("gd_G") ? { loc: "so" as KieuLoc, gt: (r: Row) => r.gd_gio_tung?.[k.slice(3)] } : LOC_COT[k]);

const BO_COT: Record<string, { l: string; cot: string[] }> = {
  co_ban: { l: "Cơ bản", cot: ["ma_phe_duyet", "part_code", "part_name", "kho", "doi_tac", "so_luong_dat", "sl_ve", "con_thieu", "trang_thai_don_hang", "gd_hien_tai", "ton", "dk_gan_nhat"] },
  tien_do: { l: "Tiến độ", cot: ["ma_phe_duyet", "part_code", "kho", "so_luong_dat", "sl_ve", "con_thieu", "trang_thai_don_hang", "canh_bao", "ton", "ngay_nm", "dk_dau", "dk_gan_nhat", "so_lan_doi", "ngay_ve_eo", "toc_do", "so_loi"] },
  theo_doi: { l: "Theo dõi (KH cung ứng)", cot: ["ma_phe_duyet", "part_code", "kho", "doi_tac", "dat_ve_thieu", "ton", "ba_ngay", "han_ndk", "so_lan_lui", "so_loi", "td_tinh_trang", "gd_hien_tai"] },
  ceo: { l: "Cấp CEO", cot: ["ma_phe_duyet", "nguoi_tao", "part_code", "kho", "doi_tac", "dat_ve_thieu", "ba_ngay", "ton", "so_lan_lui", "so_loi", "ceo", "td_tinh_trang"] },
  giai_doan: { l: "Giai đoạn", cot: ["ma_phe_duyet", "part_code", "kho", "gd_hien_tai", "g4_tt", "gd_G1", "gd_G2", "gd_G3", "gd_G4", "gd_G5", "gd_G6", "gd_G7", "gd_G8", "so_lan_tra_ve", "ton"] },
};

interface Loc {
  q: string; ngayTheo: string; tu: string; den: string; trangThaiEo: string; tinhTrang: string; gd: string; tre: string; ton: string;
  kho: string; doiTac: string; lyDo: string; maLk: string; loaiHinh: string; phongBan: string; nguoiTao: string; sauBh: string; coLoi: string; canhBao: string;
  g4: string; // G4 song song (mail gui NCC): "da" | "chua" | "tre"
  nhom: string; // nhom nhanh (NHOM) - thay 7 nhom cua man Theo doi cu + Canh bao CEO + lich Ke hoach hang ve
  apDung: string; // "1" = chi dong EO ap dung quy tac theo doi
}
const LOC_TRONG: Loc = { q: "", ngayTheo: "ngay_ban_hanh", tu: "", den: "", trangThaiEo: "", tinhTrang: "", gd: "", tre: "", ton: "", kho: "", doiTac: "", lyDo: "", maLk: "", loaiHinh: "", phongBan: "", nguoiTao: "", sauBh: "", coLoi: "", canhBao: "", g4: "", nhom: "", apDung: "" };
/** Loc an (nhan tu link Tong quan / bao cao / Viec can xu ly: ?gd= ?ton= ?tinhTrang=...) - hien "Lọc từ liên kết: … ×". */
const LOC_LIEN_KET: Record<string, (v: string) => string> = {
  tinhTrang: (v) => `Tình trạng: ${v === "__mo" ? "đang mở" : v}`, gd: (v) => `Giai đoạn ${v}`, ton: (v) => `Tồn ${MOC_TON.find((m) => m.k === v)?.l ?? v}`,
  g4: (v) => `G4 mail: ${({ da: "đã gửi", chua: "chưa ghi nhận", tre: "trễ" } as any)[v] ?? v}`, canhBao: (v) => v, kho: (v) => `Kho ${v}`,
  doiTac: (v) => `NCC ${v}`, lyDo: (v) => `Lý do ${v}`, maLk: (v) => `Mã LK ${v}`, loaiHinh: (v) => v, phongBan: (v) => v,
  nguoiTao: (v) => `Người tạo ${ten(v)}`, trangThaiEo: (v) => ST(v), sauBh: (v) => (v === "sau" ? "Thêm sau BH" : "Tạo trước BH"),
  coLoi: (v) => (v === "cho" ? "Lỗi chờ giải trình" : "Có lỗi theo dõi"),
};
/** Tuan Thu 2 - Chu nhat chua ngay hom nay (+lech tuan), gio VN: [tu, den] dang YYYY-MM-DD. */
function tuan(lech: number): [string, string] {
  const d = new Date(Date.now() + 7 * 3600_000);
  const t2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + lech * 7));
  const cn = new Date(t2.getTime() + 6 * 86400_000);
  return [t2.toISOString().slice(0, 10), cn.toISOString().slice(0, 10)];
}
const veTrongTuan = (r: Row, lech: number) => { const [a, b] = tuan(lech); const v = String(r.ngay_du_kien_gan_nhat ?? "").slice(0, 10); return MO.includes(r.trang_thai_don_hang) && !!v && v >= a && v <= b; };
/** Nhom nhanh co so dem (bam = loc). Nhom theo doi chi gom dong EO da ban hanh trong pham vi theo doi (r.tinh_trang != null). */
const NHOM: { k: string; l: string; f: (r: Row) => boolean; mau?: string; title?: string }[] = [
  { k: "con_cho", l: "Còn chờ hàng", title: "Đơn đã ban hành, hàng chưa về hoặc về chưa đủ (nhóm mặc định)", f: (r) => MO.includes(r.trang_thai_don_hang) },
  { k: "can_xl", l: "Cần xử lý", mau: "#DC2626", title: "Dòng áp dụng quy tắc: cần nhập ngày dự kiến, quá ngày dự kiến hoặc có lỗi chờ giải trình (= Việc cần xử lý)",
    f: (r) => r.ap_dung && (["CHO_NDK", "TRE_NDK", "QUA_HAN_NDK"].includes(r.tinh_trang) || r.so_loi_cho_gt > 0) },
  { k: "TRE_NDK", l: "Trễ hạn chưa có ngày DK", title: "Quá 24h (Karofi / Livotec / Korihome) hoặc 48h làm việc (hãng khác) sau ban hành mà chưa có ngày dự kiến", f: (r) => r.tinh_trang === "TRE_NDK" },
  { k: "CHO_NDK", l: "Chờ ngày DK (24h/48h)", f: (r) => r.tinh_trang === "CHO_NDK" },
  { k: "QUA_HAN_NDK", l: "Quá ngày dự kiến", f: (r) => r.tinh_trang === "QUA_HAN_NDK" },
  { k: "CO_LOI", l: "Lỗi chờ giải trình", f: (r) => r.so_loi_cho_gt > 0 },
  { k: "CEO", l: "Cấp CEO", mau: "#DC2626", title: "Lùi ngày dự kiến ≥ 3 lần / ngày DK cách ngày đặt ≥ 30 ngày / ≥ 3 lỗi", f: (r) => (r.ceo_ly_do ?? []).length > 0 },
  { k: "CHO_HANG", l: "Có ngày DK, chờ hàng", f: (r) => r.tinh_trang === "CHO_HANG" },
  { k: "VE_TUAN", l: "Dự kiến về tuần này", title: "Đơn còn thiếu có ngày dự kiến gần nhất trong tuần này (Thứ 2 – Chủ nhật)", f: (r) => veTrongTuan(r, 0) },
  { k: "VE_TUAN_SAU", l: "Dự kiến về tuần sau", f: (r) => veTrongTuan(r, 1) },
];
const KEY_COT = "sdh-cot", KEY_LOC = "sdh-loc-luu", KEY_XEM = "sdh-xem";
/** 3 che do xem (2026-11-08): tung dong · nhom theo PO (EO) · nhom theo ma linh kien. Luu localStorage. */
type CheDoXem = "" | "po" | "lk";
const COT_AN_KHI_NHOM: Record<string, string[]> = { po: ["ma_phe_duyet", "tieu_de"], lk: ["part_code", "part_name"] };
const maPo = (r: Row) => r.ma_phe_duyet || r.eo_code;
const TRANG = 20; // so dong / trang (xem theo nhom: nhom tron ven ~20 dong)
const NHOM_MAC_DINH = "con_cho";

/** Remount theo query string: link noi bo (Tong quan, bao cao, Viec can xu ly) doi ?nhom= / ?gd= ... -> ap bo loc moi. */
export default function DonHang() {
  const loc = useLocation();
  return <DonHangTrang key={loc.search} />;
}

const BAO_CAO = [
  { k: "giai-doan", l: "Giai đoạn đơn hàng" },
  { k: "tien-do-tuan", l: "Tiến độ tuần (KH KRF)" },
  { k: "luy-ke-nam", l: "Lũy kế năm" },
];

function DonHangTrang() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const tab = sp.get("tab") === "bao-cao" ? "bao-cao" : "ds";
  const bc = BAO_CAO.some((b) => b.k === sp.get("bc")) ? sp.get("bc")! : "giai-doan";
  // Danh sach / Bao cao = 2 muc con duoi "LK đặt" o sidebar (lib/nav.ts) - trang khong con nut chuyen tab rieng
  return (
    <div>
      <PageHeader title={tab === "ds" ? "LK đặt" : "LK đặt · Báo cáo"} />
      {tab === "ds" ? <DanhSach /> : (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {BAO_CAO.map((b) => <button key={b.k} className={`qv-chip ${bc === b.k ? "on" : ""}`} onClick={() => nav(`/don-hang?tab=bao-cao&bc=${b.k}`)}>{b.l}</button>)}
          </div>
          {bc === "giai-doan" ? <BaoCaoGiaiDoan nhung /> : bc === "tien-do-tuan" ? <ReportTuan nhung /> : <ReportLuyKe nhung />}
        </div>
      )}
    </div>
  );
}

function DanhSach() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const qv = useQuickView();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const q = useQuery({ queryKey: ["so-don-hang"], queryFn: taiSoDonHang });
  const [loc, setLoc] = useState<Loc>(() => {
    const tuUrl: Record<string, string> = Object.fromEntries([...sp.entries()].filter(([k]) => k in LOC_TRONG));
    if (tuUrl.nhom === "tat_ca") tuUrl.nhom = ""; // link cu cua man Theo doi
    // vao man khong kem bo loc -> mac dinh nhom "Còn chờ hàng"; link co bo loc (?gd=, ?ton=...) -> giu dung bo loc do
    return { ...LOC_TRONG, nhom: Object.keys(tuUrl).length ? "" : NHOM_MAC_DINH, ...tuUrl };
  });
  // loc + sap xep tren tieu de cot (kieu Excel) - luu cung bo loc da luu
  const [locCot, setLocCot] = useState<LocCot>({});
  const [sap, setSap] = useState<SapCot>(null);
  // thao tac dong (tu man Theo doi cu)
  const [modal, setModal] = useState<{ loai: "ndk" | "gt" | "ls"; dong: Dong } | null>(null);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [pushKq, setPushKq] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [hop, setHop] = useState<"" | "krf" | "kh" | "loi">("");
  const krf = useGoiYKrf();
  const refresh = () => ["so-don-hang", "theo-doi", "tl-dong", "inbox-count", "dash-quan-ly"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const [cot, setCot] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(KEY_COT) ?? "null") ?? BO_COT.co_ban.cot; } catch { return BO_COT.co_ban.cot; } });
  const [luu, setLuu] = useState<{ l: string; loc: Loc; locCot?: LocCot; sap?: SapCot }[]>(() => { try { return JSON.parse(localStorage.getItem(KEY_LOC) ?? "[]"); } catch { return []; } });
  const [chonCot, setChonCot] = useState(false);
  const [xem, setXemS] = useState<CheDoXem>(() => (["po", "lk"].includes(localStorage.getItem(KEY_XEM) ?? "") ? localStorage.getItem(KEY_XEM) as CheDoXem : ""));
  const setXem = (v: CheDoXem) => { setXemS(v); localStorage.setItem(KEY_XEM, v); };
  const [gtChung, setGtChung] = useState(false);

  const all = q.data?.rows ?? [];
  const defs = useMemo(() => cotDefs(q.data?.giai_doan ?? [], q.data?.sla ?? {}), [q.data]);
  const set = (p: Partial<Loc>) => setLoc((l) => ({ ...l, ...p }));
  const datCot = (c: string[]) => { setCot(c); localStorage.setItem(KEY_COT, JSON.stringify(c)); };

  // base = moi bo loc tru nhom nhanh (de dem so tren tung nhom); rows = base + nhom dang chon
  const base = useMemo(() => {
    const k = khopTim(loc.q);
    return all.filter((r) => {
      if (loc.tu || loc.den) {
        const v = String((loc.ngayTheo === "ngay_dat" ? ngayDatCua(r) : r[loc.ngayTheo]) ?? "").slice(0, 10);
        if (!v || (loc.tu && v < loc.tu) || (loc.den && v > loc.den)) return false;
      }
      if (loc.trangThaiEo && r.trang_thai_eo !== loc.trangThaiEo) return false;
      if (loc.tinhTrang && (loc.tinhTrang === "__mo" ? !MO.includes(r.trang_thai_don_hang) : r.trang_thai_don_hang !== loc.tinhTrang)) return false;
      if (loc.gd && r.gd_hien_tai !== loc.gd) return false;
      if (loc.tre && (loc.tre === "tre" ? !r.gd_tre : r.gd_tre !== false)) return false;
      // moc ton: cung pham vi & ngay dat voi Theo doi / Bang dieu khien (dong trong pham vi theo doi, bat_dau) -> so khop Tong quan
      if (loc.ton && (!r.theo_doi || !MO.includes(r.trang_thai_don_hang) || mocCua(soNgayTon(r.bat_dau ?? ngayDatCua(r)))?.k !== loc.ton)) return false;
      if (loc.apDung && !r.ap_dung) return false;
      if (loc.kho && r.kho !== loc.kho) return false;
      if (loc.doiTac && r.doi_tac !== loc.doiTac) return false;
      if (loc.lyDo && r.ly_do_ps !== loc.lyDo) return false;
      if (loc.maLk) { const m = loc.maLk.trim().toUpperCase(); if (![r.part_code, r.part_code_goc].some((x) => String(x ?? "").toUpperCase().includes(m))) return false; }
      if (loc.loaiHinh && r.loai_hinh !== loc.loaiHinh) return false;
      if (loc.phongBan && r.phong_ban !== loc.phongBan) return false;
      if (loc.nguoiTao && r.nguoi_tao !== loc.nguoiTao) return false;
      if (loc.sauBh && (loc.sauBh === "sau") !== !!r.sau_ban_hanh) return false;
      if (loc.coLoi && (loc.coLoi === "cho" ? !r.so_loi_cho_gt : !r.so_loi)) return false;
      if (loc.canhBao && r.canh_bao !== loc.canhBao) return false;
      if (loc.g4 && (loc.g4 === "da" ? r.g4_trang_thai !== "DA_GUI" : loc.g4 === "tre" ? r.g4_trang_thai !== "TRE" : !["CHUA_GHI_NHAN", "TRE"].includes(r.g4_trang_thai) || ["XONG", "HUY"].includes(r.gd_hien_tai))) return false;
      return k({ ...r, gd_moc: undefined, gd_gio_tung: undefined, gd_tre_tung: undefined });
    });
  }, [all, loc]);
  const nhomDang = NHOM.find((n) => n.k === loc.nhom);
  const rowsNhom = useMemo(() => (nhomDang ? base.filter(nhomDang.f) : base), [base, nhomDang]);
  const hien = cot.map((k) => defs.find((d) => d.k === k)).filter(Boolean) as CotDef[];
  // cot du lieu (khong gom cot Thao tac) kem loc / sap kieu Excel -> rows = sau loc cot (xuat Excel, chon tat ca, tong)
  const colsDl: Col<Row>[] = hien.map((d) => {
    const lc = locCua(d.k);
    return { key: d.k, header: d.l, align: d.align, maxW: d.maxW, render: d.render ?? ((r: Row) => d.get(r) ?? ""),
      loc: lc?.loc, gt: lc?.gt ?? d.get, gtSap: lc?.gtSap, nhanChon: lc?.nhan };
  });
  const rows = useMemo(() => locVaSap(rowsNhom, colsDl, locCot, sap), [rowsNhom, colsDl, locCot, sap]); // eslint-disable-line react-hooks/exhaustive-deps
  // tick dong: dong trong pham vi theo doi -> push doi tac (chi dong con mo) + giai trinh chung (1 / nhieu dong / ca nhom)
  const pushDuoc = (r: Row) => r.theo_doi && r.tinh_trang !== "DONG";
  const chonDuocF = (r: Row) => !!r.theo_doi;
  const chonDuoc = rows.filter(chonDuocF);
  const tatCaChon = chonDuoc.length > 0 && chonDuoc.every((r) => chon.has(r.item_id));
  const dongChon = useMemo(() => all.filter((r) => chon.has(r.item_id)), [all, chon]);
  const idPush = dongChon.filter(pushDuoc).map((r) => r.item_id);
  const doiChon = (ids: number[], bat: boolean) => setChon((s) => { const n = new Set(s); ids.forEach((id) => (bat ? n.add(id) : n.delete(id))); return n; });
  const [lh, setLh] = useState<number[] | null>(null); // ghi nhan nhac doi tac (goi dien / tin nhan)
  const taoPush = async () => {
    if (!idPush.length) return alert("Các dòng đã chọn đều đã đóng — không còn gì để push.");
    if (!confirm(`Tạo file push đối tác cho ${idPush.length} dòng còn mở? (mỗi đối tác 1 file + tiêu đề mail chuẩn)`)) return;
    setBusy(true);
    try {
      setPushKq(await taoPushDoiTac(idPush));
      setChon(new Set());
      refresh();
    } catch (e: any) {
      alert(e?.body?.error === "READ_ONLY" ? "Bạn không có quyền push một số dòng đã chọn." : "Lỗi tạo push.");
    } finally { setBusy(false); }
  };

  const cols: Col<Row>[] = [
    {
      key: "act", header: <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" title="Chọn mọi dòng đang lọc (push đối tác / giải trình chung)" checked={tatCaChon} disabled={!chonDuoc.length}
          onChange={() => setChon(tatCaChon ? new Set() : new Set(chonDuoc.map((r) => r.item_id)))} /> Thao tác</span>,
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 2, alignItems: "center", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" disabled={!chonDuocF(r)} title={chonDuocF(r) ? "Chọn để push đối tác / giải trình chung" : "Chỉ dòng EO đã ban hành trong phạm vi theo dõi"} checked={chon.has(r.item_id)}
            onChange={() => setChon((s) => { const n = new Set(s); if (n.has(r.item_id)) n.delete(r.item_id); else n.add(r.item_id); return n; })} />
          <button className="btn ghost sm" title="Xem đơn hàng: tiến trình giai đoạn, thời gian, lỗi, kế hoạch, lịch sử" onClick={() => qv.openDong(r.item_id)}><I.eye width={14} height={14} /></button>
          {r.trang_thai_eo === "ISSUED" && <>
            <button className="btn ghost sm" title="Ngày nhà máy cam kết · dự kiến · hàng về (cập nhật)" onClick={() => setModal({ loai: "ndk", dong: r as Dong })}><I.calendar width={14} height={14} /></button>
            {r.theo_doi && <button className="btn ghost sm" title="Giải trình lỗi (Ai + Lỗi gì + ảnh)" onClick={() => setModal({ loai: "gt", dong: r as Dong })}><I.edit width={14} height={14} /></button>}
            {r.theo_doi && <button className="btn ghost sm" title="Lịch sử theo dõi (lỗi, giải trình, push, mail, ngày DK)" onClick={() => setModal({ loai: "ls", dong: r as Dong })}><I.clock width={14} height={14} /></button>}
          </>}
        </span>
      ),
    },
    // xem theo nhom: an cot da nam o tieu de nhom (van loc theo cot do neu dang loc)
    ...colsDl.filter((c) => !(COT_AN_KHI_NHOM[xem] ?? []).includes(c.key)),
  ];
  const lienKet = Object.keys(LOC_LIEN_KET).filter((k) => (loc as any)[k]);
  const soItDung = ["tu", "den", "tre", "apDung"].filter((k) => (loc as any)[k]).length;
  const soLoc = Object.entries(loc).filter(([k, v]) => v && k !== "ngayTheo" && k !== "nhom").length + soCotLoc(locCot) + (loc.nhom && loc.nhom !== NHOM_MAC_DINH ? 1 : 0);
  const tong = (f: (r: Row) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const demGd = (k: string) => rows.filter((r) => r.gd_hien_tai === k).length;
  const luuLoc = () => {
    const l = prompt("Tên bộ lọc (vd: KRF quá hạn của kho 6803):");
    if (!l?.trim()) return;
    const moi = [...luu.filter((x) => x.l !== l.trim()), { l: l.trim(), loc, locCot, sap }];
    setLuu(moi); localStorage.setItem(KEY_LOC, JSON.stringify(moi));
  };
  const xoaLuu = (l: string) => { const moi = luu.filter((x) => x.l !== l); setLuu(moi); localStorage.setItem(KEY_LOC, JSON.stringify(moi)); };
  const xuat = () => exportRowsToXlsx(rows, hien.map((d) => ({ header: d.l, get: d.get })), "LK_dat.xlsx", "LK dat");
  const xoaHet = () => { setLoc({ ...LOC_TRONG, nhom: NHOM_MAC_DINH }); setLocCot({}); setSap(null); };

  const S = ({ v, onChange, children, w = 160, title }: { v: string; onChange: (v: string) => void; children: ReactNode; w?: number; title?: string }) => (
    <select className="select tb" style={{ width: w, borderColor: v ? "var(--brand-yellow-btn)" : undefined }} value={v} title={title} onChange={(e) => onChange(e.target.value)}>{children}</select>
  );

  // tieu de nhom: o tick ca nhom (giai trinh chung / push) + ma + so dong + tong Dat / Ve / Thieu + canh bao
  const dauNhom = (k: string, ds: Row[]) => {
    const r0 = ds[0];
    const duoc = ds.filter(chonDuocF).map((r) => r.item_id);
    const soChon = duoc.filter((id) => chon.has(id)).length;
    const sum = (f: (r: Row) => number) => ds.reduce((s, r) => s + (f(r) || 0), 0);
    const loiCho = sum((r) => r.so_loi_cho_gt), ceo = ds.filter((r) => (r.ceo_ly_do ?? []).length > 0).length;
    const quaDk = ds.filter((r) => r.tinh_trang === "QUA_HAN_NDK" || r.tinh_trang === "TRE_NDK").length;
    return <>
      <input type="checkbox" disabled={!duoc.length} checked={duoc.length > 0 && soChon === duoc.length} title="Chọn cả nhóm (push đối tác / giải trình chung)"
        ref={(el) => { if (el) el.indeterminate = soChon > 0 && soChon < duoc.length; }}
        onClick={(e) => e.stopPropagation()} onChange={() => doiChon(duoc, soChon < duoc.length)} />
      {xem === "po"
        ? <><b onClick={(e) => e.stopPropagation()}><EoLink id={r0.eo_id}>{maPo(r0)}</EoLink></b>{r0.ma_phe_duyet && <span className="muted" style={{ fontSize: 11 }}>{r0.eo_code}</span>}
            <span className="muted">(×{ds.length})</span><span style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r0.tieu_de}>{r0.tieu_de}</span></>
        : <><b onClick={(e) => e.stopPropagation()}><PartLink ma={k} /></b><span style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r0.part_name}>{r0.part_name}</span>
            <span className="muted">(×{ds.length} · {new Set(ds.map((r) => r.eo_id)).size} PO)</span></>}
      <span className="muted" style={{ whiteSpace: "nowrap" }}>· Đặt <b style={{ color: "var(--text)" }}>{soLuong(sum((r) => r.so_luong_dat))}</b> · về {soLuong(sum((r) => Math.min(r.sl_nhap_amis_dung_eo, r.so_luong_dat)))} · thiếu <b style={{ color: "var(--text)" }}>{soLuong(sum((r) => r.so_luong_con_thieu))}</b></span>
      {quaDk > 0 && <span className="badge reject" title="Dòng trễ hạn chưa có ngày DK / quá ngày dự kiến">{quaDk} trễ / quá DK</span>}
      {loiCho > 0 && <span className="badge reject" title="Lỗi chờ giải trình">{loiCho} lỗi chờ GT</span>}
      {ceo > 0 && <span className="badge reject" title="Dòng cấp CEO">{ceo} cấp CEO</span>}
      {soChon > 0 && <span className="badge issued">đã chọn {soChon}</span>}
    </>;
  };
  const nhomCfg = xem ? { khoa: (r: Row) => (xem === "po" ? String(r.eo_id) : String(r.part_code)), dau: dauNhom } : undefined;
  const soKrf = krf.data?.goi_y.length ?? 0;
  const giaiDoan = (q.data?.giai_doan ?? []).filter((g) => !["G4", "G7"].includes(g.k));
  const iconBtn = { padding: "0 9px" };

  // v0.063: thanh thao tac gon 1 dong - nhom nhanh / giai doan = o chon; bo loc it dung + bo loc da luu, cong cu, chu giai = bang xo xuong
  return (
    <div>
      <Card>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <S v={loc.nhom} onChange={(v) => set({ nhom: v })} w={215} title="Nhóm nhanh (số dòng mỗi nhóm theo bộ lọc hiện tại)">
            <option value="">Tất cả ({soLuong(base.length)})</option>
            {NHOM.map((n) => <option key={n.k} value={n.k} title={n.title}>{n.l} ({soLuong(base.filter(n.f).length)})</option>)}
          </S>
          <S v={xem} onChange={(v) => setXem(v as CheDoXem)} w={150} title="Cách xem: từng dòng linh kiện / nhóm theo PO (EO) / nhóm theo mã linh kiện">
            <option value="">Xem: từng dòng</option><option value="po">Xem: nhóm theo PO</option><option value="lk">Xem: nhóm theo LK</option>
          </S>
          <S v={loc.gd} onChange={(v) => set({ gd: v })} w={190} title="Đang ở giai đoạn">
            <option value="">Mọi giai đoạn</option>
            {giaiDoan.map((g) => { const n = loc.gd ? 0 : demGd(g.k); return <option key={g.k} value={g.k}>{g.k} {g.l}{n ? ` (${soLuong(n)})` : ""}</option>; })}
          </S>
          <input className="input tb" style={{ flex: "1 1 200px", maxWidth: 320 }} placeholder="🔍 Tìm mã EO / 3TDO / mã-tên LK / CRM / ghi chú…" value={loc.q} onChange={(e) => set({ q: e.target.value })} />
          <Popover width={360} active={soItDung > 0} title="Bộ lọc ít dùng: khoảng ngày, đúng / trễ hạn giai đoạn, EO áp dụng quy tắc, đơn của tôi · bộ lọc đã lưu"
            label={<><I.filter width={13} height={13} /> Lọc khác{soItDung ? ` (${soItDung})` : ""}</>}>
            {(dong) => (
              <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
                <S v={loc.ngayTheo} onChange={(v) => set({ ngayTheo: v })} w={338} title="Lọc khoảng ngày theo"><option value="ngay_ban_hanh">Khoảng ngày theo ngày ban hành</option><option value="ngay_dat">Khoảng ngày theo ngày đặt</option><option value="ngay_tao">Khoảng ngày theo ngày tạo dòng</option><option value="ngay_du_kien_gan_nhat">Khoảng ngày theo ngày dự kiến</option><option value="ngay_nhap_kho_amis_theo_eo">Khoảng ngày theo ngày hàng về</option></S>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input className="input tb" type="date" style={{ flex: 1 }} value={loc.tu} onChange={(e) => set({ tu: e.target.value })} title="Từ ngày" />
                  <span className="muted">→</span>
                  <input className="input tb" type="date" style={{ flex: 1 }} value={loc.den} onChange={(e) => set({ den: e.target.value })} title="Đến ngày" />
                </div>
                <S v={loc.tre} onChange={(v) => set({ tre: v })} w={338} title="Đúng / trễ hạn ở giai đoạn hiện tại"><option value="">Đúng & trễ hạn giai đoạn</option><option value="tre">Trễ hạn giai đoạn</option><option value="dung">Đúng hạn giai đoạn</option></S>
                <S v={loc.apDung} onChange={(v) => set({ apDung: v })} w={338} title="EO ban hành từ ngày áp dụng quy tắc theo dõi"><option value="">Mọi EO</option><option value="1">Chỉ EO áp dụng quy tắc theo dõi</option></S>
                {me.data?.email && <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={loc.nguoiTao === me.data.email} onChange={() => set({ nguoiTao: loc.nguoiTao === me.data.email ? "" : me.data.email })} /> Chỉ đơn tôi đặt</label>}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Bộ lọc đã lưu (trên máy này)</div>
                  {luu.length === 0 && <div className="muted" style={{ fontSize: 12 }}>Chưa có.</div>}
                  {luu.map((x) => (
                    <div key={x.l} style={{ display: "flex", alignItems: "center" }}>
                      <MenuItem onClick={() => { setLoc(x.loc); setLocCot(x.locCot ?? {}); setSap(x.sap ?? null); dong(); }}>★ {x.l}</MenuItem>
                      <button className="btn ghost sm" title="Xóa bộ lọc đã lưu" onClick={() => xoaLuu(x.l)}><I.x width={12} height={12} /></button>
                    </div>
                  ))}
                  <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={luuLoc} disabled={!soLoc}>＋ Lưu bộ lọc hiện tại</button>
                </div>
              </div>
            )}
          </Popover>
          {lienKet.filter((k) => k !== "gd").map((k) => (
            <span key={k} className="qv-chip on" style={{ display: "inline-flex", gap: 4 }} title="Bộ lọc mở từ liên kết (Tổng quan, báo cáo…)">
              {LOC_LIEN_KET[k]((loc as any)[k])}<span role="button" style={{ cursor: "pointer" }} onClick={() => set({ [k]: "" } as any)}>×</span></span>
          ))}
          {soLoc > 0 && <button className="btn sm ghost" style={{ color: "var(--text-muted)" }} onClick={xoaHet} title="Xóa mọi bộ lọc (về nhóm Còn chờ hàng)"><I.refresh width={13} height={13} /> Xóa lọc</button>}
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}
            title={`SL đặt ${soLuong(tong((r) => r.so_luong_dat))} · về ${soLuong(tong((r) => Math.min(r.sl_nhap_amis_dung_eo, r.so_luong_dat)))} · thiếu ${soLuong(tong((r) => r.so_luong_con_thieu))}`}>
            <b style={{ color: "var(--text)" }}>{soLuong(rows.length)}</b> dòng · thiếu {soLuong(tong((r) => r.so_luong_con_thieu))}</span>
          {chon.size > 0 && <>
            <span className="qv-chip on" style={{ display: "inline-flex", gap: 4 }}>Đã chọn {soLuong(chon.size)}<span role="button" title="Bỏ chọn tất cả" style={{ cursor: "pointer" }} onClick={() => setChon(new Set())}>×</span></span>
            <button className="btn sm primary" onClick={() => setGtChung(true)} title="1 nội dung giải trình cho mọi dòng đã chọn (cùng nguyên nhân)"><I.edit width={14} height={14} /> Giải trình chung</button>
            <button className="btn sm" disabled={busy || !idPush.length} onClick={taoPush} title="Mỗi đối tác 1 file + tiêu đề mail chuẩn (chỉ dòng còn mở)"><I.send width={14} height={14} /> Push ({idPush.length})</button>
            <button className="btn sm" disabled={!idPush.length} onClick={() => setLh(idPush)} title="Đã nhắc đối tác bằng gọi điện / Zalo / tin nhắn (không mail) — tính như đã push (R3)">📞 Đã nhắc đối tác ({idPush.length})</button>
          </>}
          <Popover align="right" width={290} title="Công cụ: push đối tác, ngày KRF từ mail, kế hoạch hàng về…"
            label={<><I.dots width={14} height={14} /> Công cụ{soKrf > 0 && <span style={{ background: "#EF4444", color: "#fff", borderRadius: 999, fontSize: 10.5, fontWeight: 800, padding: "0 6px", marginLeft: 2 }} title="Gợi ý ngày KRF từ mail">{soKrf}</span>}</>}>
            {(dong) => <>
              <MenuItem icon={<I.send width={14} height={14} />} disabled={!idPush.length || busy} onClick={() => { dong(); taoPush(); }} title="Tick các dòng còn mở ở cột Thao tác rồi bấm — mỗi đối tác 1 file + tiêu đề mail chuẩn">Tạo file push đối tác ({idPush.length})</MenuItem>
              <MenuItem icon={<I.calendar width={14} height={14} />} onClick={() => { dong(); setHop("krf"); }} title="Ngày KRF đáp ứng đọc từ mail Karofi trả lời (hộp thư theodoimuahang) — gợi ý cập nhật ngày nhà máy cam kết"
                right={soKrf > 0 ? <b style={{ color: "var(--danger-ink)" }}>{soLuong(soKrf)}</b> : <span className="muted">0</span>}>Ngày KRF từ mail</MenuItem>
              <MenuItem icon={<I.upload width={14} height={14} />} onClick={() => { dong(); setHop("kh"); }} title="Tải file Excel kế hoạch hàng về, điền ngày rồi nhập lại cho nhiều dòng">Kế hoạch hàng về (Excel)</MenuItem>
              <MenuItem icon={<I.calendar width={14} height={14} />} onClick={() => nav("/don-hang/ke-hoach-tuan")} title="Đơn kế hoạch tháng KRF — nhập SL về theo từng tuần">Kế hoạch tuần KRF</MenuItem>
              {me.data?.vai_tro === "Admin" && <MenuItem icon={<I.tag width={14} height={14} />} onClick={() => { dong(); setHop("loi"); }}>Bảng lỗi</MenuItem>}
            </>}
          </Popover>
          <button className="btn sm" style={iconBtn} title={`Chọn cột hiển thị (${hien.length} cột)`} onClick={() => setChonCot(true)}><I.grid width={14} height={14} /></button>
          <button className="btn sm" style={iconBtn} title={`Xuất Excel ${soLuong(rows.length)} dòng đang lọc (đúng các cột đang hiện)`} onClick={xuat}><I.download width={14} height={14} /></button>
          <Popover align="right" width={560} btnClass="btn sm ghost" title="Chú giải 3 loại ngày + quy tắc theo dõi" label={<I.help width={15} height={15} />}>
            <ChuGiaiNgay gon />
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Quy tắc theo dõi (EO ban hành từ ngày áp dụng, tới khi hàng về ĐỦ theo AMIS): có ngày dự kiến trong 24h làm việc (Karofi / Livotec / Korihome, dòng từ 08/11/2026) hoặc 48h (hãng khác) · thứ 2/thứ 4 push đối tác dòng chưa có ngày DK ·
              quá ngày DK phải nhập ngày mới trong 24h — vi phạm tự ghi lỗi, phải giải trình. Cấp CEO: lùi ≥ 3 lần / ngày DK cách ngày đặt ≥ 30 ngày / ≥ 3 lỗi.
              {q.data?.danh_gia_luc && ` Kiểm tra lỗi lần cuối ${ngayGio(q.data.danh_gia_luc)}.`}
              <div style={{ marginTop: 6 }}>Lọc / sắp xếp từng cột: bấm biểu tượng phễu / tiêu đề cột.</div>
            </div>
          </Popover>
        </div>
        {q.isLoading ? <Spinner /> : (
          <DataTable timKiem={false} cols={cols} rows={rows} keyOf={(r) => r.item_id} pageSize={TRANG} nhom={nhomCfg} onRowClick={(r) => qv.openDong(r.item_id)} empty="Không có dòng nào khớp bộ lọc"
            ngoai rowsGoc={rowsNhom} loc={locCot} onLoc={setLocCot} sap={sap} onSap={setSap} />
        )}
      </Card>

      {modal?.loai === "ndk" && <NgayHangVeModal dong={modal.dong} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.loai === "gt" && <GiaiTrinhModal dong={modal.dong} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.loai === "ls" && <LichSuModal dong={modal.dong} onClose={() => setModal(null)} />}
      {gtChung && <GiaiTrinhDongModal dongs={dongChon.map((r) => ({ item_id: r.item_id, eo_id: r.eo_id, ma_po: maPo(r), part_code: r.part_code, part_name: r.part_name }))}
        onClose={() => setGtChung(false)}
        onSaved={(kq) => { setGtChung(false); setChon(new Set()); refresh(); alert(`Đã giải trình chung: ${kq.so_loi} lỗi trên ${kq.so_dong} dòng (${kq.so_po} PO).`); }} />}
      {pushKq && <PushKetQua dot={pushKq} onClose={() => setPushKq(null)} />}
      {lh && <LienHeDoiTacModal ids={lh} nhan={`${lh.length} dòng đã chọn`} onClose={() => setLh(null)}
        onSaved={(kq) => { setLh(null); setChon(new Set()); refresh(); alert(`Đã ghi nhận nhắc đối tác cho ${kq.so_dong} dòng${kq.bo_loi_r3 ? ` — bỏ ${kq.bo_loi_r3} lỗi R3 (không push) của kỳ đó` : ""}.`); }} />}
      {hop === "krf" && <KrfGoiYModal onClose={() => setHop("")} onSaved={refresh} onMoDong={(d) => { setHop(""); setModal({ loai: "ndk", dong: d }); }} />}
      {hop === "kh" && <KeHoachExcelModal onClose={() => setHop("")} onDone={refresh} />}
      {hop === "loi" && <BangLoiModal onClose={() => setHop("")} />}

      {chonCot && (
        <Modal title="Chọn cột hiển thị" onClose={() => setChonCot(false)} width={860} footer={<button className="btn primary" onClick={() => setChonCot(false)}>Xong</button>}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Bộ cột mẫu:</span>
            {Object.entries(BO_COT).map(([k, b]) => <button key={k} className="btn sm" onClick={() => datCot(b.cot)}>{b.l}</button>)}
            <button className="btn sm ghost" onClick={() => datCot(defs.map((d) => d.k))}>Tất cả ({defs.length})</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
            {["EO", "Linh kiện", "Tiến độ", "Theo dõi", "Giai đoạn"].map((nh) => (
              <div key={nh}>
                <b style={{ fontSize: 13 }}>{nh}</b>
                {defs.filter((d) => d.nhom === nh).map((d) => (
                  <label key={d.k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, padding: "2px 0" }}>
                    <input type="checkbox" checked={cot.includes(d.k)} onChange={(e) => datCot(e.target.checked ? [...cot, d.k] : cot.filter((x) => x !== d.k))} /> {d.l}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Lựa chọn được ghi nhớ trên máy này. Xuất Excel lấy đúng các cột đang hiện, theo thứ tự chọn.</div>
        </Modal>
      )}
    </div>
  );
}
