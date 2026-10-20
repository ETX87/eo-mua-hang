import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, StatusBadge, StatTile, Modal, Avatar, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, tien, ngay, ngayGio, ten } from "../../lib/format";
import { STATUS_META, KHO_THEO_PHONG_BAN } from "../../lib/nav";
import { FILE_ACCEPT, checkFile, driveThumb, fileSize, isExcel, isImage, uploadEoFiles } from "../../lib/files";
import { dailyTemplate, parseDailyFile, type Parsed } from "../../lib/planExcel";
import { PlanImportModal } from "../../components/PlanImportModal";

const TABS = ["Linh kiện", "Kế hoạch hàng về", "Quy trình duyệt", "Lịch sử thay đổi", "Bình luận", "Tài liệu đính kèm"] as const;
type Tab = typeof TABS[number];

const APR_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ xử lý", cls: "nhap" }, APPROVED: { label: "Đồng ý", cls: "issued" },
  REJECTED: { label: "Từ chối", cls: "reject" }, REQUEST_UPDATE: { label: "Yêu cầu cập nhật", cls: "final" },
  WITHDRAWN: { label: "Đã rút", cls: "nhap" }, SKIPPED: { label: "Bỏ qua", cls: "nhap" },
};
const EVENT_LABEL: Record<string, string> = {
  CREATE_EO: "Tạo EO", UPDATE_EO: "Sửa thông tin EO", SUBMIT_EO: "Gửi trình duyệt", RESUBMIT_EO: "Trình lại",
  APPROVE_REVIEW: "Duyệt thẩm định", REJECT_REVIEW: "Từ chối thẩm định", REQUEST_UPDATE: "Yêu cầu cập nhật",
  WITHDRAW_REVIEW: "Rút phiếu thẩm định", APPROVE_FINAL: "Duyệt cuối", REJECT_FINAL: "Từ chối duyệt cuối",
  ISSUE_EO: "Ban hành EO", CANCEL_EO: "Hủy EO", ADD_ITEM: "Thêm dòng linh kiện", UPDATE_ITEM: "Sửa dòng linh kiện",
  UPDATE_QUANTITY: "Sửa số lượng", CANCEL_LINE: "Hủy dòng", APPROVE_POST_ISSUE_ITEM: "Duyệt dòng thêm sau ban hành",
  ADD_PLAN: "Thêm kế hoạch", UPDATE_PLAN: "Sửa kế hoạch", DELETE_PLAN: "Xóa kế hoạch", IMPORT_AMIS: "Import AMIS",
  UPLOAD_FILE: "Đính kèm tài liệu", REPLACE_PART: "Thay mã linh kiện tương đương", BULK_PLAN: "Cập nhật kế hoạch hàng loạt",
  IMPORT_ITEMS: "Import dòng linh kiện từ Excel", RECALL_EO: "Rút về nháp để sửa",
};

const PRE_ISSUE_STATES = ["DRAFT", "IN_REVIEW", "WAITING_FINAL_APPROVAL"];

