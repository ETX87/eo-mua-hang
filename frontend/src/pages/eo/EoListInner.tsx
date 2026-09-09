import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DataTable, Pagination, FilterBar, RefreshFiltersBtn, type Col } from "../../components/DataTable";
import { StatusBadge, TypeBadge } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ten } from "../../lib/format";
import { STATUS_META } from "../../lib/nav";
import { exportRowsToXlsx, type ExportCol } from "../../lib/exportXlsx";

interface EoRow {
  id: number; eo_code: string; approval_code: string | null; tieu_de: string;
  loai_hinh: string | null; phong_ban: string | null; trang_thai: string;
  created_by: string; created_at: string; so_dong: number; tong_sl: number; final_approver_email: string | null;
}

const EXPORT_COLS: ExportCol<EoRow>[] = [
  { header: "Mã EO", get: (r) => r.eo_code },
  { header: "Mã phê duyệt", get: (r) => r.approval_code },
  { header: "Tiêu đề", get: (r) => r.tieu_de },
  { header: "Loại hình", get: (r) => r.loai_hinh },
  { header: "Phòng ban", get: (r) => r.phong_ban },
  { header: "Trạng thái", get: (r) => STATUS_META[r.trang_thai]?.label ?? r.trang_thai },
  { header: "Người tạo", get: (r) => ten(r.created_by) },
  { header: "Ngày tạo", get: (r) => ngay(r.created_at) },
  { header: "Số dòng LK", get: (r) => r.so_dong },
  { header: "Tổng SL đặt", get: (r) => r.tong_sl },
  { header: "Người duyệt cuối", get: (r) => ten(r.final_approver_email) },
];

export default function EoListInner({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [loaiHinh, setLoaiHinh] = useState("");
  const [phongBan, setPhongBan] = useState("");
  const limit = 10;
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("trang_thai", status);
  if (createdBy) params.set("created_by", createdBy);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const list = useQuery({
    queryKey: ["eo-list", params.toString()],
    queryFn: () => api.get<{ rows: EoRow[]; total: number; limit: number; offset: number }>("/eo?" + params.toString()),
  });
  const cats = useQuery({ queryKey: ["dm-loaihinh"], queryFn: () => api.get<any[]>("/danh-muc/loai-hinh") });

  let rows = list.data?.rows ?? [];
  if (loaiHinh) rows = rows.filter((r) => r.loai_hinh === loaiHinh);
  if (phongBan) rows = rows.filter((r) => r.phong_ban === phongBan);
  const creatorOpts = [...new Set((list.data?.rows ?? []).map((r) => r.created_by).filter(Boolean))] as string[];

  const cols: Col<EoRow>[] = [
    { key: "eo_code", header: "Mã EO", render: (r) => <span className="cell-link">{r.eo_code}</span> },
    { key: "approval_code", header: "Mã phê duyệt", render: (r) => r.approval_code || "" },
    { key: "tieu_de", header: "Tiêu đề", width: 240, render: (r) => <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.35, minWidth: 180 }}>{r.tieu_de || "—"}</span> },
    { key: "loai_hinh", header: "Loại hình", render: (r) => <TypeBadge loai={r.loai_hinh} /> },
    { key: "phong_ban", header: "Phòng ban", render: (r) => r.phong_ban || "" },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge status={r.trang_thai} /> },
    { key: "created_by", header: "Người tạo", render: (r) => ten(r.created_by) },
    { key: "created_at", header: "Ngày tạo", render: (r) => ngay(r.created_at) },
    { key: "so_dong", header: "Số dòng LK", align: "right", render: (r) => soLuong(r.so_dong) },
    { key: "tong_sl", header: "Tổng SL đặt", align: "right", render: (r) => soLuong(r.tong_sl) },
    { key: "final", header: "Người duyệt cuối", render: (r) => ten(r.final_approver_email) },
    {
      key: "act", header: "Thao tác", align: "center", render: (r) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
          <button className="btn ghost sm" onClick={() => nav(`/eo/${r.id}`)}><I.eye width={15} height={15} /></button>
        </div>
      ),
    },
  ];

  const reset = () => { setQ(""); setStatus(""); setCreatedBy(""); setLoaiHinh(""); setPhongBan(""); setOffset(0); };

  const doExport = async () => {
    setExporting(true);
    try {
      const exportParams = new URLSearchParams();
      if (q) exportParams.set("q", q);
      if (status) exportParams.set("trang_thai", status);
      if (createdBy) exportParams.set("created_by", createdBy);
      exportParams.set("limit", "200");
      const all: EoRow[] = [];
      let off = 0;
      while (true) {
        exportParams.set("offset", String(off));
        const page = await api.get<{ rows: EoRow[]; total: number }>("/eo?" + exportParams.toString());
        all.push(...page.rows);
        if (all.length >= page.total || page.rows.length === 0) break;
        off += 200;
      }
      let filtered = all;
      if (loaiHinh) filtered = filtered.filter((r) => r.loai_hinh === loaiHinh);
      if (phongBan) filtered = filtered.filter((r) => r.phong_ban === phongBan);
      exportRowsToXlsx(filtered, EXPORT_COLS, "danh-sach-eo.xlsx");
    } finally {
      setExporting(false);
    }
  };

  const phongBanOpts = [...new Set((list.data?.rows ?? []).map((r) => r.phong_ban).filter(Boolean))] as string[];

  return (
    <div>
      <FilterBar>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 320 }}>
          <I.search width={15} height={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--text-faint)" }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Tìm kiếm mã EO, mã phê duyệt, tiêu đề..." value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        </div>
        <select className="select" style={{ width: 128 }} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">Trạng thái</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="select" style={{ width: 128 }} value={createdBy} onChange={(e) => { setCreatedBy(e.target.value); setOffset(0); }}>
          <option value="">Người tạo</option>
          {creatorOpts.map((u) => <option key={u} value={u}>{ten(u)}</option>)}
        </select>
        <select className="select" style={{ width: 128 }} value={loaiHinh} onChange={(e) => setLoaiHinh(e.target.value)}>
          <option value="">Loại hình</option>
          {(cats.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <select className="select" style={{ width: 128 }} value={phongBan} onChange={(e) => setPhongBan(e.target.value)}>
          <option value="">Phòng ban</option>
          {phongBanOpts.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <RefreshFiltersBtn onClick={reset} />
        <div style={{ flex: 1 }} />
        <button className="btn sm" disabled={exporting} onClick={doExport}><I.download width={14} height={14} /> {exporting ? "Đang xuất..." : "Xuất Excel"}</button>
      </FilterBar>

      <DataTable cols={cols} rows={rows} keyOf={(r) => r.id} onRowClick={(r) => nav(`/eo/${r.id}`)} empty="Chưa có EO nào khớp bộ lọc" />

      {list.data && (
        <Pagination
          total={list.data.total} limit={limit} offset={offset}
          onPage={compact ? () => nav("/eo") : setOffset}
        />
      )}
    </div>
  );
}
