import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useQuickView } from "../../components/quickview/QuickView";
import { DataTable, Pagination, FilterBar, RefreshFiltersBtn, soCotLoc, type Col, type LocCot, type SapCot } from "../../components/DataTable";
import { StatusBadge, TypeBadge, Popover } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ten } from "../../lib/format";
import { STATUS_META } from "../../lib/nav";
import { MocTon } from "../../lib/tonDong";
import { exportRowsToXlsx, type ExportCol } from "../../lib/exportXlsx";
import { DL, GoiYDatalists, useGoiYDong } from "../../lib/goiY";
import { actionsFor, ApprovalActionModal } from "./eoActions";

interface EoRow {
  id: number; eo_code: string; approval_code: string | null; tieu_de: string;
  loai_hinh: string | null; phong_ban: string | null; trang_thai: string;
  created_by: string; created_at: string; so_dong: number; tong_sl: number; final_approver_email: string | null;
  issued_at: string | null; ma_lk: string | null; so_dong_sau_bh: number; so_dong_chua_du: number; sl_ve: number;
  so_dong_cho_duyet: number; phieu_cho_toi_id: number | null; phieu_cho_toi_buoc: string | null;
}
interface DsEo { rows: EoRow[]; total: number; tong_truoc_loc: number; tuy_chon: Record<string, string[]>; limit: number; offset: number }

/**
 * Nhom nhanh man Quan ly EO (backend routes/eo.ts CHIP_EO). Mac dinh "EO con ton" = chua ket thuc
 * (khong huy / tu choi, chua ban hanh hoac con dong chua ve du) - yeu cau 2026-11-07.
 */
const CHIP: { k: string; l: string; mau?: string; title?: string }[] = [
  { k: "con_ton", l: "EO còn tồn", title: "EO chưa kết thúc: chưa đóng / chưa hủy / chưa từ chối, đang trình duyệt hoặc đã ban hành nhưng hàng chưa về đủ" },
  { k: "cho_toi_duyet", l: "Chờ tôi duyệt", mau: "#DC2626", title: "Phiếu thẩm định / duyệt mua đang chờ bạn + EO bạn là người duyệt mua có dòng thêm sau ban hành chờ duyệt" },
  { k: "nhap_cua_toi", l: "Nháp / bị trả về của tôi", mau: "#C2410C" },
  { k: "dang_tham_dinh", l: "Đang thẩm định" },
  { k: "cho_duyet_cuoi", l: "Chờ duyệt mua" },
  { k: "da_ban_hanh", l: "Đã ban hành" },
  { k: "sau_bh_cho", l: "Có dòng thêm sau BH chờ duyệt" },
  { k: "tu_choi_huy", l: "Từ chối / Đã hủy" },
];
const CHIP_MAC_DINH = "con_ton";
const TAT_CA = "tat_ca";

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
  { header: "Ngày ban hành", get: (r) => ngay(r.issued_at) },
  { header: "Người duyệt mua", get: (r) => ten(r.final_approver_email) },
];

