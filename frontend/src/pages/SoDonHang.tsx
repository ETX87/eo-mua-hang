import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner, Modal, StatusBadge } from "../components/ui";
import { DataTable, type Col } from "../components/DataTable";
import { EoLink, PartLink } from "../components/quickview/QuickView";
import { I } from "../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { MocTon, MOC_TON, mocCua, soNgayTon, khopTim } from "../lib/tonDong";
import { GdBadge, gioTxt } from "../lib/giaiDoan";

/**
 * "So don hang": moi dong linh kien tren EO (moi trang thai) - thay man Bao cao Tien do don hang.
 * Chon cot (luu theo nguoi dung, 3 bo cot mau), bo loc day du, bo loc luu san / tu luu, 8 giai doan (backend lib/giaiDoan),
 * xuat Excel dung bo loc + cot dang hien. Du lieu: GET /api/so-don-hang (cache).
 */
type Row = Record<string, any>;
interface CotDef { k: string; l: string; nhom: string; get: (r: Row) => string | number | null | undefined; render?: (r: Row) => ReactNode; align?: "right" | "center"; maxW?: number }

const MO = ["Hàng chưa về", "Chưa đủ hàng"];
const ngayDatCua = (r: Row) => (r.sau_ban_hanh ? r.ngay_tao : r.ngay_ban_hanh ?? r.ngay_tao);
const TT_MAU: Record<string, string> = { "Kết thúc": "issued", "Đơn trên EO bị hủy": "nhap", "Chưa đủ hàng": "final", "Hàng chưa về": "reject", "Chưa ban hành": "nhap" };
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
    { k: "nguoi_duyet_cuoi", l: "Người duyệt cuối", nhom: "EO", get: (r) => r.nguoi_duyet_cuoi, render: (r) => ten(r.nguoi_duyet_cuoi) },
    { k: "ngay_ban_hanh", l: "Ngày ban hành", nhom: "EO", get: (r) => ngay(r.ngay_ban_hanh) },
    // ---- dong linh kien
    { k: "part_code", l: "Mã linh kiện", nhom: "Linh kiện", get: (r) => r.part_code, render: (r) => <><PartLink ma={r.part_code} />{r.part_code_goc && <div className="muted" style={{ fontSize: 10.5 }}>thay từ {r.part_code_goc}</div>}</> },
    { k: "part_name", l: "Tên linh kiện", nhom: "Linh kiện", get: (r) => r.part_name, maxW: 200 },
    { k: "kho", l: "Kho", nhom: "Linh kiện", get: (r) => r.kho, maxW: 150 },
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
    { k: "so_loi", l: "Lỗi theo dõi", nhom: "Tiến độ", get: (r) => r.so_loi, render: (r) => r.so_loi ? <span className={`badge ${r.so_loi_cho_gt ? "reject" : "nhap"}`}>{r.so_loi}{r.so_loi_cho_gt ? ` (${r.so_loi_cho_gt} chờ)` : ""}</span> : "", align: "center" },
    // ---- giai doan
    { k: "gd_hien_tai", l: "Giai đoạn hiện tại", nhom: "Giai đoạn", get: (r) => r.gd_hien_tai_ten ? `${r.gd_hien_tai} ${r.gd_hien_tai_ten}${r.gd_tre ? " (trễ)" : ""}` : "", render: (r) => <GdBadge r={r} /> },
    { k: "g4_tt", l: "G4 Gửi đơn NCC (mail)", nhom: "Giai đoạn", get: (r) => ({ DA_GUI: "Đã gửi", CHUA_GHI_NHAN: "Chưa ghi nhận mail", TRE: "Trễ" } as any)[r.g4_trang_thai] ?? "", render: (r) => r.g4_trang_thai === "DA_GUI" ? <span className="badge issued">Đã gửi</span> : r.g4_trang_thai === "TRE" ? <span className="badge reject">Chưa thấy mail · trễ</span> : r.g4_trang_thai ? <span className="badge nhap">Chưa ghi nhận</span> : <span className="muted">—</span> },
    ...gdCols,
    { k: "so_lan_tra_ve", l: "Số lần EO bị trả về", nhom: "Giai đoạn", get: (r) => r.so_lan_tra_ve, align: "right" },
  ];
}

