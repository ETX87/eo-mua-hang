import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "../components/ui";
import { soLuong } from "../lib/format";
import QuanLyPanel from "./QuanLyPanel";
import DieuHanh from "./DieuHanh";

/**
 * v0.129 (chu he thong chot 27/11/2026 "Gop thanh 2 man"): "/" = TONG QUAN & DIEU HANH - gop Tong quan cu + man Dieu hanh (/dieu-hanh chuyen huong ve day).
 * Tren cung: viec cua ban + so tong (ty le dap ung, ton theo moc - QuanLyPanel); duoi: toan bo Dieu hanh (pham vi, ket luan, o suc khoe, luong giai doan, tab
 * - tab Trach nhiem thay bang trach nhiem lanh dao cu, tab Xu huong EO = bieu do cu). Bao cao dat LK (so lieu ky) giu man rieng.
 */
export default function TongQuan() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ViecCanXuLy />
      <QuanLyPanel />
      <DieuHanh nhung />
    </div>
  );
}

/** Tong hop "viec can xu ly" cua nguoi dang dang nhap (cung nguon voi so do o menu - /api/viec-can-lam). */
function ViecCanXuLy() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["inbox-count"], queryFn: () => api.get<{ items: any[]; tong: number }>("/viec-can-lam"), refetchInterval: 60000 });
  if (q.isLoading) return null;
  const items = q.data?.items ?? [];
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: items.length ? 12 : 0 }}>
        <strong style={{ fontSize: 15 }}>Việc cần xử lý của bạn</strong>
        <span style={{ background: items.length ? "#EF4444" : "#6CD13D", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 800, padding: "2px 10px" }}>{soLuong(q.data?.tong ?? 0)}</span>
        {!items.length && <span className="muted" style={{ fontSize: 13 }}>Không có việc tồn — tốt lắm!</span>}
      </div>
      {items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {items.map((x) => (
            <div key={x.key} onClick={() => nav(x.to)} className="card card-pad" style={{ cursor: "pointer", borderLeft: "4px solid #EF4444" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{x.label}</span>
                <span style={{ fontWeight: 900, fontSize: 22, color: "#EF4444" }}>{soLuong(x.count)}</span>
              </div>
              {(x.chi_tiet ?? []).map((c: any) => (
                <div key={c.label} className="muted" style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}><span>{c.label}</span><b>{c.label.startsWith("Lần nhập") ? "" : soLuong(c.count)}</b></div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
