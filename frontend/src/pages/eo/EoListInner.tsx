import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useQuickView } from "../../components/quickview/QuickView";
import { DataTable, Pagination, FilterBar, RefreshFiltersBtn, type Col } from "../../components/DataTable";
import { StatusBadge, TypeBadge } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ten } from "../../lib/format";
import { STATUS_META, PHONG_BAN } from "../../lib/nav";
import { MocTon } from "../../lib/tonDong";
import { exportRowsToXlsx, type ExportCol } from "../../lib/exportXlsx";

interface EoRow {
  id: number; eo_code: string; approval_code: string | null; tieu_de: string;
  loai_hinh: string | null; phong_ban: string | null; trang_thai: string;
  created_by: string; created_at: string; so_dong: number; tong_sl: number; final_approver_email: string | null;
  issued_at: string | null; ma_lk: string | null; so_dong_sau_bh: number; so_dong_chua_du: number;
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

/** actions: nut them o cuoi thanh loc (vd "Tao EO" o trang Danh sach EO - trang khong co dong tieu de rieng). */
export default function EoListInner({ compact, actions }: { compact?: boolean; actions?: ReactNode }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [loaiHinh, setLoaiHinh] = useState("");
  const [phongBan, setPhongBan] = useState("");
  const limit = 10;
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const filterParams = () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("trang_thai", status);
    if (createdBy) p.set("created_by", createdBy);
    if (loaiHinh) p.set("loai_hinh", loaiHinh);
    if (phongBan) p.set("phong_ban", phongBan);
    return p;
  };
  const params = filterParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const list = useQuery({
    queryKey: ["eo-list", params.toString()],
    queryFn: () => api.get<{ rows: EoRow[]; total: number; limit: number; offset: number }>("/eo?" + params.toString()),
  });
  const cats = useQuery({ queryKey: ["dm-loaihinh"], queryFn: () => api.get<any[]>("/danh-muc/loai-hinh") });
  const users = useQuery({ queryKey: ["users-min"], queryFn: () => api.get<any[]>("/users/directory") });

  const qv = useQuickView();
  const rows = list.data?.rows ?? [];
  const creatorOpts = (users.data ?? []).map((u: any) => u.email as string);

  const cols: Col<EoRow>[] = [
    { key: "eo_code", header: "Mã EO · 3TDO", render: (r) => <><span className="cell-link">{r.eo_code}</span><div className="muted" style={{ fontSize: 11 }}>{r.approval_code || "chưa ban hành"}</div></> },
    { key: "tieu_de", header: "Tiêu đề", maxW: 190, render: (r) => r.tieu_de || "—" },
    { key: "loai_hinh", header: "Loại hình", render: (r) => <TypeBadge loai={r.loai_hinh} /> },
    { key: "phong_ban", header: "Phòng ban", maxW: 115, render: (r) => r.phong_ban || "" },
    { key: "ma_lk", header: "Mã linh kiện", maxW: 150, render: (r) => r.ma_lk ? <span title={r.ma_lk}>{r.ma_lk}{r.so_dong > 4 ? ", …" : ""}</span> : <span className="muted">—</span> },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge status={r.trang_thai} /> },
    {
      // ton: EO da ban hanh con dong chua ve du -> tinh tu ngay ban hanh; EO dang cho duyet -> tinh tu ngay tao
      key: "ton", header: "Tồn", render: (r) => r.trang_thai === "ISSUED"
        ? (r.so_dong_chua_du > 0 ? <><MocTon tu={r.issued_at} nho /><div className="muted" style={{ fontSize: 11 }}>{r.so_dong_chua_du} dòng chưa đủ</div></> : <span style={{ color: "var(--ok-ink)", fontSize: 12 }}>✓ về đủ</span>)
        : ["IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(r.trang_thai) ? <><MocTon tu={r.created_at} nho /><div className="muted" style={{ fontSize: 11 }}>chờ duyệt</div></> : <span className="muted">—</span>,
    },
    { key: "created_by", header: "Người tạo · ngày", maxW: 110, render: (r) => <>{ten(r.created_by)}<div className="muted" style={{ fontSize: 11 }}>{ngay(r.created_at)}</div></> },
    { key: "so_dong", header: "Dòng · SL", align: "right", render: (r) => <>{soLuong(r.so_dong)}<div className="muted" style={{ fontSize: 11 }}>{soLuong(r.tong_sl)}</div>{r.so_dong_sau_bh > 0 && <div title="Dòng thêm sau khi EO ban hành" style={{ fontSize: 10.5, color: "var(--orange-ink, #C2410C)" }}>+{r.so_dong_sau_bh} sau BH</div>}</> },
    { key: "final", header: "Người duyệt cuối", maxW: 100, render: (r) => ten(r.final_approver_email) },
    {
      key: "act", header: "", align: "center", render: (r) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
          <button className="btn ghost sm" title="Xem nhanh" onClick={() => qv.openEo(r.id)}><I.eye width={15} height={15} /></button>
          <button className="btn ghost sm" title="Mở trang chi tiết" onClick={() => nav(`/eo/${r.id}`)}><I.arrowRight width={15} height={15} /></button>
        </div>
      ),
    },
  ];

  const reset = () => { setQ(""); setStatus(""); setCreatedBy(""); setLoaiHinh(""); setPhongBan(""); setOffset(0); };

  const doExport = async () => {
    setExporting(true);
    try {
      const exportParams = filterParams();
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
      exportRowsToXlsx(all, EXPORT_COLS, "danh-sach-eo.xlsx");
    } finally {
      setExporting(false);
    }
  };

  const phongBanOpts = [...new Set([...PHONG_BAN, ...rows.map((r) => r.phong_ban).filter(Boolean)])] as string[];

  return (
    <div>
      <FilterBar>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 320 }}>
          <I.search width={15} height={15} style={{ position: "absolute", left: 11, top: 11, color: "var(--text-faint)" }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Tìm mã EO, 3TDO, tiêu đề, mã / tên linh kiện…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        </div>
        <select className="select" style={{ width: 128 }} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">Trạng thái</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="select" style={{ width: 128 }} value={createdBy} onChange={(e) => { setCreatedBy(e.target.value); setOffset(0); }}>
          <option value="">Người tạo</option>
          {creatorOpts.map((u) => <option key={u} value={u}>{ten(u)}</option>)}
        </select>
        <select className="select" style={{ width: 128 }} value={loaiHinh} onChange={(e) => { setLoaiHinh(e.target.value); setOffset(0); }}>
          <option value="">Loại hình</option>
          {(cats.data ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <select className="select" style={{ width: 128 }} value={phongBan} onChange={(e) => { setPhongBan(e.target.value); setOffset(0); }}>
          <option value="">Phòng ban</option>
          {phongBanOpts.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <RefreshFiltersBtn onClick={reset} />
        <div style={{ flex: 1 }} />
        <button className="btn sm" disabled={exporting} onClick={doExport}><I.download width={14} height={14} /> {exporting ? "Đang xuất..." : "Xuất Excel"}</button>
        {actions}
      </FilterBar>

      <DataTable timKiem={false} cols={cols} rows={rows} keyOf={(r) => r.id} onRowClick={(r) => qv.openEo(r.id)} empty="Chưa có EO nào khớp bộ lọc" />

      {list.data && (
        <Pagination
          total={list.data.total} limit={limit} offset={offset}
          onPage={compact ? () => nav("/eo") : setOffset}
        />
      )}
    </div>
  );
}
