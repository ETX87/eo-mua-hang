import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, StatTile, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, ngay } from "../../lib/format";

const COLS = ["Mã kho", "Tên kho", "Mã hàng", "Tên hàng", "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "ĐVT", "Diễn giải", "Số lượng Nhập", "Số lượng Xuất", "Số lượng Tồn", "TK Kho", "TK đối ứng", "Mã phê duyệt"];

export default function AmisImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const batches = useQuery({ queryKey: ["amis-batches"], queryFn: () => api.get<any[]>("/amis/batches") });
  const unmatched = useQuery({ queryKey: ["amis-unmatched"], queryFn: () => api.get<{ rows: any[]; total: any }>("/amis/unmatched") });
  const tomtat = useQuery({ queryKey: ["amis-tomtat"], queryFn: () => api.get<any>("/dashboard/amis-tomtat") });
  const kho = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const validKho = new Set((kho.data ?? []).filter((k) => k.active).map((k) => k.ten_kho));

  const onFile = (f: File) => {
    setFilename(f.name); setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target!.result, { type: "binary", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      setRows(XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }));
    };
    reader.readAsBinaryString(f);
  };

  const classify = (r: any): "nhap" | "bo" => {
    // dong bo voi dieu kien loc that o backend (routes/amis.ts)
    const str = (k: string) => String(r[k] ?? "").trim();
    const ok = str("Mã phê duyệt") && Number(str("Số lượng Nhập").replace(/,/g, "")) > 0 && validKho.has(str("Tên kho"))
      && str("Mã hàng") && str("Số chứng từ") && str("Ngày chứng từ");
    return ok ? "nhap" : "bo";
  };
  const seNhap = rows?.filter((r) => classify(r) === "nhap").length ?? 0;
  const boQua = (rows?.length ?? 0) - seNhap;

  const doImport = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await api.post("/amis/import", { filename, rows });
      setResult(res);
      batches.refetch(); unmatched.refetch();
    } finally { setBusy(false); }
  };

  const previewCols: Col<any>[] = [
    { key: "st", header: "Trạng thái", render: (r) => {
      const c = classify(r);
      return <span className={`badge ${c === "nhap" ? "issued" : "nhap"}`}>{c === "nhap" ? "Sẽ nhập" : "Bỏ qua"}</span>;
    } },
    ...COLS.map((c) => ({ key: c, header: c, align: /Số lượng/.test(c) ? "right" as const : undefined, render: (r: any) => /Ngày/.test(c) ? ngay(r[c]) : String(r[c] ?? "") })),
  ];

  const scrollUpload = () => document.getElementById("amis-upload")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div>
      <PageHeader title="Nhập AMIS" />

      {/* Tong quan doi chieu */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <StatTile label="Tổng cần nhập" value={soLuong(tomtat.data?.tong)} tint="var(--brand-yellow-soft)" />
          <StatTile label="Đã nhập" value={<span style={{ color: "var(--ok)" }}>{soLuong(tomtat.data?.da_nhap)}</span>} />
          <StatTile label="Chưa nhập" value={<span style={{ color: "var(--danger)" }}>{soLuong(tomtat.data?.chua_nhap)}</span>} />
        </div>
        <strong style={{ fontSize: 13.5 }}>Danh sách chờ nhập</strong>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
          {(tomtat.data?.danh_sach_cho ?? []).length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: "8px 0" }}>Tất cả dòng đã đối chiếu AMIS.</div>}
          {(tomtat.data?.danh_sach_cho ?? []).map((r: any) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="cell-link" style={{ minWidth: 110 }}>{r.eo_code}</span>
              <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>{soLuong(r.so_dong_thieu)} dòng</span>
              <span className="muted" style={{ fontSize: 12.5 }}>{ngay(r.issued_at)}</span>
              <button className="btn primary sm" onClick={scrollUpload}>Nhập</button>
            </div>
          ))}
        </div>
      </Card>

      {/* B1 upload */}
      <Card style={{ marginBottom: 16 }} >
        <div id="amis-upload" />
        <strong style={{ fontSize: 14 }}>1. Tải file</strong>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
          style={{ marginTop: 10, border: "2px dashed var(--border-strong)", borderRadius: 12, padding: 30, textAlign: "center", cursor: "pointer", background: "var(--panel-2)" }}
        >
          <I.upload width={26} height={26} style={{ color: "var(--text-muted)" }} />
          <div style={{ marginTop: 8, fontWeight: 600 }}>Kéo file Excel MISA vào đây (.xlsx)</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chỉ nhận dòng có "Mã phê duyệt", "SL Nhập" &gt; 0, kho hợp lệ.</div>
          {filename && <div style={{ marginTop: 8, fontSize: 12.5 }}>Đã chọn: <b>{filename}</b></div>}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </Card>

      {/* B2 preview */}
      {rows && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>2. Xem trước &amp; kiểm tra</strong>
            <button className="btn primary" disabled={busy || seNhap === 0} onClick={doImport}>{busy ? "Đang nhập…" : "Nhập dữ liệu"}</button>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <StatTile label="Tổng dòng" value={soLuong(rows.length)} />
            <StatTile label="Sẽ nhập" value={soLuong(seNhap)} tint="#F0FDF4" />
            <StatTile label="Bỏ qua" value={soLuong(boQua)} tint="#F9FAFB" />
          </div>
          <DataTable cols={previewCols} rows={rows} keyOf={(_r, i) => i} pageSize={PAGE_SIZE} />
        </Card>
      )}

      {/* B3 result */}
      {result && (
        <Card style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 14 }}>3. Kết quả import</strong>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <StatTile label="Đã nhập" value={soLuong(result.inserted)} tint="#F0FDF4" />
            <StatTile label="Trùng" value={soLuong(result.duplicate)} tint="#FFFBEB" />
            <StatTile label="Bỏ qua" value={soLuong(result.skipped)} tint="#F9FAFB" />
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <strong style={{ fontSize: 14 }}>Lịch sử import</strong>
          <DataTable
            cols={[
              { key: "f", header: "File", render: (r) => r.source_filename || "—" },
              { key: "u", header: "Người nhập", render: (r) => r.imported_by },
              { key: "t", header: "Thời gian", render: (r) => ngay(r.imported_at) },
              { key: "r", header: "Dòng", align: "right", render: (r) => soLuong(r.row_count) },
              { key: "i", header: "Đã nhập", align: "right", render: (r) => soLuong(r.inserted_count) },
              { key: "d", header: "Trùng", align: "right", render: (r) => soLuong(r.duplicate_count) },
            ]}
            rows={batches.data ?? []} keyOf={(r) => r.id} pageSize={PAGE_SIZE} empty="Chưa có lần import nào."
          />
        </Card>
        <Card>
          <strong style={{ fontSize: 14 }}>AMIS chưa ghép được EO</strong>
          <div className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>
            Tổng SL {soLuong(unmatched.data?.total?.so_luong_nhap)} · {soLuong(unmatched.data?.total?.so_dong)} dòng
          </div>
          <DataTable
            cols={[
              { key: "d", header: "Số chứng từ", render: (r) => r.doc_no },
              { key: "k", header: "Kho", render: (r) => r.warehouse_name },
              { key: "m", header: "Mã hàng", render: (r) => r.part_code },
              { key: "sl", header: "SL nhập", align: "right", render: (r) => soLuong(r.qty_in) },
              { key: "nc", header: "Ngày chứng từ", render: (r) => ngay(r.doc_date) },
              { key: "mp", header: "Mã phê duyệt", render: (r) => r.approval_code_raw },
            ]}
            rows={unmatched.data?.rows ?? []} keyOf={(_r, i) => i} pageSize={PAGE_SIZE} empty="Không có dòng AMIS lệch EO."
          />
        </Card>
      </div>
    </div>
  );
}
