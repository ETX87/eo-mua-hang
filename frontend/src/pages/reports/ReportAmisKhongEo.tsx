import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { I } from "../../lib/icons";
import { soLuong, ngay } from "../../lib/format";

export default function ReportAmisKhongEo() {
  const q = useQuery({ queryKey: ["rep-amis-ko-eo"], queryFn: () => api.get<any>("/reports/amis-khong-eo") });
  if (q.isLoading) return <Spinner />;
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
      <PageHeader title="Báo cáo – AMIS không có EO" actions={<button className="btn sm"><I.download width={14} height={14} /> Xuất Excel</button>} />
      <Card>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Các mã phê duyệt này có trên EO nhưng dòng hàng không khớp EO nào.
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
