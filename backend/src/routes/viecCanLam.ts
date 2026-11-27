import { MAIL_DONG_BO_THEO_DONG } from "../lib/mailNhacDongBo";
import { Hono } from "hono";
import type { Env, AppVariables, AppUser } from "../types";
import { versionTag } from "../lib/dataVersions";
import { todayVN, nowVN } from "../lib/vnTime";
import { kyR3Tu, layDongTheoDoi, type DongTheoDoi } from "../lib/theoDoi";
import { canImportAmis, canEditPlan, isViewOnly, xemToanBoTheoDoi } from "../lib/eoAccess";
import { dvbhEnabled } from "../lib/dvbhSync";
import { CHO_DUYET_SAU_BH_SQL } from "../lib/choDuyetSauBh";

/**
 * GET /api/viec-can-lam - "viec can xu ly" theo vai tro: so dem hien sau ten menu (sidebar) + khung tong hop o Tong quan.
 * Moi muc: { key, to (duong dan menu), label, count, chi_tiet[] }. Ma tran vai tro x viec: xem ../THEO_DOI_LINH_KIEN_DAT.md
 * muc 4. Dem theo doi linh kien (nang) dung chi muc trong bo nho isolate, dung lai khi version eo/amis/settings/theo_doi
 * doi hoac sang moc 10 phut moi (trang thai tre 48h thay doi theo thoi gian).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type Gon = Pick<DongTheoDoi, "item_id" | "eo_id" | "nguoi_dat" | "kho" | "ap_dung" | "tinh_trang" | "so_loi_cho_gt" | "ceo_ly_do" | "co_ngay_du_kien">;
let cache: { tag: string; rows: Gon[] } | null = null;

async function dongTheoDoi(env: Env): Promise<Gon[]> {
  const tag = `${await versionTag(env.DB, ["eo", "amis", "settings", "theo_doi"])}|${nowVN().slice(0, 15)}`; // moc 10 phut
  if (cache?.tag === tag) return cache.rows;
  const rows = (await layDongTheoDoi(env, "dang_mo")).map((r) => ({
    item_id: r.item_id, eo_id: r.eo_id, nguoi_dat: r.nguoi_dat, kho: r.kho, ap_dung: r.ap_dung, tinh_trang: r.tinh_trang,
    so_loi_cho_gt: r.so_loi_cho_gt, ceo_ly_do: r.ceo_ly_do, co_ngay_du_kien: r.co_ngay_du_kien,
  }));
  cache = { tag, rows };
  return rows;
}

const TOAN_BO = xemToanBoTheoDoi;

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
       WHERE ${CHO_DUYET_SAU_BH_SQL("i")} AND e.trang_thai = 'ISSUED' AND e.final_approver_email = ?`,
    ).bind(u.email).first<{ n: number }>(),
  ]);
  if ((pa?.n ?? 0) + (pi?.n ?? 0) > 0) out.push({ key: "duyet", to: "/eo?chip=cho_toi_duyet", label: "Phiếu chờ bạn duyệt", count: (pa?.n ?? 0) + (pi?.n ?? 0),
    chi_tiet: [{ label: "Thẩm định / duyệt mua", count: pa?.n ?? 0 }, { label: "Dòng thêm sau ban hành", count: pi?.n ?? 0 }] });

  // 3 + 4. Theo doi linh kien dat / Canh bao CEO (chi dong ap dung quy tac)
  if (canEditPlan(u) || TOAN_BO(u)) {
    const khoCua = (u.khu_vuc_kho ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const cua = (r: Gon) => TOAN_BO(u) || r.nguoi_dat === u.email || (u.vai_tro === "Kho" && (khoCua.length === 0 || khoCua.includes(r.kho)));
    const cuaToi = (await dongTheoDoi(c.env)).filter(cua);
    const rows0 = cuaToi.filter((r) => r.ap_dung);
    // v0.113: dong dang "cho NCC bao ngay" (tl_lien_he.hen_lai >= hom nay) khong tinh la viec can lam - khop man Viec cua toi
    const canNgay = rows0.filter((r) => ["CHO_NDK", "TRE_NDK", "QUA_HAN_NDK"].includes(r.tinh_trang)).map((r) => r.item_id);
    const choNcc = new Set(canNgay.length ? (await db.prepare("SELECT DISTINCT eo_item_id FROM tl_lien_he WHERE hen_lai >= ? AND eo_item_id IN (SELECT value FROM json_each(?))")
      .bind(today, JSON.stringify(canNgay)).all<{ eo_item_id: number }>()).results.map((x) => x.eo_item_id) : []);
    const rows = rows0.filter((r) => !choNcc.has(r.item_id));
    const canNdk = rows.filter((r) => r.tinh_trang === "CHO_NDK" || r.tinh_trang === "TRE_NDK");
    const quaHan = rows.filter((r) => r.tinh_trang === "QUA_HAN_NDK");
    // loi cho giai trinh van tinh ca khi dong dang cho NCC; v0.120 ca dong PO truoc moc ap dung (loi R4 ton)
    const loiCho = cuaToi.filter((r) => r.so_loi_cho_gt > 0);
    const viec = new Set([...canNdk, ...quaHan, ...loiCho].map((r) => r.item_id));
    const chiTiet = [
      { label: "Cần nhập ngày dự kiến (8h/16h LV)", count: canNdk.length },
      { label: "Trong đó đã trễ hạn", count: canNdk.filter((r) => r.tinh_trang === "TRE_NDK").length },
      { label: "Quá ngày dự kiến — cần ngày mới", count: quaHan.length },
      { label: "Lỗi chờ giải trình (dòng)", count: loiCho.length },
      { label: "Đang chờ NCC báo ngày (không tính)", count: choNcc.size },
    ];
    if (dow === 1 || dow === 3) {
      const ids = rows.filter((r) => !r.co_ngay_du_kien).map((r) => r.item_id);
      const daNhac = ids.length ? (await db.prepare(
        `WITH nhac AS (
           ${MAIL_DONG_BO_THEO_DONG}
           UNION
           SELECT eo_item_id, substr(ngay_lien_he, 1, 10) d FROM tl_lien_he
         )
         SELECT DISTINCT eo_item_id FROM nhac WHERE d > ? AND d <= ? AND eo_item_id IN (SELECT value FROM json_each(?))`,
      ).bind(kyR3Tu(today), today, JSON.stringify(ids)).all<{ eo_item_id: number }>()).results : [];
      const daNhacIds = new Set(daNhac.map((r) => r.eo_item_id));
      const chuaNhac = ids.filter((id) => !daNhacIds.has(id));
      chiTiet.push({ label: "Cần push đối tác hôm nay", count: chuaNhac.length });
      chuaNhac.forEach((id) => viec.add(id));
    }
    if (viec.size) out.push({ key: "theo_doi", to: "/viec-cua-toi", label: "Linh kiện đặt cần xử lý", count: viec.size, chi_tiet: chiTiet.filter((x) => x.count > 0) });
    // v0.100: dem CA CEO = PO + loai ly do (gop dong) - khop man Ca ton CEO (lib/caCeo gomCaCeo)
    const ceo = rows.filter((r) => r.ceo_ly_do.length > 0);
    const caCua = (f: (x: string) => boolean) => new Set(ceo.filter((r) => r.ceo_ly_do.some(f)).map((r) => r.eo_id)).size;
    const lui = caCua((x) => x.startsWith("Lùi")), xa = caCua((x) => x.includes("ngày đặt")), loi = caCua((x) => x.endsWith("lỗi"));
    if (ceo.length) out.push({ key: "ceo", to: "/ca-ceo", label: "PO tồn CEO", count: lui + xa + loi,
      chi_tiet: [
        { label: "Lùi ngày dự kiến ≥ 3 lần", count: lui },
        { label: "Ngày DK ≥ 30 ngày sau ngày đặt", count: xa },
        { label: "≥ 3 lỗi", count: loi },
      ].filter((x) => x.count > 0) });
  }

  // 4b. Vi pham CUA TOI chua giai trinh (nguoi vi pham = ai_email, mac dinh nguoi dat) -> man Vi pham & giai trinh
  const vp = await db.prepare(
    `SELECT COUNT(*) n, COUNT(DISTINCT l.eo_id) po FROM tl_loi l JOIN eo e ON e.id = l.eo_id
     WHERE l.trang_thai = 'CHO_GIAI_TRINH' AND (COALESCE(l.ai_email, e.created_by) = ?1 OR (e.created_by = ?1 AND l.quy_tac <> 'R5'))
       AND substr(COALESCE(e.issued_at, e.created_at), 1, 10) >= COALESCE((SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'), '2026-07-01')`,
  ).bind(u.email).first<{ n: number; po: number }>();
  if (vp?.n) out.push({ key: "vi_pham", to: "/vi-pham?xem=cua_toi&tt=cho", label: "Lỗi của bạn cần giải trình (còn hạn)", count: vp.n,
    chi_tiet: [{ label: "Số PO có lỗi (giải trình chung được cho cả PO)", count: vp.po }] });

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
