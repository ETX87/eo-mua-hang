import { I } from "./icons";

export interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof I;
  section?: string;
  badgeKey?: "approvals";
  /** backend chan bang requireAdmin -> an voi vai tro khac */
  adminOnly?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Tổng quan", icon: "home" },
  // Quan ly EO gop: Danh sach EO, Viec can duyet, trang Chi tiet EO (popup)
  { to: "/eo", label: "Quản lý EO", icon: "clipboard" },
  // Quan ly don hang gop: Theo doi LK dat, So don hang, Canh bao CEO, Ke hoach hang ve / tuan, 3 bao cao (../UI_GOP_2_MAN_HINH.md)
  { to: "/don-hang", label: "Quản lý đơn hàng", icon: "list" },
  { to: "/amis", label: "Nhập AMIS", icon: "upload" },

  { to: "/admin/users", label: "Người dùng", icon: "user", section: "CÀI ĐẶT", adminOnly: true },
  { to: "/admin/roles", label: "Phân quyền", icon: "shield", adminOnly: true },
  { to: "/admin/danh-muc", label: "Danh mục", icon: "tag", adminOnly: true },
  { to: "/admin/cau-hinh", label: "Cấu hình hệ thống", icon: "gear", adminOnly: true },
];

export const PHONG_BAN = ["Phòng Tác Ngiệp KD", "Phòng kế hoạch cung ứng", "Kho vận Miền Bắc", "Kho vận Miền Nam", "Phòng tài chính kế toán"];

/** Phong ban kho van -> kho dat hang co dinh: chon phong ban la tu gan kho cho moi dong moi, khong phai chon tay. */
export const KHO_THEO_PHONG_BAN: Record<string, string> = {
  "Kho vận Miền Bắc": "Kho 6804 - Nguyễn Hữu Thọ",
  "Kho vận Miền Nam": "Kho 6803 - Q2 HCM",
};

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Nháp", cls: "nhap" },
  IN_REVIEW: { label: "Đang thẩm định", cls: "review" },
  WAITING_FINAL_APPROVAL: { label: "Chờ duyệt cuối", cls: "final" },
  ISSUED: { label: "Đã ban hành", cls: "issued" },
  REJECTED: { label: "Từ chối", cls: "reject" },
  CANCELLED: { label: "Đã hủy", cls: "reject" },
};
