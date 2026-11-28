import { I } from "./icons";

/** Menu cap 2 (v0.129): giai doan / nhom con cua 1 menu phu. dem = khoa so dem (xem AppShell demCua); anRong = an khi dem = 0. */
export interface NavCap2 { to: string; label: string; dem?: string; anRong?: boolean }
/** Menu phu cap 1. to co ?query: active khi moi tham so trong to khop URL. con = menu cap 2 (chi hien duoi menu cap 1 dang chon). */
export interface NavCon { to: string; label: string; icon: keyof typeof I; dem?: string; demDo?: boolean; con?: NavCap2[] }
export interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof I;
  section?: string;
  badgeKey?: "approvals";
  /** backend chan bang requireAdmin -> an voi vai tro khac */
  adminOnly?: boolean;
  /** menu phu cap 1 (menu goc = nhom; bam ten menu goc = mo trang dau + xo / thu nhom) */
  children?: NavCon[];
}

/**
 * Cap 2 cua cac nhom PO = MOC TIEN TRINH PO (backend routes/eo.ts MOC_PO / mocPo): bam = /eo?chip=..&moc=G.. -> danh sach Don PO
 * tu loc cot "Tiến trình". So dem: GET /api/eo/dem theo_moc[chip][moc]. Nhom "Theo PO" dung chip tat_ca (gom ca PO da xong / huy).
 */
export const MOC_PO_MENU: { k: string; l: string }[] = [
  { k: "G1", l: "G1 · Lập (nháp / trả về)" }, { k: "G2", l: "G2 · Thẩm định" }, { k: "G3", l: "G3 · Duyệt mua" },
  { k: "G5", l: "G5 · Chờ ngày DK" }, { k: "G6", l: "G6 · Chờ hàng" }, { k: "G8", l: "G8 · Giao bù đến đủ" },
  { k: "XONG", l: "✓ Đủ hàng" }, { k: "TU_CHOI", l: "Từ chối" }, { k: "DA_HUY", l: "Đã hủy" },
];
const mocCua = (chip: string, anRong: boolean, chi?: string[]): NavCap2[] =>
  MOC_PO_MENU.filter((m) => !chi || chi.includes(m.k)).map((m) => ({ to: `/eo?chip=${chip}&moc=${m.k}`, label: m.l, dem: `${chip}:${m.k}`, anRong }));
/** Cap 2 "Theo LK" = 8 giai doan cua dong linh kien (backend lib/giaiDoan) - /don-hang?gd=G.. */
const GD_LK: NavCap2[] = [
  ["G1", "Lập & trình EO"], ["G2", "Thẩm định"], ["G3", "Duyệt mua & ban hành"], ["G4", "Gửi đơn NCC"], ["G5", "Chờ ngày DK"],
  ["G6", "Chờ giao hàng"], ["G7", "Nhập kho"], ["G8", "Giao bù đến đủ"],
].map(([k, l]) => ({ to: `/don-hang?gd=${k}`, label: `${k} · ${l}` }));
/** Cap 2 cua menu Vi pham = BUOC / loai loi (quy tac) - /vi-pham?..&qt=R.. */
const QT_VP: [string, string][] = [["R5", "G2–G3 · Chậm duyệt"], ["R3", "G4 · Không thúc NCC"], ["R1", "G5 · Chưa có ngày DK"], ["R4", "G6 · Quá ngày DK"], ["TAY", "Lỗi ghi tay"]];
const qtCua = (base: string, chi?: string[]): NavCap2[] =>
  QT_VP.filter(([k]) => !chi || chi.includes(k)).map(([k, l]) => ({ to: `${base}${base.includes("?") ? "&" : "?"}qt=${k}`, label: l }));

