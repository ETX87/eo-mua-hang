import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal } from "../../components/ui";
import { PlanImportModal } from "../../components/PlanImportModal";
import { I } from "../../lib/icons";
import { dailyTemplate, parseDailyFile, type Parsed, type PlanLine } from "../../lib/planExcel";

/**
 * Cap nhat ke hoach hang ve (loai NGAY) cho nhieu dong bang Excel: tai file (dien san dot hien co) -> dien -> nhap.
 * Truoc o man "Ke hoach hang ve" (/plans), nay mo tu Quan ly don hang. Ghi qua POST /plans/bulk (PlanImportModal).
 */
export function KeHoachExcelModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [imp, setImp] = useState<{ name: string; parsed: Parsed } | null>(null);
  const [msg, setMsg] = useState("");
  const [busyTpl, setBusyTpl] = useState(false);
  const [phamVi, setPhamVi] = useState<"chua_kh" | "cho_hang">("chua_kh");
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <Modal title="Cập nhật kế hoạch hàng về bằng Excel" onClose={onClose} width={900}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Chỉ sửa 1–2 dòng? Dùng nút 📅 trên dòng. Đơn kế hoạch tháng (nhà máy báo SL theo tuần) → nút <b>Kế hoạch tuần KRF</b>.
      </div>
      {msg && <div style={{ background: "#DCFCE7", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{msg}</div>}
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
      {imp && (
        <PlanImportModal loai="NGAY" fileName={imp.name} parsed={imp.parsed} onClose={() => setImp(null)}
          onDone={(s) => {
            setImp(null);
            setMsg(`Đã lưu: ${s.so_ghi} đợt hàng về cho ${s.so_dong_lk} linh kiện.`);
            qc.invalidateQueries({ queryKey: ["plan-tuan"] });
            onDone();
          }} />
      )}
    </Modal>
  );
}
