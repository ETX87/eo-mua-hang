import type { AppUser } from "../types";

/**
 * Quyen HANH DONG tren EO (xem: khong gioi han - moi tai khoan da duyet deu xem duoc, xem
 * PERMISSION_SPEC.md). Cac ham duoi tra ve boolean, route tu tra 403.
 */

export function canCreateEo(u: AppUser): boolean {
  return u.vai_tro === "Admin" || u.vai_tro === "KH cung ung" || u.la_nv_dat_hang === 1 || u.la_nv_kho === 1;
}

/** Creator cua EO (hoac KH cung ung / Admin) - sua draft, submit, cancel, sua so luong, them dong. */
export function canManageEo(u: AppUser, eo: { created_by: string }): boolean {
  return u.vai_tro === "Admin" || u.vai_tro === "KH cung ung" || eo.created_by === u.email;
}

/** CRUD item_plan (PERMISSION_SPEC muc 2): creator, NV dat hang/kho, KH cung ung, Kho/Theo doi TD, Admin. Ke toan & View: khong. */
export function canEditPlan(u: AppUser, eo?: { created_by: string }): boolean {
  if (isViewOnly(u)) return false;
  if (eo && eo.created_by === u.email) return true;
  return (
    u.vai_tro === "Admin" || u.vai_tro === "KH cung ung" || u.vai_tro === "Kho" || u.vai_tro === "Theo doi tien do" ||
    u.la_nv_dat_hang === 1 || u.la_nv_kho === 1 || u.la_theo_doi_td === 1
  );
}

export function isViewOnly(u: AppUser): boolean {
  return (
    u.vai_tro === "View" ||
    (u.la_view === 1 &&
      u.la_nv_dat_hang === 0 &&
      u.la_nv_kho === 0 &&
      u.la_ke_toan === 0 &&
      u.la_theo_doi_td === 0)
  );
}

/** Xem / quan ly theo doi linh kien dat & vi pham cua TOAN BO don (khong chi don cua minh / kho minh). */
export function xemToanBoTheoDoi(u: AppUser): boolean {
  return u.vai_tro === "Admin" || u.vai_tro === "KH cung ung" || u.vai_tro === "Theo doi tien do";
}

/**
 * Sua ma LK / kho / doi tac cua dong dat (POST /eo/items/:id/sua-thong-tin, 2026-11-08): ke toan, mua hang (KH cung ung, NV dat hang),
 * nguoi tao PO, Admin. Dieu kien PO chua ket thuc hoan toan kiem o route. FE pages/eo/eoActions quyenEo().canSuaThongTin dong bo tay.
 */
export function canSuaThongTinDong(u: AppUser, eo: { created_by: string }): boolean {
  if (isViewOnly(u)) return false;
  return u.vai_tro === "Admin" || u.vai_tro === "KH cung ung" || u.vai_tro === "Ke toan" || u.la_ke_toan === 1 || u.la_nv_dat_hang === 1 || eo.created_by === u.email;
}

export function canImportAmis(u: AppUser): boolean {
  return u.vai_tro === "Admin" || u.vai_tro === "Ke toan" || u.la_ke_toan === 1;
}