/** Cap 2 "Lỗi theo PO": giai doan phat sinh loi (gd = buoc cua ma loi) + ma loi theo ben chiu (an khi = 0 lan). */
const GD_TEN_LOI: [string, string][] = [["G1", "Lập EO"], ["G2", "Thẩm định"], ["G3", "Duyệt mua"], ["G4", "Gửi / thúc NCC"], ["G5", "Chờ ngày DK"], ["G6", "Chờ giao hàng"], ["G7", "Nhập kho"], ["G8", "Giao bù"]];
const GD_LOI: NavCap2[] = GD_TEN_LOI.map(([k, l]) => ({ to: `/loi-po?xem=gd&gd=${k}`, label: `${k} · ${l}`, dem: `loi:gd|${k}`, anRong: true }));
/** v0.156 (chu he thong 28/11 "duoi menu phu can giai trinh => menu phu cap 2: theo giai doan"): G1..G8 chi dem loi CHO giai trinh (khoa "loi:CHO|gd|Gx"). */
const GD_LOI_CHO: NavCap2[] = GD_TEN_LOI.map(([k, l]) => ({ to: `/loi-po?tt=CHO&gd=${k}`, label: `${k} · ${l}`, dem: `loi:CHO|gd|${k}`, anRong: true }));
const MA_LOI_MENU: [string, string][] = [
  ["ER.MH-001", "001 · Chưa có ngày DK (8h)"], ["ER.MH-002", "002 · Chưa có ngày DK (16h)"], ["ER.MH-003", "003 · Không thúc NCC"],
  ["ER.MH-004", "004 · Quá ngày DK"], ["ER.MH-005", "005 · Chậm duyệt"], ["ER.MH-101", "101 · NCC không phản hồi"], ["ER.MH-102", "102 · NCC báo trễ"],
  ["ER.MH-103", "103 · NCC hết hàng"], ["ER.MH-104", "104 · Đặt sai"], ["ER.MH-105", "105 · Chậm duyệt (ghi tay)"], ["ER.MH-199", "199 · Lỗi khác"],
];
const maLoiCua = (ben: "NCC" | "NOI_BO"): NavCap2[] =>
  MA_LOI_MENU.map(([ma, l]) => ({ to: `/loi-po?ben=${ben}&ma=${ma}`, label: l, dem: `loi:${ben}|${ma}`, anRong: true }));

