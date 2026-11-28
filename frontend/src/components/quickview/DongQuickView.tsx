import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner, StatusBadge } from "../ui";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { I } from "../../lib/icons";
import { MocTon } from "../../lib/tonDong";
import { NhanNgay } from "../../lib/ngay";
import { QvHeader, Kpi, EoLink, useQuickView, useAnPhu, CotPhu } from "./QuickView";
import { QuyTrinh, GiaiThichCeo, ceoTxt, type GdDef } from "../TienTrinh";
import { type Dong, TINH_TRANG, NgayHangVeModal, GiaiTrinhModal, LichSuDong, LienHeDoiTacModal } from "../../pages/theodoi/shared";
import { BangViPhamDong } from "../BangViPhamDong";
import { GdBadge } from "../../lib/giaiDoan";
import { HuyDongModal, KetThucSomModal, SuaThongTinDongModal, QtyModal, ReplacePartModal, TuChoiDongModal, quyenEo } from "../../pages/eo/eoActions";
import { Kho } from "../../lib/kho";
import { MenuXo } from "../MenuXo";

/**
 * Popup "don hang" = 1 dong linh kien tren EO: duong tien trinh 8 giai doan + bang chi tiet tung giai doan (bat dau, ket thuc,
 * thoi gian, han, loi) + ke hoach & hang ve + lich su theo doi. Mo tu Quan ly don hang (bam dong) / popup EO (nut tien trinh).
 * Du lieu: GET /theo-doi/dong/:id (dong, ke hoach, AMIS, loi, mail...) + GET /so-don-hang?eo_id= (giai doan, chi so theo doi).
 */