export default function EoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Linh kiện");
  const [qtyItem, setQtyItem] = useState<any>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [replaceItem, setReplaceItem] = useState<any>(null);
  const [showRecall, setShowRecall] = useState(false);

  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const q = useQuery({ queryKey: ["eo", id], queryFn: () => api.get<any>(`/eo/${id}`) });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <div className="muted">Không tìm thấy EO.</div>;
  const { eo, items, tong, submissions, approvals, events, comments, files, plans } = q.data;
  const issued = eo.trang_thai === "ISSUED";
  const refresh = () => qc.invalidateQueries({ queryKey: ["eo", id] });

  const myEmail = me.data?.email;
  const myRole = me.data?.vai_tro;
  const canManage = myRole === "Admin" || myRole === "KH cung ung" || eo.created_by === myEmail;
  const canCancel = (PRE_ISSUE_STATES.includes(eo.trang_thai) && canManage) || (issued && myRole === "Admin");
  // khop backend lib/eoAccess.ts canEditPlan
  const m = me.data ?? {};
  const canEditPlan = myRole !== "View" && (eo.created_by === myEmail ||
    ["Admin", "KH cung ung", "Kho", "Theo doi tien do"].includes(myRole) ||
    m.la_nv_dat_hang === 1 || m.la_nv_kho === 1 || m.la_theo_doi_td === 1);

  return (
    <div>
      <PageHeader
        title="Chi tiết EO" back={() => nav(-1)}
        breadcrumb={["Danh sách EO", "Chi tiết EO"]}
        actions={<>
          {eo.trang_thai === "DRAFT" && canManage && (
            <button className="btn primary" onClick={() => nav(`/eo/${id}/edit`)}><I.edit width={14} height={14} /> Sửa EO</button>
          )}
          {["IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(eo.trang_thai) && canManage && (
            <button className="btn primary" onClick={() => setShowRecall(true)}><I.edit width={14} height={14} /> Sửa EO</button>
          )}
          <button className="btn" onClick={() => setTab("Lịch sử thay đổi")}><I.clock width={14} height={14} /> Lịch sử</button>
          {canCancel && <button className="btn danger" onClick={() => setShowCancel(true)}><I.x width={14} height={14} /> Hủy EO</button>}
        </>}
      />

      {/* info card */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "var(--brand-ink)" }}>{eo.eo_code}</h2>
          <StatusBadge status={eo.trang_thai} />
          <span className="muted" style={{ fontSize: 13 }}>Mã phê duyệt: {eo.approval_code
            ? <b style={{ color: "var(--text)" }}>{eo.approval_code}</b>
            : <i>Chưa ban hành</i>}</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 14 }}>Tiêu đề: <b>{eo.tieu_de || "—"}</b></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 0, marginTop: 12, fontSize: 12.5 }}>
          {[
            ["Người tạo", ten(eo.created_by)], ["Ngày tạo", ngayGio(eo.created_at)],
            ["Người duyệt cuối", ten(eo.final_approver_email)], ["Phòng ban", eo.phong_ban || "—"],
            ["Loại hình", eo.loai_hinh || "—"],
          ].map(([k, v], i) => (
            <span key={k} style={{ padding: "0 14px", borderLeft: i ? "1px solid var(--border)" : "none" }}>
              <span className="muted">{k}: </span><b>{v}</b>
            </span>
          ))}
        </div>
      </Card>

      {/* tabs */}
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "11px 6px", marginRight: 12, border: "none", background: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 14, color: tab === t ? "var(--link-amber)" : "var(--text-muted)",
            borderBottom: tab === t ? "3px solid var(--brand-yellow-btn)" : "3px solid transparent",
            marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      {tab === "Linh kiện" && (
        <TabLinhKien
          items={items} tong={tong} issued={issued} canManage={canManage} onReplacePart={setReplaceItem}
          canEditQty={canManage && (issued || eo.trang_thai === "DRAFT")}
          canApprovePostIssue={issued && (myEmail === eo.final_approver_email || myRole === "Admin")}
          onEditQty={setQtyItem} onAddItem={() => setShowAddItem(true)}
          onApproved={() => { refresh(); qc.invalidateQueries({ queryKey: ["inbox-count"] }); qc.invalidateQueries({ queryKey: ["post-issue"] }); }}
        />
      )}
      {tab === "Kế hoạch hàng về" && (
        <TabKeHoach eo={eo} items={items} plans={plans} issued={issued} canEdit={canEditPlan} onChanged={refresh} />
      )}
      {tab === "Quy trình duyệt" && <TabQuyTrinh submissions={submissions} approvals={approvals} />}
      {tab === "Lịch sử thay đổi" && <TabLichSu events={events} />}
      {tab === "Bình luận" && <TabBinhLuan eoId={id!} comments={comments} onSent={refresh} />}
      {tab === "Tài liệu đính kèm" && <TabTaiLieu eoId={id!} files={files} onUploaded={refresh} />}

      {qtyItem && <QtyModal item={qtyItem} issued={issued} onClose={() => setQtyItem(null)} onSaved={() => { setQtyItem(null); refresh(); }} />}
      {showCancel && <CancelModal eo={eo} onClose={() => setShowCancel(false)} onDone={() => { setShowCancel(false); refresh(); }} />}
      {showRecall && <RecallModal eo={eo} onClose={() => setShowRecall(false)} onDone={() => { setShowRecall(false); refresh(); qc.invalidateQueries({ queryKey: ["inbox-count"] }); nav(`/eo/${id}/edit`); }} />}
      {replaceItem && <ReplacePartModal item={replaceItem} onClose={() => setReplaceItem(null)} onSaved={() => { setReplaceItem(null); refresh(); }} />}
      {showAddItem && <AddItemModal eoId={id!} phongBan={eo.phong_ban} onClose={() => setShowAddItem(false)} onSaved={() => { setShowAddItem(false); refresh(); }} />}
    </div>
  );
}