/** actions: nut them o cuoi thanh loc (vd "Tao EO" o trang Danh sach EO - trang khong co dong tieu de rieng). */
export default function EoListInner({ compact, actions }: { compact?: boolean; actions?: ReactNode }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [chip, setChip] = useState(sp.get("chip") ?? (compact ? TAT_CA : CHIP_MAC_DINH));
  const [duyet, setDuyet] = useState<{ row: any; action: string } | null>(null);
  const dem = useQuery({ queryKey: ["eo-dem"], queryFn: () => api.get<Record<string, number>>("/eo/dem"), enabled: !compact });
  // thuong dung: o tim + nhom nhanh + loc / sap tren tieu de cot. It dung (an, bam "Bộ lọc khác"): kho, doi tac, ly do PS cua dong LK.
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<LocCot>({});
  const [sap, setSap] = useState<SapCot>(null);
  const [kho, setKho] = useState("");
  const [doiTac, setDoiTac] = useState("");
  const [lyDo, setLyDo] = useState("");
  const goiY = useGoiYDong();
  const khos = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho"), enabled: !compact });
  const limit = 20;
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const soItDung = [kho, doiTac, lyDo].filter((x) => x.trim()).length;

  const filterParams = () => {
    const p = new URLSearchParams();
    if (chip && chip !== TAT_CA) p.set("chip", chip);
    if (q.trim()) p.set("q", q.trim());
    if (kho) p.set("kho", kho);
    if (doiTac.trim()) p.set("doi_tac", doiTac.trim());
    if (lyDo.trim()) p.set("ly_do", lyDo.trim());
    if (soCotLoc(loc)) p.set("loc", JSON.stringify(loc));
    if (sap) p.set("sap", `${sap.k}:${sap.tang ? "asc" : "desc"}`);
    return p;
  };
  const params = filterParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const list = useQuery({ queryKey: ["eo-list", params.toString()], queryFn: () => api.get<DsEo>("/eo?" + params.toString()) });

  const qv = useQuickView();
  const rows = list.data?.rows ?? [];

  const cols: Col<EoRow>[] = [
    { key: "eo_code", header: "Mã EO · 3TDO", loc: "chu", render: (r) => <><span className="cell-link">{r.eo_code}</span><div className="muted" style={{ fontSize: 11 }}>{r.approval_code || "chưa ban hành"}</div></> },
    { key: "tieu_de", header: "Tiêu đề", loc: "chu", maxW: 190, render: (r) => r.tieu_de || "—" },
    { key: "loai_hinh", header: "Loại hình", loc: "chon", render: (r) => <TypeBadge loai={r.loai_hinh} /> },
    { key: "phong_ban", header: "Phòng ban", loc: "chon", maxW: 115, render: (r) => r.phong_ban || "" },
    { key: "ma_lk", header: "Mã linh kiện", loc: "chu", maxW: 150, render: (r) => r.ma_lk ? <span title={r.ma_lk}>{r.ma_lk}{r.so_dong > 4 ? ", …" : ""}</span> : <span className="muted">—</span> },
    { key: "trang_thai", header: "Trạng thái", loc: "chon", nhanChon: (v) => STATUS_META[v]?.label ?? v, render: (r) => <StatusBadge status={r.trang_thai} /> },
    {
      // ton: EO da ban hanh con dong chua ve du -> tinh tu ngay ban hanh; EO dang cho duyet -> tinh tu ngay tao
      key: "ton", header: "Tồn", loc: "chon", render: (r) => r.trang_thai === "ISSUED"
        ? (r.so_dong_chua_du > 0 ? <><MocTon tu={r.issued_at} nho /><div className="muted" style={{ fontSize: 11 }}>{r.so_dong_chua_du} dòng chưa đủ</div></> : <span style={{ color: "var(--ok-ink)", fontSize: 12 }}>✓ về đủ</span>)
        : ["IN_REVIEW", "WAITING_FINAL_APPROVAL"].includes(r.trang_thai) ? <><MocTon tu={r.created_at} nho /><div className="muted" style={{ fontSize: 11 }}>chờ duyệt</div></> : <span className="muted">—</span>,
    },
    { key: "created_by", header: "Người tạo", loc: "chon", nhanChon: (v) => ten(v), maxW: 110, render: (r) => ten(r.created_by) },
    { key: "created_at", header: "Ngày tạo", loc: "ngay", render: (r) => ngay(r.created_at) },
    { key: "so_dong", header: "Dòng · SL", loc: "so", align: "right", render: (r) => <>{soLuong(r.so_dong)}<div className="muted" style={{ fontSize: 11 }}>{soLuong(r.tong_sl)}</div>{r.so_dong_sau_bh > 0 && <div title="Dòng thêm sau khi EO ban hành" style={{ fontSize: 10.5, color: "var(--orange-ink, #C2410C)" }}>+{r.so_dong_sau_bh} sau BH</div>}</> },
    { key: "issued", header: "Ban hành", loc: "ngay", render: (r) => r.issued_at ? ngay(r.issued_at) : <span className="muted">—</span> },
    {
      key: "pct", header: "% về", loc: "so", align: "right", render: (r) => {
        if (r.trang_thai !== "ISSUED" || !r.tong_sl) return <span className="muted">—</span>;
        const p = Math.round((r.sl_ve / r.tong_sl) * 100);
        return <span title={`Về ${soLuong(r.sl_ve)} / đặt ${soLuong(r.tong_sl)}`} style={{ fontWeight: 700, color: p >= 100 ? "var(--ok-ink)" : p >= 70 ? "var(--warn-ink)" : "var(--danger-ink)" }}>{p}%</span>;
      },
    },
    { key: "final", header: "Người duyệt mua", loc: "chon", nhanChon: (v) => ten(v), maxW: 100, render: (r) => ten(r.final_approver_email) },
    {
      key: "act", header: "", align: "center", render: (r) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <button className="btn ghost sm" title="Xem / thao tác EO" onClick={() => qv.openEo(r.id)}><I.eye width={15} height={15} /></button>
          {r.phieu_cho_toi_id && r.phieu_cho_toi_buoc && actionsFor(r.phieu_cho_toi_buoc).map((a) => (
            <button key={a.key} className={`btn sm ${a.cls || ""}`} title={`${r.phieu_cho_toi_buoc === "FINAL" ? "Duyệt mua" : "Thẩm định"} — ${a.label}`}
              onClick={() => setDuyet({ row: { id: r.phieu_cho_toi_id, eo_code: r.eo_code }, action: a.key })}>{a.label}</button>
          ))}
          {r.so_dong_cho_duyet > 0 && <button className="btn sm" title="Dòng thêm sau ban hành chờ duyệt — mở EO để duyệt / từ chối từng dòng" onClick={() => qv.openEo(r.id)}>{r.so_dong_cho_duyet} dòng chờ duyệt</button>}
        </div>
      ),
    },
  ];

  const datChip = (k: string) => { setChip(k); setOffset(0); };
  const reset = () => { setQ(""); setLoc({}); setSap(null); setKho(""); setDoiTac(""); setLyDo(""); setOffset(0); };

  const doExport = async () => {
    setExporting(true);
    try {
      const exportParams = filterParams();
      exportParams.set("limit", "500");
      const all: EoRow[] = [];
      let off = 0;
      while (true) {
        exportParams.set("offset", String(off));
        const page = await api.get<DsEo>("/eo?" + exportParams.toString());
        all.push(...page.rows);
        if (all.length >= page.total || page.rows.length === 0) break;
        off += 500;
      }
      exportRowsToXlsx(all, EXPORT_COLS, "danh-sach-eo.xlsx");
    } finally {
      setExporting(false);
    }
  };

  // v0.063: thanh thao tac gon 1 dong (uu tien man hinh cho du lieu) - nhom nhanh = o chon, bo loc it dung = bang xo xuong
  const chipDang = CHIP.find((c) => c.k === chip);
  const canhBao = CHIP.filter((c) => c.mau && (dem.data?.[c.k] ?? 0) > 0 && c.k !== chip);
  return (
    <div>
      <FilterBar>
        {!compact && (
          <select className="select tb" style={{ width: 230, borderColor: chip !== CHIP_MAC_DINH ? "var(--brand-yellow-btn)" : undefined, color: chipDang?.mau }}
            value={chip} title={chipDang?.title ?? "Nhóm nhanh"} onChange={(e) => datChip(e.target.value)}>
            {CHIP.map((c) => <option key={c.k} value={c.k} title={c.title}>{c.l} ({soLuong(dem.data?.[c.k] ?? 0)})</option>)}
            <option value={TAT_CA}>Tất cả ({soLuong(dem.data?.tat_ca ?? 0)})</option>
          </select>
        )}
        {!compact && canhBao.map((c) => (
          <button key={c.k} className="btn sm ghost" title={c.title} style={{ color: c.mau, fontWeight: 700, padding: "0 8px" }} onClick={() => datChip(c.k)}>{c.l} ({soLuong(dem.data?.[c.k] ?? 0)})</button>
        ))}
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <I.search width={15} height={15} style={{ position: "absolute", left: 11, top: 9, color: "var(--text-faint)" }} />
          <input className="input tb" style={{ paddingLeft: 32 }} placeholder="Tìm mã EO, 3TDO, tiêu đề, mã / tên linh kiện…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        </div>
        {!compact && (
          <Popover width={300} active={soItDung > 0} title="Bộ lọc ít dùng: kho, đối tác, lý do phát sinh của dòng linh kiện"
            label={<><I.filter width={13} height={13} /> Lọc khác{soItDung ? ` (${soItDung})` : ""}</>}>
            <div style={{ display: "grid", gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>EO có dòng linh kiện:</span>
              <GoiYDatalists data={goiY.data} />
              <select className="select" style={{ borderColor: kho ? "var(--brand-yellow-btn)" : undefined }} value={kho} onChange={(e) => { setKho(e.target.value); setOffset(0); }}>
                <option value="">ở kho…</option>{(khos.data ?? []).filter((k: any) => k.active !== 0).map((k) => <option key={k.ten_kho} value={k.ten_kho}>{k.ten_kho}</option>)}</select>
              <input className="input" list={DL.doiTac} style={{ borderColor: doiTac ? "var(--brand-yellow-btn)" : undefined }} placeholder="Đối tác" value={doiTac} onChange={(e) => { setDoiTac(e.target.value); setOffset(0); }} />
              <input className="input" list={DL.lyDo} style={{ borderColor: lyDo ? "var(--brand-yellow-btn)" : undefined }} placeholder="Lý do PS" value={lyDo} onChange={(e) => { setLyDo(e.target.value); setOffset(0); }} />
            </div>
          </Popover>
        )}
        {(q || soItDung > 0 || soCotLoc(loc) > 0 || sap) && <RefreshFiltersBtn onClick={reset} />}
        <div style={{ flex: 1 }} />
        {list.data && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}><b style={{ color: "var(--text)" }}>{soLuong(list.data.total)}</b> EO</span>}
        <button className="btn sm" style={{ padding: "0 9px" }} disabled={exporting} onClick={doExport} title="Xuất Excel các EO đang lọc (Lọc / sắp xếp từng cột: bấm phễu / tiêu đề cột)">
          <I.download width={14} height={14} />{exporting ? " Đang xuất..." : ""}</button>
        {actions}
      </FilterBar>

      <DataTable timKiem={false} cols={cols} rows={rows} keyOf={(r) => r.id} onRowClick={(r) => qv.openEo(r.id)} empty="Chưa có EO nào khớp bộ lọc"
        ngoai loc={loc} onLoc={(l) => { setLoc(l); setOffset(0); }} sap={sap} onSap={(s) => { setSap(s); setOffset(0); }}
        tuyChon={list.data?.tuy_chon} tongGoc={list.data?.tong_truoc_loc} tongSauLoc={list.data?.total} />
      {duyet && <ApprovalActionModal act={duyet} onClose={() => setDuyet(null)} onDone={() => { setDuyet(null); ["eo-list", "eo-dem", "inbox-count", "inbox"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }} />}

      {list.data && (
        <Pagination
          total={list.data.total} limit={limit} offset={offset}
          onPage={compact ? () => nav("/eo") : setOffset}
        />
      )}
    </div>
  );
}
