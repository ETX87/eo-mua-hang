import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { todayVN, nowVN } from "../lib/vnTime";
import { danhGiaQuyTac, kyR3Tu, layDongTheoDoi, GIO_TU_DONG, hanGiaiTrinh, type DongTheoDoi } from "../lib/theoDoi";
import { MAIL_DONG_BO_THEO_DONG } from "../lib/mailNhacDongBo";
import { canEditPlan, isViewOnly, xemToanBoTheoDoi } from "../lib/eoAccess";
import { congGioLV, demGioLV } from "../lib/gioLamViec";

/**
 * GET /api/viec-cua-toi (v0.104, yeu cau 2026-11-19: "voi vai tro 1 nhan vien, lam sao xac dinh viec can lam ... vao dau them ngay du kien
 * truoc khi bi tinh loi, vao dau push mail nhac nho? don gian de hieu, nhin cai hieu phai lam gi luon").
 * Man "Việc của tôi" (FE pages/ViecCuaToi.tsx): 4 viec theo dong LK, moi dong co HAN (gio lam viec con lai) + 1 nut lam ngay:
 *   ndk       chua co ngay du kien (R1) - han = han_ngay_du_kien
 *   push      thu 2 / thu 4: dong chua co ngay du kien chua duoc nhac NCC trong ky (R3) - han = 23:59 hom nay
 *   ngay_moi  qua ngay du kien chua ve du (R4) - han = han_cap_nhat_lai
 *   giai_trinh dong co loi cho giai trinh - han tu dong = han loi som nhat + GIO_TU_DONG gio LV
 *   cho_ncc   (v0.113) dong ndk / ngay_moi dang "Cho NCC bao ngay" (tl_lien_he.hen_lai >= hom nay) - khong do, han = ngay hen hoi lai
 * Pham vi: ?pham_vi=toi (mac dinh: dong minh dat / kho minh phu trach) | tat_ca (chi nguoi xem toan bo theo doi). Cung quy tac voi viecCanLam.
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type Viec = DongTheoDoi & { han: string | null; con_gio: number | null };

app.get("/", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  const toanBo = xemToanBoTheoDoi(u);
  const tatCa = toanBo && c.req.query("pham_vi") === "tat_ca";
  if (isViewOnly(u) && !toanBo) return c.json({ ndk: [], push: [], ngay_moi: [], giai_trinh: [], toan_bo: false });
  if (!canEditPlan(u) && !toanBo) return c.json({ ndk: [], push: [], ngay_moi: [], giai_trinh: [], toan_bo: false });
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const now = nowVN(), today = todayVN();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const khoCua = (u.khu_vuc_kho ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const cua = (r: DongTheoDoi) => tatCa || r.nguoi_dat === u.email || (u.vai_tro === "Kho" && (khoCua.length === 0 || khoCua.includes(r.kho)));
  const cuaToi = (await layDongTheoDoi(c.env, "dang_mo")).filter(cua);
  const rows = cuaToi.filter((r) => r.ap_dung);
  // gio LAM VIEC con lai den han (am = da tre)
  const conGio = (han: string | null) => (!han ? null : han >= now ? demGioLV(now, han) : -demGioLV(han, now));
  const gan = (r: DongTheoDoi, han: string | null): Viec => ({ ...r, han, con_gio: conGio(han) });
  const sapHan = (a: Viec, b: Viec) => String(a.han ?? "9").localeCompare(String(b.han ?? "9"));

  // v0.113: dong da ghi "NCC chua co ngay - hen hoi lai" con hieu luc -> nhom rieng "Dang cho NCC bao ngay", khong nam trong muc do
  const canNgay = rows.filter((r) => ["CHO_NDK", "TRE_NDK", "QUA_HAN_NDK"].includes(r.tinh_trang));
  const choNcc = canNgay.length ? new Map((await db.prepare(
    `SELECT eo_item_id, hen_lai, ket_qua, ngay_lien_he FROM tl_lien_he WHERE hen_lai >= ? AND eo_item_id IN (SELECT value FROM json_each(?))
     ORDER BY hen_lai`,
  ).bind(today, JSON.stringify(canNgay.map((r) => r.item_id))).all<{ eo_item_id: number; hen_lai: string; ket_qua: string; ngay_lien_he: string }>()).results
    .map((x) => [x.eo_item_id, x])) : new Map<number, { hen_lai: string; ket_qua: string; ngay_lien_he: string }>();
  const ndk = rows.filter((r) => (r.tinh_trang === "CHO_NDK" || r.tinh_trang === "TRE_NDK") && !choNcc.has(r.item_id)).map((r) => gan(r, r.han_ngay_du_kien)).sort(sapHan);
  const ngayMoi = rows.filter((r) => r.tinh_trang === "QUA_HAN_NDK" && !choNcc.has(r.item_id)).map((r) => gan(r, r.han_cap_nhat_lai)).sort(sapHan);
  const choNccDs = canNgay.filter((r) => choNcc.has(r.item_id)).map((r) => {
    const x = choNcc.get(r.item_id)!;
    return { ...gan(r, `${x.hen_lai} 17:00:00`), cho_ncc_ket_qua: x.ket_qua, cho_ncc_tu: x.ngay_lien_he };
  }).sort(sapHan);

  // R3: thu 2 / thu 4 - dong chua tung co ngay du kien, chua co mail dong bo / lien he trong ky
  let push: Viec[] = [];
  const ngayPush = dow === 1 || dow === 3;
  if (ngayPush) {
    // dong dang "cho NCC bao ngay" khong phai push (R3 tam dung toi ngay hen) - v0.113
    const ids = rows.filter((r) => !r.co_ngay_du_kien && r.bat_dau && r.bat_dau.slice(0, 10) < today && !choNcc.has(r.item_id)).map((r) => r.item_id);
    const daNhac = ids.length ? new Set((await db.prepare(
      `WITH nhac AS (${MAIL_DONG_BO_THEO_DONG} UNION SELECT eo_item_id, substr(ngay_lien_he, 1, 10) d FROM tl_lien_he)
       SELECT DISTINCT eo_item_id FROM nhac WHERE d > ? AND d <= ? AND eo_item_id IN (SELECT value FROM json_each(?))`,
    ).bind(kyR3Tu(today), today, JSON.stringify(ids)).all<{ eo_item_id: number }>()).results.map((r) => r.eo_item_id)) : new Set<number>();
    push = rows.filter((r) => ids.includes(r.item_id) && !daNhac.has(r.item_id)).map((r) => gan(r, `${today} 23:59:59`));
  }
  // ngay push ke tiep (thu 2 / thu 4) de nhac truoc
  const sau = new Date(`${today}T00:00:00Z`);
  do sau.setUTCDate(sau.getUTCDate() + 1); while (![1, 3].includes(sau.getUTCDay()));

  // giai trinh: han tu dong = loi cho som nhat + GIO_TU_DONG gio LV
  // v0.120: ca dong cua PO ban hanh truoc moc ap dung (co loi R4 ton tu lib/theoDoi) - giai trinh duoc o day
  const coLoi = cuaToi.filter((r) => r.so_loi_cho_gt > 0);
  const mocLoi = coLoi.length ? new Map((await db.prepare(
    `SELECT eo_item_id, MIN(COALESCE(han, created_at)) moc, GROUP_CONCAT(DISTINCT quy_tac) qt FROM tl_loi
     WHERE trang_thai = 'CHO_GIAI_TRINH' AND eo_item_id IN (SELECT value FROM json_each(?)) GROUP BY eo_item_id`,
  ).bind(JSON.stringify(coLoi.map((r) => r.item_id))).all<{ eo_item_id: number; moc: string; qt: string }>()).results.map((x) => [x.eo_item_id, x])) : new Map();
  const giaiTrinh = coLoi.map((r) => { const m = mocLoi.get(r.item_id); return { ...gan(r, m ? hanGiaiTrinh(m.moc) : null), loi_qt_cho: m?.qt ?? "" }; }).sort(sapHan);

  return c.json({
    ndk, push, ngay_moi: ngayMoi, giai_trinh: giaiTrinh, cho_ncc: choNccDs,
    ngay_push: ngayPush, ngay_push_ke: sau.toISOString().slice(0, 10), hom_nay: today, luc: now,
    toan_bo: toanBo, pham_vi: tatCa ? "tat_ca" : "toi", gio_tu_dong: GIO_TU_DONG,
  });
});

export default app;
