import type { Col } from "../../components/DataTable";
import { EoLink, useQuickView } from "../../components/quickview/QuickView";
import { soLuong, ngay } from "../../lib/format";
import { Kho, khoGon } from "../../lib/kho";

/** Ma hang -> popup DON HANG (dong linh kien dat) - CUNG giao dien voi LK dat, khong dung popup rieng (2026-11-08). */
function DongLink({ id, ma }: { id?: number | null; ma: string }) {
  const qv = useQuickView();
  if (!id) return <span title="Không có dòng đặt mang mã này trong PO">{ma}</span>;
  return <button type="button" className="qv-link" title="Mở đơn hàng (dòng linh kiện đặt)" onClick={(e) => { e.stopPropagation(); qv.openDong(id); }}>{ma}</button>;
}

/** Cot chung bang chung tu AMIS: Ma phe duyet -> popup PO, Ma hang -> popup don hang (dong dat); loc + sap xep kieu Excel tren tieu de. */
export const cotChungTuAmis = (): Col<any>[] => [
  { key: "d", header: "Số CT", loc: "chu", gt: (r) => r.doc_no, render: (r) => r.doc_no },
  { key: "n", header: "Ngày CT", loc: "ngay", gt: (r) => r.doc_date, render: (r) => ngay(r.doc_date) },
  { key: "k", header: "Kho", loc: "chon", gt: (r) => r.warehouse_name, nhanChon: (v) => (khoGon(v) !== v ? `${khoGon(v)} — ${v}` : v), render: (r) => <Kho t={r.warehouse_name} /> },
  { key: "m", header: "Mã hàng", loc: "chu", gt: (r) => `${r.part_code ?? ""} ${r.part_name ?? ""}`, render: (r) => <DongLink id={r.dong_id} ma={r.part_code} /> },
  { key: "sl", header: "SL nhập", align: "right", loc: "so", gt: (r) => r.qty_in, render: (r) => soLuong(r.qty_in) },
  { key: "a", header: "Mã phê duyệt", loc: "chu", gt: (r) => r.approval_code_raw,
    render: (r) => r.po_eo_id ? <EoLink id={r.po_eo_id} title="Mở PO">{r.approval_code_raw}</EoLink> : <span title="Không có PO mang mã này">{r.approval_code_raw}</span> },
];
