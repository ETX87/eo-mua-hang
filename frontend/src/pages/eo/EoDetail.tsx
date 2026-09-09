import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, StatusBadge, StatTile, Modal, Avatar, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, tien, ngay, ngayGio, ten } from "../../lib/format";

const TABS = ["Linh kiện", "Quy trình duyệt", "Lịch sử thay đổi", "Bình luận", "Tài liệu đính kèm"] as const;
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
};

export default function EoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Linh kiện");
  const [qtyItem, setQtyItem] = useState<any>(null);

  const q = useQuery({ queryKey: ["eo", id], queryFn: () => api.get<any>(`/eo/${id}`) });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <div className="muted">Không tìm thấy EO.</div>;
  const { eo, items, tong, submissions, approvals, events, comments, files } = q.data;
  const issued = eo.trang_thai === "ISSUED";
  const refresh = () => qc.invalidateQueries({ queryKey: ["eo", id] });

  return (
    <div>
      <PageHeader
        title="Chi tiết EO" back={() => nav(-1)}
        breadcrumb={["Danh sách EO", "Chi tiết EO"]}
        actions={<>
          <button className="btn primary" onClick={() => nav(`/eo/${id}/edit`)}><I.edit width={14} height={14} /> Sửa EO</button>
          <button className="btn" onClick={() => setTab("Lịch sử thay đổi")}><I.clock width={14} height={14} /> Lịch sử</button>
          <button className="btn"><I.dots width={14} height={14} /> Khác</button>
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

      {tab === "Linh kiện" && <TabLinhKien items={items} tong={tong} issued={issued} onEditQty={setQtyItem} />}
      {tab === "Quy trình duyệt" && <TabQuyTrinh submissions={submissions} approvals={approvals} />}
      {tab === "Lịch sử thay đổi" && <TabLichSu events={events} />}
      {tab === "Bình luận" && <TabBinhLuan eoId={id!} comments={comments} onSent={refresh} />}
      {tab === "Tài liệu đính kèm" && <TabTaiLieu files={files} />}

      {qtyItem && <QtyModal item={qtyItem} issued={issued} onClose={() => setQtyItem(null)} onSaved={() => { setQtyItem(null); refresh(); }} />}
    </div>
  );
}

function TabLinhKien({ items, tong, issued, onEditQty }: any) {
  const cols: Col<any>[] = [
    { key: "stt", header: "STT", align: "center", render: (_r, ) => "", width: 48 },
    { key: "part_code", header: "Mã linh kiện", render: (r) => <span className="cell-link" style={{ textDecoration: "underline" }}>{r.legacy_id || r.part_code}</span> },
    { key: "part_name", header: "Tên linh kiện", render: (r) => r.part_name },
    { key: "warehouse", header: "Kho cần đặt", render: (r) => r.warehouse },
    { key: "supplier", header: "Đối tác", render: (r) => r.supplier || "" },
    { key: "current_qty", header: "Số lượng", align: "right", render: (r) => soLuong(r.current_qty) },
    { key: "da_dat", header: "Đã đặt", align: "right", render: (r) => soLuong(r.da_dat) },
    { key: "chua_dat", header: "Chưa đặt", align: "right", render: (r) => soLuong(r.chua_dat) },
    { key: "don_gia", header: "Đơn giá dự kiến", align: "right", render: (r) => r.don_gia_du_kien != null ? soLuong(r.don_gia_du_kien) : "" },
    { key: "thanh_tien", header: "Thành tiền dự kiến", align: "right", render: (r) => r.thanh_tien_du_kien ? soLuong(r.thanh_tien_du_kien) : "" },
    { key: "reason", header: "Lý do PS", render: (r) => r.reason || "" },
    {
      key: "act", header: "", align: "center", render: (r) => (
        <button className="btn ghost sm" onClick={() => onEditQty(r)} title="Sửa số lượng"><I.edit width={14} height={14} /></button>
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
        totalRow={["", <b key="t">TỔNG</b>, "", "", "", <b key="q">{soLuong(tong.tong_sl_dat)}</b>, <b key="d">{soLuong(tong.sl_da_dat)}</b>, <b key="c">{soLuong(tong.sl_chua_dat)}</b>, "", <b key="tt">{soLuong(tong.tong_tien_du_kien)}</b>, "", ""]}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 16 }}>
        <StatTile label="Tổng số dòng" value={soLuong(tong.so_dong)} />
        <StatTile label="Tổng SL đặt" value={soLuong(tong.tong_sl_dat)} />
        <StatTile label="SL đã đặt" value={soLuong(tong.sl_da_dat)} />
        <StatTile label="SL chưa đặt" value={soLuong(tong.sl_chua_dat)} />
        <StatTile label="Tổng tiền dự kiến" value={tien(tong.tong_tien_du_kien)} />
      </div>
      {issued && (
        <button className="btn sm" style={{ marginTop: 14 }}><I.plus width={14} height={14} /> Thêm dòng (duyệt sau ban hành)</button>
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

function TabTaiLieu({ files }: any) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
      {files.length === 0 && <div className="muted">Chưa có tài liệu.</div>}
      {files.map((f: any) => (
        <Card key={f.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <I.file width={22} height={22} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, wordBreak: "break-word" }}>{f.file_name}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{ten(f.uploaded_by)} · {ngay(f.uploaded_at)}</div>
            {!f.drive_url && <span className="badge nhap" style={{ marginTop: 6 }}>Chưa đồng bộ</span>}
          </div>
        </Card>
      ))}
      <button className="btn sm" style={{ alignSelf: "start" }}><I.upload width={14} height={14} /> Tải lên</button>
    </div>
  );
}

function QtyModal({ item, issued, onClose, onSaved }: any) {
  const [qty, setQty] = useState(String(item.current_qty));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try {
      await api.patch(`/eo/items/${item.id}`, { current_qty: Number(qty), reason: reason || undefined });
      onSaved();
    } catch (e: any) {
      setErr(e?.body?.error === "REASON_REQUIRED" ? "Cần nhập lý do." :
        e?.body?.error === "QTY_BELOW_PLANNED_SUM" ? `SL mới nhỏ hơn tổng kế hoạch (${soLuong(e.body.planned_sum)}).` : "Lỗi lưu.");
    }
  };
  return (
    <Modal title={`Sửa số lượng — ${item.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={save}>Lưu</button></>}>
      <label className="field-label">Số lượng mới</label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Lý do {issued && <span className="req">*</span>}</label>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do thay đổi số lượng" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}
