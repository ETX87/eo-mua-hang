import { useSearchParams } from "react-router-dom";
import ReportAmisKhongEo from "../reports/ReportAmisKhongEo";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { docSheetAmis } from "../../lib/amisSheet";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, StatTile, Modal } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { writeBook } from "../../lib/excel";

const COLS = ["Mã kho", "Tên kho", "Mã hàng", "Tên hàng", "Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "ĐVT", "Diễn giải", "Số lượng Nhập", "Số lượng Xuất", "Số lượng Tồn", "TK Kho", "TK đối ứng", "Mã phê duyệt"];

// File mau: sheet dau = dong tieu de dung 15 cot COLS (backend routes/amis.ts doc theo ten cot), khong co dong du lieu
// de tai nham file mau len khong nhap rac; vi du + giai thich o sheet "Huong dan".
const COT_MO_TA: [string, string, string, string][] = [
  ["Mã kho", "", "Mã kho trên MISA", "KHN01"],
  ["Tên kho", "Bắt buộc", "Đúng tên kho trong danh mục (sheet \"Danh sach kho\") — phải trùng kho cần đặt trên EO", "Kho Hà Nội"],
  ["Mã hàng", "Bắt buộc", "Mã hàng MISA — phải trùng mã linh kiện trên EO", "LCD-A52-ORG"],
  ["Tên hàng", "", "Tên hàng", "Màn hình Samsung A52 zin"],
  ["Ngày hạch toán", "", "dd/mm/yyyy hoặc ô ngày Excel", "15/10/2026"],
  ["Ngày chứng từ", "Bắt buộc", "dd/mm/yyyy hoặc ô ngày Excel — chính là NGÀY HÀNG VỀ của dòng EO", "15/10/2026"],
  ["Số chứng từ", "Bắt buộc", "Số phiếu nhập kho", "NK01234"],
  ["ĐVT", "", "Đơn vị tính", "Cái"],
  ["Diễn giải", "", "Diễn giải phiếu", "Nhập hàng NCC Minh Phát"],
  ["Số lượng Nhập", "Bắt buộc", "Số lượng nhập > 0 (dòng xuất / SL nhập trống bị bỏ qua)", "20"],
  ["Số lượng Xuất", "", "Không dùng — để trống", ""],
  ["Số lượng Tồn", "", "Không dùng — để trống", ""],
  ["TK Kho", "", "Tài khoản kho", "1561"],
  ["TK đối ứng", "", "Tài khoản đối ứng", "331"],
  ["Mã phê duyệt", "Bắt buộc", "Mã phê duyệt của EO (3TDO-xxxxxx) — dòng không có mã bị bỏ qua", "3TDO-000123"],
];

/**
 * Man "Nhap AMIS": tab Nhap & doi chieu (ke toan) + tab "Chung tu chua khop" (truoc la bao cao AMIS khong EO,
 * gop v0.051 - ../UI_GOP_2_MAN_HINH.md). /reports/amis-khong-eo chuyen huong ?tab=chua-khop.
 */
export default function AmisImport() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "chua-khop" ? "chua-khop" : "nhap";
  const dem = useQuery({ queryKey: ["rep-amis-ko-eo"], queryFn: () => api.get<any>("/reports/amis-khong-eo") });
  return (
    <div>
      <PageHeader title="Nhập AMIS" actions={
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn sm ${tab === "nhap" ? "primary" : ""}`} onClick={() => setSp({})}><I.upload width={14} height={14} /> Nhập & đối chiếu</button>
          <button className={`btn sm ${tab === "chua-khop" ? "primary" : ""}`} title="Chứng từ AMIS có mã phê duyệt nhưng không khớp dòng EO nào" onClick={() => setSp({ tab: "chua-khop" })}>
            <I.clock width={14} height={14} /> Chứng từ chưa khớp ({soLuong(dem.data?.rows?.length ?? 0)})</button>
        </div>
      } />
      {tab === "nhap" ? <NhapAmis /> : <ReportAmisKhongEo nhung />}
    </div>
  );
}

function NhapAmis() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [docInfo, setDocInfo] = useState<{ dongTieuDe: number; nhanDang: "mau" | "so_chi_tiet"; thieuCot: string[] } | null>(null);
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"APPEND" | "SYNC">("APPEND");
  const [kyTu, setKyTu] = useState("");
  const [kyDen, setKyDen] = useState("");
  const [khoAll, setKhoAll] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const [check, setCheck] = useState<any>(null);
  const [err, setErr] = useState("");
  const [voidBatch, setVoidBatch] = useState<any>(null);
  const [q, setQ] = useState("");
  const [showVoided, setShowVoided] = useState<"" | "1" | "only">("");

  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  const canEdit = me.data?.vai_tro === "Admin" || me.data?.vai_tro === "Ke toan" || me.data?.la_ke_toan === 1;
  const batches = useQuery({ queryKey: ["amis-batches"], queryFn: () => api.get<any[]>("/amis/batches") });
  const unmatched = useQuery({ queryKey: ["amis-unmatched"], queryFn: () => api.get<{ rows: any[]; total: any }>("/amis/unmatched") });
  const tomtat = useQuery({ queryKey: ["amis-tomtat"], queryFn: () => api.get<any>("/dashboard/amis-tomtat") });
  const kho = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const receipts = useQuery({
    queryKey: ["amis-receipts", q, showVoided],
    queryFn: () => api.get<any[]>(`/amis/receipts?q=${encodeURIComponent(q.trim())}${showVoided ? `&include_voided=${showVoided}` : ""}`),
  });
  const validKho = new Set((kho.data ?? []).filter((k) => k.active).map((k) => k.ten_kho));
  const taiFileMau = () => writeBook("Mau_import_AMIS_MISA.xlsx", [
    { name: "Nhap kho MISA", rows: [COLS], widths: [10, 26, 18, 30, 14, 14, 13, 7, 30, 13, 13, 12, 8, 10, 15] },
    {
      name: "Huong dan",
      rows: [
        ["Cách dùng file mẫu nhập AMIS"],
        ["- Dán dữ liệu phiếu nhập kho xuất từ MISA vào sheet ĐẦU TIÊN \"Nhap kho MISA\", từ dòng 2. Giữ nguyên dòng tiêu đề (tên 15 cột phải đúng như mẫu)."],
        ["- Chỉ nhập các dòng có Mã phê duyệt, Số lượng Nhập > 0 và Tên kho đúng danh mục; dòng khác tự bỏ qua (xem ở bước Xem trước)."],
        ["- Dòng được tính vào EO khi khớp đủ 3 thông tin: Mã phê duyệt + Mã hàng + Tên kho. Ngày chứng từ = ngày hàng về của dòng EO."],
        ["- Tải lại file chồng kỳ cũ không bị nhân đôi: hệ thống tự nhận diện dòng đã nhập (Số CT + Kho + Mã hàng + SL + Ngày CT + Mã phê duyệt)."],
        [],
        ["Cột", "Bắt buộc", "Ý nghĩa", "Ví dụ"],
        ...COT_MO_TA,
        [],
        ["Dòng ví dụ (KHÔNG dán vào sheet Nhap kho MISA)"],
        COLS,
        COT_MO_TA.map((c) => c[3]),
      ],
      widths: [16, 10, 70, 26, 14, 14, 13, 7, 30, 13, 13, 12, 8, 10, 15],
    },
    { name: "Danh sach kho", rows: [["Tên kho (ghi đúng vào cột Tên kho)"], ...(kho.data ?? []).filter((k) => k.active).map((k) => [k.ten_kho])], widths: [50] },
  ]);
  const refreshAll = () => { batches.refetch(); unmatched.refetch(); receipts.refetch(); tomtat.refetch(); };

  const onFile = (f: File) => {
    setFilename(f.name); setResult(null); setCheck(null); setErr(""); setKyTu(""); setKyDen("");
    const reader = new FileReader();
    reader.onload = (e) => {
      // dateNF: o ngay Excel -> 'YYYY-MM-DD' (mac dinh SheetJS ra 'm/d/yy' -> lech khoa chong trung / ky)
      const wb = XLSX.read(e.target!.result, { type: "binary", cellDates: true, dateNF: "yyyy-mm-dd" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // nhan ca file mau lan bao cao goc MISA "So chi tiet vat tu hang hoa" (tieu de bao cao, tieu de 2 tang, cot "Ma PD EO")
      const kq = docSheetAmis(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false, dateNF: "yyyy-mm-dd" }) as unknown[][]);
      setDocInfo({ dongTieuDe: kq.dongTieuDe, nhanDang: kq.nhanDang, thieuCot: kq.thieuCot });
      setRows(kq.rows);
    };
    reader.readAsBinaryString(f);
  };

  // kiem tra truoc voi he thong ngay khi chon file: dong nao Moi / Da co (trung lan import truoc) / Khoi phuc / Bo qua
  const [pre, setPre] = useState<any>(null);
  useEffect(() => {
    setPre(null);
    if (!rows?.length || !canEdit) return;
    api.post<any>("/amis/import", { filename, rows, mode: "APPEND", dry_run: true }).then(setPre).catch(() => setPre(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, canEdit]);
  const DONG: Record<string, { l: string; c: string }> = {
    moi: { l: "Mới", c: "issued" }, da_co: { l: "Đã có — bỏ qua", c: "nhap" }, khoi_phuc: { l: "Khôi phục", c: "final" },
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

  const payload = (dry: boolean) => ({
    filename, rows, mode, dry_run: dry,
    ky_tu: kyTu || undefined, ky_den: kyDen || undefined, kho: khoAll ? null : undefined, ly_do: lyDo.trim() || undefined,
  });
  // Dong bo lai ky: kiem tra truoc (them moi / khoi phuc / se huy) roi moi cho xac nhan
  const doCheck = async () => {
    if (!rows) return;
    setBusy(true); setErr("");
    try {
      const res = await api.post<any>("/amis/import", payload(true));
      setCheck(res);
      if (!kyTu) setKyTu(res.summary.ky_tu ?? "");
      if (!kyDen) setKyDen(res.summary.ky_den ?? "");
    } catch (e: any) {
      setErr(e?.body?.error === "BAD_PERIOD" ? "Kỳ không hợp lệ (từ ngày phải ≤ đến ngày)." : "Lỗi kiểm tra file.");
    } finally { setBusy(false); }
  };
  const doImport = async () => {
    if (!rows) return;
    if (mode === "SYNC" && !lyDo.trim()) return setErr("Nhập lý do đồng bộ lại (vd: kế toán sửa chứng từ NK0123 trên MISA).");
    setBusy(true); setErr("");
    try {
      const res = await api.post("/amis/import", payload(false));
      setResult(res); setCheck(null); setPre(null);
      refreshAll();
    } catch (e: any) {
      setErr(e?.body?.error === "REASON_REQUIRED" ? "Nhập lý do." : "Lỗi nhập dữ liệu.");
    } finally { setBusy(false); }
  };

  const actReceipt = async (r: any, act: "void" | "restore") => {
    const lyDoX = prompt(act === "void"
      ? `Hủy chứng từ ${r.doc_no} · ${r.part_code} · SL ${r.qty_in}?\nNhập lý do (bắt buộc):`
      : `Khôi phục chứng từ ${r.doc_no} · ${r.part_code}?\nNhập lý do (bắt buộc):`);
    if (!lyDoX?.trim()) return;
    try {
      await api.post(`/amis/receipts/${r.id}/${act}`, { ly_do: lyDoX.trim() });
      refreshAll();
    } catch { alert("Lỗi cập nhật chứng từ."); }
  };

  const previewCols: Col<any>[] = [
    { key: "st", header: "Trạng thái", render: (r) => {
      const d: string | undefined = pre?.dong?.[r.__i];
      if (d) {
        if (d.startsWith("bo:")) return <span className="badge nhap" title={d.slice(3)}>Bỏ qua: {d.slice(3)}</span>;
        return <span className={`badge ${DONG[d]?.c ?? "nhap"}`}>{DONG[d]?.l ?? d}</span>;
      }
      const c = classify(r);
      return <span className={`badge ${c === "nhap" ? "issued" : "nhap"}`}>{c === "nhap" ? "Sẽ nhập" : "Bỏ qua"}</span>;
    } },
    ...COLS.map((c) => ({ key: c, header: c, align: /Số lượng/.test(c) ? "right" as const : undefined, render: (r: any) => /Ngày/.test(c) ? ngay(r[c]) : String(r[c] ?? "") })),
  ];
  const receiptCols: Col<any>[] = [
    { key: "d", header: "Số CT", render: (r) => r.doc_no },
    { key: "n", header: "Ngày CT", render: (r) => ngay(r.doc_date) },
    { key: "k", header: "Kho", render: (r) => r.warehouse_name },
    { key: "m", header: "Mã hàng", render: (r) => r.part_code },
    { key: "sl", header: "SL nhập", align: "right", render: (r) => soLuong(r.qty_in) },
    { key: "a", header: "Mã phê duyệt", render: (r) => r.approval_code_raw },
  ];

  const scrollUpload = () => document.getElementById("amis-upload")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div>

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 14 }}>1. Tải file</strong>
          <button className="btn sm" onClick={taiFileMau}><I.download width={14} height={14} /> Tải file mẫu</button>
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
          style={{ marginTop: 10, border: "2px dashed var(--border-strong)", borderRadius: 12, padding: 30, textAlign: "center", cursor: "pointer", background: "var(--panel-2)" }}
        >
          <I.upload width={26} height={26} style={{ color: "var(--text-muted)" }} />
          <div style={{ marginTop: 8, fontWeight: 600 }}>Kéo file Excel MISA vào đây (.xlsx)</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Nhận file mẫu hoặc xuất thẳng báo cáo MISA "Sổ chi tiết vật tư hàng hóa". Chỉ nhập dòng có Mã phê duyệt (cột "Mã PD EO"), SL Nhập &gt; 0, kho hợp lệ.</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Sheet đầu tiên: <b>file mẫu</b> (dòng 1 là tiêu đề) hoặc báo cáo MISA <b>Sổ chi tiết vật tư hàng hóa</b> xuất thẳng — hệ thống tự tìm dòng tiêu đề, bỏ dòng "Tổng cộng".
            Bắt buộc: Tên kho · Mã hàng · Ngày chứng từ · Số chứng từ · Số lượng Nhập · Mã phê duyệt.
          </div>
          {filename && <div style={{ marginTop: 8, fontSize: 12.5 }}>Đã chọn: <b>{filename}</b>
            {docInfo && <span className="muted"> · {docInfo.nhanDang === "so_chi_tiet" ? `nhận dạng: báo cáo MISA "Sổ chi tiết" (tiêu đề cột ở dòng ${docInfo.dongTieuDe})` : "nhận dạng: file mẫu"} · {soLuong(rows?.length ?? 0)} dòng dữ liệu</span>}</div>}
          {docInfo && docInfo.thieuCot.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--danger-ink)", background: "#FEF2F2", borderRadius: 8, padding: "6px 10px" }}>
              Không tìm thấy cột: <b>{docInfo.thieuCot.join(", ")}</b> — kiểm tra tên cột trong file (mã phê duyệt có thể đặt tên "Mã phê duyệt" hoặc "Mã PD EO").
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      </Card>

      {/* B2 preview */}
      {rows && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>2. Xem trước &amp; kiểm tra</strong>
            {canEdit && (mode === "APPEND"
              ? <button className="btn primary" disabled={busy || seNhap === 0} onClick={doImport}>{busy ? "Đang nhập…" : "Nhập dữ liệu"}</button>
              : <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" disabled={busy || seNhap === 0} onClick={doCheck}>{busy ? "Đang kiểm tra…" : "Kiểm tra thay đổi"}</button>
                  <button className="btn primary" disabled={busy || !check} onClick={doImport}>Xác nhận đồng bộ</button>
                </div>)}
          </div>
          {canEdit && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" checked={mode === "APPEND"} onChange={() => { setMode("APPEND"); setCheck(null); }} />
                  <b>Thêm mới</b> <span className="muted">— chỉ thêm chứng từ chưa có (dùng hằng ngày)</span>
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" checked={mode === "SYNC"} onChange={() => { setMode("SYNC"); setCheck(null); }} />
                  <b>Đồng bộ lại kỳ</b> <span className="muted">— chứng từ MISA đã sửa / xóa: thay dữ liệu của kỳ bằng file này</span>
                </label>
              </div>
              {mode === "SYNC" && (
                <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div><label className="field-label">Kỳ từ ngày CT</label><input className="input" type="date" value={kyTu} onChange={(e) => { setKyTu(e.target.value); setCheck(null); }} /></div>
                  <div><label className="field-label">đến ngày CT</label><input className="input" type="date" value={kyDen} onChange={(e) => { setKyDen(e.target.value); setCheck(null); }} /></div>
                  <div><label className="field-label">Phạm vi kho</label>
                    <select className="select" value={khoAll ? "all" : "file"} onChange={(e) => { setKhoAll(e.target.value === "all"); setCheck(null); }}>
                      <option value="file">Chỉ các kho có trong file</option><option value="all">Tất cả kho</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 260 }}><label className="field-label">Lý do <span className="req">*</span></label>
                    <input className="input" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="vd: Kế toán sửa SL chứng từ NK0123 trên MISA" />
                  </div>
                  <div className="muted" style={{ fontSize: 12, width: "100%" }}>
                    Để trống kỳ = tự lấy ngày chứng từ nhỏ nhất – lớn nhất trong file. Xuất MISA đủ cả kỳ (không lọc bớt),
                    vì chứng từ trong kỳ + phạm vi kho mà không có trong file sẽ bị đánh dấu hủy.
                  </div>
                </div>
              )}
              {err && <div style={{ color: "var(--danger)", marginTop: 8 }}>{err}</div>}
              {check && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span className="badge nhap">Kỳ {ngay(check.summary.ky_tu)} – {ngay(check.summary.ky_den)} · {check.summary.kho ? `${check.summary.kho.length} kho` : "tất cả kho"}</span>
                    <span className="badge issued">Thêm mới {soLuong(check.summary.them_moi)}</span>
                    <span className="badge nhap">Giữ nguyên {soLuong(check.summary.giu_nguyen)}</span>
                    {check.summary.khoi_phuc > 0 && <span className="badge final">Khôi phục {soLuong(check.summary.khoi_phuc)}</span>}
                    <span className={`badge ${check.summary.se_huy ? "reject" : "nhap"}`}>Sẽ hủy {soLuong(check.summary.se_huy)}</span>
                  </div>
                  {check.huy.length > 0 && <DataTable cols={receiptCols} rows={check.huy} keyOf={(r) => r.id} pageSize={PAGE_SIZE} />}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <StatTile label="Tổng dòng" value={soLuong(rows.length)} />
            {pre ? <>
              <StatTile label="Mới — sẽ nhập" value={soLuong(pre.summary.them_moi)} tint="#F0FDF4" />
              <StatTile label="Đã có (trùng lần trước)" value={soLuong(pre.summary.giu_nguyen)} tint="#F9FAFB" />
              {pre.summary.khoi_phuc > 0 && <StatTile label="Khôi phục (đã hủy trước đó)" value={soLuong(pre.summary.khoi_phuc)} tint="#EFF6FF" />}
              <StatTile label="Bỏ qua" value={soLuong(pre.summary.skipped)} tint="#F9FAFB" />
            </> : <>
              <StatTile label="Sẽ nhập" value={soLuong(seNhap)} tint="#F0FDF4" />
              <StatTile label="Bỏ qua" value={soLuong(boQua)} tint="#F9FAFB" />
            </>}
          </div>
          {pre && Object.keys(pre.summary.ly_do_bo ?? {}).length > 0 && (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              Bỏ qua: {Object.entries(pre.summary.ly_do_bo).map(([k, v]) => `${k} (${soLuong(v as number)})`).join(" · ")}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            File tải lại chồng lấn kỳ cũ không sao: mỗi dòng có ID tự sinh từ Số CT + Kho + Mã hàng + SL nhập + Ngày CT + Mã phê duyệt,
            dòng đã nhập trước đó tự bỏ qua. Chứng từ đã <b>sửa</b> trên MISA (đổi SL / ngày / mã…) là ID mới — dùng "Đồng bộ lại kỳ" để hủy dòng cũ.
          </div>
          <DataTable cols={previewCols} rows={rows.map((r, i) => ({ ...r, __i: i }))} keyOf={(_r, i) => i} pageSize={PAGE_SIZE} />
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
            {result.restored > 0 && <StatTile label="Khôi phục" value={soLuong(result.restored)} tint="#EFF6FF" />}
            {result.voided > 0 && <StatTile label="Đã hủy (đồng bộ)" value={soLuong(result.voided)} tint="#FEF2F2" />}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <strong style={{ fontSize: 14 }}>Lịch sử import</strong>
          <DataTable
            cols={[
              { key: "f", header: "File", render: (r) => r.source_filename || "—" },
              { key: "u", header: "Người nhập", render: (r) => ten(r.imported_by) },
              { key: "t", header: "Thời gian", render: (r) => ngay(r.imported_at) },
              { key: "i", header: "Đã nhập", align: "right", render: (r) => soLuong(r.inserted_count) },
              { key: "d", header: "Trùng", align: "right", render: (r) => soLuong(r.duplicate_count) },
              { key: "m", header: "Chế độ", render: (r) => r.cancelled_at
                ? <span className="badge reject" title={`${ten(r.cancelled_by)} · ${ngayGio(r.cancelled_at)} · ${r.cancel_reason ?? ""}`}>Đã hủy lô</span>
                : r.mode === "SYNC" ? <span className="badge final" title={r.ghi_chu ?? ""}>Đồng bộ {ngay(r.ky_tu)}–{ngay(r.ky_den)} · hủy {r.voided_count}</span>
                : "Thêm mới" },
              { key: "x", header: "", render: (r) => canEdit && !r.cancelled_at && r.inserted_count > 0
                ? <button className="btn ghost sm danger" title="Hủy các dòng do lô này thêm vào" onClick={() => setVoidBatch(r)}>Hủy lô</button> : null },
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

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>Tra cứu &amp; hủy chứng từ AMIS</strong>
          <input className="input" style={{ width: 300 }} placeholder="Số CT / mã hàng / mã 3TDO / tên hàng..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ width: 200 }} value={showVoided} onChange={(e) => setShowVoided(e.target.value as any)}>
            <option value="">Chứng từ đang tính</option><option value="1">Tất cả (cả đã hủy)</option><option value="only">Chỉ chứng từ đã hủy</option>
          </select>
          <span className="muted" style={{ fontSize: 12 }}>300 dòng mới nhất khớp tìm kiếm. Chứng từ đã hủy không tính vào EO / báo cáo; import lại đúng chứng từ sẽ tự khôi phục.</span>
        </div>
        <DataTable
          cols={[
            ...receiptCols.slice(0, 4),
            { key: "t", header: "Tên hàng", render: (r) => r.part_name || "" },
            ...receiptCols.slice(4),
            { key: "e", header: "Khớp EO", render: (r) => r.voided_at
              ? <span className="badge reject" title={`${ten(r.voided_by)} · ${ngayGio(r.voided_at)}`}>Đã hủy: {r.void_reason}</span>
              : r.eo_code ? <a className="cell-link" href={`/eo/${r.eo_id}`}>{r.eo_code}</a>
              : r.match_status === "CODE_ONLY_NO_LINE" ? <span className="badge final">Có mã, không có dòng</span> : <span className="muted">Không khớp</span> },
            { key: "x", header: "", render: (r) => !canEdit ? null : r.voided_at
              ? <button className="btn ghost sm" onClick={() => actReceipt(r, "restore")}>Khôi phục</button>
              : <button className="btn ghost sm danger" onClick={() => actReceipt(r, "void")}>Hủy</button> },
          ]}
          rows={receipts.data ?? []} keyOf={(r) => r.id} pageSize={PAGE_SIZE} empty="Không có chứng từ khớp."
        />
      </Card>

      {voidBatch && <VoidBatchModal batch={voidBatch} onClose={() => setVoidBatch(null)} onDone={() => { setVoidBatch(null); refreshAll(); }} />}
    </div>
  );
}

function VoidBatchModal({ batch, onClose, onDone }: { batch: any; onClose: () => void; onDone: () => void }) {
  const [lyDo, setLyDo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!lyDo.trim()) return setErr("Nhập lý do.");
    setBusy(true); setErr("");
    try { await api.post(`/amis/batches/${batch.id}/void`, { ly_do: lyDo.trim() }); onDone(); }
    catch (e: any) { setErr(e?.body?.error === "ALREADY_CANCELLED" ? "Lô này đã hủy." : "Lỗi hủy lô."); setBusy(false); }
  };
  return (
    <Modal title={`Hủy lô import #${batch.id}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn danger" disabled={busy} onClick={run}>Hủy {soLuong(batch.inserted_count)} dòng</button></>}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        File <b>{batch.source_filename || "—"}</b> · {ten(batch.imported_by)} · {ngayGio(batch.imported_at)}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        Các dòng do lần import này thêm vào sẽ được đánh dấu hủy (không xóa) và không còn tính vào EO / báo cáo.
        Dòng trùng với lần import trước không bị ảnh hưởng. Sau đó import lại file đúng — chứng từ trùng khớp sẽ tự khôi phục.
      </div>
      <label className="field-label">Lý do <span className="req">*</span></label>
      <input className="input" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="vd: chọn nhầm file kỳ tháng 8" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}