function TabLinhKien({ items, tong, issued, canManage, canEditQty, canApprovePostIssue, onEditQty, onAddItem, onApproved, onReplacePart }: any) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const approve = async (r: any) => {
    if (!confirm(`Duyệt dòng ${r.part_code} (SL ${soLuong(r.current_qty)}) thêm sau ban hành?`)) return;
    setErr(""); setBusyId(r.id);
    try {
      await api.post(`/eo/items/${r.id}/approve-post-issue`);
      onApproved();
    } catch (e: any) {
      setErr(e?.body?.error === "ONLY_FINAL_APPROVER" ? "Chỉ người duyệt cuối của EO được duyệt dòng này." : "Lỗi duyệt dòng.");
    } finally {
      setBusyId(null);
    }
  };
  const cols: Col<any>[] = [
    { key: "stt", header: "STT", align: "center", render: (_r, ) => "", width: 48 },
    {
      key: "part_code", header: "Mã linh kiện", render: (r) => (
        <>
          <span className="cell-link" style={{ textDecoration: "underline" }}>{r.legacy_id || r.part_code}</span>
          {r.post_issue_status === "PENDING" && <span className="badge final" style={{ marginLeft: 6 }}>Chờ duyệt sau BH</span>}
          {r.post_issue_status === "APPROVED" && <span className="badge issued" style={{ marginLeft: 6 }}>Thêm sau BH</span>}
          {r.part_code_goc && <span className="badge final" style={{ marginLeft: 6 }} title={`Mã đã duyệt: ${r.part_code_goc}${r.part_name_goc ? ` — ${r.part_name_goc}` : ""}`}>Thay từ {r.part_code_goc}</span>}
          {(r.crm_id || r.order_id) && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              {r.crm_id && <span title="ID CRM - mã ca bảo hành">Ca {r.crm_id}</span>}
              {r.crm_id && r.order_id && " · "}
              {r.order_id && <span title="ID đặt hàng">{r.order_id}</span>}
            </div>
          )}
        </>
      ),
    },
    { key: "part_name", header: "Tên linh kiện", render: (r) => r.part_name },
    { key: "warehouse", header: "Kho cần đặt", render: (r) => r.warehouse },
    { key: "supplier", header: "Đối tác", render: (r) => r.supplier || "" },
    { key: "current_qty", header: "Số lượng", align: "right", render: (r) => soLuong(r.current_qty) },
    { key: "da_dat", header: "Đã đặt", align: "right", render: (r) => soLuong(r.da_dat) },
    { key: "chua_dat", header: "Chưa đặt", align: "right", render: (r) => soLuong(r.chua_dat) },
    { key: "don_gia", header: "Đơn giá dự kiến", align: "right", render: (r) => r.don_gia_du_kien != null ? soLuong(r.don_gia_du_kien) : "" },
    { key: "thanh_tien", header: "Thành tiền dự kiến", align: "right", render: (r) => r.thanh_tien_du_kien ? soLuong(r.thanh_tien_du_kien) : "" },
    { key: "reason", header: "Lý do PS", render: (r) => r.reason || "" },
    { key: "ghi_chu", header: "Ghi chú", render: (r) => r.ghi_chu ? <span style={{ display: "block", minWidth: 180 }}>{r.ghi_chu}</span> : "" },
    {
      key: "act", header: "", align: "center", render: (r) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {canEditQty && <button className="btn ghost sm" onClick={() => onEditQty(r)} title="Sửa số lượng / ghi chú"><I.edit width={14} height={14} /></button>}
          {issued && canManage && r.line_status === "ACTIVE" && (
            <button className="btn ghost sm" onClick={() => onReplacePart(r)} title="Thay mã linh kiện tương đương (NCC giao mã khác)"><I.refresh width={14} height={14} /></button>
          )}
          {canApprovePostIssue && r.post_issue_status === "PENDING" && (
            <button className="btn sm primary" disabled={busyId === r.id} onClick={() => approve(r)}>Duyệt dòng này</button>
          )}
        </div>
      ),
    },
  ];
  // render STT via index
  const withStt = items.map((r: any, i: number) => ({ ...r, _stt: i + 1 }));
  cols[0].render = (r: any) => r._stt;

  return (
    <>
      <DataTable
        cols={cols} rows={withStt} keyOf={(r) => r.id} pageSize={PAGE_SIZE}
        totalRow={["", <b key="t">TỔNG</b>, "", "", "", <b key="q">{soLuong(tong.tong_sl_dat)}</b>, <b key="d">{soLuong(tong.sl_da_dat)}</b>, <b key="c">{soLuong(tong.sl_chua_dat)}</b>, "", <b key="tt">{soLuong(tong.tong_tien_du_kien)}</b>, "", "", ""]}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 16 }}>
        <StatTile label="Tổng số dòng" value={soLuong(tong.so_dong)} />
        <StatTile label="Tổng SL đặt" value={soLuong(tong.tong_sl_dat)} />
        <StatTile label="SL đã đặt" value={soLuong(tong.sl_da_dat)} />
        <StatTile label="SL chưa đặt" value={soLuong(tong.sl_chua_dat)} />
        <StatTile label="Tổng tiền dự kiến" value={tien(tong.tong_tien_du_kien)} />
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      {issued && canManage && (
        <button className="btn sm" style={{ marginTop: 14 }} onClick={onAddItem}><I.plus width={14} height={14} /> Thêm dòng (duyệt sau ban hành)</button>
      )}
    </>
  );
}

