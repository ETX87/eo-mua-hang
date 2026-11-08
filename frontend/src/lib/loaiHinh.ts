/**
 * Y nghia Loai hinh EO = "Loại hình cấp 2" o Cai dat › Danh muc › Loai hinh EO (settings_eo_category.cap2), vd
 * "PO.D101.KRF & Livotec nước" -> "Đơn PS - Kho" (2026-11-08). Nap 1 lan o App (GET /danh-muc/loai-hinh) -> datLoaiHinh.
 */
let YN: Record<string, string> = {};
export function datLoaiHinh(ds: { code: string; cap2?: string | null }[]) {
  YN = Object.fromEntries(ds.filter((c) => c.cap2?.trim()).map((c) => [c.code.trim(), c.cap2!.trim()]));
}
export const yNghiaLoaiHinh = (code: string | null | undefined) => (code ? YN[String(code).trim()] ?? "" : "");
