import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { exportRowsToXlsx } from "../../lib/exportXlsx";
import { type Dong, TINH_TRANG, timKhongDau, LichSuModal, GiaiTrinhModal } from "./shared";

/** "Cảnh báo CEO": dong dang mo thoa 1 trong 3 dieu kien (lui >= 3 lan / ngay DK - ngay dat >= 30 ngay / >= 3 loi). */
export default function CanhBaoCeo() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["theo-doi-ceo"], queryFn: () => api.get<{ rows: Dong[] }>("/theo-doi/ceo") });
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ loai: "ls" | "gt"; dong: Dong } | null>(null);
  const rows = (q.data?.rows ?? []).filter((r) => timKhongDau(r, search));
  const dem = (s: string) => rows.filter((r) => r.ceo_ly_do.some((x) => x.includes(s))).length;
  return (
    <div>
      <PageHeader title="Cảnh báo CEO" actions={
        <button className="btn" onClick={() => exportRowsToXlsx(rows, [
          { header: "Mã phê duyệt", get: (r) => r.ma_phe_duyet }, { header: "Mã EO", get: (r) => r.eo_code }, { header: "Người đặt", get: (r) => r.nguoi_dat },
          { header: "Mã LK", get: (r) => r.part_code }, { header: "Tên LK", get: (r) => r.part_name }, { header: "Kho", get: (r) => r.kho }, { header: "Đối tác", get: (r) => r.doi_tac },
          { header: "SL đặt", get: (r) => r.so_luong_dat }, { header: "SL còn thiếu", get: (r) => r.so_luong_con_thieu },
          { header: "Ngày ban hành", get: (r) => ngayGio(r.bat_dau) }, { header: "Ngày DK gần nhất", get: (r) => ngay(r.ngay_du_kien_gan_nhat) },
          { header: "Số lần lùi", get: (r) => r.so_lan_lui }, { header: "Số lỗi", get: (r) => r.so_loi }, { header: "Lý do cấp CEO", get: (r) => r.ceo_ly_do.join("; ") },
        ], "Canh_bao_CEO.xlsx", "CEO")}><I.download width={14} height={14} /> Xuất Excel</button>
      } />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
          <input className="input" style={{ width: 300 }} placeholder="Tìm mã/tên LK, EO, đối tác… (không dấu)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="badge reject">{soLuong(rows.length)} dòng cấp CEO</span>
          <span className="badge nhap">Lùi ≥ 3 lần: {dem("Lùi")}</span>
          <span className="badge nhap">≥ 30 ngày: {dem("ngày đặt")}</span>
          <span className="badge nhap">≥ 3 lỗi: {dem("lỗi")}</span>
        </div>
      </Card>
      <Card style={{ padding: 0 }}>
        {q.isLoading ? <Spinner /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>EO / 3TDO</th><th>Linh kiện</th><th>Kho · Đối tác</th><th style={{ textAlign: "right" }}>Đặt / Thiếu</th><th>Ngày DK</th><th>Lý do cấp CEO</th><th>Tình trạng</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có đơn hàng ở cấp CEO.</td></tr>}
              {rows.map((r) => (
                <tr key={r.item_id}>
                  <td><span className="cell-link" onClick={() => nav(`/eo/${r.eo_id}`)}>{r.ma_phe_duyet || r.eo_code}</span><div className="muted" style={{ fontSize: 11 }}>{ten(r.nguoi_dat)}</div></td>
                  <td><b>{r.part_code}</b><div className="muted" style={{ fontSize: 11.5 }}>{r.part_name}</div></td>
                  <td>{r.kho}<div className="muted" style={{ fontSize: 11.5 }}>{r.doi_tac ?? "—"}</div></td>
                  <td style={{ textAlign: "right" }}>{soLuong(r.so_luong_dat)} / <b>{soLuong(r.so_luong_con_thieu)}</b></td>
                  <td>{ngay(r.ngay_du_kien_gan_nhat) || "—"}</td>
                  <td style={{ color: "var(--danger)", fontSize: 12.5 }}>{r.ceo_ly_do.map((x) => <div key={x}>• {x}</div>)}</td>
                  <td><span className={`badge ${TINH_TRANG[r.tinh_trang].c}`}>{TINH_TRANG[r.tinh_trang].l}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn ghost sm" title="Giải trình" onClick={() => setModal({ loai: "gt", dong: r })}><I.edit width={14} height={14} /></button>
                    <button className="btn ghost sm" title="Lịch sử" onClick={() => setModal({ loai: "ls", dong: r })}><I.clock width={14} height={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      {modal?.loai === "ls" && <LichSuModal dong={modal.dong} onClose={() => setModal(null)} />}
      {modal?.loai === "gt" && <GiaiTrinhModal dong={modal.dong} onClose={() => setModal(null)} onSaved={() => { setModal(null); qc.invalidateQueries({ queryKey: ["theo-doi-ceo"] }); }} />}
    </div>
  );
}
