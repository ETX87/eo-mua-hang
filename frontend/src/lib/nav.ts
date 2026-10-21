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
  { to: "/eo", label: "Danh sách EO", icon: "clipboard" },
  { to: "/approvals", label: "Việc cần duyệt", icon: "bell", badgeKey: "approvals" },
  { to: "/theo-doi", label: "Theo dõi linh kiện đặt", icon: "list" },
  { to: "/canh-bao-ceo", label: "Cảnh báo CEO", icon: "shield" },
  { to: "/plans", label: "Kế hoạch hàng về", icon: "trend" },
  { to: "/plans/tuan", label: "Kế hoạch tuần (KRF)", icon: "calendar" },
  { to: "/amis", label: "Nhập AMIS", icon: "upload" },

  { to: "/reports/tien-do-don-hang", label: "Tiến độ đơn hàng", icon: "trend", section: "BÁO CÁO" },
  { to: "/reports/amis-khong-eo", label: "AMIS không EO", icon: "clock" },
  { to: "/reports/tien-do-tuan", label: "Tiến độ tuần", icon: "calendar" },
  { to: "/reports/luy-ke-nam", label: "Lũy kế năm", icon: "grid" },

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
