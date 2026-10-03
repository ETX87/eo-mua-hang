import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner } from "../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../components/DataTable";
import { soLuong, ngay } from "../lib/format";

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
  const [tuan, setTuan] = useState(0);
  const q = useQuery({
    queryKey: ["plan-tuan", tuan],
    queryFn: () => api.get<{ tu: string; den: string; rows: any[] }>(`/dashboard/plan-tuan?tuan=${tuan}`),
  });
  const rows = q.data?.rows ?? [];
  const tongDong = rows.reduce((s, r) => s + r.so_dong, 0);
  const tongSL = rows.reduce((s, r) => s + r.tong_sl, 0);
  const kyLabel = KY.find((k) => k.v === tuan)?.l ?? "";

  const cols: Col<any>[] = [
    { key: "d", header: "Ngày về dự kiến", render: (r) => ngay(r.planned_date) },
    { key: "eo", header: "Mã EO", render: (r) => <span className="cell-link">{r.eo_code}</span> },
    { key: "n", header: "Số dòng", align: "right", render: (r) => soLuong(r.so_dong) },
    { key: "sl", header: "Tổng SL", align: "right", render: (r) => soLuong(r.tong_sl) },
  ];

  return (
    <div>
      <PageHeader title="Kế hoạch hàng về" />
      <Card>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <select className="select" style={{ width: 160 }} value={tuan} onChange={(e) => setTuan(Number(e.target.value))}>
            {KY.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
          {q.data && <span className="muted" style={{ fontSize: 13 }}>{ngay(q.data.tu)} – {ngay(q.data.den)}</span>}
        </div>
        {q.isLoading ? <Spinner /> : (
          <DataTable cols={cols} rows={rows} keyOf={(r, i) => `${r.eo_id}-${r.planned_date}-${i}`} pageSize={PAGE_SIZE}
            onRowClick={(r) => nav(`/eo/${r.eo_id}`)}
            totalRow={[<b key="t">Tổng</b>, "", <b key="n">{soLuong(tongDong)}</b>, <b key="s">{soLuong(tongSL)}</b>]}
            empty={`${kyLabel} chưa có kế hoạch hàng về.`} />
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Cập nhật kế hoạch theo từng dòng linh kiện ở Chi tiết EO › tab "Kế hoạch hàng về".
        </div>
      </Card>
    </div>
  );
}
