import { useEffect } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "../components/ui";
import { soLuong } from "../lib/format";
import QuanLyPanel from "./QuanLyPanel";
import { XuHuongEo } from "./dieuhanh/XuHuongEo";

/**
 * "/" = TONG QUAN (v0.133, chu he thong 27/11/2026 "chon menu phu nhung bao cao khong thay doi, neu khong thay doi thi tach bao cao khong lien quan
 * rieng ra menu phu rieng"): viec cua ban + bang dieu khien (ty le dap ung, ton, giai doan) + xu huong EO. Dieu hanh tach lai thanh menu phu rieng
 * (/dieu-hanh, cap 2 = tab) - link cu "/?tab=..." (ban gop v0.130-0.132) chuyen sang /dieu-hanh?tab=...
 */
export default function TongQuan() {
  const [sp] = useSearchParams();
  useEffect(() => { window.scrollTo(0, 0); }, []);
  if (sp.get("tab")) return <Navigate to={`/dieu-hanh?tab=${sp.get("tab")}`} replace />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ViecCanXuLy />
      <QuanLyPanel />
      <XuHuongEo />
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
