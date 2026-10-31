import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { I } from "../../lib/icons";
import { gioTxt } from "../../lib/giaiDoan";
import { MocTon } from "../../lib/tonDong";
import { NhanNgay } from "../../lib/ngay";
import { QvHeader, Kpi, EoLink, PartLink } from "./QuickView";
import { TienTrinh, tinhNut, LOI_GD, type GdDef } from "../TienTrinh";
import { type Dong, TINH_TRANG, NgayHangVeModal, GiaiTrinhModal, LichSuDong } from "../../pages/theodoi/shared";

/**
 * Popup "don hang" = 1 dong linh kien tren EO: duong tien trinh 8 giai doan + bang chi tiet tung giai doan (bat dau, ket thuc,
 * thoi gian, han, loi) + ke hoach & hang ve + lich su theo doi. Mo tu Quan ly don hang (bam dong) / popup EO (nut tien trinh).
 * Du lieu: GET /theo-doi/dong/:id (dong, ke hoach, AMIS, loi, mail...) + GET /so-don-hang?eo_id= (giai doan, chi so theo doi).
 */
type Tab = "gd" | "kh";

export default function DongQuickView({ id, onClose, onCloseAll, coTruoc }: { id: number; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const qc = useQueryClient();
  const ls = useQuery({ queryKey: ["tl-dong", id], queryFn: () => api.get<any>(`/theo-doi/dong/${id}`) });
  const eoId = ls.data?.item?.eo_id as number | undefined;
  const sdh = useQuery({
    queryKey: ["so-don-hang", "eo", eoId], enabled: !!eoId,
    queryFn: () => api.get<{ giai_doan: GdDef[]; sla: Record<string, number>; rows: any[] }>(`/so-don-hang?eo_id=${eoId}`),
  });
  const [tab, setTab] = useState<Tab>("gd");
  const [md, setMd] = useState<"ndk" | "gt" | null>(null);

  if (ls.isLoading || (eoId && sdh.isLoading)) return <Spinner />;
  const it = ls.data?.item;
  if (!it) return <div style={{ padding: 30 }}>Không tải được dòng đơn hàng. <button className="btn sm" onClick={onClose}>Đóng</button></div>;
  const r = (sdh.data?.rows ?? []).find((x) => x.item_id === id) ?? {};
  const defs = sdh.data?.giai_doan ?? [];
  const sla = sdh.data?.sla ?? {};
  const loi: any[] = ls.data.loi ?? [];
  const nut = tinhNut(defs, r.item_id ? [r] : [], loi);
  const issued = r.trang_thai_eo === "ISSUED";
  const dong = { ...r, item_id: id, eo_id: it.eo_id, eo_code: it.eo_code, ma_phe_duyet: it.approval_code, part_code: it.part_code, part_name: it.part_name,
    kho: it.warehouse, doi_tac: it.supplier, so_luong_dat: r.so_luong_dat ?? it.current_qty } as Dong;
  const xong = () => { setMd(null); ["so-don-hang", "tl-dong", "theo-doi", "inbox-count", "eo-bo-sung"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const tt = r.tinh_trang ? TINH_TRANG[r.tinh_trang as Dong["tinh_trang"]] : null;
  const loiCho = loi.filter((l) => l.trang_thai === "CHO_GIAI_TRINH").length;

  return (
    <>
      <div className="qv-head">
        <QvHeader coTruoc={coTruoc} onClose={onClose} onCloseAll={onCloseAll} actions={<>
          {issued && <button className="btn sm primary" onClick={() => setMd("ndk")}><I.calendar width={13} height={13} /> Ngày NM / dự kiến / hàng về</button>}
          {r.theo_doi && <button className="btn sm" onClick={() => setMd("gt")} style={{ color: loiCho ? "var(--danger)" : undefined }}><I.edit width={13} height={13} /> Giải trình{loiCho ? ` (${loiCho})` : ""}</button>}
        </>}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Đơn hàng</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: "var(--brand-ink)" }}><PartLink ma={it.part_code} /></span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{it.part_name}</span>
            {r.trang_thai_don_hang && <span className="badge nhap">{r.trang_thai_don_hang}</span>}
            {tt && <span className={`badge ${tt.c}`}>{tt.l}</span>}
            {(r.ceo_ly_do ?? []).length > 0 && <span className="badge reject" title={r.ceo_ly_do.join("\n")}>Cấp CEO</span>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>EO <EoLink id={it.eo_id}>{it.approval_code || it.eo_code}</EoLink>{it.approval_code ? ` (${it.eo_code})` : ""} {r.trang_thai_eo && <StatusBadge status={r.trang_thai_eo} />}</span>
            <span>Kho <b>{it.warehouse}</b></span>
            <span>Đối tác <b>{it.supplier || "—"}</b></span>
            <span>Người đặt <b>{ten(r.nguoi_dat ?? it.created_by)}</b></span>
            {r.id_dat_lk && <span>ID dòng <b>{r.id_dat_lk}</b></span>}
            {r.ly_do_ps && <span>Lý do PS <b>{r.ly_do_ps}</b></span>}
            {r.part_code_goc && <span>Thay từ mã <b>{r.part_code_goc}</b></span>}
          </div>
        </QvHeader>
        <div className="qv-kpis">
          <Kpi l="SL đặt" v={soLuong(r.so_luong_dat ?? it.current_qty)} />
          <Kpi l="Đã về (AMIS)" v={soLuong(r.sl_nhap_amis_dung_eo ?? 0)} tone="ok" />
          <Kpi l="Còn thiếu" v={soLuong(r.so_luong_con_thieu ?? 0)} tone={r.so_luong_con_thieu ? "warn" : undefined} />
          <Kpi l="Ngày NM cam kết" v={ngay(r.ngay_nm_cam_ket) || "—"} />
          <Kpi l="Ngày dự kiến" v={ngay(r.ngay_du_kien_gan_nhat) || "—"} tone={r.canh_bao === "Quá dự kiến" ? "danger" : undefined} />
          <Kpi l="Ngày hàng về" v={ngay(r.ngay_hang_ve ?? r.ngay_nhap_kho_amis_theo_eo) || "—"} />
          <Kpi l="Tồn (từ ngày đặt)" v={["Hàng chưa về", "Chưa đủ hàng"].includes(r.trang_thai_don_hang) ? <MocTon tu={r.bat_dau ?? r.ngay_ban_hanh} nho /> : "—"} />
          <Kpi l="Lỗi chờ giải trình" v={soLuong(loiCho)} tone={loiCho ? "danger" : undefined} />
        </div>
        {r.item_id ? <TienTrinh defs={defs} sla={sla} rows={[r]} loi={loi} onChonNut={() => setTab("gd")} /> : <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Chưa có dữ liệu giai đoạn.</div>}
      </div>

      <div className="qv-body">
        <div className="qv-col">
          <div className="qv-tabs">
            <button className={`qv-tab ${tab === "gd" ? "on" : ""}`} onClick={() => setTab("gd")}>Chi tiết giai đoạn</button>
            <button className={`qv-tab ${tab === "kh" ? "on" : ""}`} onClick={() => setTab("kh")}>Kế hoạch & hàng về ({(ls.data.ke_hoach ?? []).length} · {(ls.data.phieu_nhap ?? []).length})</button>
          </div>
          <div className="qv-scroll">
            {tab === "gd" && (
              <table className="tbl tbl-dense">
                <thead><tr><th>Giai đoạn</th><th>Phụ trách</th><th>Bắt đầu</th><th>Kết thúc</th><th style={{ textAlign: "right" }}>Thời gian (giờ LV)</th><th>Hạn</th><th>Kết quả</th><th>Lỗi theo dõi</th></tr></thead>
                <tbody>
                  {nut.map((n) => {
                    const m = r.gd_moc?.[n.g.k];
                    const g = r.gd_gio_tung?.[n.g.k];
                    const tre = r.gd_tre_tung?.[n.g.k];
                    const kq = !m?.bd ? <span className="muted">Chưa tới</span>
                      : !m.kt ? (n.g.k === "G7" ? <span className="muted">—</span> : <span className={`badge ${tre ? "reject" : "review"}`}>{n.g.k === "G4" ? "Chưa ghi nhận mail" : "Đang thực hiện"}{tre ? " · trễ" : ""}</span>)
                      : <span className={`badge ${tre ? "reject" : "issued"}`}>{tre ? "Xong · trễ hạn" : "Xong · đúng hạn"}</span>;
                    return (
                      <tr key={n.g.k} style={{ background: r.gd_hien_tai === n.g.k ? "#FFFBEB" : undefined }}>
                        <td style={{ whiteSpace: "nowrap" }}><b>{n.g.k}</b> {n.g.l}{n.g.k === "G4" && <span className="muted"> (song song)</span>}{n.g.k === "G7" && <span className="muted"> (chỉ đo)</span>}</td>
                        <td>{n.g.vai_tro}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{m?.bd ? ngayGio(m.bd) : "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{m?.kt ? ngayGio(m.kt) : m?.bd && n.g.k !== "G7" ? <i className="muted">đang chạy</i> : "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: tre ? "var(--danger-ink)" : undefined }}>{g != null ? gioTxt(g) : "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{m?.han ? ngayGio(m.han) : sla[n.g.k] != null ? `${gioTxt(sla[n.g.k])} làm việc` : "—"}</td>
                        <td>{kq}{n.traVe > 0 && <div><span className="badge final" style={{ marginTop: 3 }}>EO bị trả về {n.traVe} lần</span></div>}</td>
                        <td>{n.loi.length ? <span className={`badge ${n.loiCho ? "reject" : "nhap"}`} title={n.loi.map((l) => `${l.quy_tac} · hạn ${ngayGio(l.han)}`).join("\n")}>{n.loi.length} lỗi{n.loiCho ? ` · ${n.loiCho} chờ GT` : ""}</span> : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                  {loi.some((l) => !LOI_GD[l.quy_tac]) && <tr><td colSpan={8} className="muted" style={{ fontSize: 12 }}>+ {loi.filter((l) => !LOI_GD[l.quy_tac]).length} lỗi ghi khi giải trình (không gắn giai đoạn).</td></tr>}
                </tbody>
              </table>
            )}
            {tab === "kh" && (
              <>
                <div className="qv-sec">Kế hoạch hàng về</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Loại</th><th><NhanNgay k="NM" ngan /></th><th><NhanNgay k="DK" ngan /></th><th style={{ textAlign: "right" }}>SL</th><th>Ghi chú</th><th>Cập nhật</th></tr></thead>
                  <tbody>
                    {(ls.data.ke_hoach ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa có kế hoạch.</td></tr>}
                    {(ls.data.ke_hoach ?? []).map((p: any) => <tr key={p.id}><td>{p.loai === "TUAN" ? `Tuần ${p.tuan ?? ""}` : "Ngày"}</td><td>{ngay(p.factory_committed_date) || "—"}</td><td>{ngay(p.planned_date)}</td>
                      <td style={{ textAlign: "right" }}>{soLuong(p.planned_qty)}</td><td>{p.ghi_chu || ""}</td><td className="muted" style={{ fontSize: 11.5 }}>{ten(p.updated_by ?? p.created_by)} · {ngayGio(p.updated_at ?? p.created_at)}</td></tr>)}
                  </tbody>
                </table>
                <div className="qv-sec">Phiếu nhập AMIS (ngày hàng về thực tế)</div>
                <table className="tbl tbl-dense">
                  <thead><tr><th>Ngày CT</th><th>Số CT</th><th>Kho</th><th style={{ textAlign: "right" }}>SL nhập</th></tr></thead>
                  <tbody>
                    {(ls.data.phieu_nhap ?? []).length === 0 && <tr><td colSpan={4} className="muted">Chưa có hàng về.</td></tr>}
                    {(ls.data.phieu_nhap ?? []).map((p: any) => <tr key={p.id}><td>{ngay(p.doc_date)}</td><td>{p.doc_no}</td><td>{p.warehouse_name}</td><td style={{ textAlign: "right" }}>{soLuong(p.qty_in)}</td></tr>)}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
        <div className="qv-col">
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13.5 }}>Lịch sử theo dõi</div>
          <div className="qv-scroll" style={{ padding: "0 12px 12px" }}>
            <LichSuDong dong={dong} />
          </div>
        </div>
      </div>

      {md === "ndk" && <NgayHangVeModal dong={dong} onClose={() => setMd(null)} onSaved={xong} />}
      {md === "gt" && <GiaiTrinhModal dong={dong} onClose={() => setMd(null)} onSaved={xong} />}
    </>
  );
}
