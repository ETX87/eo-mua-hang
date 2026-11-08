import type { Col } from "../../components/DataTable";
import { EoLink, DongLink } from "../../components/quickview/QuickView";
import { soLuong, ngay } from "../../lib/format";
import { Kho, khoGon } from "../../lib/kho";


/** Cot chung bang chung tu AMIS: Ma phe duyet -> popup PO, Ma hang -> popup don hang (dong dat); loc + sap xep kieu Excel tren tieu de. */
export const cotChungTuAmis = (): Col<any>[] => [
  { key: "d", header: "Số CT", loc: "chu", gt: (r) => r.doc_no, render: (r) => r.doc_no },
  { key: "n", header: "Ngày CT", loc: "ngay", gt: (r) => r.doc_date, render: (r) => ngay(r.doc_date) },
  { key: "k", header: "Kho", loc: "chon", gt: (r) => r.warehouse_name, nhanChon: (v) => (khoGon(v) !== v ? `${khoGon(v)} — ${v}` : v), render: (r) => <Kho t={r.warehouse_name} /> },
  { key: "m", header: "Mã hàng", loc: "chu", gt: (r) => `${r.part_code ?? ""} ${r.part_name ?? ""}`, render: (r) => <DongLink id={r.dong_id} ma={r.part_code} po={r.approval_code_raw} /> },
  { key: "sl", header: "SL nhập", align: "right", loc: "so", gt: (r) => r.qty_in, render: (r) => soLuong(r.qty_in) },
  { key: "a", header: "Mã phê duyệt", loc: "chu", gt: (r) => r.approval_code_raw,
    render: (r) => r.po_eo_id ? <EoLink id={r.po_eo_id} title="Mở PO">{r.approval_code_raw}</EoLink> : <span title="Không có PO mang mã này">{r.approval_code_raw}</span> },
];
