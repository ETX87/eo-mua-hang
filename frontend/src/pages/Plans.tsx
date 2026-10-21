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
  const fileRef = useRef<HTMLInputElement>(null);
  const q = useQuery({
    queryKey: ["plan-tuan", tuan],
    queryFn: () => api.get<{ tu: string; den: string; rows: any[] }>(`/dashboard/plan-tuan?tuan=${tuan}`),
  });
  const rows = q.data?.rows ?? [];
  const tongDong = rows.reduce((s, r) => s + r.so_dong, 0);
  const tongSL = rows.reduce((s, r) => s + r.tong_sl, 0);
  const kyLabel = KY.find((k) => k.v === tuan)?.l ?? "";

  // file mau dien san moi dong EO da ban hanh con thieu ke hoach
  const downloadTemplate = async () => {
    setBusyTpl(true);
    try {
      const r = await api.get<{ lines: PlanLine[] }>("/plans/lines?con_lai=1");
      dailyTemplate(r.lines, "Ke_hoach_hang_ve_cac_dong_con_thieu.xlsx");
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
      <Card>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select className="select" style={{ width: 160 }} value={tuan} onChange={(e) => setTuan(Number(e.target.value))}>
            {KY.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
          {q.data && <span className="muted" style={{ fontSize: 13 }}>{ngay(q.data.tu)} – {ngay(q.data.den)}</span>}
          <div style={{ flex: 1 }} />

        <button className="btn sm primary" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Import Excel</button>
        <button className="btn sm" disabled={busyTpl} onClick={downloadTemplate}><I.download width={14} height={14} /> {busyTpl ? "Đang tạo..." : "Tải mẫu (dòng còn thiếu KH)"}</button>
        <button className="btn sm ghost" onClick={() => nav("/plans/tuan")}><I.calendar width={14} height={14} /> Kế hoạch tuần (KRF)</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
        </div>
        {q.isLoading ? <Spinner /> : (
          <DataTable cols={cols} rows={rows} keyOf={(r, i) => `${r.eo_id}-${r.planned_date}-${i}`} pageSize={PAGE_SIZE}
            onRowClick={(r) => nav(`/eo/${r.eo_id}`)}
            totalRow={[<b key="t">Tổng</b>, "", <b key="n">{soLuong(tongDong)}</b>, <b key="s">{soLuong(tongSL)}</b>]}
            empty={`${kyLabel} chưa có kế hoạch hàng về.`} />
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Cập nhật nhiều EO 1 lần: tải mẫu → điền Ngày nhà máy cam kết / Ngày dự kiến + SL (1 linh kiện về nhiều đợt thì thêm dòng) → Import Excel.
          Theo từng EO: Chi tiết EO › tab "Kế hoạch hàng về" › "Cập nhật hàng loạt". Kế hoạch tuần tính vào ngày Thứ Bảy của tuần.
        </div>
      </Card>
      {imp && (
        <PlanImportModal loai="NGAY" fileName={imp.name} parsed={imp.parsed} onClose={() => setImp(null)}
          onDone={(s) => {
            setImp(null);
            setMsg(`Import xong: ${s.so_ghi} mốc kế hoạch cho ${s.so_dong_lk} linh kiện${s.so_ke_hoach_cu_thay ? `, thay ${s.so_ke_hoach_cu_thay} mốc cũ` : ""}.`);
            qc.invalidateQueries({ queryKey: ["plan-tuan"] });
          }} />
      )}
    </div>
  );
}
