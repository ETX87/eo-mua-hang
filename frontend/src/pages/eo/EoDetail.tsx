import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PartLink } from "../../components/quickview/QuickView";
import { PageHeader, Card, StatusBadge, StatTile, Avatar, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, tien, ngay, ngayGio, ten } from "../../lib/format";
import { STATUS_META } from "../../lib/nav";
import { EVENT_LABEL } from "../../lib/eventLabels";
import { fileSize } from "../../lib/files";
import { quyenEo, TabKeHoach, TabTaiLieu, QtyModal, CancelModal, RecallModal, ReplacePartModal, AddItemModal } from "./eoActions";

const TABS = ["Linh kiện", "Kế hoạch hàng về", "Quy trình duyệt", "Lịch sử thay đổi", "Bình luận", "Tài liệu đính kèm"] as const;
type Tab = typeof TABS[number];

const APR_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ xử lý", cls: "nhap" }, APPROVED: { label: "Đồng ý", cls: "issued" },
  REJECTED: { label: "Từ chối", cls: "reject" }, REQUEST_UPDATE: { label: "Yêu cầu cập nhật", cls: "final" },
  WITHDRAWN: { label: "Đã rút", cls: "nhap" }, SKIPPED: { label: "Bỏ qua", cls: "nhap" },
};


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
  const { canManage, canCancel, canEditPlan, canEditQty, canApprovePostIssue, canDeleteFile } = quyenEo(eo, me.data);

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
          canEditQty={canEditQty} canApprovePostIssue={canApprovePostIssue}
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
      {tab === "Tài liệu đính kèm" && <TabTaiLieu eoId={id!} files={files} onUploaded={refresh} canDelete={canDeleteFile} myEmail={myEmail} preIssue={!["ISSUED", "CANCELLED"].includes(eo.trang_thai)} />}

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
          <PartLink ma={r.part_code} />{r.legacy_id && <span className="muted" style={{ fontSize: 10.5, marginLeft: 4 }}>{r.legacy_id}</span>}
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
        if (r.event_type === "DELETE_FILE" && b?.file_name) parts.push(b.file_name);
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