function TabKeHoach({ eo, items, plans, issued, canEdit, onChanged }: any) {
  const [edit, setEdit] = useState<any>(null);
  const [bulk, setBulk] = useState(false);
  const [imp, setImp] = useState<{ name: string; parsed: Parsed } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const itemById = Object.fromEntries(items.map((i: any) => [i.id, i]));
  const po = eo.approval_code || eo.eo_code;
  const plannedOf = (itemId: number, excludeId?: number) =>
    plans.filter((p: any) => p.eo_item_id === itemId && p.id !== excludeId).reduce((s: number, p: any) => s + (p.planned_qty || 0), 0);
  const del = async (p: any) => {
    if (!confirm(`Xóa kế hoạch ${p.loai === "TUAN" ? p.tuan : ngay(p.planned_date)} — SL ${soLuong(p.planned_qty)}?`)) return;
    setErr("");
    try { await api.del(`/plans/${p.id}`); onChanged(); } catch { setErr("Lỗi xóa kế hoạch."); }
  };
  const editable = issued && canEdit;
  const activeItems = items.filter((i: any) => i.line_status !== "CANCELLED_LINE");
  const lines = activeItems.map((i: any) => ({ ...i, eo_code: eo.eo_code, approval_code: eo.approval_code, da_len_kh: plannedOf(i.id), da_len_kh_loai: 0, da_ve: i.da_dat }));
  const onFile = async (f: File) => {
    setErr(""); setMsg("");
    try { setImp({ name: f.name, parsed: await parseDailyFile(f) }); } catch { setErr("Không đọc được file Excel."); }
  };
  const cols: Col<any>[] = [
    { key: "po", header: "Mã PO", render: () => po },
    { key: "pc", header: "Mã linh kiện", render: (p) => itemById[p.eo_item_id]?.part_code ?? "" },
    { key: "pn", header: "Tên linh kiện", render: (p) => itemById[p.eo_item_id]?.part_name ?? "" },
    { key: "wh", header: "Kho", render: (p) => itemById[p.eo_item_id]?.warehouse ?? "" },
    { key: "d", header: "Ngày / tuần về", render: (p) => p.loai === "TUAN" ? <span title={`đến ${ngay(p.planned_date)}`}><span className="badge final">Tuần</span> {p.tuan}</span> : ngay(p.planned_date) },
    { key: "q", header: "SL kế hoạch", align: "right", render: (p) => soLuong(p.planned_qty) },
    { key: "f", header: "Ngày NM cam kết", render: (p) => p.factory_committed_date ? ngay(p.factory_committed_date) : "" },
    { key: "g", header: "Ghi chú", render: (p) => p.ghi_chu || "" },
    {
      key: "act", header: "", align: "center", render: (p) => editable ? (
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {p.loai !== "TUAN" && <button className="btn ghost sm" title="Sửa" onClick={() => setEdit(p)}><I.edit width={14} height={14} /></button>}
          <button className="btn ghost sm danger" title="Xóa" onClick={() => del(p)}><I.trash width={14} height={14} /></button>
        </div>
      ) : null,
    },
  ];
  return (
    <>
      {!issued && <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>Lập kế hoạch hàng về sau khi EO được ban hành.</div>}
      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button className="btn sm primary" onClick={() => setBulk(true)}><I.calendar width={14} height={14} /> Cập nhật hàng loạt</button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Import Excel</button>
          <button className="btn sm ghost" onClick={() => dailyTemplate(lines, `Ke_hoach_hang_ve_${eo.eo_code}.xlsx`)}><I.download width={14} height={14} /> Tải mẫu (các dòng của EO)</button>
          <button className="btn sm ghost" onClick={() => setEdit({})}><I.plus width={14} height={14} /> Thêm 1 mốc</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
        </div>
      )}
      {msg && <div style={{ background: "#DCFCE7", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>{msg}</div>}
      <DataTable cols={cols} rows={plans} keyOf={(p) => p.id} empty="Chưa có kế hoạch hàng về" pageSize={PAGE_SIZE} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10, marginTop: 14 }}>
        {activeItems.map((i: any) => {
          const sum = plannedOf(i.id);
          return (
            <div key={i.id} className="card card-pad" style={{ fontSize: 12.5 }}>
              <b>{i.part_code}</b> · {i.warehouse}
              {i.part_name && <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.part_name}</div>}
              {i.ghi_chu && <div style={{ fontSize: 12, color: "var(--text-muted)" }} title={i.ghi_chu}>Ghi chú: {i.ghi_chu}</div>}
              <div className="muted">Đã lên KH {soLuong(sum)} / {soLuong(i.current_qty)}</div>
            </div>
          );
        })}
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
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

