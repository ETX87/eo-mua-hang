// Nhan tieng Viet cho event_log.event_type - dung chung Chi tiet EO, popup xem nhanh EO / ma linh kien.
export const EVENT_LABEL: Record<string, string> = {
  CREATE_EO: "Tạo EO", UPDATE_EO: "Sửa thông tin EO", SUBMIT_EO: "Gửi trình duyệt", RESUBMIT_EO: "Trình lại",
  APPROVE_REVIEW: "Duyệt thẩm định", REJECT_REVIEW: "Từ chối thẩm định", REQUEST_UPDATE: "Yêu cầu cập nhật",
  WITHDRAW_REVIEW: "Rút phiếu thẩm định", APPROVE_FINAL: "Duyệt cuối", REJECT_FINAL: "Từ chối duyệt cuối",
  ISSUE_EO: "Ban hành EO", CANCEL_EO: "Hủy EO", ADD_ITEM: "Thêm dòng linh kiện", UPDATE_ITEM: "Sửa dòng linh kiện",
  UPDATE_QUANTITY: "Sửa số lượng", CANCEL_LINE: "Hủy dòng", APPROVE_POST_ISSUE_ITEM: "Duyệt dòng thêm sau ban hành", REJECT_POST_ISSUE_ITEM: "Từ chối dòng thêm sau ban hành",
  ADD_PLAN: "Thêm kế hoạch", UPDATE_PLAN: "Sửa kế hoạch", DELETE_PLAN: "Xóa kế hoạch", IMPORT_AMIS: "Import AMIS",
  UPLOAD_FILE: "Đính kèm tài liệu", REPLACE_PART: "Thay mã linh kiện tương đương", BULK_PLAN: "Cập nhật kế hoạch hàng loạt",
  IMPORT_ITEMS: "Import dòng linh kiện từ Excel", DELETE_FILE: "Xóa tài liệu đính kèm", RECALL_EO: "Rút về nháp để sửa",
  GIAI_TRINH_THEO_DOI: "Giải trình theo dõi",
};

const sl = (v: unknown) => (v == null || v === "" ? "" : Number(v).toLocaleString("vi-VN"));
const d = (v: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? ""); };
const j = (s: string | null | undefined) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/** Mo ta ngan 1 dong event_log (before/after/metadata JSON). */
export function moTaSuKien(e: { event_type: string; before_json?: string | null; after_json?: string | null; metadata_json?: string | null }): string {
  const b = j(e.before_json), a = j(e.after_json), m = j(e.metadata_json);
  const p: string[] = [];
  if (b?.qty != null && a?.qty != null) p.push(`SL ${sl(b.qty)} → ${sl(a.qty)}`);
  if (e.event_type === "REPLACE_PART") p.push(`${b?.part_code} → ${a?.part_code}`);
  if (e.event_type === "BULK_PLAN" && Array.isArray(a)) {
    p.push(`${m?.part_code ?? ""}: ${a.map((x: any) => `${m?.loai === "TUAN" ? x.tuan : d(x.planned_date)}: ${sl(x.planned_qty)}`).slice(0, 4).join(", ")}${a.length > 4 ? "…" : ""}`);
    if (m?.thay_the) p.push(`thay ${m.so_ke_hoach_cu} mốc cũ`);
  } else if (a?.planned_date) {
    // 3 loai ngay - xem lib/ngay.tsx; ghi ro "truoc -> sau" khi sua
    const doi = (k: string) => b && b[k] !== undefined && b[k] !== a[k] ? `${d(b[k]) || "—"} → ` : "";
    p.push(`Ngày dự kiến ${doi("planned_date")}${d(a.planned_date)}`);
    if (a.factory_committed_date || b?.factory_committed_date) p.push(`Ngày NM cam kết ${doi("factory_committed_date")}${d(a.factory_committed_date) || "—"}`);
    if (a.planned_qty) p.push(`SL ${b?.planned_qty != null && b.planned_qty !== a.planned_qty ? `${sl(b.planned_qty)} → ` : ""}${sl(a.planned_qty)}`);
  }
  if (e.event_type === "DELETE_PLAN" && b?.planned_date) p.push(`Xóa đợt — ngày dự kiến ${d(b.planned_date)} · SL ${sl(b.planned_qty)}`);
  if (e.event_type === "UPLOAD_FILE" && a?.file_name) p.push(a.file_name);
  if (e.event_type === "DELETE_FILE" && b?.file_name) p.push(b.file_name);
  if (e.event_type === "ADD_ITEM" && a?.part_code) p.push(`${a.part_code} · ${a.warehouse ?? ""} · SL ${sl(a.current_qty)}`);
  if (e.event_type === "IMPORT_ITEMS") p.push(`${m?.so_dong ?? ""} dòng`);
  if (e.event_type === "GIAI_TRINH_THEO_DOI" && a?.noi_dung) p.push(a.noi_dung);
  if (e.event_type === "UPDATE_EO" && a) p.push(Object.keys(a).join(", "));
  if (m?.comment) p.push(m.comment);
  if (m?.reason) p.push(`Lý do: ${m.reason}`);
  if (m?.ly_do) p.push(m.ly_do);
  return p.filter(Boolean).join(" · ");
}
