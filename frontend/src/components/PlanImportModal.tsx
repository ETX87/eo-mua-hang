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
    <Modal title={`Kiểm tra file kế hoạch ${loai === "TUAN" ? "tuần" : "hàng về"} — ${fileName}`} onClose={onClose} width={1060}
      footer={<>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn primary" disabled={!canSave || busy} onClick={() => run(false)}>
          {busy ? "Đang xử lý..." : bad.length ? `Còn ${bad.length} dòng sai` : `Lưu ${s?.so_ghi ?? 0} đợt hàng về`}
        </button>
      </>}>
      {parsed.errs.length > 0 && (
        <div style={{ background: "#FEE2E2", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
          <b>{parsed.errs.length} dòng điền sai trong file</b> — sửa trong Excel rồi tải lên lại:
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {parsed.errs.slice(0, 20).map((e) => <li key={e}>{e}</li>)}
            {parsed.errs.length > 20 && <li>… và {parsed.errs.length - 20} dòng khác</li>}
          </ul>
        </div>
      )}
      {loai === "NGAY" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10, fontSize: 12.5 }}>
          {([[true, "File là kế hoạch mới (khuyên dùng)", "Linh kiện nào có trong file: các đợt trong file thay cho đợt cũ. Linh kiện không có trong file giữ nguyên. Tải lại cùng file không bị nhân đôi."],
            [false, "Chỉ thêm đợt mới", "Giữ nguyên các đợt đang có, cộng thêm các dòng trong file. Dùng khi file chỉ chứa đợt mới."]] as const).map(([v, t, m]) => (
            <label key={t} style={{ display: "flex", gap: 8, alignItems: "flex-start", border: `1px solid ${thayThe === v ? "var(--brand-yellow-btn)" : "var(--border)"}`, background: thayThe === v ? "#FFFBEB" : undefined, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
              <input type="radio" checked={thayThe === v} onChange={() => setThayThe(v)} style={{ marginTop: 3 }} />
              <span><b>{t}</b><div className="muted">{m}</div></span>
            </label>
          ))}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Kế hoạch tuần cũ của các linh kiện có trong file sẽ được thay bằng số trong file.</div>
      )}
      {!parsed.rows.length && <div className="muted">Không có dòng nào có dữ liệu để import{parsed.skipped ? ` (${parsed.skipped} dòng trống được bỏ qua)` : ""}.</div>}
      {busy && !res && <Spinner />}
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      {s && (
        <div style={{ borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13, background: bad.length ? "#FEF2F2" : "#F0FDF4" }}>
          {bad.length > 0
            ? <><b style={{ color: "var(--danger-ink)" }}>Có {bad.length} dòng sai</b> (tô đỏ, xem cột "Kết quả") — sửa trong file Excel rồi tải lên lại. Chưa lưu gì.</>
            : <>Sẵn sàng lưu <b>{s.so_ghi} đợt hàng về</b> cho <b>{s.so_dong_lk} linh kiện</b>{loai === "NGAY" && thayThe && s.so_ke_hoach_cu_thay > 0 ? <> (thay {s.so_ke_hoach_cu_thay} đợt cũ của các linh kiện này)</> : null}.</>}
          {parsed.skipped > 0 && <span className="muted"> · {parsed.skipped} dòng để trống được bỏ qua (linh kiện đó giữ nguyên).</span>}
        </div>
      )}
      {rows.length > 0 && (
        <div className="tbl-wrap" style={{ maxHeight: "48vh", overflow: "auto" }}>
          <table className="tbl">
            <thead><tr>
              <th>Dòng Excel</th><th>Mã PO</th><th>Mã LK</th><th>Tên linh kiện</th><th>Kho</th>
              {loai !== "TUAN" && <th>Ngày NM cam kết</th>}<th>{loai === "TUAN" ? "Tuần" : "Ngày dự kiến"}</th><th style={{ textAlign: "right" }}>SL dự kiến về</th><th style={{ textAlign: "right" }}>SL đặt</th><th>Kết quả</th>
            </tr></thead>
            <tbody>
              {[...bad, ...rows.filter((r) => r.ok)].slice(0, 500).map((r, i) => (
                <tr key={`${r._row}-${i}`} style={{ background: r.ok ? undefined : "#FEF2F2" }}>
                  <td>{r._row}</td>
                  <td>{r.approval_code || r.eo_code || ""}</td>
                  <td>{r.part_code ?? ""}</td>
                  <td>{r.part_name ?? ""}</td>
                  <td>{r.warehouse ?? ""}</td>
                  {loai !== "TUAN" && <td>{ngay(r.factory_committed_date) || "—"}</td>}
                  <td>{loai === "TUAN" ? (r.tuan ?? "") : ngay(r.planned_date)}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(r.planned_qty)}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(r.current_qty)}</td>
                  <td style={{ color: r.ok ? "var(--text-muted)" : "var(--danger)", fontSize: 12 }}>
                    {r.ok ? (r.planned_qty > 0 ? "✓ Hợp lệ" : "Bỏ kế hoạch cũ") : `${r.error_text}${r.detail ? ` (${r.detail})` : ""}`}
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
