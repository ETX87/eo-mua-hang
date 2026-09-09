import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner } from "../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../components/DataTable";
import { soLuong, ngay } from "../lib/format";

export default function Plans() {
  const q = useQuery({ queryKey: ["plan-tuan"], queryFn: () => api.get<{ rows: any[] }>("/dashboard/plan-tuan") });
  if (q.isLoading) return <Spinner />;
  const rows = q.data?.rows ?? [];
  const tongDong = rows.reduce((s, r) => s + r.so_dong, 0);
  const tongSL = rows.reduce((s, r) => s + r.tong_sl, 0);

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
        <div style={{ marginBottom: 12 }}>
          <select className="select" style={{ width: 160 }} defaultValue="tuan"><option value="tuan">Tuần này</option></select>
        </div>
        <DataTable cols={cols} rows={rows} keyOf={(r, i) => `${r.eo_id}-${r.planned_date}-${i}`} pageSize={PAGE_SIZE}
          totalRow={[<b key="t">Tổng</b>, "", <b key="n">{soLuong(tongDong)}</b>, <b key="s">{soLuong(tongSL)}</b>]}
          empty="Tuần này chưa có kế hoạch hàng về." />
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Cập nhật kế hoạch chi tiết theo từng dòng linh kiện trong màn Chi tiết EO.
        </div>
      </Card>
    </div>
  );
}
