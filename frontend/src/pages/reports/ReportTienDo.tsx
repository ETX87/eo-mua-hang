import { EoLink, PartLink } from "../../components/quickview/QuickView";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { api } from "../../api/client";
import { PageHeader, Card, StatTile, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, ngay, pct } from "../../lib/format";
import { MocTon, mocCua, ngayDat, soNgayTon } from "../../lib/tonDong";
import { exportRowsToXlsx, type ExportCol } from "../../lib/exportXlsx";

const badgeFor = (v: string) => {
  if (v === "Kết thúc") return "issued";
  if (v === "Đơn trên EO bị hủy") return "reject";
  if (v === "Quá dự kiến") return "reject";
  if (v === "Chưa quá dự kiến") return "issued";
  if (v === "Chưa có ngày dự kiến") return "nhap";
  return "review";
};

export default function ReportTienDo() {
  const [kieuXem, setKieuXem] = useState("toan_bo");
  const summary = useQuery({ queryKey: ["td-tomtat"], queryFn: () => api.get<any>("/dashboard/tien-do-tomtat") });
  const rep = useQuery({ queryKey: ["rep-td", kieuXem], queryFn: () => api.get<any>(`/reports/tien-do-don-hang?kieu_xem=${kieuXem}`) });
  const allRows: any[] = rep.data?.rows ?? [];

  const cols: Col<any>[] = [
    { key: "tt", header: "Trạng thái đơn hàng", sticky: true, render: (r) => <span className={`badge ${badgeFor(r.trang_thai_don_hang)}`}>{r.trang_thai_don_hang}</span> },
    { key: "cb", header: "Cảnh báo", render: (r) => r.canh_bao ? <span className={`badge ${badgeFor(r.canh_bao)}`}>{r.canh_bao}</span> : "" },
    // ton: chi dong con mo (chua ve du), tinh tu ngay dat = muon hon (ban hanh, tao dong)
    { key: "ton", header: "Mốc tồn", render: (r) => ["Hàng chưa về", "Chưa đủ hàng"].includes(r.trang_thai_don_hang) ? <MocTon tu={ngayDat(r.ngay_ban_hanh, r.ngay_tao, String(r.phan_loai_thoi_diem_dat).startsWith("Tạo sau"))} nho /> : <span className="muted">—</span> },
    { key: "pc", header: "Mã linh kiện", render: (r) => <PartLink ma={r.part_code} /> },
    { key: "toc", header: "Tốc độ hàng về", width: 130, render: (r) => <span style={{ whiteSpace: "nowrap" }}>{r.toc_do_hang_ve}</span> },
    { key: "mp", header: "Mã phê duyệt (EO)", width: 120, render: (r) => r.eo_id ? <EoLink id={r.eo_id}>{r.ma_phe_duyet || r.eo_code}</EoLink> : (r.ma_phe_duyet || "") },
    { key: "pl", header: "Phân loại thời điểm đặt", width: 150, render: (r) => <span style={{ whiteSpace: "nowrap" }}>{r.phan_loai_thoi_diem_dat}</span> },
    { key: "idlk", header: "ID ĐẶT LK", width: 120, render: (r) => r.id_dat_lk },
    { key: "idtl", header: "ID tài liệu (mã EO)", width: 120, render: (r) => r.id_tai_lieu },
    { key: "lh", header: "Loại hình", width: 150, render: (r) => r.loai_hinh || "" },
    { key: "ld", header: "Lý do PS", maxW: 160, render: (r) => r.ly_do_ps || "" },
    { key: "crm", header: "ID CRM", render: (r) => r.id_crm || "" },
    { key: "idh", header: "ID đặt hàng", render: (r) => r.id_dat_hang || "" },
    { key: "gc", header: "Ghi chú", maxW: 160, render: (r) => r.ghi_chu || "" },
    { key: "kho", header: "Kho", maxW: 150, render: (r) => r.kho },
    { key: "dt", header: "Đối tác", maxW: 120, render: (r) => r.doi_tac || "" },
    { key: "pn", header: "Tên linh kiện", maxW: 200, render: (r) => r.part_name },
    { key: "sl", header: "SL đặt", align: "right", render: (r) => soLuong(r.so_luong_dat) },
    { key: "amis", header: "SL nhập theo AMIS (đúng EO)", align: "right", render: (r) => soLuong(r.sl_nhap_amis_dung_eo) },
    { key: "st", header: "Đối chiếu sai/thừa", align: "right", render: (r) => <span style={{ color: r.doi_chieu_sai_thua < 0 ? "var(--danger)" : undefined }}>{soLuong(r.doi_chieu_sai_thua)}</span> },
    { key: "ct", header: "SL còn thiếu", align: "right", render: (r) => soLuong(r.so_luong_con_thieu) },
    { key: "tg", header: "Thời gian xử lý (ngày)", align: "right", render: (r) => r.thoi_gian_xu_ly_ngay ?? "" },
    { key: "sld", header: "Số lần đổi ngày dự kiến", align: "right", render: (r) => soLuong(r.so_lan_doi_ngay_du_kien) },
    { key: "dkd", header: "Ngày dự kiến lần đầu", render: (r) => ngay(r.ngay_du_kien_lan_dau) },
    { key: "dkg", header: "Ngày dự kiến gần nhất", render: (r) => ngay(r.ngay_du_kien_gan_nhat) },
    { key: "n1", header: "Ngày hàng về (AMIS, theo mã EO)", render: (r) => ngay(r.ngay_nhap_kho_amis_theo_eo) },
    { key: "n2", header: "Ngày hàng về (AMIS, theo kho + mã)", render: (r) => ngay(r.ngay_nhap_kho_amis) },
    { key: "n3", header: "Ngày hàng về (AMIS, toàn quốc)", render: (r) => ngay(r.ngay_nhap_toan_quoc_amis) },
    { key: "ncs", header: "Ngày cập nhật lại SL", render: (r) => ngay(r.ngay_cap_nhat_so_luong) },
    { key: "nt", header: "Ngày tạo", render: (r) => ngay(r.ngay_tao) },
  ];

  const exportCols: ExportCol<any>[] = [
    { header: "Tồn (ngày)", get: (r) => ["Hàng chưa về", "Chưa đủ hàng"].includes(r.trang_thai_don_hang) ? Math.floor(soNgayTon(ngayDat(r.ngay_ban_hanh, r.ngay_tao, String(r.phan_loai_thoi_diem_dat).startsWith("Tạo sau"))) ?? 0) : "" },
    { header: "Mốc tồn", get: (r) => ["Hàng chưa về", "Chưa đủ hàng"].includes(r.trang_thai_don_hang) ? mocCua(soNgayTon(ngayDat(r.ngay_ban_hanh, r.ngay_tao, String(r.phan_loai_thoi_diem_dat).startsWith("Tạo sau"))))?.l ?? "" : "" },
    { header: "Trạng thái đơn hàng", get: (r) => r.trang_thai_don_hang },
    { header: "Cảnh báo", get: (r) => r.canh_bao },
    { header: "Tốc độ hàng về", get: (r) => r.toc_do_hang_ve },
    { header: "Mã phê duyệt (EO)", get: (r) => r.ma_phe_duyet },
    { header: "Phân loại thời điểm đặt", get: (r) => r.phan_loai_thoi_diem_dat },
    { header: "ID ĐẶT LK", get: (r) => r.id_dat_lk },
    { header: "ID tài liệu (mã EO)", get: (r) => r.id_tai_lieu },
    { header: "Loại hình", get: (r) => r.loai_hinh },
    { header: "Lý do PS", get: (r) => r.ly_do_ps },
    { header: "ID CRM", get: (r) => r.id_crm },
    { header: "ID đặt hàng", get: (r) => r.id_dat_hang },
    { header: "Ghi chú", get: (r) => r.ghi_chu },
    { header: "Kho", get: (r) => r.kho },
    { header: "Đối tác", get: (r) => r.doi_tac },
    { header: "Mã linh kiện", get: (r) => r.part_code },
    { header: "Tên linh kiện", get: (r) => r.part_name },
    { header: "SL đặt", get: (r) => r.so_luong_dat },
    { header: "SL nhập theo AMIS (đúng EO)", get: (r) => r.sl_nhap_amis_dung_eo },
    { header: "Đối chiếu sai/thừa", get: (r) => r.doi_chieu_sai_thua },
    { header: "SL còn thiếu", get: (r) => r.so_luong_con_thieu },
    { header: "Thời gian xử lý (ngày)", get: (r) => r.thoi_gian_xu_ly_ngay },
    { header: "Số lần đổi ngày dự kiến", get: (r) => r.so_lan_doi_ngay_du_kien },
    { header: "Ngày dự kiến lần đầu", get: (r) => ngay(r.ngay_du_kien_lan_dau) },
    { header: "Ngày dự kiến gần nhất", get: (r) => ngay(r.ngay_du_kien_gan_nhat) },
    { header: "Ngày hàng về (AMIS, theo mã EO)", get: (r) => ngay(r.ngay_nhap_kho_amis_theo_eo) },
    { header: "Ngày hàng về (AMIS, theo kho + mã)", get: (r) => ngay(r.ngay_nhap_kho_amis) },
    { header: "Ngày hàng về (AMIS, toàn quốc)", get: (r) => ngay(r.ngay_nhap_toan_quoc_amis) },
    { header: "Ngày cập nhật lại SL", get: (r) => ngay(r.ngay_cap_nhat_so_luong) },
    { header: "Ngày tạo", get: (r) => ngay(r.ngay_tao) },
  ];

  return (
    <div>
      <PageHeader title="Báo cáo – Tiến độ đơn hàng" />

      {summary.data && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <StatTile label="Tổng đơn hàng" value={soLuong(summary.data.tong_don_hang)} />
            <StatTile label="Đã hoàn thành" value={soLuong(summary.data.hoan_thanh.so)} sub={`${summary.data.hoan_thanh.pc}%`} tint="#F0FDF4" />
            <StatTile label="Đang giao" value={soLuong(summary.data.dang_giao.so)} sub={`${summary.data.dang_giao.pc}%`} tint="#FFFBEB" />
            <StatTile label="Chậm" value={soLuong(summary.data.cham.so)} sub={`${summary.data.cham.pc}%`} tint="#FEF2F2" />
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={summary.data.chart} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#EEE" vertical={false} />
                <XAxis dataKey="ky" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="hoan_thanh" name="Hoàn thành" stackId="a" fill="#22C55E" />
                <Bar dataKey="dang_giao" name="Đang giao" stackId="a" fill="#F5CC18" />
                <Bar dataKey="cham" name="Chậm" stackId="a" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <select className="select" style={{ width: 170 }} value={kieuXem} onChange={(e) => setKieuXem(e.target.value)}>
            <option value="toan_bo">Xem toàn bộ</option>
            <option value="ton">Chỉ đơn tồn</option>
            <option value="dong">Chỉ đơn đóng</option>
          </select>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => exportRowsToXlsx(allRows, exportCols, "tien-do-don-hang.xlsx")}><I.download width={14} height={14} /> Xuất Excel</button>
        </div>
        {rep.isLoading ? <Spinner /> : (
          <DataTable
            minWidth={3600} pageSize={PAGE_SIZE}
            cols={cols} rows={allRows} keyOf={(_r, i) => i}
            totalRow={["TỔNG", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", `${soLuong(rep.data?.tong?.so_dong ?? 0)} dòng`,
              soLuong(rep.data?.tong?.so_luong_dat), soLuong(rep.data?.tong?.sl_nhap_amis_dung_eo),
              soLuong(rep.data?.tong?.doi_chieu_sai_thua), soLuong(rep.data?.tong?.so_luong_con_thieu),
              "", "", "", "", "", "", "", "", ""]}
          />
        )}
      </Card>
    </div>
  );
}
