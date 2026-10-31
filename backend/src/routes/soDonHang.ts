import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { cachedReport } from "../lib/reportCache";
import { computeTienDo01 } from "./reports";
import { layGiaiDoan, GIAI_DOAN } from "../lib/giaiDoan";
import { layDongTheoDoi, danhGiaQuyTac } from "../lib/theoDoi";

/**
 * GET /api/so-don-hang[?eo_id=] - "So don hang": moi dong linh kien (ke ca chua ban hanh / dong / huy) = bao cao 0.1
 * + thong tin EO (phong ban, tieu de, nguoi tao) + don gia + ngay NM cam ket + loi theo doi + 8 GIAI DOAN (lib/giaiDoan).
 * + chi so THEO DOI (lib/theoDoi: tinh trang quy tac, han ngay DK, so lan lui, cap CEO...) cho dong EO da ban hanh
 * thuoc pham vi theo doi (theo_doi = true) - man "Quan ly don hang" dung 1 nguon nay cho ca xem lan thao tac.
 * Loc / chon cot / xuat Excel lam o FE (du lieu da cache, ~0.3s).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/", async (c) => {
  const db = c.env.DB;
  const eoId = Number(c.req.query("eo_id")) || null;
  // danh gia quy tac (toi da 10 phut/lan) truoc khi doc - nhu GET /theo-doi/danh-sach
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const [base, gd, them, td, st] = await Promise.all([
    cachedReport(db, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(c.env)),
    layGiaiDoan(c.env),
    cachedReport(db, "rep:so-don-hang-them", ["eo", "theo_doi"], async () => {
      const [eo, it, nm, loi] = await Promise.all([
        db.prepare("SELECT id, phong_ban, tieu_de, created_by FROM eo").all<any>(),
        db.prepare("SELECT id, don_gia_du_kien, created_after_issue FROM eo_item").all<any>(),
        db.prepare(
          `SELECT p.eo_item_id, p.factory_committed_date nm FROM item_plan p
           WHERE p.deleted_at IS NULL AND p.factory_committed_date IS NOT NULL
             AND p.id = (SELECT p2.id FROM item_plan p2 WHERE p2.eo_item_id = p.eo_item_id AND p2.deleted_at IS NULL AND p2.factory_committed_date IS NOT NULL
                         ORDER BY COALESCE(p2.updated_at, p2.created_at) DESC, p2.id DESC LIMIT 1)`,
        ).all<any>(),
        db.prepare("SELECT eo_item_id, COUNT(*) n, SUM(trang_thai = 'CHO_GIAI_TRINH') cho FROM tl_loi GROUP BY eo_item_id").all<any>(),
      ]);
      return { eo: eo.results, it: it.results, nm: nm.results, loi: loi.results };
    }),
    layDongTheoDoi(c.env, "tat_ca"),
    db.prepare("SELECT danh_gia_luc FROM tl_state WHERE id = 1").first<{ danh_gia_luc: string | null }>(),
  ]);
  const tdBy = new Map(td.map((r) => [r.item_id, r]));
  const eoBy = new Map(them.eo.map((e: any) => [e.id, e]));
  const itBy = new Map(them.it.map((e: any) => [e.id, e]));
  const nmBy = new Map(them.nm.map((e: any) => [e.eo_item_id, e.nm]));
  const loiBy = new Map(them.loi.map((e: any) => [e.eo_item_id, e]));
  const rows = base.filter((r: any) => !eoId || r.eo_id === eoId).map((r: any) => {
    const e: any = eoBy.get(r.eo_id) ?? {};
    const i: any = itBy.get(r.item_id) ?? {};
    const l: any = loiBy.get(r.item_id);
    const g = gd.map.get(r.item_id);
    const t = tdBy.get(r.item_id);
    return {
      ...r, phong_ban: e.phong_ban ?? null, tieu_de: e.tieu_de ?? null, nguoi_tao: e.created_by ?? null,
      don_gia_du_kien: i.don_gia_du_kien ?? null, sau_ban_hanh: i.created_after_issue === 1,
      ngay_nm_cam_ket: nmBy.get(r.item_id) ?? null, so_loi: l?.n ?? 0, so_loi_cho_gt: l?.cho ?? 0,
      gd_hien_tai: g?.gd_hien_tai ?? null, gd_hien_tai_ten: g?.gd_hien_tai_ten ?? null, gd_bat_dau: g?.gd_bat_dau ?? null,
      gd_gio: g?.gd_gio ?? null, gd_tre: g?.gd_tre ?? null, g4_trang_thai: g?.g4_trang_thai ?? null,
      so_lan_trinh: g?.so_lan_trinh ?? 0, so_lan_tra_ve: g?.so_lan_tra_ve ?? 0,
      gd_gio_tung: g?.gio ?? {}, gd_tre_tung: g?.tre ?? {}, gd_moc: g?.moc ?? {},
      // theo doi (null khi dong ngoai pham vi: chua ban hanh / EO huy / dat truoc moc bo qua)
      theo_doi: !!t, tinh_trang: t?.tinh_trang ?? null, ap_dung: t?.ap_dung ?? false, bat_dau: t?.bat_dau ?? null,
      han_ngay_du_kien: t?.han_ngay_du_kien ?? null, han_cap_nhat_lai: t?.han_cap_nhat_lai ?? null,
      so_lan_lui: t?.so_lan_lui ?? 0, ceo_ly_do: t?.ceo_ly_do ?? [], ngay_hang_ve: t?.ngay_hang_ve ?? null,
      ngay_ve_du: t?.ngay_ve_du ?? null, sl_nhap_amis: t?.sl_nhap_amis ?? r.sl_nhap_amis_dung_eo ?? 0, nguoi_dat: t?.nguoi_dat ?? e.created_by ?? null,
    };
  });
  return c.json({ giai_doan: GIAI_DOAN, sla: gd.sla, rows, danh_gia_luc: st?.danh_gia_luc ?? null });
});

export default app;