const BO_COT: Record<string, { l: string; cot: string[] }> = {
  co_ban: { l: "Cơ bản", cot: ["ma_phe_duyet", "part_code", "part_name", "kho", "doi_tac", "so_luong_dat", "sl_ve", "con_thieu", "trang_thai_don_hang", "gd_hien_tai", "ton", "dk_gan_nhat"] },
  tien_do: { l: "Tiến độ", cot: ["ma_phe_duyet", "part_code", "kho", "so_luong_dat", "sl_ve", "con_thieu", "trang_thai_don_hang", "canh_bao", "ton", "ngay_nm", "dk_dau", "dk_gan_nhat", "so_lan_doi", "ngay_ve_eo", "toc_do", "so_loi"] },
  giai_doan: { l: "Giai đoạn", cot: ["ma_phe_duyet", "part_code", "kho", "gd_hien_tai", "g4_tt", "gd_G1", "gd_G2", "gd_G3", "gd_G4", "gd_G5", "gd_G6", "gd_G7", "gd_G8", "so_lan_tra_ve", "ton"] },
};

interface Loc {
  q: string; ngayTheo: string; tu: string; den: string; trangThaiEo: string; tinhTrang: string; gd: string; tre: string; ton: string;
  kho: string; doiTac: string; loaiHinh: string; phongBan: string; nguoiTao: string; sauBh: string; coLoi: string; canhBao: string;
}
const LOC_TRONG: Loc = { q: "", ngayTheo: "ngay_ban_hanh", tu: "", den: "", trangThaiEo: "", tinhTrang: "", gd: "", tre: "", ton: "", kho: "", doiTac: "", loaiHinh: "", phongBan: "", nguoiTao: "", sauBh: "", coLoi: "", canhBao: "" };
const LOC_MAU: { l: string; loc: Partial<Loc> }[] = [
  { l: "Đang mở (chưa về đủ)", loc: { tinhTrang: "__mo" } },
  { l: "Trễ hạn ở giai đoạn hiện tại", loc: { tinhTrang: "__mo", tre: "tre" } },
  { l: "Chưa có ngày dự kiến", loc: { canhBao: "Chưa có ngày dự kiến" } },
  { l: "Quá ngày dự kiến", loc: { canhBao: "Quá dự kiến" } },
  { l: "Hàng chưa về (=0)", loc: { tinhTrang: "Hàng chưa về" } },
  { l: "Tồn trên 30 ngày", loc: { tinhTrang: "__mo", ton: "gt30" } },
  { l: "Thêm sau ban hành", loc: { sauBh: "sau" } },
];
const KEY_COT = "sdh-cot", KEY_LOC = "sdh-loc-luu";

