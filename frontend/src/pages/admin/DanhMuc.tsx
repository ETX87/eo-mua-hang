import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { soLuong } from "../../lib/format";

export default function DanhMuc() {
  const [tab, setTab] = useState<"kho" | "loai" | "toc">("kho");
  const kho = useQuery({ queryKey: ["dm-kho"], queryFn: () => api.get<any[]>("/danh-muc/kho") });
  const loai = useQuery({ queryKey: ["dm-loaihinh"], queryFn: () => api.get<any[]>("/danh-muc/loai-hinh") });
  const toc = useQuery({ queryKey: ["dm-tocdo"], queryFn: () => api.get<any[]>("/danh-muc/toc-do") });

  const khoCols: Col<any>[] = [
    { key: "t", header: "Tên kho", render: (r) => r.ten_kho },
    { key: "m", header: "Mã kho", render: (r) => r.ma_kho || "" },
    { key: "a", header: "Kích hoạt", align: "center", render: (r) => <input type="checkbox" defaultChecked={!!r.active} /> },
  ];
  const loaiCols: Col<any>[] = [
    { key: "c", header: "Mã", render: (r) => r.code },
    { key: "t", header: "Tên", render: (r) => r.ten || "" },
    { key: "c2", header: "Loại hình cấp 2", render: (r) => r.cap2 || "" },
    { key: "pb", header: "Phòng ban", render: (r) => r.phong_ban || "" },
  ];
  const tocCols: Col<any>[] = [
    { key: "d", header: "Từ (ngày)", align: "right", render: (r) => r.min_days === -999999 ? "–∞" : soLuong(r.min_days) },
    { key: "l", header: "Nhãn", render: (r) => r.label },
  ];

  return (
    <div>
      <PageHeader title="Danh mục" breadcrumb={["Cài đặt", "Danh mục"]} />
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["kho", "Kho"], ["loai", "Loại hình EO"], ["toc", "Ngưỡng tốc độ hàng về"]].map(([k, l]) => (
          <button key={k} className={`btn sm ${tab === k ? "primary" : ""}`} onClick={() => setTab(k as any)}>{l}</button>
        ))}
      </div>
      <Card>
        {tab === "kho" && (kho.isLoading ? <Spinner /> : <DataTable cols={khoCols} rows={kho.data ?? []} keyOf={(r) => r.ten_kho} pageSize={PAGE_SIZE} />)}
        {tab === "loai" && (loai.isLoading ? <Spinner /> : <DataTable cols={loaiCols} rows={loai.data ?? []} keyOf={(r) => r.code} pageSize={PAGE_SIZE} />)}
        {tab === "toc" && (toc.isLoading ? <Spinner /> : <DataTable cols={tocCols} rows={toc.data ?? []} keyOf={(r) => r.min_days} pageSize={PAGE_SIZE} />)}
      </Card>
    </div>
  );
}
