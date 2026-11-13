import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal, Card, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten, loiChuanTxt } from "../../lib/format";
import { KHO_THEO_PHONG_BAN, STATUS_META } from "../../lib/nav";
import { FILE_ACCEPT, checkFile, driveThumb, fileSize, isExcel, isImage, uploadEoFiles } from "../../lib/files";
import { dailyTemplate, parseDailyFile, type Parsed } from "../../lib/planExcel";
import { PlanImportModal } from "../../components/PlanImportModal";
import { exportRowsToXlsx } from "../../lib/exportXlsx";
import { NGAY, NhanNgay, ChuGiaiNgay } from "../../lib/ngay";
import { TN, Hoi, type KhoaTN } from "../../lib/thuatNgu";
import { NgayHangVeModal } from "../theodoi/shared";
import { DL, GoiYDatalists, useGoiYDong, tenKhiDoiMa, ChonLyDo } from "../../lib/goiY";
import { Kho } from "../../lib/kho";

/**
 * Cac thao tac xu ly EO dung chung cho trang Chi tiet EO va popup xem nhanh (components/quickview):
 * tab ke hoach hang ve, tai lieu, modal sua dong / thay ma / them dong / huy / rut ve nhap, va quyen (khop backend).
 */

/** Quyen thao tac tren 1 EO - khop backend (lib/eoAccess.ts canEditPlan, routes eo/approvals). */
export function quyenEo(eo: any, me: any) {
  const m = me ?? {};
  const role = m.vai_tro;
  const issued = eo.trang_thai === "ISSUED";
  const preIssue = ["DRAFT", "IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(eo.trang_thai);
  const canManage = role === "Admin" || role === "KH cung ung" || eo.created_by === m.email;
  return {
    issued, preIssue, canManage,
    canEditDraft: eo.trang_thai === "DRAFT" && canManage,
    canRecall: ["IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(eo.trang_thai) && canManage,
    canCancel: (preIssue && canManage) || (issued && role === "Admin"),
    canEditQty: canManage && (issued || eo.trang_thai === "DRAFT"),
    canApprovePostIssue: issued && (m.email === eo.final_approver_email || role === "Admin"),
    canEditPlan: role !== "View" && (eo.created_by === m.email || ["Admin", "KH cung ung", "Kho", "Theo doi tien do"].includes(role) ||
      m.la_nv_dat_hang === 1 || m.la_nv_kho === 1 || m.la_theo_doi_td === 1),
    // huy 1 dong cua EO da ban hanh (ke ca dong them sau BH da duyet) - khop backend /items/:id/cancel-line
    canCancelLine: issued && (canManage || m.email === eo.final_approver_email),
    canDeleteFile: role === "Admin" || (canManage && !["ISSUED", "CANCELLED"].includes(eo.trang_thai)),
    readOnly: role === "View",
    // sua ma LK / kho / doi tac dong dat - khop backend lib/eoAccess canSuaThongTinDong (dieu kien PO chua ket thuc kiem o backend)
    canSuaThongTin: ["DRAFT", "ISSUED"].includes(eo.trang_thai) && role !== "View" && (["Admin", "KH cung ung", "Ke toan"].includes(role) ||
      m.la_ke_toan === 1 || m.la_nv_dat_hang === 1 || eo.created_by === m.email),
    // ket thuc som ca PO - khop backend POST /eo/:id/ket-thuc-som
    canKetThucSomPo: issued && (canManage || m.email === eo.final_approver_email),
    // Copy EO = tao EO moi tu thong tin phieu - khop backend lib/eoAccess.ts canCreateEo
    canCopy: role === "Admin" || role === "KH cung ung" || m.la_nv_dat_hang === 1 || m.la_nv_kho === 1,
  };
}

export function TabKeHoach({ eo, items, plans, issued, canEdit, onChanged }: any) {
  const [edit, setEdit] = useState<any>(null);
  const [bulk, setBulk] = useState(false);
  const [imp, setImp] = useState<{ name: string; parsed: Parsed } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [ngayItem, setNgayItem] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bs = useQuery({ queryKey: ["eo-bo-sung", eo.id], queryFn: () => api.get<any>(`/xem/eo/${eo.id}/bo-sung`), enabled: issued });
  const po = eo.approval_code || eo.eo_code;
  const plannedOf = (itemId: number, excludeId?: number) =>
    plans.filter((p: any) => p.eo_item_id === itemId && p.id !== excludeId).reduce((s: number, p: any) => s + (p.planned_qty || 0), 0);
  const editable = issued && canEdit;
  const activeItems = items.filter((i: any) => i.line_status !== "CANCELLED_LINE");
  const lines = activeItems.map((i: any) => ({ ...i, eo_code: eo.eo_code, approval_code: eo.approval_code, da_len_kh: plannedOf(i.id), da_len_kh_loai: 0, da_ve: i.da_dat }));
  const onFile = async (f: File) => {
    setErr(""); setMsg("");
    try { setImp({ name: f.name, parsed: await parseDailyFile(f) }); } catch { setErr("Không đọc được file Excel."); }
  };
  // ---- bang THEO DONG linh kien: moi dong = 1 linh kien, gom cac dot ke hoach + cac lan hang ve (AMIS) cua dong do
  const homNay = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const dd = (x?: string | null) => (x ? `${x.slice(8, 10)}/${x.slice(5, 7)}` : "—");
  const nhapBy = new Map<number, any[]>();
  for (const r of bs.data?.phieu_nhap ?? []) nhapBy.set(r.matched_eo_item_id, [...(nhapBy.get(r.matched_eo_item_id) ?? []), r]);
  const rowsDong = activeItems.map((i: any) => {
    const ps = plans.filter((p: any) => p.eo_item_id === i.id).sort((x: any, y: any) => String(x.planned_date).localeCompare(String(y.planned_date)));
    const ve = (nhapBy.get(i.id) ?? []).sort((x: any, y: any) => String(x.doc_date).localeCompare(String(y.doc_date)));
    const kh = ps.reduce((s: number, p: any) => s + (p.planned_qty || 0), 0);
    const thieu = Math.max(0, i.current_qty - (i.da_dat || 0));
    const dkTiep = ps.map((p: any) => p.planned_date as string).filter((x: string) => x >= homNay)[0] ?? null;
    const dkCuoi = ps.length ? ps[ps.length - 1].planned_date : null;
    const tt = thieu <= 0 ? { l: "Về đủ", c: "issued" }
      : !ps.length ? { l: "Chưa có kế hoạch", c: "reject" }
      : !dkTiep && dkCuoi && dkCuoi < homNay ? { l: "Quá ngày dự kiến", c: "reject" }
      : kh < i.current_qty ? { l: `Thiếu KH ${soLuong(i.current_qty - kh)}`, c: "final" }
      : { l: "Chờ hàng", c: "review" };
    // chuoi tim: dua ngay cac dot / phieu vao de o tim nhanh cua bang tim duoc theo ngay
    return { ...i, _ps: ps, _ve: ve, _kh: kh, _thieu: thieu, _tt: tt.l, _ttc: tt.c, _dk: dkTiep,
      _tim: `${ps.map((p: any) => `${dd(p.factory_committed_date)} ${dd(p.planned_date)} ${p.tuan ?? ""}`).join(" ")} ${ve.map((r: any) => `${dd(r.doc_date)} ${r.doc_no}`).join(" ")}` };
  });
  const cols: Col<any>[] = [
    {
      key: "act", header: "", render: (r) => (
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn ghost sm" title="Xem / sửa các đợt: ngày nhà máy cam kết · dự kiến · hàng về" onClick={() => setNgayItem(r)}><I.calendar width={14} height={14} /></button>
          {editable && r._thieu > 0 && <button className="btn ghost sm" title="Thêm 1 đợt hàng về cho dòng này" onClick={() => setEdit({ eo_item_id: r.id })}><I.plus width={14} height={14} /></button>}
        </div>
      ),
    },
    { key: "pc", header: "Linh kiện", maxW: 170, render: (r) => <><b>{r.part_code}</b>{r.part_code_goc && <span className="muted" style={{ fontSize: 10.5 }}> · thay từ {r.part_code_goc}</span>}<div className="muted" style={{ fontSize: 11.5 }}>{r.part_name}</div></> },
    { key: "wh", header: <Hoi k="KHO" nhan="Kho" />, maxW: 95, render: (r) => <Kho t={r.warehouse} /> },
    { key: "sl", header: <Hoi k="SL_DAT" />, align: "right", render: (r) => <b>{soLuong(r.current_qty)}</b> },
    {
      key: "ps", header: <span title="Mỗi dòng = 1 đợt: ngày nhà máy cam kết → ngày dự kiến · SL"><NhanNgay k="NM" ngan /> → <NhanNgay k="DK" ngan /> · SL</span>, wrap: true, render: (r) => r._ps.length === 0
        ? <span style={{ color: "var(--danger-ink)", fontSize: 12 }}>Chưa có đợt nào</span>
        : <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: "nowrap" }}>{r._ps.map((p: any) => (
          <div key={p.id} title={p.ghi_chu ? `Nguồn: ${p.ghi_chu}` : undefined} style={{ opacity: p.planned_date < homNay && r._thieu > 0 ? 0.75 : 1 }}>
            {p.loai === "TUAN" ? <span className="badge final" style={{ fontSize: 10 }}>Tuần {Number(String(p.tuan).split("W")[1])}</span>
              : <span style={{ color: NGAY.NM.mau }}>{dd(p.factory_committed_date)}</span>}
            {" → "}<b style={{ color: NGAY.DK.mau }}>{dd(p.planned_date)}</b> · {soLuong(p.planned_qty)}{p.ghi_chu ? " ✎" : ""}
          </div>))}</div>,
    },
    { key: "kh", header: <Hoi k="SL_KH" nhan="Lên KH" />, align: "right", render: (r) => <span style={{ color: r._kh < r.current_qty && r._thieu > 0 ? "var(--warn-ink)" : undefined, fontWeight: 600 }}>{soLuong(r._kh)}</span> },
    {
      key: "ve", header: <span title="Từng lần nhập kho theo phiếu AMIS khớp dòng: ngày · SL"><NhanNgay k="VE" /> (AMIS)</span>, wrap: true, render: (r) => r._ve.length === 0
        ? (r.da_dat > 0 ? <b style={{ color: NGAY.VE.mau }}>{soLuong(r.da_dat)}</b> : <span className="muted" style={{ fontSize: 12 }}>Chưa về</span>)
        : <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: "nowrap", color: NGAY.VE.mau }}>{r._ve.map((x: any) => <div key={x.id} title={x.doc_no}>{dd(x.doc_date)} · <b>{soLuong(x.qty_in)}</b></div>)}</div>,
    },
    { key: "thieu", header: <Hoi k="SL_THIEU" />, align: "right", render: (r) => r._thieu > 0 ? <b>{soLuong(r._thieu)}</b> : <span style={{ color: "var(--ok-ink)" }}>0</span> },
    { key: "tt", header: "Tình trạng", render: (r) => <><span className={`badge ${r._ttc}`}>{r._tt}</span>{r._dk && r._thieu > 0 && <div className="muted" style={{ fontSize: 11 }}>về tiếp {dd(r._dk)}</div>}</> },
  ];
  const tongDat = rowsDong.reduce((s: number, r: any) => s + r.current_qty, 0);
  const tongKh = rowsDong.reduce((s: number, r: any) => s + r._kh, 0);
  const tongVe = rowsDong.reduce((s: number, r: any) => s + (r.da_dat || 0), 0);
  const tongThieu = rowsDong.reduce((s: number, r: any) => s + r._thieu, 0);
  const demTt = (l: string) => rowsDong.filter((r: any) => r._tt.startsWith(l)).length;
  return (
    <>
      {!issued && <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>Lập kế hoạch hàng về sau khi EO được ban hành.</div>}
      {issued && (
        <details style={{ background: "var(--panel-2)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 12.5, lineHeight: 1.55 }}>
          <summary style={{ cursor: "pointer" }}>
            Mỗi dòng phải có <b>ngày dự kiến</b> trong 24 giờ (Karofi / Livotec / Korihome) hoặc 48 giờ làm việc (hãng khác) sau ban hành · cập nhật bằng nút 📅 / ＋ ở cột Thao tác · đơn kế hoạch tháng:{" "}
            <a href={`/don-hang/ke-hoach-tuan?eo=${eo.id}`} onClick={(e) => e.stopPropagation()}>nhập theo tuần</a> <span className="muted">(bấm để xem vì sao)</span>
          </summary>
          Không nhập / quá ngày dự kiến mà chưa cập nhật → hệ thống ghi lỗi, phải giải trình. Kho &amp; CSKH xem kế hoạch để biết khi nào có hàng.
          Tổng SL các đợt của 1 dòng ≤ SL đặt. <b>Theo ngày</b>: nhà máy báo ngày giao từng đợt. <b>Theo tuần</b>: đơn kế hoạch tháng, nhà máy chỉ báo SL mỗi tuần.
        </details>
      )}
      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button className="btn sm primary" onClick={() => setBulk(true)}><I.calendar width={14} height={14} /> Cập nhật hàng loạt</button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Import Excel</button>
          <button className="btn sm ghost" onClick={() => dailyTemplate(lines, plans, `Ke_hoach_hang_ve_${eo.eo_code}.xlsx`)}><I.download width={14} height={14} /> Tải mẫu (các dòng của EO)</button>
          <button className="btn sm ghost" onClick={() => setEdit({})}><I.plus width={14} height={14} /> Thêm 1 đợt</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
        </div>
      )}
      {msg && <div style={{ background: "#DCFCE7", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
        <span className="badge nhap">{rowsDong.length} dòng</span>
        <span>SL đặt <b>{soLuong(tongDat)}</b> · đã lên KH <b style={{ color: tongKh < tongDat ? "var(--warn-ink)" : NGAY.DK.mau }}>{soLuong(tongKh)}</b> · đã về <b style={{ color: NGAY.VE.mau }}>{soLuong(tongVe)}</b> · còn thiếu <b>{soLuong(tongThieu)}</b></span>
        {demTt("Chưa có kế hoạch") > 0 && <span className="badge reject">{demTt("Chưa có kế hoạch")} chưa có kế hoạch</span>}
        {demTt("Quá ngày") > 0 && <span className="badge reject">{demTt("Quá ngày")} quá ngày dự kiến</span>}
        {demTt("Thiếu KH") > 0 && <span className="badge final">{demTt("Thiếu KH")} thiếu kế hoạch</span>}
        {demTt("Về đủ") > 0 && <span className="badge issued">{demTt("Về đủ")} về đủ</span>}
      </div>
      <DataTable cols={cols} rows={rowsDong} keyOf={(r) => r.id} empty="EO không có dòng linh kiện hiệu lực" pageSize={20} />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      {ngayItem && <NgayHangVeModal dong={{ item_id: ngayItem.id, part_code: ngayItem.part_code }} onClose={() => setNgayItem(null)} onSaved={() => { setNgayItem(null); onChanged(); }} />}
      {edit && (
        <PlanModal plan={edit} items={activeItems} po={po} plannedOf={plannedOf}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />
      )}
      {bulk && (
        <BulkPlanModal po={po} items={activeItems} plans={plans}
          onClose={() => setBulk(false)} onSaved={(n: number) => { setBulk(false); setMsg(`Đã cập nhật kế hoạch cho ${n} dòng linh kiện.`); onChanged(); }} />
      )}
      {imp && (
        <PlanImportModal loai="NGAY" fileName={imp.name} parsed={imp.parsed} onClose={() => setImp(null)}
          onDone={(sm) => { setImp(null); setMsg(`Import xong: ${sm.so_ghi} mốc kế hoạch cho ${sm.so_dong_lk} linh kiện${sm.so_ke_hoach_cu_thay ? `, thay ${sm.so_ke_hoach_cu_thay} mốc cũ` : ""}.`); onChanged(); }} />
      )}
    </>
  );
}

const lineLabel = (po: string, i: any) => `${po} · ${i.part_code}${i.part_name ? ` · ${i.part_name}` : ""} · ${i.warehouse}`;

export function PlanModal({ plan, items, po, plannedOf, onClose, onSaved }: any) {
  const isNew = plan.id == null;
  const [itemId, setItemId] = useState<string>(plan.eo_item_id ? String(plan.eo_item_id) : "");
  const [date, setDate] = useState(plan.planned_date ?? "");
  const [qty, setQty] = useState(plan.planned_qty != null ? String(plan.planned_qty) : "");
  const [factory, setFactory] = useState(plan.factory_committed_date ?? "");
  const [note, setNote] = useState(plan.ghi_chu ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const item = items.find((i: any) => String(i.id) === itemId);
  const remain = item ? item.current_qty - plannedOf(item.id, plan.id) : 0;
  const save = async () => {
    setErr("");
    if (!itemId) return setErr("Chọn dòng linh kiện.");
    if (!date) return setErr(`Chọn ${NGAY.DK.l.toLowerCase()}.`);
    if (!(Number(qty) > 0)) return setErr("Nhập số lượng > 0.");
    setBusy(true);
    const body = { planned_date: date, planned_qty: Number(qty), factory_committed_date: factory || null, ghi_chu: note.trim() || null };
    try {
      if (isNew) await api.post("/plans", { eo_item_id: Number(itemId), ...body });
      else await api.patch(`/plans/${plan.id}`, body);
      onSaved();
    } catch (e: any) {
      setErr(e?.body?.error === "PLAN_EXCEEDS_QTY" ? `Vượt số lượng đặt — còn được lên KH tối đa ${soLuong(remain)}.` :
        e?.body?.error === "READ_ONLY" ? "Tài khoản chỉ xem, không được cập nhật kế hoạch." : "Lỗi lưu kế hoạch.");
      setBusy(false);
    }
  };
  return (
    <Modal title={isNew ? "Thêm đợt hàng về (kế hoạch)" : "Sửa đợt hàng về (kế hoạch)"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Lưu</button></>}>
      <ChuGiaiNgay gon />
      <label className="field-label">Dòng linh kiện (Mã PO · Mã LK · Tên LK · Kho) <span className="req">*</span></label>
      <select className="select" value={itemId} disabled={!isNew} onChange={(e) => setItemId(e.target.value)}>
        <option value="">Chọn dòng linh kiện</option>
        {items.map((i: any) => <option key={i.id} value={i.id}>{lineLabel(po, i)} (SL {soLuong(i.current_qty)})</option>)}
      </select>
      {item && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}><Hoi k="SL_CHUA_KH" />: <b>{soLuong(remain)}</b> (SL đặt {soLuong(item.current_qty)} − đã lên kế hoạch {soLuong(item.current_qty - remain)})</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div><label className="field-label"><NhanNgay k="NM" /></label>
          <input className="input" type="date" value={factory} onChange={(e) => { if (!date || date === factory) setDate(e.target.value); setFactory(e.target.value); }} /></div>
        <div><label className="field-label"><NhanNgay k="DK" req /></label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Nhập {NGAY.NM.l.toLowerCase()} → {NGAY.DK.l.toLowerCase()} tự điền theo (thường trùng nhau).</div>
      <label className="field-label" style={{ marginTop: 12 }}>SL về trong đợt này <span className="req">*</span></label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Tổng SL các đợt của 1 dòng không được lớn hơn SL đặt.</div>
      <label className="field-label" style={{ marginTop: 12 }}>Ghi chú / nguồn</label>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nguồn: vd KRF xác nhận qua mail 21/10" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Day 1 ngay ve (va SL) cho nhieu dong cung luc - "day ngay dap ung hang loat". */
export function BulkPlanModal({ po, items, plans, onClose, onSaved }: any) {
  type R = { chon: boolean; date: string; qty: string; nm: string; note: string };
  const [rows, setRows] = useState<Record<number, R>>(() => Object.fromEntries(items.map((i: any) => [i.id, { chon: false, date: "", qty: "", nm: "", note: "" }])));
  const [thayThe, setThayThe] = useState(false);
  const [q, setQ] = useState("");
  const [allDate, setAllDate] = useState("");
  const [allNm, setAllNm] = useState("");
  const [allQty, setAllQty] = useState<"con_lai" | "giu">("con_lai");
  const [errs, setErrs] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sumOf = (id: number, loai?: string) => plans.filter((p: any) => p.eo_item_id === id && (!loai || (p.loai ?? "NGAY") === loai)).reduce((s: number, p: any) => s + (p.planned_qty || 0), 0);
  const conLai = (i: any) => Math.max(0, i.current_qty - (thayThe ? sumOf(i.id) - sumOf(i.id, "NGAY") : sumOf(i.id)));
  const kw = q.trim().toLowerCase();
  const shown = items.filter((i: any) => !kw || `${i.part_code} ${i.part_name} ${i.warehouse}`.toLowerCase().includes(kw));
  const set = (id: number, patch: Partial<R>) => setRows((rs) => ({ ...rs, [id]: { ...rs[id], ...patch } }));
  const allChecked = shown.length > 0 && shown.every((i: any) => rows[i.id].chon);
  const toggleAll = () => setRows((rs) => { const n = { ...rs }; for (const i of shown) n[i.id] = { ...n[i.id], chon: !allChecked }; return n; });
  const apply = () => {
    if (!allDate && !allNm) return setErr(`Chọn ${NGAY.DK.l.toLowerCase()} và/hoặc ${NGAY.NM.l.toLowerCase()} chung trước khi áp dụng.`);
    setErr("");
    setRows((rs) => {
      const n = { ...rs };
      for (const i of items) if (n[i.id].chon) n[i.id] = {
        ...n[i.id],
        // DK thuong = NM: chi nhap NM chung thi DK lay theo NM (tru khi dong da co DK rieng khac NM cu)
        date: allDate || (allNm && (!n[i.id].date || n[i.id].date === n[i.id].nm) ? allNm : n[i.id].date),
        nm: allNm || n[i.id].nm,
        qty: allQty === "con_lai" ? String(conLai(i)) : n[i.id].qty,
      };
      return n;
    });
  };
  const chosen = items.filter((i: any) => rows[i.id].chon);
  const save = async () => {
    setErr(""); setErrs({});
    const e: Record<number, string> = {};
    for (const i of chosen) {
      const r = rows[i.id];
      const qn = Number(r.qty);
      if (!r.date) e[i.id] = `Thiếu ${NGAY.DK.l.toLowerCase()}`;
      else if (!(qn > 0)) e[i.id] = "SL phải > 0";
      else if (qn > conLai(i)) e[i.id] = `Vượt còn lại ${soLuong(conLai(i))}`;
    }
    if (!chosen.length) return setErr("Chưa chọn dòng nào.");
    if (Object.keys(e).length) { setErrs(e); return setErr("Có dòng chưa hợp lệ (tô đỏ)."); }
    setBusy(true);
    try {
      await api.post("/plans/bulk", {
        loai: "NGAY", thay_the: thayThe, nguon: "man_hinh",
        rows: chosen.map((i: any) => ({ eo_item_id: i.id, planned_date: rows[i.id].date, planned_qty: Number(rows[i.id].qty), factory_committed_date: rows[i.id].nm || null, ghi_chu: rows[i.id].note.trim() || null })),
      });
      onSaved(chosen.length);
    } catch (ex: any) {
      const srv: Record<number, string> = {};
      for (const r of ex?.body?.rows ?? []) if (!r.ok && r.eo_item_id) srv[r.eo_item_id] = r.error_text;
      setErrs(srv);
      setErr(Object.keys(srv).length ? "Máy chủ từ chối một số dòng (tô đỏ) — chưa ghi gì." : "Lỗi lưu kế hoạch.");
      setBusy(false);
    }
  };
  const cell = { padding: "4px 6px" };
  return (
    <Modal title="Cập nhật kế hoạch hàng về hàng loạt" onClose={onClose} width={1180}
      footer={<>
        <span className="muted" style={{ marginRight: "auto", fontSize: 12.5 }}>Đã chọn {chosen.length} / {items.length} dòng</span>
        <button className="btn" onClick={onClose}>Hủy</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Đang lưu..." : `Lưu ${chosen.length} dòng`}</button>
      </>}>
      <ChuGiaiNgay gon />
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", padding: 12, background: "var(--surface-2, #F8FAFC)", borderRadius: 10, marginBottom: 12 }}>
        <div><label className="field-label"><NhanNgay k="NM" /> chung</label><input className="input" type="date" value={allNm} onChange={(e) => setAllNm(e.target.value)} /></div>
        <div><label className="field-label"><NhanNgay k="DK" /> chung</label><input className="input" type="date" value={allDate} onChange={(e) => setAllDate(e.target.value)} placeholder="để trống = theo NM" /></div>
        <div><label className="field-label">SL về trong đợt</label>
          <select className="select" value={allQty} onChange={(e) => setAllQty(e.target.value as any)}>
            <option value="con_lai">= SL chưa lên kế hoạch của dòng</option><option value="giu">Giữ SL đang nhập</option>
          </select>
        </div>
        <button className="btn primary" onClick={apply}>Áp dụng cho dòng đã chọn</button>
        <input className="input" style={{ marginLeft: "auto", width: 220 }} placeholder="Lọc mã / tên LK / kho..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8 }}>
        <input type="checkbox" checked={thayThe} onChange={(e) => setThayThe(e.target.checked)} />
        Thay toàn bộ đợt (theo ngày) đang có của các dòng được chọn bằng đợt mới này — không tick = thêm 1 đợt mới bên cạnh đợt cũ
      </label>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      <div className="tbl-wrap" style={{ maxHeight: "50vh", overflow: "auto" }}>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 32 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
            <th>Mã PO</th><th>Mã LK</th><th>Tên linh kiện</th><th>Kho</th>
            <th style={{ textAlign: "right" }}><Hoi k="SL_DAT" /></th><th style={{ textAlign: "right" }}><Hoi k="SL_KH" nhan="Đã lên KH" /></th><th style={{ textAlign: "right" }}><Hoi k="SL_CHUA_KH" /></th>
            <th><NhanNgay k="NM" ngan /></th><th><NhanNgay k="DK" ngan /></th><th>SL</th><th>Ghi chú / nguồn</th>
          </tr></thead>
          <tbody>
            {shown.map((i: any) => {
              const r = rows[i.id];
              const e = errs[i.id];
              return (
                <tr key={i.id} style={{ background: e ? "#FEF2F2" : r.chon ? "#FFFBEB" : undefined }} title={e}>
                  <td style={cell}><input type="checkbox" checked={r.chon} onChange={(ev) => set(i.id, { chon: ev.target.checked })} /></td>
                  <td style={cell}>{po}</td>
                  <td style={cell}><b>{i.part_code}</b></td>
                  <td style={{ ...cell, maxWidth: 220 }}>{i.part_name}{i.ghi_chu && <div className="muted" style={{ fontSize: 11 }}>Ghi chú: {i.ghi_chu}</div>}</td>
                  <td style={cell}><Kho t={i.warehouse} /></td>
                  <td style={{ ...cell, textAlign: "right" }}>{soLuong(i.current_qty)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{soLuong(sumOf(i.id))}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{soLuong(conLai(i))}</td>
                  <td style={cell}><input className="input" type="date" style={{ width: 140 }} value={r.nm} onChange={(ev) => set(i.id, { nm: ev.target.value, chon: true, ...(!r.date || r.date === r.nm ? { date: ev.target.value } : {}) })} /></td>
                  <td style={cell}><input className="input" type="date" style={{ width: 140 }} value={r.date} onChange={(ev) => set(i.id, { date: ev.target.value, chon: true })} /></td>
                  <td style={cell}><input className="input right" style={{ width: 80 }} value={r.qty} onChange={(ev) => set(i.id, { qty: ev.target.value, chon: true })} /></td>
                  <td style={cell}><input className="input" style={{ width: 140 }} value={r.note} onChange={(ev) => set(i.id, { note: ev.target.value })} />{e && <div style={{ color: "var(--danger)", fontSize: 11 }}>{e}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        1 linh kiện về nhiều đợt khác ngày: dùng "Import Excel" (mỗi đợt 1 dòng) hoặc lưu đợt này rồi mở lại để thêm đợt tiếp.
      </div>
    </Modal>
  );
}

export function ReplacePartModal({ item, onClose, onSaved }: any) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("NCC giao mã tương đương");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const goc = item.part_code_goc;
  const save = async () => {
    setErr("");
    if (!code.trim()) return setErr("Nhập mã linh kiện mới.");
    if (!reason.trim()) return setErr("Nhập lý do.");
    setBusy(true);
    try {
      await api.post(`/eo/items/${item.id}/replace-part`, { part_code: code.trim(), part_name: name.trim() || undefined, reason: reason.trim() });
      onSaved();
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "SAME_PART" ? "Mã mới trùng mã hiện tại." : c === "DUPLICATE_LINE" ? "EO đã có dòng mã này ở cùng kho." :
        c === "FORBIDDEN" ? "Bạn không có quyền sửa dòng này." : c === "ONLY_ISSUED" ? "Chỉ thay mã khi EO đã ban hành." : "Lỗi thay mã.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Thay mã linh kiện tương đương — ${item.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Thay mã</button></>}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        Dùng khi nhà cung cấp (vd KRF) giao mã khác tương đương với mã đã duyệt. Số lượng, kế hoạch, kho giữ nguyên;
        hàng về AMIS theo cả mã cũ lẫn mã mới đều được tính cho dòng này. Lịch sử EO ghi lại lần thay.
      </div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        Kho: <b><Kho t={item.warehouse} /></b> · Mã hiện tại: <b>{item.part_code}</b> {item.part_name && `— ${item.part_name}`}
        {goc && <div>Mã đã duyệt ban đầu: <b>{goc}</b> <button className="btn ghost sm" onClick={() => { setCode(goc); setName(item.part_name_goc ?? ""); setReason("Trả về mã đã duyệt"); }}>Trả về mã gốc</button></div>}
      </div>
      <label className="field-label">Mã linh kiện mới <span className="req">*</span></label>
      <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mã NCC thực giao" />
      <label className="field-label" style={{ marginTop: 12 }}>Tên linh kiện mới <span className="muted">(để trống = giữ tên cũ)</span></label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Lý do <span className="req">*</span></label>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

export function TabTaiLieu({ eoId, files, onUploaded, canDelete, myEmail, preIssue }: any) {
  const del = async (f: any) => {
    if (!confirm(`Xóa tệp đính kèm "${f.file_name}"?`)) return;
    try { await api.del(`/eo/${eoId}/files/${f.id}`); onUploaded(); }
    catch (e: any) { alert(e?.body?.error === "ADMIN_ONLY_AFTER_ISSUE" ? "EO đã ban hành — chỉ Admin được xóa tệp." : e?.body?.error === "FORBIDDEN" ? "Bạn không có quyền xóa tệp này." : "Lỗi xóa tệp."); }
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!list.length) return;
    const bad = list.map(checkFile).filter(Boolean) as string[];
    const good = list.filter((f) => !checkFile(f));
    setErr(""); setBusy(true);
    const errs = [...bad, ...(await uploadEoFiles(eoId, good, note.trim() || undefined))];
    setBusy(false);
    if (errs.length) setErr(errs.join(" · "));
    if (good.length) { setNote(""); onUploaded(); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn sm primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <I.upload width={14} height={14} /> {busy ? "Đang tải lên..." : "Tải lên (Excel, ảnh, PDF...)"}
        </button>
        <input className="input" style={{ width: 320 }} placeholder="Ghi chú cho tệp (tuỳ chọn) — vd: báo giá KRF bổ sung" value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="muted" style={{ fontSize: 12 }}>Chọn được nhiều tệp, tối đa 20MB/tệp. Mỗi lần tải ghi vào Lịch sử thay đổi.</span>
        <input ref={inputRef} type="file" multiple accept={FILE_ACCEPT} style={{ display: "none" }} onChange={onPick} />
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
        {files.length === 0 && <div className="muted">Chưa có tài liệu.</div>}
        {files.map((f: any) => (
          <div key={f.id} onClick={() => f.drive_url && window.open(f.drive_url, "_blank", "noopener")} style={{ cursor: f.drive_url ? "pointer" : undefined }}>
            <Card style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
              {isImage(f.file_name) && f.drive_file_id && (
                <img src={driveThumb(f.drive_file_id)} alt={f.file_name} loading="lazy" referrerPolicy="no-referrer"
                  style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 8, background: "#F1F5F9" }} />
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <I.file width={22} height={22} style={{ color: isExcel(f.file_name) ? "#16A34A" : "var(--text-muted)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, wordBreak: "break-word" }}>{f.file_name}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{ten(f.uploaded_by)} · {ngayGio(f.uploaded_at)}{f.file_size ? ` · ${fileSize(f.file_size)}` : ""}</div>
                  {f.ghi_chu && <div style={{ fontSize: 12, marginTop: 3 }}>{f.ghi_chu}</div>}
                  {!f.drive_url && <span className="badge nhap" style={{ marginTop: 6 }}>Chưa đồng bộ</span>}
                  {(canDelete || (preIssue && f.uploaded_by === myEmail)) && (
                    <button className="btn ghost sm danger" style={{ marginTop: 6 }} onClick={(e) => { e.stopPropagation(); del(f); }}>
                      <I.trash width={13} height={13} /> Xóa
                    </button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Sua SL dat + thong tin dong. Hien ro boi canh (SL dat / da ve / da len ke hoach / con thieu) va giai thich ngay khi
 * SL moi < tong ke hoach: cho chon "tu giam ke hoach tu dot xa nhat" (backend cat_ke_hoach) thay vi bao loi kho hieu.
 */
export function QtyModal({ item, issued, onClose, onSaved }: any) {
  const ctx = useQuery({ queryKey: ["tl-dong", item.id], queryFn: () => api.get<any>(`/theo-doi/dong/${item.id}`) });
  const [qty, setQty] = useState(String(item.current_qty));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(item.ghi_chu ?? "");
  const [crm, setCrm] = useState(item.crm_id ?? "");
  const [order, setOrder] = useState(item.order_id ?? "");
  const [catKh, setCatKh] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const kh: any[] = ctx.data?.ke_hoach ?? [];
  const daVe = (ctx.data?.phieu_nhap ?? []).reduce((s: number, r: any) => s + (r.qty_in || 0), 0);
  const tongKh = kh.reduce((s, p) => s + (p.planned_qty || 0), 0);
  const moi = Number(qty);
  const qtyChanged = qty.trim() !== "" && moi !== Number(item.current_qty);
  const vuotKh = qtyChanged && moi < tongKh;
  // cac dot se bi giam / xoa (tu dot xa nhat) - xem truoc dung nhu backend lam
  const seCat: { p: any; moi: number }[] = [];
  if (vuotKh) {
    let du = tongKh - moi;
    for (const p of [...kh].sort((a, b) => String(b.planned_date).localeCompare(String(a.planned_date)) || b.id - a.id)) {
      if (du <= 0) break;
      const con = Math.max(0, p.planned_qty - du);
      du -= p.planned_qty - con;
      seCat.push({ p, moi: con });
    }
  }
  const save = async () => {
    setErr("");
    const body: Record<string, unknown> = {};
    if (qtyChanged) {
      if (!(moi >= 0)) return setErr("SL đặt phải là số ≥ 0.");
      if (issued && !reason.trim()) return setErr("EO đã ban hành — cần ghi lý do đổi SL đặt (lưu vào lịch sử để người duyệt xem).");
      if (moi === 0 && !reason.trim()) return setErr("SL đặt = 0 là hủy dòng — cần nhập lý do hủy.");
      if (vuotKh && !catKh) return setErr(`SL đặt mới (${soLuong(moi)}) nhỏ hơn tổng kế hoạch (${soLuong(tongKh)}). Tick "Tự giảm kế hoạch" hoặc sửa các đợt trước.`);
      body.current_qty = moi; body.reason = reason.trim() || undefined; if (vuotKh) body.cat_ke_hoach = true;
    }
    if (note.trim() !== (item.ghi_chu ?? "")) body.ghi_chu = note.trim() || null;
    if (crm.trim() !== (item.crm_id ?? "")) body.crm_id = crm.trim() || null;
    if (order.trim() !== (item.order_id ?? "")) body.order_id = order.trim() || null;
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    try {
      await api.patch(`/eo/items/${item.id}`, body);
      onSaved();
    } catch (e: any) {
      setErr(e?.body?.error === "REASON_REQUIRED" ? "Cần nhập lý do." :
        e?.body?.error === "QTY_BELOW_PLANNED_SUM" ? `SL mới nhỏ hơn tổng kế hoạch (${soLuong(e.body.planned_sum)}).` : e?.body?.error === "FORBIDDEN" ? "Bạn không có quyền sửa dòng này." : "Lỗi lưu.");
      setBusy(false);
    }
  };
  const O = ({ k, v, tone }: { k: KhoaTN; v: number; tone?: string }) => (
    <div style={{ background: "var(--panel-2)", borderRadius: 8, padding: "6px 10px" }}>
      <div className="muted" style={{ fontSize: 11.5 }}><Hoi k={k} /></div>
      <div style={{ fontSize: 17, fontWeight: 800, color: tone }}>{soLuong(v)}</div>
    </div>
  );
  return (
    <Modal title={`Sửa SL đặt / thông tin dòng — ${item.part_code}`} onClose={onClose} width={620}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Đang lưu..." : "Lưu"}</button></>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <O k="SL_DAT" v={Number(item.current_qty)} />
        <O k="SL_VE" v={daVe} tone={NGAY.VE.mau} />
        <O k="SL_KH" v={tongKh} tone={NGAY.DK.mau} />
        <O k="SL_THIEU" v={Math.max(0, Number(item.current_qty) - daVe)} />
      </div>
      <label className="field-label"><Hoi k="SL_DAT" nhan="SL đặt mới" /></label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{TN.SL_DAT.la} Đặt = 0 là hủy dòng.</div>
      {qtyChanged && moi < daVe && (
        <div style={{ background: "#FEF2F2", color: "var(--danger-ink)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, marginTop: 8 }}>
          SL đặt mới nhỏ hơn số đã về theo AMIS ({soLuong(daVe)}) — dòng sẽ ghi nhận <b>về thừa {soLuong(daVe - moi)}</b>. Kiểm tra lại trước khi lưu.
        </div>
      )}
      {vuotKh && (
        <div style={{ background: "#FFFBEB", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, marginTop: 8 }}>
          Kế hoạch hàng về đang là <b>{soLuong(tongKh)}</b> ({kh.length} đợt) — lớn hơn SL đặt mới <b>{soLuong(moi)}</b>. Kế hoạch không được nhiều hơn số đặt.
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, fontWeight: 600 }}>
            <input type="checkbox" checked={catKh} onChange={(e) => setCatKh(e.target.checked)} /> Tự giảm kế hoạch từ đợt xa nhất (ghi vào lịch sử)
          </label>
          {catKh && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {seCat.map(({ p, moi: m }) => (
                <li key={p.id}>Đợt {p.loai === "TUAN" ? `tuần ${p.tuan}` : ngay(p.planned_date)}: {soLuong(p.planned_qty)} → {m > 0 ? <b>{soLuong(m)}</b> : <b style={{ color: "var(--danger)" }}>xóa</b>}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {qtyChanged && (
        <>
          <label className="field-label" style={{ marginTop: 12 }}>{moi === 0 ? "Lý do hủy dòng" : "Lý do đổi SL đặt"} {(issued || moi === 0) && <span className="req">*</span>}</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd: nhà máy chỉ giao được 80, khách hủy 20…" />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ghi vào lịch sử EO{issued ? " — bắt buộc vì EO đã ban hành (số đã được duyệt)" : moi === 0 ? " — bắt buộc khi hủy dòng" : ""}.</div>
        </>
      )}
      <label className="field-label" style={{ marginTop: 12 }}><Hoi k="GHI_CHU" nhan="Ghi chú dòng" /></label>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú..." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div><label className="field-label"><Hoi k="ID_CRM" /></label><input className="input" value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="Tuỳ chọn" /></div>
        <div><label className="field-label"><Hoi k="ID_DAT_HANG" /></label><input className="input" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="TLK-..." /></div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Chỉ sửa ghi chú / ID CRM / ID đặt hàng thì không cần lý do.</div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

export function CancelModal({ eo, onClose, onDone }: any) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr("");
    if (!reason.trim()) return setErr("Cần nhập lý do hủy EO (ghi vào lịch sử).");
    setBusy(true);
    try {
      await api.post(`/eo/${eo.id}/cancel`, { reason: reason.trim() });
      onDone();
    } catch (e: any) {
      setErr(e?.body?.error === "FORBIDDEN" ? "Bạn không có quyền hủy EO này." :
        e?.body?.error === "ADMIN_ONLY_AFTER_ISSUE" ? "EO đã ban hành — chỉ Admin được hủy." :
        e?.body?.error === "BAD_STATE" ? "EO đang ở trạng thái không thể hủy." : e?.body?.error === "REASON_REQUIRED" ? "Cần nhập lý do hủy." : "Lỗi hủy EO.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Hủy EO — ${eo.eo_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn danger" disabled={busy} onClick={run}>Xác nhận hủy</button></>}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Hành động này sẽ chuyển EO sang trạng thái "Đã hủy" và không thể hoàn tác.</div>
      <label className="field-label">Lý do hủy <span className="req">*</span></label>
      <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do hủy (bắt buộc)..." />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

export function AddItemModal({ eoId, phongBan, nguoiDuyet, meEmail, onClose, onSaved }: any) {
  const tuDuyet = !!nguoiDuyet && nguoiDuyet === meEmail;
  const khos = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const goiY = useGoiYDong();
  const [partCode, setPartCode] = useState("");
  const [partName, setPartName] = useState("");
  const doiMa = (v: string) => { setPartName(tenKhiDoiMa(goiY.tenTheoMa, partCode, v, partName)); setPartCode(v); };
  const [warehouse, setWarehouse] = useState<string>(KHO_THEO_PHONG_BAN[phongBan ?? ""] ?? "");
  const [supplier, setSupplier] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [crm, setCrm] = useState("");
  const [order, setOrder] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr("");
    if (!partCode.trim()) return setErr("Nhập mã linh kiện.");
    if (!warehouse) return setErr("Chọn kho cần đặt.");
    if (!qty || Number(qty) <= 0) return setErr("Nhập số lượng > 0.");
    setBusy(true);
    try {
      await api.post(`/eo/${eoId}/items`, {
        part_code: partCode.trim(), part_name: partName.trim() || undefined, warehouse,
        supplier: supplier.trim() || undefined, current_qty: Number(qty), reason: reason.trim() || undefined,
        ghi_chu: note.trim() || undefined, crm_id: crm.trim() || undefined, order_id: order.trim() || undefined,
      });
      onSaved();
    } catch (e: any) {
      setErr(loiChuanTxt(e?.body) ?? "Lỗi lưu dòng linh kiện.");
      setBusy(false);
    }
  };
  return (
    <Modal title="Thêm dòng linh kiện (duyệt sau ban hành)" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Lưu</button></>}>
      <div style={{ fontSize: 13, marginBottom: 10, background: tuDuyet ? "#F0FDF4" : "#FFFBEB", borderRadius: 8, padding: "8px 10px" }}>
        {tuDuyet ? <>Bạn là <b>người duyệt mua</b> của EO này — dòng mới được <b>duyệt luôn</b> khi lưu.</>
          : <>Dòng mới sẽ <b>chờ {ten(nguoiDuyet)} duyệt</b> (người duyệt mua của EO) hoặc Admin. Chưa duyệt thì chưa đặt hàng; người duyệt có thể từ chối.</>}
      </div>
      <GoiYDatalists data={goiY.data} />
      <label className="field-label">Mã linh kiện <span className="req">*</span></label>
      <input className="input" list={DL.lk} value={partCode} onChange={(e) => doiMa(e.target.value)} placeholder="Nhập / chọn mã LK" />
      <label className="field-label" style={{ marginTop: 12 }}>Tên linh kiện</label>
      <input className="input" value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Nhập tên linh kiện" />
      <label className="field-label" style={{ marginTop: 12 }}><Hoi k="KHO" req /></label>
      <select className="select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
        <option value="">Chọn kho</option>
        {(khos.data ?? []).filter((k: any) => k.active !== 0).map((k) => <option key={k.ten_kho} value={k.ten_kho}>{k.ten_kho}</option>)}
      </select>
      <label className="field-label" style={{ marginTop: 12 }}><Hoi k="DOI_TAC" /></label>
      <input className="input" list={DL.doiTac} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nhập / chọn đối tác" />
      <label className="field-label" style={{ marginTop: 12 }}><Hoi k="SL_DAT" req /></label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}><Hoi k="LY_DO_PS" /></label>
      <ChonLyDo data={goiY.data} value={reason} onChange={setReason} />
      <label className="field-label" style={{ marginTop: 12 }}>Ghi chú</label>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú..." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div><label className="field-label"><Hoi k="ID_CRM" /></label><input className="input" value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="Tuỳ chọn" /></div>
        <div><label className="field-label"><Hoi k="ID_DAT_HANG" /></label><input className="input" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="TLK-..." /></div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Nguoi tao sua EO khi chua duyet xong: rut ve Nhap (huy phieu duyet dang cho) roi mo form sua. */
export function RecallModal({ eo, onClose, onDone }: any) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr(""); setBusy(true);
    try {
      await api.post(`/eo/${eo.id}/recall`, { reason: reason.trim() || undefined });
      onDone();
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "SUBMISSION_CLOSED" || c === "BAD_STATE" ? "EO vừa được duyệt / xử lý xong — tải lại trang để xem trạng thái mới." :
        c === "FORBIDDEN" ? "Bạn không có quyền sửa EO này." : "Lỗi rút EO về nháp.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Sửa EO đang chờ duyệt — ${eo.eo_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn primary" disabled={busy} onClick={run}>{busy ? "Đang xử lý..." : "Rút về nháp & sửa"}</button></>}>
      <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 10 }}>
        EO đang <b>{eo.trang_thai === "IN_REVIEW" ? "thẩm định" : "chờ duyệt mua"}</b>. Để sửa, EO sẽ được <b>rút về Nháp</b>:
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>Các phiếu duyệt đang chờ bị hủy, người duyệt nhận thông báo.</li>
          <li>Sửa xong bấm <b>Gửi trình duyệt</b> lại. Người thẩm định đã đồng ý ở lần này được giữ kết quả.</li>
        </ul>
      </div>
      <label className="field-label">Lý do sửa <span className="muted">(tuỳ chọn)</span></label>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd: bổ sung 2 mã linh kiện" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ---------------------------------------------------------------- duyet (Duyet EO + popup xem nhanh)
export const ACTIONS = [
  { key: "approve", label: "Đồng ý", cls: "primary" },
  { key: "reject", label: "Từ chối", cls: "danger" },
  { key: "request_update", label: "Yêu cầu cập nhật", cls: "" },
];
// Duyet cuoi chi Dong y / Tu choi (WORKFLOW_SPEC §5) - backend tra BAD_ACTION neu gui request_update.
export const actionsFor = (stepType: string) => ACTIONS.filter((a) => stepType === "REVIEW" || a.key !== "request_update");
const ACT_ERROR: Record<string, string> = {
  ALREADY_ACTIONED: "Phiếu này đã được xử lý (có thể do bấm 2 lần hoặc mở ở tab khác). Tải lại trang.",
  SUBMISSION_CLOSED: "Lần trình này đã đóng (EO bị trả về, hủy hoặc đã trình lại). Tải lại trang.",
  NOT_YOUR_APPROVAL: "Phiếu này không giao cho bạn.",
  BAD_ACTION: "Thao tác không hợp lệ với phiếu này.",
};

export function ApprovalActionModal({ act, onClose, onDone }: any) {
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = ACTIONS.find((a) => a.key === act.action)!;
  const needComment = act.action !== "approve";
  const run = async () => {
    if (needComment && !comment.trim()) return setErr("Cần nhập ghi chú.");
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/approvals/${act.row.id}/act`, { action: act.action, comment: comment.trim() || undefined });
      onDone();
    } catch (e: any) { setErr(ACT_ERROR[e?.body?.error] || e?.body?.error || "Lỗi."); setBusy(false); }
  };
  return (
    <Modal title={`${meta.label} — ${act.row.eo_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className={`btn ${meta.cls || "primary"}`} disabled={busy} onClick={run}>{busy ? "Đang xử lý..." : meta.label}</button></>}>
      <label className="field-label">Ghi chú {needComment && <span className="req">*</span>}</label>
      <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Nhập ghi chú..." />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ---------------------------------------------------------------- dong them sau ban hanh: ai duyet, duyet / tu choi
/** Nhan trang thai dong them sau ban hanh: cho duyet (ghi ro AI duyet) / da duyet / bi tu choi (ly do). */
export function NhanSauBH({ r, nguoiDuyet }: { r: any; nguoiDuyet?: string | null }) {
  const huy = r.line_status === "CANCELLED_LINE" && !r.post_issue_rejected_at
    ? <span className="badge reject" style={{ marginLeft: 6 }} title="Dòng đã hủy — không đặt hàng (xem lý do ở Lịch sử)">Đã hủy</span> : null;
  if (huy) return huy;
  if (r.post_issue_status === "PENDING")
    return <span className="badge final" style={{ marginLeft: 6 }} title={`Dòng thêm sau khi EO đã ban hành — chờ người duyệt mua của EO (${ten(nguoiDuyet)}) hoặc Admin duyệt / từ chối. Chưa duyệt thì chưa đặt hàng.`}>Chờ {ten(nguoiDuyet)} duyệt</span>;
  if (r.post_issue_status === "APPROVED")
    return <span className="badge issued" style={{ marginLeft: 6 }} title={`Thêm sau ban hành — ${ten(r.post_issue_approved_by)} duyệt ${ngayGio(r.post_issue_approved_at)}`}>Thêm sau BH · đã duyệt</span>;
  if (r.post_issue_rejected_at)
    return <span className="badge reject" style={{ marginLeft: 6 }} title={`${ten(r.post_issue_rejected_by)} từ chối ${ngayGio(r.post_issue_rejected_at)}: ${r.post_issue_reject_reason ?? ""}`}>Bị từ chối: {r.post_issue_reject_reason}</span>;
  return null;
}

/** Tu choi dong them sau ban hanh - bat buoc ly do; dong bi huy (SL 0), ke hoach cua dong bi xoa. */
export function TuChoiDongModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!reason.trim()) return setErr("Cần nhập lý do từ chối (người thêm dòng sẽ thấy).");
    setErr(""); setBusy(true);
    try { await api.post(`/eo/items/${item.id}/reject-post-issue`, { reason: reason.trim() }); onDone(); }
    catch (e: any) {
      setErr(e?.body?.error === "ONLY_FINAL_APPROVER" ? "Chỉ người duyệt mua của EO hoặc Admin được từ chối." : e?.body?.error === "NOT_PENDING" ? "Dòng này đã được xử lý." : "Lỗi từ chối.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Từ chối dòng thêm sau ban hành — ${item.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn danger" disabled={busy} onClick={run}>{busy ? "Đang xử lý..." : "Từ chối dòng"}</button></>}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        {item.part_name} · <Kho t={item.warehouse} /> · SL {soLuong(item.current_qty)}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Từ chối = dòng bị <b>hủy</b> (SL về 0, không đặt hàng), kế hoạch hàng về của dòng bị xóa. Ghi vào lịch sử EO.</div>
      </div>
      <label className="field-label">Lý do từ chối <span className="req">*</span></label>
      <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd: trùng dòng đã có, không cần mua thêm…" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Huy 1 don dat (dong EO da ban hanh). Bat buoc ly do; SL dat 0, xoa ke hoach, SL da ve (neu co) KHONG tinh cho don nay. */
export function HuyDongModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!reason.trim()) return setErr("Cần nhập lý do hủy dòng (ghi vào lịch sử EO).");
    setErr(""); setBusy(true);
    try { await api.post(`/eo/items/${item.id}/cancel-line`, { reason: reason.trim() }); onDone(); }
    catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "FORBIDDEN" ? "Bạn không có quyền hủy dòng này (người tạo EO / KH cung ứng / người duyệt mua / Admin)." :
        c === "USE_REJECT" ? "Dòng đang chờ duyệt — dùng nút Từ chối." : c === "ALREADY_CANCELLED" ? "Dòng đã bị hủy." : "Lỗi hủy dòng.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Hủy đơn đặt hàng — ${item.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn danger" disabled={busy} onClick={run}>{busy ? "Đang xử lý..." : "Hủy đơn"}</button></>}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        {item.part_name} · <Kho t={item.warehouse} /> · SL đặt {soLuong(item.current_qty)}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Hủy = không đặt hàng này nữa: SL đặt về 0, các đợt kế hoạch hàng về bị xóa, hết cảnh báo theo dõi, trạng thái "Đơn trên EO bị hủy". Ghi vào lịch sử EO.</div>
        {(item.da_dat ?? 0) > 0 && <div style={{ background: "#FEF2F2", color: "var(--danger-ink)", borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>Đơn đã có <b>{soLuong(item.da_dat)}</b> về theo AMIS — hủy thì số đã về này <b>không được tính</b> cho đơn nữa. Muốn giữ số đã về và dừng phần còn lại → dùng <b>Kết thúc sớm</b>.</div>}
      </div>
      <label className="field-label">Lý do hủy <span className="req">*</span></label>
      <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd: khách hủy ca, nhà máy không sản xuất mã này…" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Ket thuc som 1 don dat da ve 1 phan: SL dat ve dung SL da ve (POST /eo/items/:id/ket-thuc-som), trang thai "Kết thúc sớm". */
export function KetThucSomModal({ item, onClose, onDone }: { item: { id: number; part_code: string; part_name?: string; warehouse?: string; current_qty: number; da_dat: number }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!reason.trim()) return setErr("Cần nhập lý do kết thúc sớm (ghi vào lịch sử EO).");
    setErr(""); setBusy(true);
    try { await api.post(`/eo/items/${item.id}/ket-thuc-som`, { reason: reason.trim() }); onDone(); }
    catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "FORBIDDEN" ? "Bạn không có quyền (người tạo EO / KH cung ứng / người duyệt mua / Admin)." : c === "CHUA_VE" ? "Đơn chưa về hàng nào — dùng Hủy đơn." :
        c === "DA_VE_DU" ? "Đơn đã về đủ — tự kết thúc, không cần kết thúc sớm." : c === "NOT_ACTIVE" ? "Đơn đã hủy / đang chờ duyệt." : "Lỗi kết thúc sớm.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Kết thúc sớm đơn đặt — ${item.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn primary" disabled={busy} onClick={run}>{busy ? "Đang xử lý..." : "Kết thúc sớm"}</button></>}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        {item.part_name} · <Kho t={item.warehouse} />
        <div style={{ display: "flex", gap: 16, margin: "10px 0", fontSize: 14 }}>
          <span>SL đặt <b>{soLuong(item.current_qty)}</b> → <b style={{ color: "var(--ok-ink)" }}>{soLuong(item.da_dat)}</b></span>
          <span className="muted">bỏ phần còn thiếu {soLuong(item.current_qty - item.da_dat)}</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>Không chờ phần hàng còn lại: SL đặt tự sửa về đúng SL đã về theo AMIS, kế hoạch hàng về vượt phần đó bị cắt,
          trạng thái đơn = <b>"Kết thúc sớm"</b> (đóng, hết cảnh báo theo dõi). Ghi vào lịch sử EO.</div>
      </div>
      <label className="field-label">Lý do kết thúc sớm <span className="req">*</span></label>
      <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd: NCC ngừng sản xuất, đủ dùng, chuyển mã khác…" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ---------------------------------------------------------------- xuat Excel danh sach linh kien cua 1 EO
const TT_THEO_DOI: Record<string, string> = { CHO_NDK: "Chờ ngày dự kiến", TRE_NDK: "Trễ hạn chưa có ngày DK", QUA_HAN_NDK: "Quá ngày dự kiến", CHO_HANG: "Chờ hàng", DONG: "Đã đóng" };
/**
 * Tai file Excel: moi dong linh kien cua EO + thong tin EO + ke hoach (cac dot, ngay NM / du kien) + hang ve AMIS
 * + theo doi. Lay them /xem/eo/:id/bo-sung (phieu AMIS, theo doi) neu chua truyen vao.
 */
export async function xuatDongEo(eo: any, items: any[], plans: any[], boSung?: any) {
  const b = boSung ?? (eo.trang_thai === "ISSUED" ? await api.get<any>(`/xem/eo/${eo.id}/bo-sung`).catch(() => null) : null);
  const nhapBy = new Map<number, any[]>();
  for (const r of b?.phieu_nhap ?? []) nhapBy.set(r.matched_eo_item_id, [...(nhapBy.get(r.matched_eo_item_id) ?? []), r]);
  const tdBy = new Map<number, any>((b?.theo_doi ?? []).map((t: any) => [t.item_id, t]));
  const d = (x?: string | null) => (x ? ngay(x) : "");
  const rows = items.map((i: any, idx: number) => {
    const ps = plans.filter((p: any) => p.eo_item_id === i.id).sort((x: any, y: any) => String(x.planned_date).localeCompare(String(y.planned_date)));
    const ve = (nhapBy.get(i.id) ?? []).sort((x: any, y: any) => String(x.doc_date).localeCompare(String(y.doc_date)));
    const nm = [...ps].filter((p: any) => p.factory_committed_date).pop()?.factory_committed_date ?? null;
    return { i, idx, ps, ve, nm, td: tdBy.get(i.id), kh: ps.reduce((s: number, p: any) => s + (p.planned_qty || 0), 0) };
  });
  type R = (typeof rows)[number];
  const cols: { header: string; get: (r: R) => string | number | null | undefined }[] = [
    { header: "STT", get: (r) => r.idx + 1 },
    { header: "Mã EO", get: () => eo.eo_code },
    { header: "Mã phê duyệt (3TDO)", get: () => eo.approval_code ?? "" },
    { header: "Tiêu đề EO", get: () => eo.tieu_de ?? "" },
    { header: "Trạng thái EO", get: () => STATUS_META[eo.trang_thai]?.label ?? eo.trang_thai },
    { header: "Loại hình", get: () => eo.loai_hinh ?? "" },
    { header: "Phòng ban", get: () => eo.phong_ban ?? "" },
    { header: "Người tạo EO", get: () => eo.created_by },
    { header: "Ngày ban hành", get: () => d(eo.issued_at) },
    { header: "ID dòng", get: (r) => r.i.legacy_id || `EOI-${r.i.id}` },
    { header: "Mã linh kiện", get: (r) => r.i.part_code },
    { header: "Mã đã duyệt ban đầu (nếu thay mã)", get: (r) => r.i.part_code_goc ?? "" },
    { header: "Tên linh kiện", get: (r) => r.i.part_name },
    { header: "Kho cần đặt", get: (r) => r.i.warehouse },
    { header: "Đối tác", get: (r) => r.i.supplier ?? "" },
    { header: "SL đặt", get: (r) => r.i.current_qty },
    { header: "Đơn giá dự kiến", get: (r) => r.i.don_gia_du_kien ?? "" },
    { header: "Thành tiền dự kiến", get: (r) => r.i.thanh_tien_du_kien ?? (r.i.don_gia_du_kien != null ? r.i.don_gia_du_kien * r.i.current_qty : "") },
    { header: "Lý do PS", get: (r) => r.i.reason ?? "" },
    { header: "Ghi chú", get: (r) => r.i.ghi_chu ?? "" },
    { header: "ID CRM", get: (r) => r.i.crm_id ?? "" },
    { header: "ID đặt hàng", get: (r) => r.i.order_id ?? "" },
    { header: "Trạng thái dòng", get: (r) => r.i.line_status === "CANCELLED_LINE" ? (r.i.post_issue_rejected_at ? `Bị từ chối: ${r.i.post_issue_reject_reason ?? ""}` : "Đã hủy") : "Hiệu lực" },
    { header: "Thời điểm thêm", get: (r) => !r.i.created_after_issue ? "Trước ban hành"
      : r.i.post_issue_rejected_at ? "Sau ban hành (bị từ chối)" : r.i.post_issue_status === "PENDING" ? "Sau ban hành (chờ duyệt)" : "Sau ban hành (đã duyệt)" },
    { header: "Đã lên kế hoạch", get: (r) => r.kh },
    { header: "Số đợt kế hoạch", get: (r) => r.ps.length },
    { header: "Các đợt (NM cam kết → dự kiến : SL)", get: (r) => r.ps.map((p: any) => `${p.loai === "TUAN" ? `Tuần ${p.tuan}` : d(p.factory_committed_date) || "—"} → ${d(p.planned_date)} : ${p.planned_qty}`).join("; ") },
    { header: "Ngày nhà máy cam kết (gần nhất)", get: (r) => d(r.nm) },
    { header: "Ngày dự kiến (gần nhất)", get: (r) => d(r.td?.ngay_du_kien_gan_nhat ?? r.ps[r.ps.length - 1]?.planned_date) },
    { header: "Đã về (AMIS)", get: (r) => r.i.da_dat ?? 0 },
    { header: "Các lần hàng về (ngày : SL : số CT)", get: (r) => r.ve.map((x: any) => `${d(x.doc_date)} : ${x.qty_in} : ${x.doc_no}`).join("; ") },
    { header: "Ngày hàng về (gần nhất)", get: (r) => d(r.ve[r.ve.length - 1]?.doc_date) },
    { header: "Còn thiếu", get: (r) => r.i.chua_dat ?? Math.max(0, r.i.current_qty - (r.i.da_dat ?? 0)) },
    { header: "Tình trạng theo dõi", get: (r) => r.td ? TT_THEO_DOI[r.td.tinh_trang] ?? r.td.tinh_trang : "" },
    { header: "Số lần lùi ngày", get: (r) => r.td?.so_lan_lui ?? "" },
    { header: "Số lỗi theo dõi", get: (r) => r.td?.so_loi ?? "" },
    { header: "Cấp CEO", get: (r) => r.td?.ceo_ly_do?.join("; ") ?? "" },
  ];
  exportRowsToXlsx(rows, cols, `Linh_kien_${eo.approval_code || eo.eo_code}.xlsx`, "Linh kien");
}

/**
 * Sua lai MA LINH KIEN / KHO / DOI TAC cua 1 dong dat (nhap sai) - POST /eo/items/:id/sua-thong-tin (2026-11-08).
 * Ke toan, mua hang, nguoi tao PO; PO chua ket thuc hoan toan. Bat buoc ly do, log day du truoc / sau. Doi tac moi -> hoi them.
 */
export function SuaThongTinDongModal({ item, onClose, onDone }: { item: { id: number; part_code: string; part_name?: string; warehouse: string; supplier?: string | null }; onClose: () => void; onDone: () => void }) {
  const goiY = useGoiYDong();
  const khos = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const [ma, setMa] = useState(item.part_code);
  const [tenLk, setTenLk] = useState(item.part_name ?? "");
  const [kho, setKho] = useState(item.warehouse);
  const [ncc, setNcc] = useState(item.supplier ?? "");
  const [lyDo, setLyDo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr("");
    const body: any = { ly_do: lyDo.trim() };
    if (ma.trim() !== item.part_code) body.part_code = ma.trim();
    if (tenLk.trim() !== (item.part_name ?? "")) body.part_name = tenLk.trim();
    if (kho !== item.warehouse) body.warehouse = kho;
    if (ncc.trim() !== (item.supplier ?? "")) body.supplier = ncc.trim() || null;
    if (Object.keys(body).length === 1) return setErr("Chưa thay đổi gì.");
    if (!body.ly_do) return setErr("Cần nhập lý do sửa (ghi vào lịch sử PO).");
    setBusy(true);
    const gui = () => api.post(`/eo/items/${item.id}/sua-thong-tin`, body);
    try {
      try { await gui(); }
      catch (e: any) {
        const loi = (e?.body?.error === "GIA_TRI_KHONG_CHUAN" ? e.body.loi : []) as { loai: string; gia_tri: string }[];
        const moi = loi.filter((x) => x.loai === "DOI_TAC").map((x) => x.gia_tri);
        if (!moi.length || !confirm(`Đối tác CHƯA CÓ trong hệ thống: ${moi.join(", ")}.\nBạn có chắc chắn muốn THÊM đối tác mới?`)) throw e;
        for (const v of moi) await api.post("/danh-muc/chuan/doi-tac-moi", { ten: v });
        await gui();
      }
      onDone();
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(loiChuanTxt(e?.body) ?? (c === "FORBIDDEN" ? "Bạn không có quyền sửa (kế toán / mua hàng / người tạo PO)." : c === "PO_DA_KET_THUC" ? "PO đã kết thúc hoàn toàn (mọi dòng đã về đủ) — không sửa được."
        : c === "DUPLICATE_LINE" ? "PO đã có dòng khác cùng mã + kho này." : c === "KHO_KHONG_CO" ? "Kho không có trong danh mục." : c === "BAD_STATE" ? "PO đang trình duyệt — rút về để sửa." : c === "DONG_DA_HUY" ? "Dòng đã hủy." : "Lỗi lưu."));
      setBusy(false);
    }
  };
  return (
    <Modal title={`Sửa mã LK / kho / đối tác — ${item.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn primary" disabled={busy} onClick={run}>{busy ? "Đang lưu..." : "Lưu thay đổi"}</button></>}>
      <GoiYDatalists data={goiY.data} />
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        Dùng khi <b>nhập sai</b> mã linh kiện / kho / đối tác. Mọi thay đổi ghi lịch sử (trước → sau, người sửa, lý do). Đổi mã hoặc kho của PO đã ban hành
        → hệ thống <b>khớp lại phiếu AMIS</b> theo mã + kho mới. NCC giao mã tương đương (không phải nhập sai) → dùng <b>Thay mã tương đương</b>.
      </div>
      <label className="field-label">Mã linh kiện</label>
      <input className="input" list={DL.lk} value={ma} onChange={(e) => { const v = e.target.value; setTenLk(tenKhiDoiMa(goiY.tenTheoMa, ma, v, tenLk)); setMa(v); }} />
      <label className="field-label" style={{ marginTop: 10 }}>Tên linh kiện</label>
      <input className="input" value={tenLk} onChange={(e) => setTenLk(e.target.value)} />
      <label className="field-label" style={{ marginTop: 10 }}>Kho</label>
      <select className="select" value={kho} onChange={(e) => setKho(e.target.value)}>
        {!(khos.data ?? []).some((k: any) => k.ten_kho === kho) && <option value={kho}>{kho}</option>}
        {(khos.data ?? []).filter((k: any) => k.active !== 0 || k.ten_kho === kho).map((k: any) => <option key={k.ten_kho} value={k.ten_kho}>{k.ma_kho ? `${k.ma_kho} — ` : ""}{k.ten_kho}</option>)}
      </select>
      <label className="field-label" style={{ marginTop: 10 }}>Đối tác</label>
      <input className="input" list={DL.doiTac} value={ncc} onChange={(e) => setNcc(e.target.value)} placeholder="Chọn đối tác chuẩn" />
      <label className="field-label" style={{ marginTop: 10 }}>Lý do sửa <span className="req">*</span></label>
      <input className="input" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="vd: nhập nhầm kho 6804, đúng là kho ký gửi Media Mart" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/**
 * Ket thuc som CA PO (2026-11-08) - POST /eo/:id/ket-thuc-som: moi dong dang mo -> SL dat = SL da ve thuc te.
 * Xem truoc tung dong + canh bao day du truoc khi lam (khong hoan tac tu dong).
 */
export function KetThucSomPoModal({ eo, onClose, onDone }: { eo: { id: number; eo_code: string; approval_code?: string | null }; onClose: () => void; onDone: () => void }) {
  const xem = useQuery({ queryKey: ["kts-po", eo.id], queryFn: () => api.post<{ dong: any[]; so_doi: number }>(`/eo/${eo.id}/ket-thuc-som`, { xem: true }) });
  const [lyDo, setLyDo] = useState("");
  const [dongY, setDongY] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ds = xem.data?.dong ?? [];
  const veMotPhan = ds.filter((r) => r.hanh_dong === "VE_MOT_PHAN"), chuaVe = ds.filter((r) => r.hanh_dong === "CHUA_VE");
  const choDuyet = ds.filter((r) => (r.hanh_dong === "VE_MOT_PHAN" || r.hanh_dong === "CHUA_VE") && r.post_issue_status === "PENDING");
  const bot = veMotPhan.reduce((s, r) => s + (r.current_qty - r.da_ve), 0) + chuaVe.reduce((s, r) => s + r.current_qty, 0);
  const NHAN: Record<string, string> = { VE_MOT_PHAN: "SL đặt → SL đã về", CHUA_VE: "Chưa về gì → SL 0, hủy dòng", BO_QUA_DU: "Đã về đủ — giữ nguyên",
    BO_QUA_DA_KTS: "Đã kết thúc sớm — giữ nguyên", BO_QUA_HUY: "Đã hủy — giữ nguyên", BO_QUA_CHO_DUYET: "Chờ duyệt (thêm sau BH) — bỏ qua" };
  const run = async () => {
    setErr("");
    if (!lyDo.trim()) return setErr("Cần nhập lý do kết thúc sớm (ghi vào lịch sử PO).");
    if (!dongY) return setErr("Tick xác nhận đã đọc cảnh báo.");
    setBusy(true);
    try { await api.post(`/eo/${eo.id}/ket-thuc-som`, { reason: lyDo.trim() }); onDone(); }
    catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "FORBIDDEN" ? "Bạn không có quyền (người tạo PO / KH cung ứng / người duyệt mua / Admin)." : c === "KHONG_CO_DONG_MO" ? "PO không còn dòng nào đang chờ hàng." : "Lỗi kết thúc sớm.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Kết thúc sớm cả PO — ${eo.approval_code || eo.eo_code}`} onClose={onClose} width={860}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn danger" disabled={busy || !(xem.data?.so_doi)} onClick={run}>{busy ? "Đang xử lý..." : `Kết thúc sớm ${xem.data?.so_doi ?? 0} dòng`}</button></>}>
      {xem.isLoading ? <Spinner /> : (
        <div style={{ fontSize: 13 }}>
          <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "var(--danger-ink)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, lineHeight: 1.55 }}>
            <b>⚠ Cảnh báo — đọc kỹ trước khi kết thúc sớm:</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              <li>Mọi dòng đang chờ hàng: <b>SL đặt đổi bằng SL đã về thực tế (AMIS)</b> — giảm tổng <b>{soLuong(bot)}</b> cái chưa về; hệ thống <b>không chờ / không theo dõi phần còn lại</b>.</li>
              {chuaVe.length > 0 && <li><b>{chuaVe.length} dòng chưa về gì</b> sẽ thành SL 0 và bị hủy: {chuaVe.slice(0, 6).map((r) => r.part_code).join(", ")}{chuaVe.length > 6 ? "…" : ""}.</li>}
              <li>Kế hoạch hàng về vượt SL mới bị cắt bớt; lỗi theo dõi / cảnh báo của phần còn lại không còn tính.</li>
              <li>Hàng về thêm sau này (nếu NCC vẫn giao) <b>không được tính</b> cho PO này — cần đặt PO mới.</li>
              {choDuyet.length > 0 && <li>{choDuyet.length} dòng thêm sau ban hành đang chờ duyệt <b>cũng được kết thúc sớm</b>: chưa về → hủy, gỡ khỏi hàng chờ duyệt; về 1 phần → SL đặt = SL đã về, vẫn chờ người duyệt mua duyệt.</li>}
              <li>Không hoàn tác tự động — sửa lại phải sửa SL từng dòng.</li>
            </ul>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 240, overflow: "auto" }}>
            <table className="tbl tbl-dense">
              <thead><tr><th>Mã LK</th><th>Tên</th><th>Kho</th><th style={{ textAlign: "right" }}>SL đặt</th><th style={{ textAlign: "right" }}>Đã về</th><th>Sau khi kết thúc sớm</th></tr></thead>
              <tbody>{ds.map((r) => {
                const doi = r.hanh_dong === "VE_MOT_PHAN" || r.hanh_dong === "CHUA_VE";
                return (
                  <tr key={r.id} style={{ opacity: doi ? 1 : 0.5 }}>
                    <td><b>{r.part_code}</b></td><td>{r.part_name}</td><td><Kho t={r.warehouse} /></td>
                    <td style={{ textAlign: "right" }}>{soLuong(r.current_qty)}</td><td style={{ textAlign: "right" }}>{soLuong(r.da_ve)}</td>
                    <td style={{ color: r.hanh_dong === "CHUA_VE" ? "var(--danger-ink)" : undefined }}>{NHAN[r.hanh_dong] ?? r.hanh_dong}{doi ? ` (${soLuong(r.da_ve)})` : ""}{doi && r.post_issue_status === "PENDING" ? " · dòng chờ duyệt" : ""}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <label className="field-label" style={{ marginTop: 12 }}>Lý do kết thúc sớm <span className="req">*</span></label>
          <textarea className="textarea" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="vd: NCC báo ngừng sản xuất, phần còn lại đặt PO khác…" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontWeight: 600 }}>
            <input type="checkbox" checked={dongY} onChange={(e) => setDongY(e.target.checked)} /> Tôi đã đọc cảnh báo và muốn kết thúc sớm {xem.data?.so_doi ?? 0} dòng của PO này
          </label>
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </Modal>
  );
}

/**
 * Ket thuc som THEO MA LINH KIEN (2026-11-09) - POST /eo/ma-lk/ket-thuc-som: doi tac bao ngung san xuat -> moi dong dang mo cua ma nay
 * tren moi PO: SL dat = SL da ve thuc te (chua ve -> SL 0, huy dong). Xem truoc + tick chon dong (mac dinh tat ca) + canh bao.
 */
export function KetThucSomMaModal({ ma, onClose, onDone }: { ma: string; onClose: () => void; onDone: (kq: { so_dong: number; so_po: number }) => void }) {
  const xem = useQuery({ queryKey: ["kts-ma", ma], queryFn: () => api.post<{ dong: any[]; so_doi: number }>(`/eo/ma-lk/ket-thuc-som`, { ma, xem: true }) });
  const [lyDo, setLyDo] = useState("");
  const [dongY, setDongY] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [bo, setBo] = useState<Set<number>>(new Set()); // dong BO tick (mac dinh chon het)
  const ds = xem.data?.dong ?? [];
  const doiDuoc = (r: any) => r.hanh_dong === "VE_MOT_PHAN" || r.hanh_dong === "CHUA_VE";
  const chon = ds.filter((r) => doiDuoc(r) && !bo.has(r.id));
  const soPo = new Set(chon.map((r) => r.eo_id)).size;
  const chuaVe = chon.filter((r) => r.hanh_dong === "CHUA_VE");
  const bot = chon.reduce((s, r) => s + (r.current_qty - r.da_ve), 0);
  const khongQuyen = ds.filter((r) => r.hanh_dong === "BO_QUA_QUYEN"), chuaBh = ds.filter((r) => r.hanh_dong === "BO_QUA_CHUA_BH");
  const NHAN: Record<string, string> = { VE_MOT_PHAN: "SL đặt → SL đã về", CHUA_VE: "Chưa về gì → SL 0, hủy dòng", BO_QUA_CHO_DUYET: "Chờ duyệt (thêm sau BH) — bỏ qua",
    BO_QUA_QUYEN: "Không có quyền trên PO này — bỏ qua", BO_QUA_CHUA_BH: "EO chưa ban hành — sửa / hủy trực tiếp trên EO" };
  const run = async () => {
    setErr("");
    if (!chon.length) return setErr("Chưa chọn dòng nào.");
    if (!lyDo.trim()) return setErr("Cần nhập lý do (ghi vào lịch sử từng PO).");
    if (!dongY) return setErr("Tick xác nhận đã đọc cảnh báo.");
    setBusy(true);
    try { onDone(await api.post<{ so_dong: number; so_po: number }>(`/eo/ma-lk/ket-thuc-som`, { ma, reason: lyDo.trim(), item_ids: chon.map((r) => r.id) })); }
    catch (e: any) {
      setErr(e?.body?.error === "KHONG_CO_DONG_MO" ? "Không còn dòng nào đang chờ hàng (có thể vừa được người khác xử lý)." : "Lỗi kết thúc sớm.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Kết thúc sớm mã linh kiện ${ma} — mọi PO đang chờ hàng`} onClose={onClose} width={960}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn danger" disabled={busy || !chon.length} onClick={run}>{busy ? "Đang xử lý..." : `Kết thúc sớm ${chon.length} dòng / ${soPo} PO`}</button></>}>
      {xem.isLoading ? <Spinner /> : xem.isError ? <div style={{ color: "var(--danger)" }}>Không tải được danh sách dòng.</div> : (
        <div style={{ fontSize: 13 }}>
          <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "var(--danger-ink)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, lineHeight: 1.55 }}>
            <b>⚠ Dùng khi đối tác báo mã này ngừng sản xuất / không giao nữa. Đọc kỹ:</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              <li>Mọi dòng được chọn: <b>SL đặt đổi bằng SL đã về thực tế (AMIS)</b> — giảm tổng <b>{soLuong(bot)}</b> cái chưa về trên <b>{soPo} PO</b>; hệ thống <b>không chờ / không theo dõi phần còn lại</b>.</li>
              {chuaVe.length > 0 && <li><b>{chuaVe.length} dòng chưa về gì</b> sẽ thành SL 0 và bị hủy.</li>}
              <li>Kế hoạch hàng về vượt SL mới bị cắt bớt; lỗi theo dõi / cảnh báo của phần còn lại không còn tính.</li>
              <li>Hàng về thêm sau này (nếu NCC vẫn giao) <b>không được tính</b> cho các PO này.</li>
              {khongQuyen.length > 0 && <li>{khongQuyen.length} dòng thuộc PO bạn không có quyền — <b>không bị ảnh hưởng</b> (báo người tạo PO / KH cung ứng).</li>}
              {chuaBh.length > 0 && <li>{chuaBh.length} dòng trên EO chưa ban hành — không đụng tới, sửa / hủy trực tiếp trên EO.</li>}
              <li>Không hoàn tác tự động — sửa lại phải sửa SL từng dòng.</li>
            </ul>
          </div>
          {ds.length === 0 ? <div className="muted">Mã này không còn dòng nào đang chờ hàng.</div> : (
            <div className="tbl-wrap" style={{ maxHeight: 280, overflow: "auto" }}>
              <table className="tbl tbl-dense">
                <thead><tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={ds.some(doiDuoc) && ds.filter(doiDuoc).every((r) => !bo.has(r.id))}
                    onChange={(e) => setBo(e.target.checked ? new Set() : new Set(ds.filter(doiDuoc).map((r) => r.id)))} /></th>
                  <th>PO / EO</th><th>Mã LK</th><th>Kho</th><th style={{ textAlign: "right" }}>SL đặt</th><th style={{ textAlign: "right" }}>Đã về</th><th>Sau khi kết thúc sớm</th>
                </tr></thead>
                <tbody>{ds.map((r) => {
                  const doi = doiDuoc(r), on = doi && !bo.has(r.id);
                  return (
                    <tr key={r.id} style={{ opacity: on ? 1 : 0.5 }}>
                      <td><input type="checkbox" disabled={!doi} checked={on} onChange={() => setBo((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
                      <td><b>{r.approval_code || "—"}</b><div className="muted" style={{ fontSize: 11 }}>{r.eo_code}</div></td>
                      <td>{r.part_code}{r.part_code_goc && r.part_code_goc !== r.part_code ? <div className="muted" style={{ fontSize: 11 }}>gốc {r.part_code_goc}</div> : null}</td>
                      <td><Kho t={r.warehouse} /></td>
                      <td style={{ textAlign: "right" }}>{soLuong(r.current_qty)}</td><td style={{ textAlign: "right" }}>{soLuong(r.da_ve)}</td>
                      <td style={{ color: r.hanh_dong === "CHUA_VE" ? "var(--danger-ink)" : undefined }}>{NHAN[r.hanh_dong] ?? r.hanh_dong}{doi ? ` (${soLuong(r.da_ve)})` : ""}{doi && r.post_issue_status === "PENDING" ? " · dòng chờ duyệt" : ""}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          <label className="field-label" style={{ marginTop: 12 }}>Lý do kết thúc sớm <span className="req">*</span></label>
          <textarea className="textarea" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="vd: Karofi báo ngừng sản xuất mã này từ 11/2026…" />
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontWeight: 600 }}>
            <input type="checkbox" checked={dongY} onChange={(e) => setDongY(e.target.checked)} /> Tôi đã đọc cảnh báo và muốn kết thúc sớm {chon.length} dòng của mã {ma}
          </label>
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </Modal>
  );
}