export default function SoDonHang() {
  const [sp] = useSearchParams();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const q = useQuery({ queryKey: ["so-don-hang"], queryFn: () => api.get<{ giai_doan: any[]; sla: Record<string, number>; rows: Row[] }>("/so-don-hang") });
  const [loc, setLoc] = useState<Loc>(() => ({ ...LOC_TRONG, ...Object.fromEntries([...sp.entries()].filter(([k]) => k in LOC_TRONG)) }));
  const [cot, setCot] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(KEY_COT) ?? "null") ?? BO_COT.co_ban.cot; } catch { return BO_COT.co_ban.cot; } });
  const [luu, setLuu] = useState<{ l: string; loc: Loc }[]>(() => { try { return JSON.parse(localStorage.getItem(KEY_LOC) ?? "[]"); } catch { return []; } });
  const [chonCot, setChonCot] = useState(false);
  const [moRong, setMoRong] = useState(false);

  const all = q.data?.rows ?? [];
  const defs = useMemo(() => cotDefs(q.data?.giai_doan ?? [], q.data?.sla ?? {}), [q.data]);
  const set = (p: Partial<Loc>) => setLoc((l) => ({ ...l, ...p }));
  const datCot = (c: string[]) => { setCot(c); localStorage.setItem(KEY_COT, JSON.stringify(c)); };
  const uniq = (f: (r: Row) => any) => [...new Set(all.map(f).filter(Boolean) as string[])].sort((a, b) => String(a).localeCompare(String(b)));

  const rows = useMemo(() => {
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
      if (loc.ton && (!MO.includes(r.trang_thai_don_hang) || mocCua(soNgayTon(ngayDatCua(r)))?.k !== loc.ton)) return false;
      if (loc.kho && r.kho !== loc.kho) return false;
      if (loc.doiTac && r.doi_tac !== loc.doiTac) return false;
      if (loc.loaiHinh && r.loai_hinh !== loc.loaiHinh) return false;
      if (loc.phongBan && r.phong_ban !== loc.phongBan) return false;
      if (loc.nguoiTao && r.nguoi_tao !== loc.nguoiTao) return false;
      if (loc.sauBh && (loc.sauBh === "sau") !== !!r.sau_ban_hanh) return false;
      if (loc.coLoi && (loc.coLoi === "cho" ? !r.so_loi_cho_gt : !r.so_loi)) return false;
      if (loc.canhBao && r.canh_bao !== loc.canhBao) return false;
      return k({ ...r, gd_moc: undefined, gd_gio_tung: undefined, gd_tre_tung: undefined });
    });
  }, [all, loc]);

  const hien = cot.map((k) => defs.find((d) => d.k === k)).filter(Boolean) as CotDef[];
  const cols: Col<Row>[] = [
    { key: "act", header: "", render: (r) => <EoLink id={r.eo_id}><I.eye width={14} height={14} /></EoLink> },
    ...hien.map((d) => ({ key: d.k, header: d.l, align: d.align, maxW: d.maxW, render: d.render ?? ((r: Row) => d.get(r) ?? "") })),
  ];
  const soLoc = Object.entries(loc).filter(([k, v]) => v && k !== "ngayTheo").length;
  const tong = (f: (r: Row) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const demGd = (k: string) => rows.filter((r) => r.gd_hien_tai === k).length;
  const luuLoc = () => {
    const l = prompt("Tên bộ lọc (vd: KRF quá hạn của kho 6803):");
    if (!l?.trim()) return;
    const moi = [...luu.filter((x) => x.l !== l.trim()), { l: l.trim(), loc }];
    setLuu(moi); localStorage.setItem(KEY_LOC, JSON.stringify(moi));
  };
  const xoaLuu = (l: string) => { const moi = luu.filter((x) => x.l !== l); setLuu(moi); localStorage.setItem(KEY_LOC, JSON.stringify(moi)); };
  const xuat = () => exportRowsToXlsx(rows, hien.map((d) => ({ header: d.l, get: d.get })), "So_don_hang.xlsx", "So don hang");

  const S = ({ v, onChange, children, w = 160, title }: { v: string; onChange: (v: string) => void; children: ReactNode; w?: number; title?: string }) => (
    <select className="select" style={{ width: w, height: 32, fontSize: 12.5, borderColor: v ? "var(--brand-yellow-btn)" : undefined }} value={v} title={title} onChange={(e) => onChange(e.target.value)}>{children}</select>
  );

  return (
    <div>
      <PageHeader title="Sổ đơn hàng" />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" style={{ width: 300, height: 32 }} placeholder="🔍 Tìm mã EO / 3TDO / mã-tên LK / CRM / ghi chú… (không dấu)" value={loc.q} onChange={(e) => set({ q: e.target.value })} />
          <S v={loc.tinhTrang} onChange={(v) => set({ tinhTrang: v })} w={150} title="Tình trạng đơn"><option value="">Mọi tình trạng</option><option value="__mo">Đang mở (chưa về đủ)</option>{["Hàng chưa về", "Chưa đủ hàng", "Kết thúc", "Chưa ban hành", "Đơn trên EO bị hủy"].map((x) => <option key={x}>{x}</option>)}</S>
          <S v={loc.gd} onChange={(v) => set({ gd: v })} w={190} title="Giai đoạn hiện tại"><option value="">Mọi giai đoạn</option>{(q.data?.giai_doan ?? []).filter((g) => !["G4", "G7"].includes(g.k)).map((g) => <option key={g.k} value={g.k}>{g.k} · {g.l}</option>)}<option value="XONG">Hoàn tất</option><option value="HUY">Đã hủy</option></S>
          <S v={loc.tre} onChange={(v) => set({ tre: v })} w={130} title="Đúng / trễ hạn ở giai đoạn hiện tại"><option value="">Đúng & trễ hạn</option><option value="tre">Trễ hạn</option><option value="dung">Đúng hạn</option></S>
          <S v={loc.kho} onChange={(v) => set({ kho: v })} w={170}><option value="">Mọi kho</option>{uniq((r) => r.kho).map((x) => <option key={x}>{x}</option>)}</S>
          <S v={loc.doiTac} onChange={(v) => set({ doiTac: v })} w={140}><option value="">Mọi NCC</option>{uniq((r) => r.doi_tac).map((x) => <option key={x}>{x}</option>)}</S>
          <button className="btn sm ghost" onClick={() => setMoRong((x) => !x)}>{moRong ? "Thu gọn bộ lọc" : "Thêm bộ lọc"}{soLoc ? ` (${soLoc} đang lọc)` : ""}</button>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setChonCot(true)}><I.grid width={14} height={14} /> Chọn cột ({hien.length})</button>
          <button className="btn sm" onClick={xuat}><I.download width={14} height={14} /> Xuất Excel ({soLuong(rows.length)})</button>
        </div>
        {moRong && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            <S v={loc.ngayTheo} onChange={(v) => set({ ngayTheo: v })} w={170} title="Lọc khoảng ngày theo"><option value="ngay_ban_hanh">Theo ngày ban hành</option><option value="ngay_dat">Theo ngày đặt</option><option value="ngay_tao">Theo ngày tạo dòng</option><option value="ngay_du_kien_gan_nhat">Theo ngày dự kiến</option><option value="ngay_nhap_kho_amis_theo_eo">Theo ngày hàng về</option></S>
            <input className="input" type="date" style={{ width: 140, height: 32 }} value={loc.tu} onChange={(e) => set({ tu: e.target.value })} title="Từ ngày" />
            <span className="muted">→</span>
            <input className="input" type="date" style={{ width: 140, height: 32 }} value={loc.den} onChange={(e) => set({ den: e.target.value })} title="Đến ngày" />
            <S v={loc.ton} onChange={(v) => set({ ton: v })} w={140}><option value="">Mọi mốc tồn</option>{MOC_TON.map((m) => <option key={m.k} value={m.k}>Tồn {m.l}</option>)}</S>
            <S v={loc.trangThaiEo} onChange={(v) => set({ trangThaiEo: v })} w={150}><option value="">Mọi trạng thái EO</option>{[["DRAFT", "Nháp"], ["IN_REVIEW", "Đang thẩm định"], ["WAITING_FINAL_APPROVAL", "Chờ duyệt cuối"], ["ISSUED", "Đã ban hành"], ["REJECTED", "Từ chối"], ["CANCELLED", "Đã hủy"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</S>
            <S v={loc.canhBao} onChange={(v) => set({ canhBao: v })} w={160}><option value="">Mọi cảnh báo</option>{["Chưa có ngày dự kiến", "Quá dự kiến", "Chưa quá dự kiến"].map((x) => <option key={x}>{x}</option>)}</S>
            <S v={loc.loaiHinh} onChange={(v) => set({ loaiHinh: v })} w={170}><option value="">Mọi loại hình</option>{uniq((r) => r.loai_hinh).map((x) => <option key={x}>{x}</option>)}</S>
            <S v={loc.phongBan} onChange={(v) => set({ phongBan: v })} w={160}><option value="">Mọi phòng ban</option>{uniq((r) => r.phong_ban).map((x) => <option key={x}>{x}</option>)}</S>
            <S v={loc.nguoiTao} onChange={(v) => set({ nguoiTao: v })} w={160}><option value="">Mọi người tạo</option>{uniq((r) => r.nguoi_tao).map((x) => <option key={x} value={x}>{ten(x)}</option>)}</S>
            <S v={loc.sauBh} onChange={(v) => set({ sauBh: v })} w={150}><option value="">Trước & sau BH</option><option value="truoc">Tạo trước ban hành</option><option value="sau">Thêm sau ban hành</option></S>
            <S v={loc.coLoi} onChange={(v) => set({ coLoi: v })} w={140}><option value="">Có / không lỗi</option><option value="co">Có lỗi theo dõi</option><option value="cho">Lỗi chờ giải trình</option></S>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 12 }}>
          <span className="muted">Bộ lọc nhanh:</span>
          {LOC_MAU.map((m) => <button key={m.l} className="qv-chip" onClick={() => setLoc({ ...LOC_TRONG, ...m.loc })}>{m.l}</button>)}
          {me.data?.email && <button className="qv-chip" onClick={() => setLoc({ ...LOC_TRONG, nguoiTao: me.data.email })}>EO của tôi</button>}
          {luu.map((x) => <span key={x.l} className="qv-chip on" style={{ display: "inline-flex", gap: 4 }}><span onClick={() => setLoc(x.loc)} style={{ cursor: "pointer" }}>★ {x.l}</span><span title="Xóa bộ lọc đã lưu" style={{ cursor: "pointer" }} onClick={() => xoaLuu(x.l)}>×</span></span>)}
          <button className="btn sm ghost" onClick={luuLoc} disabled={!soLoc}>＋ Lưu bộ lọc hiện tại</button>
          {soLoc > 0 && <button className="btn sm ghost" onClick={() => setLoc(LOC_TRONG)}>Xóa lọc</button>}
        </div>
      </Card>

      {q.isLoading ? <Spinner /> : (
        <Card>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10, fontSize: 12.5 }}>
            <b>{soLuong(rows.length)} dòng</b>
            <span className="muted">SL đặt {soLuong(tong((r) => r.so_luong_dat))} · về {soLuong(tong((r) => Math.min(r.sl_nhap_amis_dung_eo, r.so_luong_dat)))} · thiếu {soLuong(tong((r) => r.so_luong_con_thieu))}</span>
            <span className="muted" style={{ marginLeft: 8 }}>Đang ở giai đoạn:</span>
            {(q.data?.giai_doan ?? []).filter((g) => !["G4", "G7"].includes(g.k)).map((g) => {
              const n = demGd(g.k);
              return n ? <button key={g.k} className={`qv-chip ${loc.gd === g.k ? "on" : ""}`} title={`${g.l} — ${g.vai_tro}`} onClick={() => set({ gd: loc.gd === g.k ? "" : g.k })}>{g.k} {g.l}: <b>{soLuong(n)}</b></button> : null;
            })}
          </div>
          <DataTable timKiem={false} cols={cols} rows={rows} keyOf={(r) => r.item_id} pageSize={50} empty="Không có dòng nào khớp bộ lọc" />
        </Card>
      )}

      {chonCot && (
        <Modal title="Chọn cột hiển thị" onClose={() => setChonCot(false)} width={860} footer={<button className="btn primary" onClick={() => setChonCot(false)}>Xong</button>}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>Bộ cột mẫu:</span>
            {Object.entries(BO_COT).map(([k, b]) => <button key={k} className="btn sm" onClick={() => datCot(b.cot)}>{b.l}</button>)}
            <button className="btn sm ghost" onClick={() => datCot(defs.map((d) => d.k))}>Tất cả ({defs.length})</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            {["EO", "Linh kiện", "Tiến độ", "Giai đoạn"].map((nh) => (
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
