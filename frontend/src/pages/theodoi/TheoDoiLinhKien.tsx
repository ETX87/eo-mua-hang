import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { EoLink, PartLink } from "../../components/quickview/QuickView";
import { PageHeader, Card, Spinner, Modal } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { exportRowsToXlsx } from "../../lib/exportXlsx";
import { BaNgay, ChuGiaiNgay, NhanNgay } from "../../lib/ngay";
import { type Dong, TINH_TRANG, timKhongDau, NgayHangVeModal, GiaiTrinhModal, LichSuModal, useDanhMuc, taoPushDoiTac, PushKetQua } from "./shared";

/**
 * "Theo dõi linh kiện đặt": moi dong = 1 ma linh kien tren 1 EO da ban hanh. Tim kiem (khong dau), loc, cap nhat
 * ngay du kien, giai trinh loi (Ai + Loi gi + anh), tao file push doi tac chuan. Quy tac / loi: backend lib/theoDoi.ts.
 */
type Nhom = "tat_ca" | "CHO_NDK" | "TRE_NDK" | "QUA_HAN_NDK" | "CO_LOI" | "CEO" | "CHO_HANG";
const NHOM: { k: Nhom; l: string; f: (r: Dong) => boolean }[] = [
  { k: "tat_ca", l: "Tất cả", f: () => true },
  { k: "TRE_NDK", l: "Trễ 24h chưa có ngày DK", f: (r) => r.tinh_trang === "TRE_NDK" },
  { k: "CHO_NDK", l: "Chờ ngày DK (trong 24h)", f: (r) => r.tinh_trang === "CHO_NDK" },
  { k: "QUA_HAN_NDK", l: "Quá ngày dự kiến", f: (r) => r.tinh_trang === "QUA_HAN_NDK" },
  { k: "CO_LOI", l: "Lỗi chờ giải trình", f: (r) => r.so_loi_cho_gt > 0 },
  { k: "CEO", l: "Cấp CEO", f: (r) => r.ceo_ly_do.length > 0 },
  { k: "CHO_HANG", l: "Đã có ngày DK, chờ hàng", f: (r) => r.tinh_trang === "CHO_HANG" },
];
const PAGE = 50;

