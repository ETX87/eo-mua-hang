import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { soLuong, pct } from "../../lib/format";

const WEEKS = Array.from({ length: 53 }, (_, i) => `W${String(i + 1).padStart(2, "0")}`);

export default function ReportLuyKe() {
  const nowY = new Date().getUTCFullYear();
  const [nam, setNam] = useState(nowY);
  const [kieuXem, setKieuXem] = useState("eo");
  const [showKH, setShowKH] = useState(false);
  const q = useQuery({ queryKey: ["rep-luyke", nam, kieuXem], queryFn: () => api.get<any>(`/reports/luy-ke-nam?nam=${nam}&kieu_xem=${kieuXem}`) });

  const heat = (v: number, max: number) => v > 0 ? { background: `rgba(34,197,94,${0.08 + 0.5 * (v / (max || 1))})` } : {};
  const maxVal = Math.max(1, ...(q.data?.rows ?? []).flatMap((r: any) => WEEKS.map((w) => r.ve_tuan[w] || 0)));

  return (
    <div>
      <PageHeader title="Báo cáo – Kế hoạch lũy kế năm" />
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <select className="select" style={{ width: 120 }} value={nam} onChange={(e) => setNam(Number(e.target.value))}>
            {[nowY - 1, nowY, nowY + 1].map((y) => <option key={y} value={y}>Y{y}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} value={kieuXem} onChange={(e) => setKieuXem(e.target.value)}>
            <option value="eo">Chỉ mã EO</option>
            <option value="eo_kho">Kèm kho</option>
          </select>
          <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={showKH} onChange={(e) => setShowKH(e.target.checked)} /> Hiện cột kế hoạch tuần
          </label>
        </div>

        {q.isLoading ? <Spinner /> : (
          <div className="tbl-wrap">
            <table className="tbl" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  {["Mã EO", "Kho", "SL LK EO", "SL kế hoạch", "SL thiếu KH", "Tổng đã về", "% hàng đã về", "% hoàn thành KH"].map((h, i) => (
                    <th key={h} style={{ position: "sticky", left: i === 0 ? 0 : undefined, background: "var(--panel-2)" }}>{h}</th>
                  ))}
                  {WEEKS.map((w) => <th key={w} className="right">{w}</th>)}
                  {showKH && WEEKS.map((w) => <th key={"kh" + w} className="right">KH-{w}</th>)}
                </tr>
              </thead>
              <tbody>
                {(q.data?.rows ?? []).map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 600 }}>{r.ma_eo}</td>
                    <td>{r.kho || ""}</td>
                    <td className="right mono-num">{soLuong(r.sl_lk_eo)}</td>
                    <td className="right mono-num">{soLuong(r.sl_ke_hoach)}</td>
                    <td className="right mono-num">{soLuong(r.sl_thieu_ke_hoach)}</td>
                    <td className="right mono-num">{soLuong(r.tong_da_ve)}</td>
                    <td className="right mono-num">{pct(r.pc_hang_da_ve)}</td>
                    <td className="right mono-num">{pct(r.pc_hoan_thanh_kh)}</td>
                    {WEEKS.map((w) => <td key={w} className="right mono-num" style={heat(r.ve_tuan[w] || 0, maxVal)}>{r.ve_tuan[w] || ""}</td>)}
                    {showKH && WEEKS.map((w) => <td key={"kh" + w} className="right mono-num">{r.kh_tuan[w] || ""}</td>)}
                  </tr>
                ))}
                {(q.data?.rows ?? []).length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 40 }}>Chưa có kế hoạch trong năm.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
