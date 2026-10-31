import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal } from "../../components/ui";
import { useDanhMuc } from "./shared";

/** Bang loi & danh sach "Ai" cua giai trinh (Admin) - mo tu Quan ly don hang. */
export function BangLoiModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const dm = useDanhMuc();
  const [f, setF] = useState({ loai: "LOI", ma: "", ten: "", thu_tu: "0" });
  const [err, setErr] = useState("");
  const save = async (row: any) => {
    setErr("");
    try { await api.put("/theo-doi/danh-muc", row); qc.invalidateQueries({ queryKey: ["tl-danh-muc"] }); setF({ loai: f.loai, ma: "", ten: "", thu_tu: "0" }); }
    catch { setErr("Lỗi lưu (cần mã + tên)."); }
  };
  return (
    <Modal title="Bảng lỗi & danh sách Ai" onClose={onClose} wide>
      {(["AI", "LOI"] as const).map((loai) => (
        <div key={loai} style={{ marginBottom: 14 }}>
          <b style={{ fontSize: 13.5 }}>{loai === "AI" ? "Ai chịu trách nhiệm" : "Lỗi gì"}</b>
          {(dm.data ?? []).filter((x) => x.loai === loai).map((x) => (
            <div key={x.ma} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13, opacity: x.active ? 1 : 0.5 }}>
              <code style={{ width: 170 }}>{x.ma}</code><span style={{ flex: 1 }}>{x.ten}</span>
              <button className="btn ghost sm" onClick={() => save({ ...x, active: !x.active })}>{x.active ? "Ẩn" : "Hiện"}</button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <select className="select" style={{ width: 110 }} value={f.loai} onChange={(e) => setF({ ...f, loai: e.target.value })}><option value="LOI">Lỗi</option><option value="AI">Ai</option></select>
        <input className="input" style={{ width: 170 }} placeholder="Mã (vd NCC_GIAO_THIEU)" value={f.ma} onChange={(e) => setF({ ...f, ma: e.target.value })} />
        <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Tên hiển thị" value={f.ten} onChange={(e) => setF({ ...f, ten: e.target.value })} />
        <input className="input" style={{ width: 70 }} placeholder="Thứ tự" value={f.thu_tu} onChange={(e) => setF({ ...f, thu_tu: e.target.value })} />
        <button className="btn primary" onClick={() => save({ ...f, thu_tu: Number(f.thu_tu) || 0, active: true })}>Thêm / sửa</button>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
    </Modal>
  );
}