export default function TheoDoiLinhKien() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const [phamVi, setPhamVi] = useState<"dang_mo" | "tat_ca">("dang_mo");
  const q = useQuery({ queryKey: ["theo-doi", phamVi], queryFn: () => api.get<{ rows: Dong[]; danh_gia_luc: string | null }>(`/theo-doi/danh-sach?pham_vi=${phamVi}`) });
  const [nhom, setNhom] = useState<Nhom>("tat_ca");
  const [search, setSearch] = useState("");
  const [kho, setKho] = useState("");
  const [doiTac, setDoiTac] = useState("");
  const [nguoiDat, setNguoiDat] = useState("");
  const [chiApDung, setChiApDung] = useState(false);
  const [page, setPage] = useState(0);
  const [chon, setChon] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<{ loai: "ndk" | "gt" | "ls"; dong: Dong } | null>(null);
  const [pushKq, setPushKq] = useState<any[] | null>(null);
  const [showDm, setShowDm] = useState(false);
  const [busy, setBusy] = useState(false);

  const all = q.data?.rows ?? [];
  const base = useMemo(() => all.filter((r) => (!chiApDung || r.ap_dung) && (!kho || r.kho === kho) && (!doiTac || (r.doi_tac ?? "") === doiTac)
    && (!nguoiDat || r.nguoi_dat === nguoiDat) && timKhongDau(r, search)), [all, chiApDung, kho, doiTac, nguoiDat, search]);
  const rows = base.filter(NHOM.find((n) => n.k === nhom)!.f);
  const trang = rows.slice(page * PAGE, page * PAGE + PAGE);
  const uniq = (f: (r: Dong) => string | null) => [...new Set(all.map(f).filter(Boolean) as string[])].sort();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["theo-doi"] }); qc.invalidateQueries({ queryKey: ["tl-dong"] }); };

  const taoPush = async () => {
    if (!chon.size) return;
    if (!confirm(`Tạo file push đối tác cho ${chon.size} dòng? (mỗi đối tác 1 file + tiêu đề mail chuẩn)`)) return;
    setBusy(true);
    try {
      const dot = await taoPushDoiTac([...chon]);
      setPushKq(dot);
      setChon(new Set());
      refresh();
    } catch (e: any) {
      alert(e?.body?.error === "READ_ONLY" ? "Bạn không có quyền push một số dòng đã chọn." : "Lỗi tạo push.");
    } finally { setBusy(false); }
  };
  const xuatExcel = () => exportRowsToXlsx(rows, [
    { header: "ID dòng", get: (r) => r.id_dat_lk }, { header: "Mã phê duyệt", get: (r) => r.ma_phe_duyet }, { header: "Mã EO", get: (r) => r.eo_code },
    { header: "Mã LK", get: (r) => r.part_code }, { header: "Tên LK", get: (r) => r.part_name }, { header: "Kho", get: (r) => r.kho },
    { header: "Đối tác", get: (r) => r.doi_tac }, { header: "Người đặt", get: (r) => r.nguoi_dat }, { header: "SL đặt", get: (r) => r.so_luong_dat },
    { header: "SL về AMIS", get: (r) => r.sl_nhap_amis }, { header: "SL còn thiếu", get: (r) => r.so_luong_con_thieu },
    { header: "Ngày ban hành", get: (r) => ngayGio(r.bat_dau) }, { header: "Hạn có ngày dự kiến", get: (r) => ngayGio(r.han_ngay_du_kien) },
    { header: "Ngày nhà máy cam kết", get: (r) => ngay(r.ngay_nm_cam_ket) },
    { header: "Ngày dự kiến gần nhất", get: (r) => ngay(r.ngay_du_kien_gan_nhat) }, { header: "Ngày hàng về (AMIS, gần nhất)", get: (r) => ngay(r.ngay_hang_ve) },
    { header: "Ngày hàng về đủ", get: (r) => ngay(r.ngay_ve_du) }, { header: "Số lần lùi", get: (r) => r.so_lan_lui },
    { header: "Số lỗi", get: (r) => r.so_loi }, { header: "Lỗi chờ giải trình", get: (r) => r.so_loi_cho_gt },
    { header: "Tình trạng", get: (r) => TINH_TRANG[r.tinh_trang].l }, { header: "Cấp CEO", get: (r) => r.ceo_ly_do.join("; ") },
    { header: "Áp dụng quy tắc", get: (r) => (r.ap_dung ? "Có" : "Không") },
  ], "Theo_doi_linh_kien_dat.xlsx", "Theo doi");

  const cell = { padding: "6px 8px", verticalAlign: "top" as const };
  const allOnPage = trang.length > 0 && trang.every((r) => chon.has(r.item_id));
  return (
    <div>
      <PageHeader title="Theo dõi linh kiện đặt" />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {NHOM.map((n) => {
            const cnt = base.filter(n.f).length;
            return <button key={n.k} className={`btn sm ${nhom === n.k ? "primary" : ""}`} onClick={() => { setNhom(n.k); setPage(0); }}>{n.l} ({soLuong(cnt)})</button>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" style={{ width: 300 }} placeholder="Tìm mã/tên LK, mã EO, 3TDO, ID CRM… (không dấu)" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select className="select" style={{ width: 200 }} value={kho} onChange={(e) => { setKho(e.target.value); setPage(0); }}><option value="">Tất cả kho</option>{uniq((r) => r.kho).map((x) => <option key={x}>{x}</option>)}</select>
          <select className="select" style={{ width: 170 }} value={doiTac} onChange={(e) => { setDoiTac(e.target.value); setPage(0); }}><option value="">Tất cả đối tác</option>{uniq((r) => r.doi_tac).map((x) => <option key={x}>{x}</option>)}</select>
          <select className="select" style={{ width: 200 }} value={nguoiDat} onChange={(e) => { setNguoiDat(e.target.value); setPage(0); }}><option value="">Tất cả người đặt</option>{uniq((r) => r.nguoi_dat).map((x) => <option key={x} value={x}>{ten(x)}</option>)}</select>
          <select className="select" style={{ width: 150 }} value={phamVi} onChange={(e) => { setPhamVi(e.target.value as any); setPage(0); }}><option value="dang_mo">Đang mở</option><option value="tat_ca">Cả đã đóng</option></select>
          <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={chiApDung} onChange={(e) => setChiApDung(e.target.checked)} /> Chỉ EO áp dụng quy tắc</label>
          <div style={{ flex: 1 }} />
          <button className="btn sm primary" disabled={!chon.size || busy} onClick={taoPush}><I.send width={14} height={14} /> Tạo file push đối tác ({chon.size})</button>
        <button className="btn sm" onClick={xuatExcel}><I.download width={14} height={14} /> Xuất Excel</button>
        {me.data?.vai_tro === "Admin" && <button className="btn sm ghost" onClick={() => setShowDm(true)}><I.tag width={14} height={14} /> Bảng lỗi</button>}
        </div>
        <div style={{ marginTop: 10 }}><ChuGiaiNgay gon /></div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          Quy tắc (EO ban hành từ ngày áp dụng, áp tới khi hàng về ĐỦ theo AMIS — về thiếu vẫn tính; hết cảnh báo khi về đủ hoặc sửa lại SL đặt): có ngày dự kiến trong 24h làm việc · thứ 2/thứ 4 push đối tác dòng chưa có ngày DK · quá ngày DK phải nhập ngày mới trong 24h —
          vi phạm tự ghi lỗi, phải giải trình (Ai + Lỗi gì + ảnh). Cấp CEO: lùi ≥ 3 lần / ngày DK cách ngày đặt ≥ 30 ngày / ≥ 3 lỗi.
          {q.data?.danh_gia_luc && ` Kiểm tra lỗi lần cuối ${ngayGio(q.data.danh_gia_luc)}.`}
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        {q.isLoading ? <Spinner /> : (
          <div className="tbl-wrap" style={{ overflow: "auto" }}>
            <table className="tbl">
              <thead><tr>
                <th className="qv-act">Thao tác</th>
                <th style={{ width: 32 }}><input type="checkbox" checked={allOnPage} onChange={() => setChon((s) => { const n = new Set(s); trang.forEach((r) => (allOnPage ? n.delete(r.item_id) : n.add(r.item_id))); return n; })} /></th>
                <th>EO / 3TDO</th><th>Linh kiện</th><th>Kho · Đối tác</th><th style={{ textAlign: "right" }}>Đặt / Về / Thiếu</th>
                <th>Ban hành · Hạn có ngày dự kiến</th><th><NhanNgay k="NM" ngan /><br /><NhanNgay k="DK" ngan /><br /><NhanNgay k="VE" ngan /></th><th style={{ textAlign: "center" }}>Lùi</th><th style={{ textAlign: "center" }}>Lỗi</th><th>Tình trạng</th>
              </tr></thead>
              <tbody>
                {trang.length === 0 && <tr><td colSpan={11} className="muted" style={{ textAlign: "center", padding: 24 }}>Không có dòng phù hợp.</td></tr>}
                {trang.map((r) => {
                  const tt = TINH_TRANG[r.tinh_trang];
                  return (
                    <tr key={r.item_id} style={{ background: r.ceo_ly_do.length ? "#FEF2F2" : undefined }}><td className="qv-act" style={cell}>
                        <button className="btn ghost sm" title="Ngày nhà máy cam kết · dự kiến · hàng về (cập nhật)" onClick={() => setModal({ loai: "ndk", dong: r })}><I.calendar width={14} height={14} /></button>
                        <button className="btn ghost sm" title="Giải trình" onClick={() => setModal({ loai: "gt", dong: r })}><I.edit width={14} height={14} /></button>
                        <button className="btn ghost sm" title="Lịch sử theo dõi" onClick={() => setModal({ loai: "ls", dong: r })}><I.clock width={14} height={14} /></button>
                      </td>
                      <td style={cell}><input type="checkbox" checked={chon.has(r.item_id)} onChange={() => setChon((s) => { const n = new Set(s); n.has(r.item_id) ? n.delete(r.item_id) : n.add(r.item_id); return n; })} /></td>
                      <td style={cell}><EoLink id={r.eo_id}>{r.ma_phe_duyet || r.eo_code}</EoLink><div className="muted" style={{ fontSize: 11 }}>{r.eo_code} · {ten(r.nguoi_dat)}</div></td>
                      <td style={{ ...cell, maxWidth: 260 }}><b><PartLink ma={r.part_code} /></b><div className="muted" style={{ fontSize: 11.5 }}>{r.part_name}</div>{r.id_crm && <div className="muted" style={{ fontSize: 11 }}>Ca {r.id_crm}</div>}</td>
                      <td style={cell}>{r.kho}<div className="muted" style={{ fontSize: 11.5 }}>{r.doi_tac ?? "—"}</div></td>
                      <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{soLuong(r.so_luong_dat)} / {soLuong(r.sl_nhap_amis)} / <b>{soLuong(r.so_luong_con_thieu)}</b></td>
                      <td style={{ ...cell, whiteSpace: "nowrap", fontSize: 12 }}>{ngayGio(r.bat_dau)}<div className="muted">{r.ap_dung ? `hạn ${ngayGio(r.han_ngay_du_kien)}` : "không áp dụng quy tắc"}</div></td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}><BaNgay nm={r.ngay_nm_cam_ket} dk={r.ngay_du_kien_gan_nhat} ve={r.ngay_hang_ve} veDu={!!r.ngay_ve_du} />{r.han_cap_nhat_lai && <div style={{ fontSize: 11, color: "var(--danger)" }}>cập nhật trước {ngayGio(r.han_cap_nhat_lai)}</div>}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{r.so_lan_lui || ""}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{r.so_loi ? <span className={`badge ${r.so_loi_cho_gt ? "reject" : "nhap"}`} title={`${r.so_loi_cho_gt} chờ giải trình`}>{r.so_loi}{r.so_loi_cho_gt ? ` (${r.so_loi_cho_gt} chờ)` : ""}</span> : ""}</td>
                      <td style={cell}><span className={`badge ${tt.c}`}>{tt.l}</span>{r.ceo_ly_do.length > 0 && <div><span className="badge reject" title={r.ceo_ly_do.join("\n")} style={{ marginTop: 4 }}>Cấp CEO</span></div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > PAGE && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", padding: 10, fontSize: 12.5 }}>
            {page * PAGE + 1}–{Math.min(rows.length, page * PAGE + PAGE)} / {soLuong(rows.length)}
            <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
            <button className="btn sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>›</button>
          </div>
        )}
      </Card>

      {modal?.loai === "ndk" && <NgayHangVeModal dong={modal.dong} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.loai === "gt" && <GiaiTrinhModal dong={modal.dong} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.loai === "ls" && <LichSuModal dong={modal.dong} onClose={() => setModal(null)} />}
      {pushKq && <PushKetQua dot={pushKq} onClose={() => setPushKq(null)} />}
      {showDm && <BangLoiModal onClose={() => setShowDm(false)} />}
    </div>
  );
}

function BangLoiModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const dm = useDanhMuc();
  const [f, setF] = useState({ loai: "LOI", ma: "", ten: "", thu_tu: "0" });
  const [err, setErr] = useState("");
  const save = async (row: any) => {
    setErr("");
    try { await api.put("/theo-doi/danh-muc", row); qc.invalidateQueries({ queryKey: ["tl-danh-muc"] }); setF({ loai: f.loai, ma: "", ten: "", thu_tu: "0" }); }
    catch { setErr("Lỗi lưu (cần mã + tên)."); }
  };
  return (
    <Modal title="Bảng lỗi & danh sách Ai" onClose={onClose} wide>
      {(["AI", "LOI"] as const).map((loai) => (
        <div key={loai} style={{ marginBottom: 14 }}>
          <b style={{ fontSize: 13.5 }}>{loai === "AI" ? "Ai chịu trách nhiệm" : "Lỗi gì"}</b>
          {(dm.data ?? []).filter((x) => x.loai === loai).map((x) => (
            <div key={x.ma} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13, opacity: x.active ? 1 : 0.5 }}>
              <code style={{ width: 170 }}>{x.ma}</code><span style={{ flex: 1 }}>{x.ten}</span>
              <button className="btn ghost sm" onClick={() => save({ ...x, active: !x.active })}>{x.active ? "Ẩn" : "Hiện"}</button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <select className="select" style={{ width: 110 }} value={f.loai} onChange={(e) => setF({ ...f, loai: e.target.value })}><option value="LOI">Lỗi</option><option value="AI">Ai</option></select>
        <input className="input" style={{ width: 170 }} placeholder="Mã (vd NCC_GIAO_THIEU)" value={f.ma} onChange={(e) => setF({ ...f, ma: e.target.value })} />
        <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Tên hiển thị" value={f.ten} onChange={(e) => setF({ ...f, ten: e.target.value })} />
        <input className="input" style={{ width: 70 }} placeholder="Thứ tự" value={f.thu_tu} onChange={(e) => setF({ ...f, thu_tu: e.target.value })} />
        <button className="btn primary" onClick={() => save({ ...f, thu_tu: Number(f.thu_tu) || 0, active: true })}>Thêm / sửa</button>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
    </Modal>
  );
}
