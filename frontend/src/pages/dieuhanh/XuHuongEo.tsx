import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { api } from "../../api/client";
import { Card, Spinner } from "../../components/ui";
import { soLuong } from "../../lib/format";

const DONUT_COLOR: Record<string, string> = {
  "Nháp": "#B6BAC2", "Đang thẩm định": "#F5CC18", "Chờ duyệt mua": "#ff6b00",
  "Đã ban hành": "#6CD13D", "Từ chối / Đã hủy": "#FC4244",
};

/** v0.129: bieu do xu huong EO theo thang + ty le theo trang thai (truoc o cuoi trang Tong quan) - tab "Xu hướng EO" man Tong quan & dieu hanh. */
export function XuHuongEo() {
  const [soThang, setSoThang] = useState(6);
  const q = useQuery({
    queryKey: ["dash-summary", soThang],
    queryFn: () => api.get<any>(`/dashboard/summary?thang=${soThang}`),
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <Spinner />;
  const d = q.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "stretch" }}>
        <Card style={{ minHeight: 270, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 16, whiteSpace: "nowrap" }}>Xu hướng EO theo tháng</strong>
            <select className="select" style={{ width: 150 }} value={soThang} onChange={(e) => setSoThang(Number(e.target.value))}>
              {[3, 6, 12].map((n) => <option key={n} value={n}>{n} tháng gần đây</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minHeight: 214 }}>
            <ResponsiveContainer>
              <ComposedChart data={d.trend} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gTong" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff9500" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ff9500" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#EEE" vertical={false} />
                <XAxis dataKey="thang" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend verticalAlign="top" align="left" iconType="plainline" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
                <Area type="monotone" dataKey="tong" name="Tổng EO" stroke="#F0C000" strokeWidth={2.5} fill="url(#gTong)" dot={{ r: 3 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="ban_hanh" name="Đã ban hành" stroke="#2fb350" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="tu_choi" name="Từ chối / Đã hủy" stroke="#ff3b30" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card style={{ minHeight: 270 }}>
          <strong style={{ fontSize: 16 }}>Tỷ lệ theo trạng thái</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
            <div style={{ width: 164, height: 164, position: "relative", flexShrink: 0 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d.donut} dataKey="count" nameKey="label" innerRadius={52} outerRadius={80} paddingAngle={1.5} stroke="none">
                    {d.donut.map((e: any) => <Cell key={e.label} fill={DONUT_COLOR[e.label] ?? "#ccc"} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }} className="mono-num">{soLuong(d.kpi.tong)}</div>
                  <div className="muted" style={{ fontSize: 10.5 }}>Tổng EO</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 11 }}>
              {d.donut.map((e: any) => (
                <div key={e.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, whiteSpace: "nowrap" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: DONUT_COLOR[e.label] ?? "#ccc", flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</span>
                  <span className="mono-num" style={{ fontWeight: 700 }}>{soLuong(e.count)}</span>
                  <span className="muted">({e.pct}%)</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
