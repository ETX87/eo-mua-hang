import { Hono } from "hono";
import type { Env, AppVariables, AppUser } from "../types";
import { versionTag } from "../lib/dataVersions";
import { todayVN, nowVN } from "../lib/vnTime";
import { layDongTheoDoi, type DongTheoDoi } from "../lib/theoDoi";
import { canImportAmis, canEditPlan, isViewOnly } from "../lib/eoAccess";
import { dvbhEnabled } from "../lib/dvbhSync";

/**
 * GET /api/viec-can-lam - "viec can xu ly" theo vai tro: so dem hien sau ten menu (sidebar) + khung tong hop o Tong quan.
 * Moi muc: { key, to (duong dan menu), label, count, chi_tiet[] }. Ma tran vai tro x viec: xem ../THEO_DOI_LINH_KIEN_DAT.md
 * muc 4. Dem theo doi linh kien (nang) dung chi muc trong bo nho isolate, dung lai khi version eo/amis/settings/theo_doi
 * doi hoac sang moc 10 phut moi (trang thai tre 24h thay doi theo thoi gian).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type Gon = Pick<DongTheoDoi, "item_id" | "nguoi_dat" | "kho" | "ap_dung" | "tinh_trang" | "so_loi_cho_gt" | "ceo_ly_do" | "co_ngay_du_kien">;
let cache: { tag: string; rows: Gon[] } | null = null;

async function dongTheoDoi(env: Env): Promise<Gon[]> {
  const tag = `${await versionTag(env.DB, ["eo", "amis", "settings", "theo_doi"])}|${nowVN().slice(0, 15)}`; // moc 10 phut
  if (cache?.tag === tag) return cache.rows;
  const rows = (await layDongTheoDoi(env, "dang_mo")).map((r) => ({
    item_id: r.item_id, nguoi_dat: r.nguoi_dat, kho: r.kho, ap_dung: r.ap_dung, tinh_trang: r.tinh_trang,
    so_loi_cho_gt: r.so_loi_cho_gt, ceo_ly_do: r.ceo_ly_do, co_ngay_du_kien: r.co_ngay_du_kien,
  }));
  cache = { tag, rows };
  return rows;
}

const TOAN_BO = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "KH cung ung" || u.vai_tro === "Theo doi tien do";

interface Muc { key: string; to: string; label: string; count: number; chi_tiet?: { label: string; count: number }[] }

app.get("/", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  const out: Muc[] = [];
  if (isViewOnly(u)) return c.json({ items: out, tong: 0 });
  const today = todayVN();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();

  // 1. EO nhap / bi tra ve cua toi
  const nhap = await db.prepare(
    `SELECT COUNT(*) n, SUM(EXISTS (SELECT 1 FROM eo_submission s WHERE s.eo_id = e.id)) tra_ve
     FROM eo e WHERE e.trang_thai = 'DRAFT' AND e.created_by = ?`,
  ).bind(u.email).first<{ n: number; tra_ve: number }>();
  if (nhap?.n) out.push({ key: "eo_nhap", to: "/eo?chip=nhap_cua_toi", label: "EO nháp / bị trả về chờ gửi trình", count: nhap.n,
    chi_tiet: [{ label: "Bị trả về / rút về sửa", count: nhap.tra_ve ?? 0 }, { label: "Nháp chưa gửi", count: nhap.n - (nhap.tra_ve ?? 0) }] });

  // 2. Viec can duyet (giong /approvals/count)
  const [pa, pi] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) n FROM eo_approval a JOIN eo_submission s ON s.id = a.submission_id
       WHERE a.approver_email = ? AND a.status = 'PENDING' AND s.status = 'PENDING'`,
    ).bind(u.email).first<{ n: number }>(),
    db.prepare(
      `SELECT COUNT(*) n FROM eo_item i JOIN eo e ON e.id = i.eo_id
       WHERE i.post_issue_status = 'PENDING' AND e.trang_thai = 'ISSUED' AND e.final_approver_email = ?`,
    ).bind(u.email).first<{ n: number }>(),
  ]);
  if ((pa?.n ?? 0) + (pi?.n ?? 0) > 0) out.push({ key: "duyet", to: "/eo?chip=cho_toi_duyet", label: "Phiếu chờ bạn duyệt", count: (pa?.n ?? 0) + (pi?.n ?? 0),
    chi_tiet: [{ label: "Thẩm định / duyệt cuối", count: pa?.n ?? 0 }, { label: "Dòng thêm sau ban hành", count: pi?.n ?? 0 }] });

  // 3 + 4. Theo doi linh kien dat / Canh bao CEO (chi dong ap dung quy tac)
  if (canEditPlan(u) || TOAN_BO(u)) {
    const khoCua = (u.khu_vuc_kho ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const cua = (r: Gon) => TOAN_BO(u) || r.nguoi_dat === u.email || (u.vai_tro === "Kho" && (khoCua.length === 0 || khoCua.includes(r.kho)));
    const rows = (await dongTheoDoi(c.env)).filter((r) => r.ap_dung && cua(r));
    const canNdk = rows.filter((r) => r.tinh_trang === "CHO_NDK" || r.tinh_trang === "TRE_NDK");
    const quaHan = rows.filter((r) => r.tinh_trang === "QUA_HAN_NDK");
    const loiCho = rows.filter((r) => r.so_loi_cho_gt > 0);
    const viec = new Set([...canNdk, ...quaHan, ...loiCho].map((r) => r.item_id));
    const chiTiet = [
      { label: "Cần nhập ngày dự kiến (24h)", count: canNdk.length },
      { label: "Trong đó đã trễ 24h", count: canNdk.filter((r) => r.tinh_trang === "TRE_NDK").length },
      { label: "Quá ngày dự kiến — cần ngày mới", count: quaHan.length },
      { label: "Lỗi chờ giải trình (dòng)", count: loiCho.length },
    ];
    if (dow === 1 || dow === 3) {
      const ids = rows.filter((r) => !r.co_ngay_du_kien).map((r) => r.item_id);
      let chuaPush = 0;
      if (ids.length) {
        const p = await db.prepare(
          "SELECT COUNT(DISTINCT eo_item_id) n FROM tl_push_item WHERE ngay = ? AND eo_item_id IN (SELECT value FROM json_each(?))",
        ).bind(today, JSON.stringify(ids)).first<{ n: number }>();
        chuaPush = ids.length - (p?.n ?? 0);
      }
      chiTiet.push({ label: "Cần push đối tác hôm nay", count: chuaPush });
      ids.forEach((id) => viec.add(id));
    }
    if (viec.size) out.push({ key: "theo_doi", to: "/don-hang?nhom=can_xl", label: "Linh kiện đặt cần xử lý", count: viec.size, chi_tiet: chiTiet.filter((x) => x.count > 0) });
    const ceo = rows.filter((r) => r.ceo_ly_do.length > 0);
    if (ceo.length) out.push({ key: "ceo", to: "/don-hang?nhom=CEO", label: "Đơn hàng cấp CEO", count: ceo.length,
      chi_tiet: [
        { label: "Lùi ngày dự kiến ≥ 3 lần", count: ceo.filter((r) => r.ceo_ly_do.some((x) => x.startsWith("Lùi"))).length },
        { label: "Ngày DK ≥ 30 ngày sau ngày đặt", count: ceo.filter((r) => r.ceo_ly_do.some((x) => x.includes("ngày đặt"))).length },
        { label: "≥ 3 lỗi", count: ceo.filter((r) => r.ceo_ly_do.some((x) => x.endsWith("lỗi"))).length },
      ].filter((x) => x.count > 0) });
  }

  // 5. Nhap AMIS hom nay (Ke toan / Admin), bo Chu nhat
  if (canImportAmis(u) && dow !== 0) {
    const last = await db.prepare("SELECT MAX(imported_at) t FROM amis_import_batch WHERE cancelled_at IS NULL").first<{ t: string | null }>();
    if (!last?.t || last.t.slice(0, 10) < today) out.push({ key: "amis_nhap", to: "/amis", label: "Chưa nhập AMIS hôm nay", count: 1,
      chi_tiet: [{ label: `Lần nhập gần nhất: ${last?.t ? last.t.slice(0, 16) : "chưa có"}`, count: 1 }] });
  }
  // 6. AMIS co ma EO nhung khong khop dong
  if (canImportAmis(u) || u.vai_tro === "KH cung ung") {
    const r = await db.prepare("SELECT COUNT(*) n FROM amis_receipt WHERE match_status = 'CODE_ONLY_NO_LINE' AND voided_at IS NULL").first<{ n: number }>();
    if (r?.n) out.push({ key: "amis_khong_eo", to: "/amis?tab=chua-khop", label: "Chứng từ AMIS có mã EO nhưng không khớp dòng", count: r.n });
  }
  // 7 + 8. Admin
  if (u.vai_tro === "Admin") {
    const r = await db.prepare("SELECT COUNT(*) n FROM users WHERE trang_thai_duyet = 'Cho duyet'").first<{ n: number }>();
    if (r?.n) out.push({ key: "nguoi_dung", to: "/admin/users", label: "Tài khoản chờ duyệt", count: r.n });
    const ch: { label: string; count: number }[] = [];
    const drive = await db.prepare("SELECT 1 x FROM google_drive_oauth WHERE id = 1").first();
    if (!drive) ch.push({ label: "Chưa kết nối Google Drive (đính kèm, ảnh giải trình)", count: 1 });
    if (dvbhEnabled(c.env)) {
      const s = await db.prepare("SELECT last_error FROM dvbh_sync_state WHERE id = 1").first<{ last_error: string | null }>();
      if (s?.last_error) ch.push({ label: "Đồng bộ DVBH đang lỗi", count: 1 });
    }
    if (ch.length) out.push({ key: "cau_hinh", to: "/admin/cau-hinh", label: "Cấu hình hệ thống cần xử lý", count: ch.length, chi_tiet: ch });
  }
  return c.json({ items: out, tong: out.reduce((s, x) => s + x.count, 0) });
});

export default app;
