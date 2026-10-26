import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner } from "../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../components/DataTable";
import { PlanImportModal } from "../components/PlanImportModal";
import { I } from "../lib/icons";
import { soLuong, ngay } from "../lib/format";
import { dailyTemplate, parseDailyFile, type Parsed, type PlanLine } from "../lib/planExcel";

const KY = [
  { v: -1, l: "Tuần trước" },
  { v: 0, l: "Tuần này" },
  { v: 1, l: "Tuần sau" },
  { v: 2, l: "2 tuần tới" },
  { v: 3, l: "3 tuần tới" },
  { v: 4, l: "4 tuần tới" },
];

export default function Plans() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tuan, setTuan] = useState(0);
  const [imp, setImp] = useState<{ name: string; parsed: Parsed } | null>(null);
  const [msg, setMsg] = useState("");
  const [busyTpl, setBusyTpl] = useState(false);
  const [phamVi, setPhamVi] = useState<"chua_kh" | "cho_hang">("chua_kh");
  const fileRef = useRef<HTMLInputElement>(null);
  const q = useQuery({
    queryKey: ["plan-tuan", tuan],
    queryFn: () => api.get<{ tu: string; den: string; rows: any[] }>(`/dashboard/plan-tuan?tuan=${tuan}`),
  });
  const rows = q.data?.rows ?? [];
  const tongDong = rows.reduce((s, r) => s + r.so_dong, 0);
  const tongSL = rows.reduce((s, r) => s + r.tong_sl, 0);
  const kyLabel = KY.find((k) => k.v === tuan)?.l ?? "";

  // file mau: cac dong theo pham vi + DIEN SAN cac dot ke hoach dang co (import thay the khong lam mat dot cu)
  const downloadTemplate = async () => {
    setBusyTpl(true);
    try {
      const r = await api.get<{ lines: PlanLine[]; plans: any[] }>(`/plans/lines?pham_vi=${phamVi}&kem_ke_hoach=1`);
      if (!r.lines.length) { setMsg(phamVi === "chua_kh" ? "Không có linh kiện nào còn thiếu kế hoạch." : "Không có linh kiện nào đang chờ hàng."); return; }
      dailyTemplate(r.lines, r.plans, phamVi === "chua_kh" ? "Ke_hoach_hang_ve_chua_co_KH.xlsx" : "Ke_hoach_hang_ve_dang_cho_hang.xlsx");
      setMsg(`Đã tải file: ${r.lines.length} linh kiện. Điền 4 cột có dấu ✎ rồi tải lên ở bước 3.`);
    } finally { setBusyTpl(false); }
  };
  const onFile = async (f: File) => {
    setMsg("");
    try { setImp({ name: f.name, parsed: await parseDailyFile(f) }); } catch { setMsg("Không đọc được file Excel."); }
  };

  const cols: Col<any>[] = [
    { key: "d", header: "Ngày dự kiến", render: (r) => ngay(r.planned_date) },
    { key: "eo", header: "Mã EO", render: (r) => <span className="cell-link">{r.eo_code}</span> },
    { key: "n", header: "Số dòng", align: "right", render: (r) => soLuong(r.so_dong) },
    { key: "sl", header: "Tổng SL", align: "right", render: (r) => soLuong(r.tong_sl) },
  ];

  return (
    <div>
      <PageHeader title="Kế hoạch hàng về" />
      {msg && <div style={{ background: "#DCFCE7", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{msg}</div>}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Cập nhật kế hoạch hàng về cho nhiều linh kiện bằng Excel</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Chỉ sửa 1–2 dòng? Dùng nút 📅 ở <a href="/theo-doi">Theo dõi linh kiện</a> hoặc trong EO. Đơn kế hoạch tháng (nhà máy báo SL theo tuần) → <a href="/plans/tuan">Kế hoạch tuần</a>.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          <div className="buoc">
            <div className="buoc-so">1</div>
            <b>Tải file Excel</b>
            <div className="muted">File có sẵn các linh kiện và kế hoạch hiện tại của chúng.</div>
            <select className="select" style={{ marginTop: 8 }} value={phamVi} onChange={(e) => setPhamVi(e.target.value as any)}>
              <option value="chua_kh">Linh kiện còn thiếu kế hoạch</option>
              <option value="cho_hang">Tất cả linh kiện đang chờ hàng (để sửa ngày)</option>
            </select>
            <button className="btn primary" style={{ marginTop: 8 }} disabled={busyTpl} onClick={downloadTemplate}><I.download width={14} height={14} /> {busyTpl ? "Đang tạo file..." : "Tải file Excel"}</button>
          </div>
          <div className="buoc">
            <div className="buoc-so">2</div>
            <b>Điền 4 cột có dấu ✎</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              <li><b>Ngày nhà máy cam kết</b> — ngày nhà máy hẹn giao</li>
              <li><b>Ngày dự kiến</b> — để trống = bằng ngày nhà máy</li>
              <li><b>SL dự kiến về</b> — số lượng về đợt đó</li>
              <li>Ghi chú / nguồn (tuỳ chọn)</li>
            </ul>
            <div className="muted" style={{ marginTop: 4 }}>Về nhiều đợt → copy thêm dòng. Không sửa các cột khác.</div>
          </div>
          <div className="buoc">
            <div className="buoc-so">3</div>
            <b>Tải file lên & lưu</b>
            <div className="muted">Hệ thống kiểm tra từng dòng, báo dòng sai trước khi lưu.</div>
            <button className="btn primary" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Chọn file đã điền</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>Lịch hàng về theo tuần</b>
          <select className="select" style={{ width: 160 }} value={tuan} onChange={(e) => setTuan(Number(e.target.value))}>
            {KY.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
          {q.data && <span className="muted" style={{ fontSize: 13 }}>{ngay(q.data.tu)} – {ngay(q.data.den)}</span>}
          <span className="muted" style={{ fontSize: 12.5 }}>— các EO có hàng dự kiến về trong tuần (bấm dòng để mở EO)</span>
        </div>
        {q.isLoading ? <Spinner /> : (
          <DataTable cols={cols} rows={rows} keyOf={(r, i) => `${r.eo_id}-${r.planned_date}-${i}`} pageSize={PAGE_SIZE}
            onRowClick={(r) => nav(`/eo/${r.eo_id}`)}
            totalRow={[<b key="t">Tổng</b>, "", <b key="n">{soLuong(tongDong)}</b>, <b key="s">{soLuong(tongSL)}</b>]}
            empty={`${kyLabel} chưa có kế hoạch hàng về.`} />
        )}
      </Card>
      {imp && (
        <PlanImportModal loai="NGAY" fileName={imp.name} parsed={imp.parsed} onClose={() => setImp(null)}
          onDone={(s) => {
            setImp(null);
            setMsg(`Đã lưu: ${s.so_ghi} đợt hàng về cho ${s.so_dong_lk} linh kiện.`);
            qc.invalidateQueries({ queryKey: ["plan-tuan"] });
          }} />
      )}
    </div>
  );
}
