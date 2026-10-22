import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, StatusBadge, Avatar, Spinner } from "../components/ui";
import { I } from "../lib/icons";
import { ngayGio, ten, soLuong } from "../lib/format";
import { actionsFor, ApprovalActionModal as ActionModal, TuChoiDongModal } from "./eo/eoActions";

export default function Approvals() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "REVIEW" | "FINAL" | "POST">("all");
  const [act, setAct] = useState<{ row: any; action: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tuChoi, setTuChoi] = useState<any>(null);

  const q = useQuery({ queryKey: ["inbox"], queryFn: () => api.get<any[]>("/approvals/inbox") });
  const post = useQuery({ queryKey: ["post-issue"], queryFn: () => api.get<any[]>("/approvals/post-issue") });
  if (q.isLoading || post.isLoading) return <Spinner />;
  const rows = filter === "POST" ? [] : (q.data ?? []).filter((r) => filter === "all" || r.step_type === filter);
  const postRows = filter === "all" || filter === "POST" ? (post.data ?? []) : [];
  const nReview = (q.data ?? []).filter((r) => r.step_type === "REVIEW").length;
  const nFinal = (q.data ?? []).filter((r) => r.step_type === "FINAL").length;
  const nPost = post.data?.length ?? 0;

  const approvePost = async (r: any) => {
    if (!confirm(`Duyệt dòng ${r.part_code} (SL ${soLuong(r.current_qty)}) của ${r.eo_code}?`)) return;
    setBusyId(r.id);
    try {
      await api.post(`/eo/items/${r.id}/approve-post-issue`);
      qc.invalidateQueries({ queryKey: ["post-issue"] });
      qc.invalidateQueries({ queryKey: ["inbox-count"] });
      qc.invalidateQueries({ queryKey: ["eo", String(r.eo_id)] });
    } catch {
      alert("Lỗi duyệt dòng.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Việc cần duyệt" />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["all", `Tất cả (${(q.data?.length ?? 0) + nPost})`], ["REVIEW", `Thẩm định (${nReview})`], ["FINAL", `Duyệt cuối (${nFinal})`], ["POST", `Dòng thêm sau ban hành (${nPost})`]].map(([k, l]) => (
          <button key={k} className={`btn sm ${filter === k ? "primary" : ""}`} onClick={() => setFilter(k as any)}>{l}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.length === 0 && postRows.length === 0 && <Card><div className="muted" style={{ textAlign: "center", padding: 24 }}>Không có việc chờ bạn xử lý.</div></Card>}
        {postRows.map((r) => (
          <Card key={`p-${r.id}`} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={r.eo_code} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{r.eo_code} ({r.approval_code}) - dòng {r.part_code}{r.part_name ? ` · ${r.part_name}` : ""}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>Kho {r.warehouse}</span><span>SL {soLuong(r.current_qty)}</span>
                <span>Thêm bởi {ten(r.created_by)} lúc {ngayGio(r.created_at)}</span>
                {r.reason && <span>Lý do: {r.reason}</span>}
                {r.ghi_chu && <span>Ghi chú: {r.ghi_chu}</span>}
                <span className="badge final" title="Dòng thêm sau khi EO đã ban hành phải được người duyệt cuối của EO (bạn) hoặc Admin duyệt mới được đặt hàng">Dòng thêm sau ban hành · bạn là người duyệt cuối</span>
              </div>
            </div>
            <button className="btn sm" onClick={() => nav(`/eo/${r.eo_id}`)}><I.eye width={14} height={14} /> Mở</button>
            <button className="btn sm danger" disabled={busyId === r.id} onClick={() => setTuChoi(r)}>Từ chối</button>
            <button className="btn sm primary" disabled={busyId === r.id} onClick={() => approvePost(r)}>Duyệt dòng</button>
          </Card>
        ))}
        {rows.map((r) => (
          <Card key={r.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={r.eo_code} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{r.eo_code} - {r.tieu_de || "(không tiêu đề)"}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>Lần trình #{r.version}</span><span>Giao lúc {ngayGio(r.assigned_at)}</span>
                <span className="badge nhap">{r.step_type === "FINAL" ? "Duyệt cuối" : "Thẩm định"}</span>
                {r.so_file > 0 && <span className="badge issued" title="Mở EO › tab Tài liệu đính kèm"><I.file width={11} height={11} /> {r.so_file} tệp đính kèm</span>}
              </div>
            </div>
            <StatusBadge status={r.eo_status} />
            <button className="btn sm" onClick={() => nav(`/eo/${r.eo_id}`)}><I.eye width={14} height={14} /> Mở</button>
            <div style={{ display: "flex", gap: 6 }}>
              {actionsFor(r.step_type).map((a) => (
                <button key={a.key} className={`btn sm ${a.cls}`} onClick={() => setAct({ row: r, action: a.key })}>{a.label}</button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {tuChoi && <TuChoiDongModal item={tuChoi} onClose={() => setTuChoi(null)} onDone={() => { setTuChoi(null); qc.invalidateQueries({ queryKey: ["post-issue"] }); qc.invalidateQueries({ queryKey: ["inbox-count"] }); }} />}
      {act && <ActionModal act={act} onClose={() => setAct(null)} onDone={() => { setAct(null); qc.invalidateQueries({ queryKey: ["inbox"] }); qc.invalidateQueries({ queryKey: ["inbox-count"] }); }} />}
    </div>
  );
}