function PlanModal({ plan, items, po, plannedOf, onClose, onSaved }: any) {
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
    if (!date) return setErr("Chọn ngày về dự kiến.");
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
    <Modal title={isNew ? "Thêm kế hoạch hàng về" : "Sửa kế hoạch hàng về"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Lưu</button></>}>
      <label className="field-label">Dòng linh kiện (Mã PO · Mã LK · Tên LK · Kho) <span className="req">*</span></label>
      <select className="select" value={itemId} disabled={!isNew} onChange={(e) => setItemId(e.target.value)}>
        <option value="">Chọn dòng linh kiện</option>
        {items.map((i: any) => <option key={i.id} value={i.id}>{lineLabel(po, i)} (SL {soLuong(i.current_qty)})</option>)}
      </select>
      {item && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Còn được lên kế hoạch: {soLuong(remain)}</div>}
      <label className="field-label" style={{ marginTop: 12 }}>Ngày về dự kiến <span className="req">*</span></label>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Số lượng <span className="req">*</span></label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Ngày nhà máy cam kết</label>
      <input className="input" type="date" value={factory} onChange={(e) => setFactory(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Ghi chú</label>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú nhà máy..." />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Day 1 ngay ve (va SL) cho nhieu dong cung luc - "day ngay dap ung hang loat". */
function BulkPlanModal({ po, items, plans, onClose, onSaved }: any) {
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
    if (!allDate && !allNm) return setErr("Chọn ngày về chung (và/hoặc ngày NM cam kết) trước khi áp dụng.");
    setErr("");
    setRows((rs) => {
      const n = { ...rs };
      for (const i of items) if (n[i.id].chon) n[i.id] = {
        ...n[i.id],
        date: allDate || n[i.id].date,
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
      if (!r.date) e[i.id] = "Thiếu ngày về";
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
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", padding: 12, background: "var(--surface-2, #F8FAFC)", borderRadius: 10, marginBottom: 12 }}>
        <div><label className="field-label">Ngày về chung</label><input className="input" type="date" value={allDate} onChange={(e) => setAllDate(e.target.value)} /></div>
        <div><label className="field-label">Ngày NM cam kết</label><input className="input" type="date" value={allNm} onChange={(e) => setAllNm(e.target.value)} /></div>
        <div><label className="field-label">Số lượng</label>
          <select className="select" value={allQty} onChange={(e) => setAllQty(e.target.value as any)}>
            <option value="con_lai">= SL còn lại của dòng</option><option value="giu">Giữ SL đang nhập</option>
          </select>
        </div>
        <button className="btn primary" onClick={apply}>Áp dụng cho dòng đã chọn</button>
        <input className="input" style={{ marginLeft: "auto", width: 220 }} placeholder="Lọc mã / tên LK / kho..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 8 }}>
        <input type="checkbox" checked={thayThe} onChange={(e) => setThayThe(e.target.checked)} />
        Thay thế kế hoạch theo ngày đang có của các dòng được chọn (không chọn = thêm mốc mới)
      </label>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      <div className="tbl-wrap" style={{ maxHeight: "50vh", overflow: "auto" }}>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: 32 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
            <th>Mã PO</th><th>Mã LK</th><th>Tên linh kiện</th><th>Kho</th>
            <th style={{ textAlign: "right" }}>SL đặt</th><th style={{ textAlign: "right" }}>Đã lên KH</th><th style={{ textAlign: "right" }}>Còn lại</th>
            <th>Ngày về</th><th>SL</th><th>Ngày NM</th><th>Ghi chú</th>
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
                  <td style={cell}>{i.warehouse}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{soLuong(i.current_qty)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{soLuong(sumOf(i.id))}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{soLuong(conLai(i))}</td>
                  <td style={cell}><input className="input" type="date" style={{ width: 140 }} value={r.date} onChange={(ev) => set(i.id, { date: ev.target.value, chon: true })} /></td>
                  <td style={cell}><input className="input right" style={{ width: 80 }} value={r.qty} onChange={(ev) => set(i.id, { qty: ev.target.value, chon: true })} /></td>
                  <td style={cell}><input className="input" type="date" style={{ width: 140 }} value={r.nm} onChange={(ev) => set(i.id, { nm: ev.target.value })} /></td>
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

function ReplacePartModal({ item, onClose, onSaved }: any) {
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
        Kho: <b>{item.warehouse}</b> · Mã hiện tại: <b>{item.part_code}</b> {item.part_name && `— ${item.part_name}`}
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

function TabQuyTrinh({ submissions, approvals }: any) {
  if (!submissions?.length) return <div className="muted" style={{ padding: 24 }}>Chưa gửi trình duyệt.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[...submissions].reverse().map((s: any) => {
        const list = approvals.filter((a: any) => a.submission_id === s.id);
        const superseded = s.status === "SUPERSEDED" || s.status === "CANCELLED";
        return (
          <Card key={s.id} style={{ opacity: superseded ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong>Lần trình #{s.version} · gửi bởi {ten(s.submitted_by)} · {ngayGio(s.submitted_at)}</strong>
              {superseded && <span className="badge nhap">Đã thay thế</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map((a: any) => {
                const m = APR_STATUS[a.status] ?? { label: a.status, cls: "nhap" };
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <Avatar name={ten(a.approver_email)} size={30} />
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 13 }}>{ten(a.approver_email)}</b>
                      <span className="badge nhap" style={{ marginLeft: 8 }}>{a.step_type === "FINAL" ? "Duyệt cuối" : "Thẩm định"}</span>
                      {a.carried_from_submission_id && <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>chuyển tiếp từ lần trước</span>}
                      {a.comment && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.comment}</div>}
                    </div>
                    <span className="muted" style={{ fontSize: 11.5 }}>{ngayGio(a.action_at)}</span>
                    <span className={`badge ${m.cls}`}>{m.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function TabLichSu({ events }: any) {
  const cols: Col<any>[] = [
    { key: "created_at", header: "Thời điểm", render: (r) => ngayGio(r.created_at), width: 150 },
    { key: "user", header: "Người", render: (r) => ten(r.user_email) },
    { key: "type", header: "Hành động", render: (r) => EVENT_LABEL[r.event_type] ?? r.event_type },
    {
      key: "detail", header: "Chi tiết", render: (r) => {
        const b = r.before_json ? JSON.parse(r.before_json) : null;
        const a = r.after_json ? JSON.parse(r.after_json) : null;
        const m = r.metadata_json ? JSON.parse(r.metadata_json) : null;
        const parts: string[] = [];
        if (b?.qty != null && a?.qty != null) parts.push(`${soLuong(b.qty)} → ${soLuong(a.qty)}`);
        if (m?.reason) parts.push(`Lý do: ${m.reason}`);
        if (a?.planned_date) parts.push(`Ngày dự kiến: ${ngay(a.planned_date)}`);
        if (r.event_type === "UPLOAD_FILE") {
          parts.push(`${a?.file_name ?? ""}${a?.file_size ? ` (${fileSize(a.file_size)})` : ""}`);
          if (m?.trang_thai_eo) parts.push(`Lúc EO: ${STATUS_META[m.trang_thai_eo]?.label ?? m.trang_thai_eo}`);
          if (a?.ghi_chu) parts.push(a.ghi_chu);
        }
        if (r.event_type === "REPLACE_PART") parts.unshift(`${b?.part_code} → ${a?.part_code}${a?.part_name ? ` (${a.part_name})` : ""}`);
        if (r.event_type === "BULK_PLAN" && Array.isArray(a)) {
          parts.push(`${m?.part_code ?? ""}: ${a.length} mốc ${m?.loai === "TUAN" ? "tuần" : "ngày"}` +
            (a.length ? ` — ${a.slice(0, 4).map((x: any) => `${m?.loai === "TUAN" ? x.tuan : ngay(x.planned_date)}: ${soLuong(x.planned_qty)}`).join(", ")}${a.length > 4 ? "…" : ""}` : ""));
          if (m?.thay_the) parts.push(`thay ${m.so_ke_hoach_cu} mốc cũ`);
          if (m?.nguon === "excel") parts.push("từ Excel");
        }
        if (r.event_type === "IMPORT_ITEMS") parts.push(`${m?.so_dong} dòng`);
        if (r.event_type === "CREATE_EO" && m?.so_dong) parts.push(`${m.so_dong} dòng${m.nguon_dong === "excel" ? " (import Excel)" : ""}`);
        return <span className="muted">{parts.join(" · ")}</span>;
      },
    },
  ];
  return <DataTable cols={cols} rows={events} keyOf={(r) => r.id} empty="Chưa có lịch sử" pageSize={PAGE_SIZE} />;
}

function TabBinhLuan({ eoId, comments, onSent }: any) {
  const [text, setText] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    await api.post(`/eo/${eoId}/comments`, { noi_dung: text.trim() });
    setText(""); onSent();
  };
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
        {comments.length === 0 && <div className="muted">Chưa có bình luận.</div>}
        {comments.map((c: any) => (
          <div key={c.id} style={{ display: "flex", gap: 10 }}>
            <Avatar name={ten(c.user_email)} size={32} />
            <div>
              <div style={{ fontSize: 12.5 }}><b>{ten(c.user_email)}</b> <span className="muted">· {ngayGio(c.created_at)}</span></div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{c.noi_dung}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" placeholder="Nhập bình luận..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn primary" onClick={send}><I.send width={14} height={14} /> Gửi</button>
      </div>
    </Card>
  );
}

function TabTaiLieu({ eoId, files, onUploaded }: any) {
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
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

function QtyModal({ item, issued, onClose, onSaved }: any) {
  const [qty, setQty] = useState(String(item.current_qty));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(item.ghi_chu ?? "");
  const [crm, setCrm] = useState(item.crm_id ?? "");
  const [order, setOrder] = useState(item.order_id ?? "");
  const [err, setErr] = useState("");
  const qtyChanged = Number(qty) !== Number(item.current_qty);
  const save = async () => {
    setErr("");
    const body: Record<string, unknown> = {};
    if (qtyChanged) { body.current_qty = Number(qty); body.reason = reason || undefined; }
    if (note.trim() !== (item.ghi_chu ?? "")) body.ghi_chu = note.trim() || null;
    if (crm.trim() !== (item.crm_id ?? "")) body.crm_id = crm.trim() || null;
    if (order.trim() !== (item.order_id ?? "")) body.order_id = order.trim() || null;
    if (!Object.keys(body).length) return onClose();
    try {
      await api.patch(`/eo/items/${item.id}`, body);
      onSaved();
    } catch (e: any) {
      setErr(e?.body?.error === "REASON_REQUIRED" ? "Cần nhập lý do." :
        e?.body?.error === "QTY_BELOW_PLANNED_SUM" ? `SL mới nhỏ hơn tổng kế hoạch (${soLuong(e.body.planned_sum)}).` : "Lỗi lưu.");
    }
  };
  return (
    <Modal title={`Sửa dòng — ${item.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={save}>Lưu</button></>}>
      <label className="field-label">Số lượng mới</label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Lý do {issued && qtyChanged && <span className="req">*</span>}</label>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do thay đổi số lượng" />
      <label className="field-label" style={{ marginTop: 12 }}>Ghi chú dòng</label>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú..." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div>
          <label className="field-label">ID CRM (mã ca)</label>
          <input className="input" value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="Tuỳ chọn" />
        </div>
        <div>
          <label className="field-label">ID đặt hàng</label>
          <input className="input" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="TLK-..." />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chỉ sửa ghi chú / ID CRM / ID đặt hàng thì không cần lý do.</div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

function CancelModal({ eo, onClose, onDone }: any) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setErr(""); setBusy(true);
    try {
      await api.post(`/eo/${eo.id}/cancel`, { reason: reason.trim() || undefined });
      onDone();
    } catch (e: any) {
      setErr(e?.body?.error === "FORBIDDEN" ? "Bạn không có quyền hủy EO này." :
        e?.body?.error === "ADMIN_ONLY_AFTER_ISSUE" ? "EO đã ban hành — chỉ Admin được hủy." :
        e?.body?.error === "BAD_STATE" ? "EO đang ở trạng thái không thể hủy." : "Lỗi hủy EO.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Hủy EO — ${eo.eo_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn danger" disabled={busy} onClick={run}>Xác nhận hủy</button></>}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Hành động này sẽ chuyển EO sang trạng thái "Đã hủy" và không thể hoàn tác.</div>
      <label className="field-label">Lý do hủy</label>
      <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do hủy (tuỳ chọn)..." />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

function AddItemModal({ eoId, phongBan, onClose, onSaved }: any) {
  const khos = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const [partCode, setPartCode] = useState("");
  const [partName, setPartName] = useState("");
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
    } catch {
      setErr("Lỗi lưu dòng linh kiện.");
      setBusy(false);
    }
  };
  return (
    <Modal title="Thêm dòng linh kiện (duyệt sau ban hành)" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Lưu</button></>}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Dòng mới sẽ ở trạng thái chờ duyệt cho tới khi người duyệt cuối của EO xác nhận.</div>
      <label className="field-label">Mã linh kiện <span className="req">*</span></label>
      <input className="input" value={partCode} onChange={(e) => setPartCode(e.target.value)} placeholder="Nhập mã LK" />
      <label className="field-label" style={{ marginTop: 12 }}>Tên linh kiện</label>
      <input className="input" value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="Nhập tên linh kiện" />
      <label className="field-label" style={{ marginTop: 12 }}>Kho cần đặt <span className="req">*</span></label>
      <select className="select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
        <option value="">Chọn kho</option>
        {(khos.data ?? []).map((k) => <option key={k.ten_kho} value={k.ten_kho}>{k.ten_kho}</option>)}
      </select>
      <label className="field-label" style={{ marginTop: 12 }}>Đối tác</label>
      <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nhập đối tác" />
      <label className="field-label" style={{ marginTop: 12 }}>Số lượng <span className="req">*</span></label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Lý do PS</label>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." />
      <label className="field-label" style={{ marginTop: 12 }}>Ghi chú</label>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú..." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div><label className="field-label">ID CRM (mã ca)</label><input className="input" value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="Tuỳ chọn" /></div>
        <div><label className="field-label">ID đặt hàng</label><input className="input" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="TLK-..." /></div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Nguoi tao sua EO khi chua duyet xong: rut ve Nhap (huy phieu duyet dang cho) roi mo form sua. */
function RecallModal({ eo, onClose, onDone }: any) {
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
        EO đang <b>{eo.trang_thai === "IN_REVIEW" ? "thẩm định" : "chờ duyệt cuối"}</b>. Để sửa, EO sẽ được <b>rút về Nháp</b>:
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
