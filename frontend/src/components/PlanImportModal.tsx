import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Modal, Spinner } from "./ui";
import { ngay, soLuong } from "../lib/format";
import type { Parsed } from "../lib/planExcel";

interface Props {
  loai: "NGAY" | "TUAN";
  fileName: string;
  parsed: Parsed;
  onClose: () => void;
  onDone: (summary: any) => void;
}

/**
 * Xem truoc + ghi import ke hoach hang ve (POST /plans/bulk dry_run -> ghi that).
 * Tat ca hoac khong: con dong loi thi khong cho ghi.
 */
export function PlanImportModal({ loai, fileName, parsed, onClose, onDone }: Props) {
  const [thayThe, setThayThe] = useState(true);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async (dry: boolean) => {
    setErr(""); setBusy(true);
    try {
      const r = await api.post<any>("/plans/bulk", { loai, thay_the: loai === "TUAN" ? true : thayThe, dry_run: dry, nguon: "excel", rows: parsed.rows });
      if (dry) setRes(r); else onDone(r.summary);
    } catch (e: any) {
      if (e?.body?.rows) setRes(e.body);
      else setErr(e?.body?.error === "TOO_MANY_ROWS" ? "File quá 5000 dòng — chia nhỏ file." : "Lỗi kiểm tra / ghi dữ liệu.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { if (parsed.rows.length) run(true); /* eslint-disable-next-line */ }, [thayThe]);

  const rows: any[] = res?.rows ?? [];
  const bad = rows.filter((r) => !r.ok);
  const s = res?.summary;
  const canSave = !!res && bad.length === 0 && parsed.rows.length > 0 && parsed.errs.length === 0;

  return (
    <Modal title={`Import kế hoạch ${loai === "TUAN" ? "tuần" : "hàng về"} — ${fileName}`} onClose={onClose} width={1060}
      footer={<>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn primary" disabled={!canSave || busy} onClick={() => run(false)}>
          {busy ? "Đang xử lý..." : `Ghi ${s?.so_ghi ?? 0} mốc kế hoạch`}
        </button>
      </>}>
      {parsed.errs.length > 0 && (
        <div style={{ background: "#FEE2E2", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
          <b>{parsed.errs.length} dòng lỗi định dạng trong file</b> — sửa file rồi import lại:
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {parsed.errs.slice(0, 20).map((e) => <li key={e}>{e}</li>)}
            {parsed.errs.length > 20 && <li>… và {parsed.errs.length - 20} dòng khác</li>}
          </ul>
        </div>
      )}
      {loai === "NGAY" ? (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={thayThe} onChange={(e) => setThayThe(e.target.checked)} />
          Ghi đè: thay toàn bộ kế hoạch theo ngày hiện có của các linh kiện có trong file (khuyên dùng — import lại không bị nhân đôi)
        </label>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Kế hoạch tuần cũ của các linh kiện có trong file sẽ được thay bằng số trong file.</div>
      )}
      {!parsed.rows.length && <div className="muted">Không có dòng nào có dữ liệu để import{parsed.skipped ? ` (${parsed.skipped} dòng trống được bỏ qua)` : ""}.</div>}
      {busy && !res && <Spinner />}
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      {s && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, fontSize: 12.5 }}>
          <span className="badge nhap">{s.so_dong} dòng đọc được</span>
          <span className="badge issued">{s.so_ghi} mốc sẽ ghi · {s.so_dong_lk} linh kiện</span>
          {s.so_ke_hoach_cu_thay > 0 && <span className="badge final">{s.so_ke_hoach_cu_thay} mốc cũ bị thay</span>}
          {bad.length > 0 && <span className="badge reject">{bad.length} dòng lỗi — chưa ghi được</span>}
          {parsed.skipped > 0 && <span className="badge nhap">{parsed.skipped} dòng trống bỏ qua</span>}
        </div>
      )}
      {rows.length > 0 && (
        <div className="tbl-wrap" style={{ maxHeight: "48vh", overflow: "auto" }}>
          <table className="tbl">
            <thead><tr>
              <th>Dòng file</th><th>Mã PO</th><th>Mã LK</th><th>Tên linh kiện</th><th>Kho</th>
              <th>{loai === "TUAN" ? "Tuần" : "Ngày về"}</th><th style={{ textAlign: "right" }}>SL</th><th style={{ textAlign: "right" }}>SL đặt</th><th>Kết quả</th>
            </tr></thead>
            <tbody>
              {[...bad, ...rows.filter((r) => r.ok)].slice(0, 500).map((r, i) => (
                <tr key={`${r._row}-${i}`} style={{ background: r.ok ? undefined : "#FEF2F2" }}>
                  <td>{r._row}</td>
                  <td>{r.approval_code || r.eo_code || ""}</td>
                  <td>{r.part_code ?? ""}</td>
                  <td>{r.part_name ?? ""}</td>
                  <td>{r.warehouse ?? ""}</td>
                  <td>{loai === "TUAN" ? (r.tuan ?? "") : ngay(r.planned_date)}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(r.planned_qty)}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(r.current_qty)}</td>
                  <td style={{ color: r.ok ? "var(--text-muted)" : "var(--danger)", fontSize: 12 }}>
                    {r.ok ? (r.planned_qty > 0 ? "OK" : "Xóa KH cũ") : `${r.error_text}${r.detail ? ` (${r.detail})` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <div className="muted" style={{ fontSize: 12, padding: 6 }}>Hiển thị 500 / {rows.length} dòng (dòng lỗi lên đầu).</div>}
        </div>
      )}
    </Modal>
  );
}
