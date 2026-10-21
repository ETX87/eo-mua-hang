import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { api } from "../api/client";
import { Card, KpiCard, StatusBadge, Avatar, Spinner } from "../components/ui";
import { I } from "../lib/icons";
import { soLuong, tuBayGio, ten } from "../lib/format";
import EoListInner from "./eo/EoListInner";

const DONUT_COLOR: Record<string, string> = {
  "Nháp": "#B6BAC2", "Đang thẩm định": "#F5CC18", "Chờ duyệt cuối": "#FC7000",
  "Đã ban hành": "#6CD13D", "Từ chối / Đã hủy": "#FC4244",
};

export default function Dashboard() {
  const nav = useNavigate();
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
      <ViecCanXuLy />
      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
        <KpiCard icon="clipboard" tint="#F5CC18" label="Tổng số EO" value={soLuong(d.kpi.tong)} />
        <KpiCard icon="clock" tint="#FC7000" label="Đang thẩm định" value={soLuong(d.kpi.tham_dinh)} />
        <KpiCard icon="user" tint="#FC7000" label="Chờ duyệt cuối" value={soLuong(d.kpi.cho_duyet)} />
        <KpiCard icon="check" tint="#6CD13D" label="Đã ban hành" value={soLuong(d.kpi.ban_hanh)} />
        <KpiCard icon="x" tint="#FC4244" label="Từ chối / Đã hủy" value={soLuong(d.kpi.tu_choi)} />
      </div>

      {/* 3 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1.18fr 1fr 1fr", gap: 16, alignItems: "stretch" }}>
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
                    <stop offset="0%" stopColor="#F7CE1B" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#F7CE1B" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#EEE" vertical={false} />
                <XAxis dataKey="thang" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend verticalAlign="top" align="left" iconType="plainline" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
                <Area type="monotone" dataKey="tong" name="Tổng EO" stroke="#F0C000" strokeWidth={2.5} fill="url(#gTong)" dot={{ r: 3 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="ban_hanh" name="Đã ban hành" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="tu_choi" name="Từ chối / Đã hủy" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 3 }} />
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

        <Card style={{ minHeight: 270 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 16 }}>Việc cần duyệt</strong>
            <span onClick={() => nav("/approvals")} style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>Xem tất cả <I.arrowRight width={13} height={13} /></span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {d.viec_can_duyet.map((r: any) => (
              <div key={r.id} onClick={() => nav(`/eo/${r.id}`)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                <Avatar name={ten(r.nguoi_tao)} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.eo_code} - {r.tieu_de || "(không tiêu đề)"}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>Người tạo: {ten(r.nguoi_tao)} • {tuBayGio(r.luc)}</div>
                </div>
                <StatusBadge status={r.trang_thai} />
              </div>
            ))}
            {d.viec_can_duyet.length === 0 && <div className="muted" style={{ padding: 20, textAlign: "center", fontSize: 12.5 }}>Không có EO chờ duyệt</div>}
          </div>
        </Card>
      </div>

      {/* Danh sách EO nhúng */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>Danh sách EO</strong>
          <button className="btn primary" onClick={() => nav("/eo/new")}><I.plus width={15} height={15} /> Tạo EO</button>
        </div>
        <EoListInner compact />
      </Card>
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