export default function DongQuickView({ id, onClose, onCloseAll, coTruoc }: { id: number; onClose: () => void; onCloseAll: () => void; coTruoc: boolean }) {
  const qc = useQueryClient();
  const ls = useQuery({ queryKey: ["tl-dong", id], queryFn: () => api.get<any>(`/theo-doi/dong/${id}`) });
  const eoId = ls.data?.item?.eo_id as number | undefined;
  const sdh = useQuery({
    queryKey: ["so-don-hang", "eo", eoId], enabled: !!eoId,
    queryFn: () => api.get<{ giai_doan: GdDef[]; sla: Record<string, number>; rows: any[] }>(`/so-don-hang?eo_id=${eoId}`),
  });
  const [xemTq, setXemTq] = useState(false); // khu phu: false = Nhat ky, true = Tong quat (o so lieu)
  const qv = useQuickView();
  const [md, setMd] = useState<"ndk" | "gt" | "huy" | "kts" | "sua" | "lh" | "qty" | "thay" | "tuchoi" | null>(null);
  const [loiDuyet, setLoiDuyet] = useState("");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const [anPhu, setAnPhu] = useAnPhu();

  if (ls.isLoading || (eoId && sdh.isLoading)) return <Spinner />;
  const it = ls.data?.item;
  if (!it) return <div style={{ padding: 30 }}>Không tải được dòng đơn hàng. <button className="btn sm" onClick={onClose}>Đóng</button></div>;
  const r = (sdh.data?.rows ?? []).find((x) => x.item_id === id) ?? {};
  const defs = sdh.data?.giai_doan ?? [];
  const sla = sdh.data?.sla ?? {};
  const loi: any[] = ls.data.loi ?? [];
  const issued = r.trang_thai_eo === "ISSUED";
  const dong = { ...r, item_id: id, eo_id: it.eo_id, eo_code: it.eo_code, ma_phe_duyet: it.approval_code, part_code: it.part_code, part_name: it.part_name,
    kho: it.warehouse, doi_tac: it.supplier, so_luong_dat: r.so_luong_dat ?? it.current_qty } as Dong;
  // v0.138: sua SL / thay ma / duyet dong doi ca popup PO, danh sach don, bao cao -> tai lai moi du lieu
  const xong = () => { setMd(null); qc.invalidateQueries(); };
  const tt = r.tinh_trang ? TINH_TRANG[r.tinh_trang as Dong["tinh_trang"]] : null;
  const loiCho = loi.filter((l) => l.trang_thai === "CHO_GIAI_TRINH").length;
  // huy / ket thuc som don dat (dong): backend kiem quyen (nguoi quan ly EO / nguoi duyet cuoi), loi tra ve hien trong modal
  const daVe = (ls.data.phieu_nhap ?? []).reduce((s: number, p: any) => s + (p.qty_in || 0), 0);
  const moDong = issued && it.line_status === "ACTIVE" && r.phan_loai_thoi_diem_dat !== "Tạo sau ban hành (chờ duyệt)";
  const itemHuy = { id, part_code: it.part_code, part_name: it.part_name, warehouse: it.warehouse, current_qty: it.current_qty, da_dat: daVe };
  // v0.138: quyen theo EO (giong menu ⋯ dong o popup PO) -> sua SL / ghi chu / ID CRM, thay ma tuong duong, duyet / tu choi dong sau BH
  const P = quyenEo({ trang_thai: it.eo_trang_thai ?? r.trang_thai_eo ?? "", created_by: it.created_by, final_approver_email: it.final_approver_email ?? r.nguoi_duyet_cuoi }, me.data);
  const conSong = it.line_status === "ACTIVE";
  const ketThuc = !!r.ket_thuc_som_at || daVe >= it.current_qty;
  const itemSua = { id, part_code: it.part_code, part_name: it.part_name, warehouse: it.warehouse, current_qty: it.current_qty,
    ghi_chu: it.ghi_chu, crm_id: it.crm_id, order_id: it.order_id, part_code_goc: it.part_code_goc };
  const duyetDong = async () => {
    if (!confirm(`Duyệt dòng ${it.part_code} (SL ${soLuong(it.current_qty)}) thêm sau ban hành?`)) return;
    setLoiDuyet("");
    try { await api.post(`/eo/items/${id}/approve-post-issue`); xong(); }
    catch (e: any) { setLoiDuyet(e?.body?.error === "ONLY_FINAL_APPROVER" ? "Chỉ người duyệt mua của EO được duyệt dòng này." : "Lỗi duyệt dòng."); }
  };

  return (
    <>
      <div className="qv-head don">
        <QvHeader coTruoc={coTruoc} onClose={onClose} onCloseAll={onCloseAll} actions={<>
          {P.canApprovePostIssue && it.post_issue_status === "PENDING" && conSong && !ketThuc && <>
            <button className="btn sm primary" title="Dòng thêm sau ban hành đang chờ bạn duyệt" onClick={duyetDong}>Duyệt dòng</button>
            <button className="btn sm danger" onClick={() => setMd("tuchoi")}>Từ chối dòng</button></>}
          {issued && <button className="btn sm primary" onClick={() => setMd("ndk")}><I.calendar width={13} height={13} /> Ngày NM / dự kiến / hàng về</button>}
          {moDong && r.theo_doi && (r.so_luong_con_thieu ?? 1) > 0 && <button className="btn sm" title="Đã nhắc đối tác bằng gọi điện / Zalo / tin nhắn (không mail) — tính như đã push (R3)" onClick={() => setMd("lh")}>📞 Đã nhắc đối tác</button>}
          {moDong && daVe > 0 && daVe < it.current_qty && <button className="btn sm" title="SL đặt về đúng SL đã về, không chờ phần còn lại" onClick={() => setMd("kts")}><I.check width={13} height={13} /> Kết thúc sớm</button>}
          {/* v0.138: gom 3 thao tac SUA vao 1 nut co chu "Sửa đơn ▾" (giong menu ⋯ dong o popup PO): sua SL / ghi chu / ID CRM (truoc day
              chi co o popup PO), sua ma / kho / NCC (nhap sai), thay ma tuong duong. Quyen khop backend (quyenEo). */}
          <MenuXo nhan={<><I.edit width={13} height={13} /> Sửa đơn ▾</>} title="Sửa SL đặt / ghi chú / ID CRM, sửa mã / kho / NCC, thay mã tương đương" muc={[
            { l: "Sửa SL đặt / ghi chú / ID CRM", icon: <I.edit width={14} height={14} />, onClick: () => setMd("qty"), an: !(P.canEditQty && conSong),
              title: "Đổi SL đặt (ghi lý do; SL < tổng kế hoạch thì tự giảm kế hoạch từ đợt xa nhất), ghi chú, ID CRM, ID đặt hàng — ghi lịch sử" },
            { l: "Sửa mã LK / kho / đối tác", icon: <I.tag width={14} height={14} />, onClick: () => setMd("sua"), title: "Nhập sai — ghi lịch sử",
              an: !(conSong && quyenEo({ trang_thai: r.trang_thai_eo ?? "", created_by: r.nguoi_tao ?? it.created_by, final_approver_email: r.nguoi_duyet_cuoi }, me.data).canSuaThongTin && (r.so_luong_con_thieu ?? 1) > 0) },
            { l: "Thay mã linh kiện tương đương", icon: <I.refresh width={14} height={14} />, onClick: () => setMd("thay"), an: !(issued && P.canManage && conSong),
              title: "NCC giao mã tương đương — đổi mã đang dùng, giữ mã gốc để khớp AMIS" },
          ]} />
          {moDong && <button className="btn sm ghost danger" title="Không đặt nữa — SL đã về (nếu có) không tính" onClick={() => setMd("huy")}><I.x width={13} height={13} /> Hủy đơn</button>}
          {r.theo_doi && <button className="btn sm" onClick={() => setMd("gt")} style={{ color: loiCho ? "var(--danger)" : undefined }}><I.edit width={13} height={13} /> Giải trình{loiCho ? ` (${loiCho})` : ""}</button>}
        </>}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Đơn hàng</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--brand-ink)" }}>{it.part_code}</span>
            <button type="button" className="btn ghost sm" style={{ flexShrink: 0 }} title="Mở UI chung: mọi đơn đặt / PO của mã linh kiện này" onClick={() => qv.openPart(it.part_code)}>⇄ Tất cả đơn của mã này</button>
            <span style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", minWidth: 60 }} title={it.part_name}>{it.part_name}</span>
            {r.trang_thai_don_hang && <span className="badge nhap">{r.trang_thai_don_hang}</span>}
            {tt && <span className={`badge ${tt.c}`}>{tt.l}</span>}
            {(r.ceo_ly_do ?? []).length > 0 && <span className="badge reject" title={ceoTxt(r.ceo_chi_tiet, r.ceo_ly_do)}>Cấp CEO</span>}
          </div>
          <div className="muted qv-meta" style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 12, flexWrap: "nowrap", whiteSpace: "nowrap", overflow: "hidden" }}>
            <span>EO <EoLink id={it.eo_id}>{it.approval_code || it.eo_code}</EoLink>{it.approval_code ? ` (${it.eo_code})` : ""} {r.trang_thai_eo && (r.trang_thai_eo === "ISSUED" && r.gd_hien_tai ? <GdBadge r={r} /> : <StatusBadge status={r.trang_thai_eo} />)}</span>
            {/* v0.108: don nay dat cho ca / don nao - de dau dong, luon hien */}
            <span title="ID CRM = mã ca bảo hành">ID case <b style={{ color: r.id_crm ? "var(--brand-ink)" : undefined }}>{r.id_crm || "—"}</b></span>
            <span title="ID đặt hàng bên app linh kiện (DDH-… / TLK-…)">ID đặt hàng <b style={{ color: r.id_dat_hang ? "var(--brand-ink)" : undefined }}>{r.id_dat_hang || "—"}</b></span>
            <span>Kho <b><Kho t={it.warehouse} /></b></span>
            <span>Đối tác <b>{it.supplier || "—"}</b></span>
            <span>Người đặt <b>{ten(r.nguoi_dat ?? it.created_by)}</b></span>
            {r.id_dat_lk && <span>ID dòng <b>{r.id_dat_lk}</b></span>}
            {r.ly_do_ps && <span>Lý do PS <b>{r.ly_do_ps}</b></span>}
            {r.part_code_goc && <span>Thay từ mã <b>{r.part_code_goc}</b></span>}
            {r.ket_thuc_som_at && <span style={{ color: "var(--ok-ink)" }}>Kết thúc sớm <b>{ngayGio(r.ket_thuc_som_at)}</b>{r.sl_dat_truoc_kts != null ? <> · SL đặt ban đầu <b>{soLuong(r.sl_dat_truoc_kts)}</b></> : null}</span>}
            {/* so lieu chinh tren dong thong tin; o so lieu day du + giai thich cap CEO trong "Xem chi tiết" (#22) */}
            <span>Đặt <b>{soLuong(r.so_luong_dat ?? it.current_qty)}</b> · về <b style={{ color: "var(--ok-ink)" }}>{soLuong(r.sl_nhap_amis_dung_eo ?? 0)}</b> · thiếu <b style={{ color: r.so_luong_con_thieu ? "var(--warn-ink)" : undefined }}>{soLuong(r.so_luong_con_thieu ?? 0)}</b>
              {" "}· DK <b style={{ color: r.canh_bao === "Quá dự kiến" ? "var(--danger-ink)" : undefined }}>{ngay(r.ngay_du_kien_gan_nhat) || "—"}</b>{r.so_lan_lui > 0 && <b style={{ color: r.so_lan_lui >= 3 ? "var(--danger-ink)" : "var(--warn-ink)" }} title="Số lần lùi ngày dự kiến (ngày mới muộn hơn ngày trước)"> · lùi {r.so_lan_lui} lần</b>}{r.ngay_nm_cam_ket && <> · NM <b>{ngay(r.ngay_nm_cam_ket)}</b></>}</span>
          </div>
        </QvHeader>
        {loiDuyet && <div style={{ color: "var(--danger)", fontSize: 12.5, padding: "4px 0" }}>{loiDuyet}</div>}
      </div>

      <div className={`qv-body${anPhu ? " an-phu" : ""}`}>
        {/* KHU CHINH (v0.131): luong 8 giai doan + chi tiet giai doan / ke hoach & hang ve / loi & giai trinh */}
        <div className="qv-col">
          {r.item_id ? <div className="qv-quytrinh"><QuyTrinh defs={defs} sla={sla} rows={[r]} loi={loi} phieuNhap={ls.data.phieu_nhap ?? []} slDat={r.so_luong_dat ?? it.current_qty}
          phuTrach={{ G4: `NV đặt hàng — ${ten(r.nguoi_dat ?? it.created_by)}`, G5: `NV đặt hàng — ${ten(r.nguoi_dat ?? it.created_by)}`, G6: `NCC — ${it.supplier || "—"}`, G8: `NCC — ${it.supplier || "—"} + NV theo dõi` }}
          chiTiet={<>
            {(r.lui_ds ?? []).length > 0 && (
              <div style={{ fontSize: 12.5, marginTop: 8 }}>
                <b>Các lần lùi ngày dự kiến</b> <span className="muted">(từ 3 lần → cấp CEO)</span>
                <table className="tbl tbl-dense" style={{ marginTop: 4, width: "auto" }}>
                  <thead><tr><th>Lần</th><th>Lúc</th><th>Người sửa</th><th>Từ ngày</th><th>Sang ngày</th><th style={{ textAlign: "right" }}>Lùi thêm</th></tr></thead>
                  <tbody>{r.lui_ds.map((x: any, i: number) => (
                    <tr key={i}><td>{i + 1}</td><td>{ngayGio(x.luc)}</td><td>{x.ai ? ten(x.ai) : "Hệ thống"}</td><td>{ngay(x.tu)}</td><td><b>{ngay(x.den)}</b></td>
                      <td style={{ textAlign: "right" }}>+{Math.round((Date.parse(x.den) - Date.parse(x.tu)) / 86400_000)} ngày</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {(r.ceo_ly_do ?? []).length > 0 && <GiaiThichCeo ct={r.ceo_chi_tiet} lyDo={r.ceo_ly_do} />}
          </>} /></div>
          : <div className="muted qv-quytrinh" style={{ fontSize: 12 }}>Chưa có dữ liệu giai đoạn.</div>}
          {/* v0.149 (chu he thong 2026-11-28): bo tab "Chi tiết giai đoạn" (trung luong quy trinh) + tab "Kế hoạch & hàng về" (thanh khoi CO DINH)
              + bang "Danh sách vi phạm" (gop loi giong nhau, khong loi thi khong hien) thay tab "Lỗi & giải trình". */}
          {/* v0.150: khoi ke hoach co dinh (cao toi da 38%, tu cuon) + bang vi pham chiem phan con lai, phan trang ghim day */}
          <div className="qv-scroll lk-mode">
            <div className="qv-don-kh">
            <div className="qv-sec">Kế hoạch hàng về ({(ls.data.ke_hoach ?? []).length}) · Phiếu nhập AMIS ({(ls.data.phieu_nhap ?? []).length})</div>
            <div className="qv-gon" style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 12, padding: "0 8px" }}>
              <table className="tbl tbl-dense">
                <colgroup><col style={{ width: "11%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /><col style={{ width: "9%" }} /><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /></colgroup>
                <thead><tr><th>Loại</th><th><NhanNgay k="NM" ngan /></th><th><NhanNgay k="DK" ngan /></th><th style={{ textAlign: "right" }}>SL</th><th>Ghi chú</th><th>Cập nhật</th></tr></thead>
                <tbody>
                  {(ls.data.ke_hoach ?? []).length === 0 && <tr><td colSpan={6} className="muted">Chưa có kế hoạch.</td></tr>}
                  {(ls.data.ke_hoach ?? []).map((p: any) => { const cn = `${ten(p.updated_by ?? p.created_by)} · ${ngayGio(p.updated_at ?? p.created_at)}`; return <tr key={p.id}>
                    <td>{p.loai === "TUAN" ? `Tuần ${p.tuan ?? ""}` : "Ngày"}</td><td>{ngay(p.factory_committed_date) || "—"}</td><td>{ngay(p.planned_date)}</td>
                    <td style={{ textAlign: "right" }}>{soLuong(p.planned_qty)}</td><td title={p.ghi_chu || undefined}>{p.ghi_chu || ""}</td><td className="muted" style={{ fontSize: 11.5 }} title={cn}>{cn}</td></tr>; })}
                </tbody>
              </table>
              <table className="tbl tbl-dense">
                <colgroup><col style={{ width: "27%" }} /><col style={{ width: "28%" }} /><col style={{ width: "27%" }} /><col style={{ width: "18%" }} /></colgroup>
                <thead><tr><th>Ngày hàng về</th><th>Số CT</th><th>Kho</th><th style={{ textAlign: "right" }}>SL nhập</th></tr></thead>
                <tbody>
                  {(ls.data.phieu_nhap ?? []).length === 0 && <tr><td colSpan={4} className="muted">Chưa có hàng về.</td></tr>}
                  {(ls.data.phieu_nhap ?? []).map((p: any) => <tr key={p.id}><td>{ngay(p.doc_date)}</td><td title={p.doc_no}>{p.doc_no}</td><td title={p.warehouse_name}>{p.warehouse_name}</td><td style={{ textAlign: "right" }}>{soLuong(p.qty_in)}</td></tr>)}
                </tbody>
              </table>
            </div>
            </div>
            <BangViPhamDong loi={loi} giaiTrinh={ls.data.giai_trinh ?? []} doiTac={it.supplier} nguoiDat={r.nguoi_dat ?? it.created_by} onGiaiTrinh={r.theo_doi ? () => setMd("gt") : undefined} />
          </div>
        </div>
        {/* KHU PHU (v0.131): so lieu + lich su theo doi (mail, push, goi / Zalo, giai trinh, ngay DK) */}
        {/* v0.149: khu phu gon nhu popup PO (v0.145) - tieu de "Nhật ký xử lý", chip Tổng quát (o so lieu) / Nhật ký */}
        <CotPhu an={anPhu} setAn={setAnPhu} tieuDe="Nhật ký xử lý">
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 4 }}>
            <button className={`qv-chip ${xemTq ? "on" : ""}`} onClick={() => setXemTq(true)} title="Ô số liệu: SL, ngày, tồn, lỗi chờ giải trình">
              Tổng quát{loiCho ? <span style={{ marginLeft: 5, background: "#ff3b30", color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 10.5 }}>{loiCho}</span> : null}</button>
            <button className={`qv-chip ${!xemTq ? "on" : ""}`} onClick={() => setXemTq(false)} title="Mail gửi / nhận, giải trình, gọi / Zalo, push, đổi ngày dự kiến">Nhật ký</button>
          </div>
          {xemTq ? <div className="qv-scroll"><div className="qv-phu-sec" style={{ borderBottom: 0 }}>
            <div className="qv-kpis" style={{ marginTop: 0 }}>
              <Kpi l="SL đặt" v={soLuong(r.so_luong_dat ?? it.current_qty)} />
              <Kpi l="Đã về (AMIS)" v={soLuong(r.sl_nhap_amis_dung_eo ?? 0)} tone="ok" />
              <Kpi l="Còn thiếu" v={soLuong(r.so_luong_con_thieu ?? 0)} tone={r.so_luong_con_thieu ? "warn" : undefined} />
              <Kpi l="Ngày NM cam kết" v={ngay(r.ngay_nm_cam_ket) || "—"} />
              <Kpi l="Ngày dự kiến" v={ngay(r.ngay_du_kien_gan_nhat) || "—"} tone={r.canh_bao === "Quá dự kiến" ? "danger" : undefined} />
              <Kpi l="Số lần lùi ngày DK" v={soLuong(r.so_lan_lui ?? 0)} tone={(r.so_lan_lui ?? 0) >= 3 ? "danger" : r.so_lan_lui ? "warn" : undefined} />
              <Kpi l="Ngày hàng về" v={ngay(r.ngay_hang_ve ?? r.ngay_nhap_kho_amis_theo_eo) || "—"} />
              <Kpi l="Tồn (từ ngày đặt)" v={["Hàng chưa về", "Chưa đủ hàng"].includes(r.trang_thai_don_hang) ? <MocTon tu={r.bat_dau ?? r.ngay_ban_hanh} nho /> : "—"} />
              <Kpi l="Lỗi chờ giải trình" v={soLuong(loiCho)} tone={loiCho ? "danger" : undefined} />
            </div>
          </div></div>
          : <div className="qv-scroll" style={{ padding: "0 12px 12px" }}>
            <LichSuDong dong={dong} boLoi />
          </div>}
        </CotPhu>
      </div>

      {md === "qty" && <QtyModal item={itemSua} issued={issued} onClose={() => setMd(null)} onSaved={xong} />}
      {md === "thay" && <ReplacePartModal item={itemSua} onClose={() => setMd(null)} onSaved={xong} />}
      {md === "tuchoi" && <TuChoiDongModal item={itemSua} onClose={() => setMd(null)} onDone={xong} />}
      {md === "ndk" && <NgayHangVeModal dong={dong} onClose={() => setMd(null)} onSaved={xong} />}
      {md === "gt" && <GiaiTrinhModal dong={dong} onClose={() => setMd(null)} onSaved={xong} />}
      {md === "lh" && <LienHeDoiTacModal ids={[id]} nhan={`${it.part_code} (${it.approval_code || it.eo_code})`} onClose={() => setMd(null)}
        onSaved={(kq) => { xong(); if (kq.bo_loi_r3) alert(`Đã ghi nhận — bỏ ${kq.bo_loi_r3} lỗi R3 (không push) của kỳ đó.`); }} />}
      {md === "huy" && <HuyDongModal item={itemHuy} onClose={() => setMd(null)} onDone={xong} />}
      {md === "kts" && <KetThucSomModal item={itemHuy} onClose={() => setMd(null)} onDone={xong} />}
      {md === "sua" && <SuaThongTinDongModal item={{ id, part_code: it.part_code, part_name: it.part_name, warehouse: it.warehouse, supplier: it.supplier }} onClose={() => setMd(null)} onDone={xong} />}
    </>
  );
}