export const NAV: NavItem[] = [
  // Viec cua toi (v0.104): nhan vien nhin 1 lan biet phai lam gi truoc han nao - backend routes/viecCuaToi.ts (so do = viecCanLam theo_doi)
  { to: "/viec-cua-toi", label: "Việc của tôi", icon: "check" },
  // v0.138 (Giam doc 2026-11-27 "1s phai biet ngay mac loi gi, loi doi tac / noi bo, loc theo ma loi"): 1 man duy nhat - PO / LK / ma loi / ai loi
  // v0.142 (chu he thong 2026-11-27 "loi theo PO cung chia theo cac menu phu"): menu phu = cach xem / nhom loi, cap 2 = giai doan / ma loi.
  // So dem = so LAN loi (GET /api/loi-po/dem, khoa "loi:..." - AppShell demCua). Bam = /loi-po?... (man tu loc theo URL).
  { to: "/loi-po", label: "Lỗi theo PO", icon: "trend", children: [
    { to: "/loi-po", label: "Theo PO", icon: "clipboard", dem: "loi:" },
    // v0.155: bieu do "Loi theo giai doan" thanh menu phu rieng, cap 2 = G1..G8 (truoc nam duoi "Theo PO")
    { to: "/loi-po?xem=gd", label: "Theo giai đoạn", icon: "trend", con: GD_LOI },
    { to: "/loi-po?xem=lk", label: "Theo linh kiện", icon: "list" },
    { to: "/loi-po?xem=ma", label: "Theo mã lỗi", icon: "tag" },
    { to: "/loi-po?xem=ai", label: "Theo ai lỗi", icon: "users" },
    { to: "/loi-po?ben=NCC", label: "Lỗi đối tác", icon: "user", dem: "loi:NCC", con: maLoiCua("NCC") },
    { to: "/loi-po?ben=NOI_BO", label: "Lỗi nội bộ", icon: "home", dem: "loi:NOI_BO", con: maLoiCua("NOI_BO") },
    { to: "/loi-po?tt=CHO", label: "Cần giải trình", icon: "edit", dem: "loi:CHO", demDo: true, con: GD_LOI_CHO },
    { to: "/loi-po?tt=VI_PHAM", label: "Vi phạm (hết hạn)", icon: "x", dem: "loi:VI_PHAM" },
  ] },
  // v0.133: Tong quan = 3 menu phu, moi menu 1 man rieng (chu he thong: "chon menu phu nhung bao cao khong thay doi -> tach rieng"):
  // Tong quan (viec cua ban + bang dieu khien + xu huong) · Dieu hanh (cap 2 = tab ?tab=, doi dung noi dung chinh) · Bao cao dat LK.
  { to: "/", label: "Tổng quan", icon: "home", children: [
    { to: "/", label: "Tổng quan", icon: "home" },
    { to: "/dieu-hanh", label: "Điều hành", icon: "trend", con: [
      { to: "/dieu-hanh?tab=tong", label: "Kết luận & sức khoẻ" }, { to: "/dieu-hanh?tab=bang", label: "Trách nhiệm NCC / nội bộ" }, { to: "/dieu-hanh?tab=nong", label: "Điểm nóng" },
      { to: "/dieu-hanh?tab=po", label: "Theo PO" }, { to: "/dieu-hanh?tab=nguoi", label: "Theo người" }, { to: "/dieu-hanh?tab=ncc", label: "Theo NCC" },
      { to: "/dieu-hanh?tab=nn", label: "Nguyên nhân & xu hướng" }, { to: "/dieu-hanh?tab=duyet", label: "Duyệt đang treo" },
    ] },
    { to: "/don-hang?tab=bao-cao", label: "Báo cáo đặt LK", icon: "trend", con: [
      { to: "/don-hang?tab=bao-cao&bc=giai-doan", label: "Giai đoạn đơn hàng" },
      { to: "/don-hang?tab=bao-cao&bc=tien-do-tuan", label: "Tiến độ tuần (KH KRF)" },
      { to: "/don-hang?tab=bao-cao&bc=luy-ke-nam", label: "Lũy kế năm" },
    ] },
  ] },
  // v0.129: "Đơn PO" = menu goc; menu phu = cach xem / nhom PO, cap 2 = giai doan. Gop menu "LK đặt" (Theo LK) + "Ca tồn CEO" (PO tồn CEO) vao day.
  { to: "/eo", label: "Đơn PO", icon: "clipboard", children: [
    { to: "/eo", label: "Theo PO", icon: "clipboard", dem: "con_ton", con: mocCua("tat_ca", false) },
    { to: "/don-hang", label: "Theo LK", icon: "list", con: GD_LK },
    { to: "/eo?chip=cho_toi_duyet", label: "PO chờ tôi", icon: "check", dem: "cho_toi_duyet", demDo: true, con: mocCua("cho_toi_duyet", true) },
    // Ca ton CEO (v0.091) -> doi ten "PO tồn CEO" (v0.129); cap 2 = 3 ma CEO
    { to: "/ca-ceo", label: "PO tồn CEO", icon: "shield", dem: "po_ceo", demDo: true, con: [
      { to: "/ca-ceo?ma=ER.MH-201", label: "201 · Lùi ngày DK ≥ 3 lần" }, { to: "/ca-ceo?ma=ER.MH-202", label: "202 · Ngày DK ≥ 30 ngày" },
      { to: "/ca-ceo?ma=ER.MH-203", label: "203 · ≥ 3 lỗi" },
    ] },
    { to: "/eo?chip=po_do", label: "PO cảnh báo", icon: "bell", dem: "po_do", demDo: true, con: mocCua("po_do", true) },
    { to: "/eo?chip=loi_doi_tac", label: "Lỗi đối tác", icon: "user", dem: "loi_doi_tac", con: mocCua("loi_doi_tac", true) },
    { to: "/eo?chip=loi_noi_bo", label: "Lỗi nội bộ", icon: "home", dem: "loi_noi_bo", con: mocCua("loi_noi_bo", true) },
  ] },
  // Vi pham & giai trinh (2026-11-04) - backend routes/viPham.ts. v0.129: menu phu = trang thai / ben chiu, cap 2 = buoc (loai loi)
  { to: "/vi-pham", label: "Vi phạm & GT", icon: "bell", children: [
    { to: "/vi-pham", label: "Cần giải trình", icon: "edit", con: qtCua("/vi-pham?tt=cho") },
    { to: "/vi-pham?tt=vi_pham", label: "Vi phạm (hết hạn)", icon: "x", con: qtCua("/vi-pham?tt=vi_pham") },
    { to: "/vi-pham?tt=xl", label: "Đã xử lý", icon: "check", con: qtCua("/vi-pham?tt=xl") },
    { to: "/vi-pham?ben=NCC", label: "Lỗi đối tác", icon: "user", con: qtCua("/vi-pham?ben=NCC", ["R1", "R4", "TAY"]) },
    { to: "/vi-pham?ben=NOI_BO", label: "Lỗi nội bộ", icon: "home", con: qtCua("/vi-pham?ben=NOI_BO", ["R5", "R3", "TAY"]) },
    { to: "/vi-pham?kieu=ma", label: "Tổng hợp theo mã lỗi", icon: "trend" },
    // Bang ma loi ER.MH (v0.092)
    { to: "/ma-loi", label: "Bảng mã lỗi", icon: "tag" },
  ] },
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
  WAITING_FINAL_APPROVAL: { label: "Chờ duyệt mua", cls: "final" },
  ISSUED: { label: "Đã ban hành", cls: "issued" },
  // trang thai TINH (2026-11-08): da ban hanh + moi dong song ve >= SL dat -> du hang (backend routes/eo xong)
  DONE: { label: "Đủ hàng (DONE)", cls: "issued" },
  REJECTED: { label: "Từ chối", cls: "reject" },
  CANCELLED: { label: "Đã hủy", cls: "reject" },
};
