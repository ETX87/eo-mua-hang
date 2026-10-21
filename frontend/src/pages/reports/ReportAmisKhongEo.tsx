import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, ngay } from "../../lib/format";
import { exportRowsToXlsx, type ExportCol } from "../../lib/exportXlsx";

const EXPORT_COLS: ExportCol<any>[] = [
  { header: "Số chứng từ", get: (r) => r.doc_no },
  { header: "Tên kho", get: (r) => r.warehouse_name },
  { header: "Mã hàng", get: (r) => r.part_code },
  { header: "Tên hàng", get: (r) => r.part_name },
  { header: "SL Nhập", get: (r) => r.qty_in },
  { header: "Ngày chứng từ", get: (r) => ngay(r.doc_date) },
  { header: "Mã phê duyệt", get: (r) => r.approval_code_raw },
];

export default function ReportAmisKhongEo() {
  const q = useQuery({ queryKey: ["rep-amis-ko-eo"], queryFn: () => api.get<any>("/reports/amis-khong-eo") });
  if (q.isLoading) return <Spinner />;
  const rows = q.data?.rows ?? [];
  const cols: Col<any>[] = [
    { key: "d", header: "Số chứng từ", render: (r) => r.doc_no },
    { key: "k", header: "Tên kho", render: (r) => r.warehouse_name },
    { key: "m", header: "Mã hàng", render: (r) => r.part_code },
    { key: "tn", header: "Tên hàng", render: (r) => r.part_name || "" },
    { key: "sl", header: "SL Nhập", align: "right", render: (r) => soLuong(r.qty_in) },
    { key: "nc", header: "Ngày chứng từ", render: (r) => ngay(r.doc_date) },
    { key: "mp", header: "Mã phê duyệt", render: (r) => r.approval_code_raw },
  ];
  return (
    <div>
      <PageHeader title="Báo cáo – AMIS không có EO" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Các mã phê duyệt này có trên EO nhưng dòng hàng không khớp EO nào.</span>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => exportRowsToXlsx(rows, EXPORT_COLS, "amis-khong-eo.xlsx")}><I.download width={14} height={14} /> Xuất Excel</button>
        </div>
        <DataTable
          pageSize={PAGE_SIZE}
          cols={cols} rows={q.data?.rows ?? []} keyOf={(_r, i) => i}
          totalRow={[<b key="t">TỔNG</b>, "", "", "", <b key="s">{soLuong(q.data?.tong?.so_luong_nhap)}</b>, "", <b key="n">{soLuong(q.data?.tong?.so_dong)}</b>]}
          empty="Không có dòng AMIS lệch EO."
        />
      </Card>
    </div>
  );
}
