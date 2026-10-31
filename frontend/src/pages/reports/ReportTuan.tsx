import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { DataTable, PAGE_SIZE, type Col } from "../../components/DataTable";
import { soLuong, pct } from "../../lib/format";

/** nhung = hien trong tab Bao cao cua Quan ly don hang (khong PageHeader rieng). */
export default function ReportTuan({ nhung }: { nhung?: boolean }) {
  const [ma, setMa] = useState("");
  const [ky, setKy] = useState("");
  const tomtat = useQuery({ queryKey: ["tuan-tomtat"], queryFn: () => api.get<any>("/dashboard/tuan-tomtat") });
  const rep = useQuery({ queryKey: ["rep-tuan", ma, ky], queryFn: () => api.get<any>(`/reports/tien-do-tuan?${ma ? "ma=" + ma : ""}${ky ? "&ky=" + ky : ""}`) });

  const cols: Col<any>[] = [
    { key: "idlk", header: "ID ĐẶT LK", render: (r) => r.id_dat_lk },
    { key: "eo", header: "Mã EO", render: (r) => r.ma_eo },
    { key: "kho", header: "Kho", render: (r) => r.kho },
    { key: "pc", header: "Mã linh kiện", render: (r) => r.part_code },
    { key: "pn", header: "Tên linh kiện", render: (r) => r.part_name },
    { key: "gcnm", header: "Ghi chú nhà máy", render: (r) => r.ghi_chu_nha_may || "" },
    { key: "ky", header: "Kỳ tính", render: (r) => r.ky_tinh },
    { key: "tuan", header: "Tuần", render: (r) => r.tuan },
    { key: "1", header: "SL LK trên EO (1)", align: "right", render: (r) => soLuong(r.sl_lk_eo) },
    { key: "2", header: "SL đã lên KH tuần (2)", align: "right", render: (r) => soLuong(r.sl_ke_hoach_tuan) },
    { key: "3", header: "SL về AMIS theo mốc (3)", align: "right", render: (r) => soLuong(r.sl_ve_amis_theo_moc) },
    { key: "4", header: "SL AMIS về sau KH cuối (4)", align: "right", render: (r) => soLuong(r.sl_amis_sau_ke_hoach) },
    { key: "5", header: "Cân bằng đúng KH (5)", align: "right", render: (r) => soLuong(r.can_bang) },
    { key: "6", header: "% KH tuần/EO (6)", align: "right", render: (r) => pct(r.pc_ke_hoach_tuan_tren_eo) },
    { key: "7", header: "% hàng về/Tổng EO (7)", align: "right", render: (r) => pct(r.pc_hang_ve_tren_eo) },
    { key: "8", header: "% hàng về cân đối (8)", align: "right", render: (r) => pct(r.pc_hang_ve_can_doi) },
  ];

  return (
    <div>
      {!nhung && <PageHeader title="Báo cáo – Tiến độ tuần" />}
      {tomtat.data && (
        <Card style={{ marginBottom: 16, maxWidth: 420 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Tóm tắt 7 ngày gần nhất</div>
          <table className="tbl" style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
            <thead><tr><th>Chỉ tiêu</th><th className="right">Giá trị</th></tr></thead>
            <tbody>
              {[
                ["Số EO tạo mới", soLuong(tomtat.data.so_eo_tao_moi)],
                ["Số EO ban hành", soLuong(tomtat.data.so_eo_ban_hanh)],
                ["Số dòng đặt hàng", soLuong(tomtat.data.so_dong)],
                ["Tổng SL đặt", soLuong(tomtat.data.tong_sl)],
                ["Tỷ lệ hoàn thành", tomtat.data.ty_le_hoan_thanh + "%"],
              ].map(([k, v]) => <tr key={k}><td>{k}</td><td className="right mono-num">{v}</td></tr>)}
            </tbody>
          </table>
        </Card>
      )}
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="input" style={{ width: 180 }} placeholder="Mã phê duyệt (3TDO-...)" value={ma} onChange={(e) => setMa(e.target.value)} />
          <input className="input" style={{ width: 140 }} placeholder="Kỳ (Y2609)" value={ky} onChange={(e) => setKy(e.target.value)} />
        </div>
        {rep.isLoading ? <Spinner /> : (
          <DataTable
            minWidth={1900} pageSize={PAGE_SIZE}
            cols={cols} rows={rep.data?.rows ?? []} keyOf={(_r, i) => i}
            totalRow={["TỔNG", "", "", "", "", "", "", "", "", soLuong(rep.data?.tong?.sl_ke_hoach_tuan), soLuong(rep.data?.tong?.sl_ve_amis_theo_moc), soLuong(rep.data?.tong?.sl_amis_sau_ke_hoach), soLuong(rep.data?.tong?.can_bang), "", "", ""]}
            empty="Chọn mã phê duyệt để xem tiến độ tuần."
          />
        )}
      </Card>
    </div>
  );
}
