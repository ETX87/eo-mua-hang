export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  FRONTEND_URL: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  LOCAL_DEV_BYPASS_AUTH?: string;
  // Danh ba "ETX nhan su" (lib/etxNhanSu.ts). Base URL de trong vars, key qua "wrangler secret put".
  ETX_HR_BASE_URL: string;
  ETX_HR_API_KEY: string;
  // Day PO sang app DVBH (lib/dvbhSync.ts). Base URL de trong vars, key do DVBH cap (wrangler secret put
  // DVBH_API_KEY). DVBH = Service Binding toi Worker "dvbh" (thieu binding -> fetch URL, chi dung local).
  DVBH_BASE_URL?: string;
  DVBH_API_KEY?: string;
  DVBH?: Fetcher;
  // App "theo-doi-mua-hang" day luong mail ve POST /api/partner/mail-events (routes/partner.ts).
  THEODOI_MUAHANG_API_KEY?: string;
}

export type VaiTro = "Admin" | "KH cung ung" | "Ke toan" | "Kho" | "Theo doi tien do" | "View";

export interface AppUser {
  email: string;
  ho_ten: string;
  vai_tro: VaiTro | null;
  la_nv_dat_hang: number;
  la_nv_kho: number;
  la_ke_toan: number;
  la_theo_doi_td: number;
  la_view: number;
  khu_vuc_kho: string | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  active: number;
  ma_nhan_su: string | null;
  chuc_danh: string | null;
}

// Bien Hono context dung xuyen suot middleware/route
export type AppVariables = {
  requestId: string;
  email: string;
  user: AppUser;
};
