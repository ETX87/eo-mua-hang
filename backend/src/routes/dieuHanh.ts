import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { nowVN, todayVN } from "../lib/vnTime";
import { xemToanBoTheoDoi } from "../lib/eoAccess";
import { danhGiaQuyTac } from "../lib/theoDoi";
import { layDongDieuHanh, thongKeGiaiDoan, xuHuong, IM_LANG_DO, IM_LANG_VANG, LOI_CHO_DO } from "../lib/dieuHanh";
import { ghiNhacNho } from "./viPham";
import { VP_SQL } from "../lib/maLoi";
import { CHO_DUYET_SAU_BH_SQL } from "../lib/choDuyetSauBh";

/**
 * /api/dieu-hanh - man "Dieu hanh" cho lanh dao (v0.084, ../QUAN_TRI_DIEU_HANH.md). 1 payload: moi dong LK dang mo (muc canh bao,
 * nguoi, hanh dong, nguyen nhan) + giai doan (dang o / tre / 30 ngay) + xu huong + nguyen nhan giai trinh + phieu duyet dang treo.
 * FE tu gom theo nguoi / NCC / kho de loc pham vi bang 1 cu bam. Ai cung xem (quyen xem khong gioi han); nhac nho chi quan ly.
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/", async (c) => {
  const db = c.env.DB;
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  const [{ dong, goc, gd }, duyet, sauBh] = await Promise.all([
    layDongDieuHanh(c.env),
    db.prepare(
      `SELECT e.id eo_id, COALESCE(e.approval_code, e.eo_code) po, e.tieu_de, a.step_type buoc, a.approver_email ai, a.assigned_at tu, e.created_by nguoi_tao,
              (SELECT COUNT(*) FROM eo_item i WHERE i.eo_id = e.id AND i.line_status = 'ACTIVE') so_dong
       FROM eo_approval a JOIN eo_submission s ON s.id = a.submission_id JOIN eo e ON e.id = s.eo_id
       WHERE a.status = 'PENDING' AND s.status = 'PENDING' AND e.trang_thai IN ('IN_REVIEW', 'WAITING_FINAL_APPROVAL') ORDER BY a.assigned_at`,
    ).all<any>(),
    db.prepare(
      `SELECT e.id eo_id, COALESCE(e.approval_code, e.eo_code) po, e.tieu_de, 'SAU_BH' buoc, e.final_approver_email ai, MIN(i.created_at) tu, e.created_by nguoi_tao, COUNT(*) so_dong
       FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE ${CHO_DUYET_SAU_BH_SQL("i")} AND e.trang_thai = 'ISSUED' GROUP BY e.id ORDER BY tu`,
    ).all<any>(),
  ]);
  // do phu giai trinh (moi loi trong pham vi theo doi, moi thoi diem) - kem moi so "nguyen nhan" de khong ket luan tu mau qua nho
  const phu = await db.prepare(
    // v0.093: theo VI PHAM GOP - vi pham "da giai trinh" khi het dong cho va co it nhat 1 giai trinh THAT; con lai tu dong
    `WITH v AS (SELECT ${VP_SQL("l")} k, MAX(l.trang_thai = 'CHO_GIAI_TRINH') cho, MAX(l.trang_thai = 'DA_GIAI_TRINH' AND COALESCE(g.pham_vi, '') <> 'AUTO') that
       FROM tl_loi l JOIN eo e ON e.id = l.eo_id LEFT JOIN tl_giai_trinh g ON g.id = l.giai_trinh_id WHERE COALESCE(e.issued_at, e.created_at) >= ? GROUP BY 1)
     SELECT COUNT(*) n, SUM(cho = 0 AND that = 1) gt, SUM(cho = 0 AND that = 0) tu_dong FROM v`,
  ).bind(goc.bo_qua).first<{ n: number; gt: number; tu_dong: number }>();
  const now = nowVN();
  const gio = (t: string) => Math.max(0, Math.round((Date.parse(now.replace(" ", "T") + "Z") - Date.parse(String(t).replace(" ", "T") + "Z")) / 3600_000));
  return c.json({
    luc: now, hom_nay: todayVN(), bo_qua_truoc: goc.bo_qua,
    nguong: { im_lang_do: IM_LANG_DO, im_lang_vang: IM_LANG_VANG, loi_cho_do: LOI_CHO_DO },
    dong,
    giai_doan: thongKeGiaiDoan(goc, gd),
    xu_huong: xuHuong(goc),
    loi30: goc.loi30,
    nguyen_nhan: goc.nguyen_nhan,
    do_phu: { tong_loi: phu?.n ?? 0, da_gt: phu?.gt ?? 0, tu_dong: phu?.tu_dong ?? 0 },
    dm: goc.dm,
    duyet: [...duyet.results, ...sauBh.results].map((r: any) => ({ ...r, gio: gio(r.tu) })),
    quan_ly: xemToanBoTheoDoi(c.get("user")),
  });
});

// POST /nhac-nguoi { email, noi_dung? } - quan ly nhac 1 nguoi giai trinh MOI loi dang cho cua ho (trong pham vi theo doi).
app.post("/nhac-nguoi", async (c) => {
  const u = c.get("user");
  if (!xemToanBoTheoDoi(u)) return c.json({ error: "FORBIDDEN" }, 403);
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; noi_dung?: string };
  const email = String(b.email ?? "").trim();
  if (!email) return c.json({ error: "BAD_INPUT" }, 400);
  const boQua = ((await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'").first<{ value: string }>())?.value || "2026-07-01").slice(0, 10);
  const ids = (await c.env.DB.prepare(
    `SELECT l.id FROM tl_loi l JOIN eo e ON e.id = l.eo_id
     WHERE l.trang_thai = 'CHO_GIAI_TRINH' AND COALESCE(l.ai_email, e.created_by) = ? AND COALESCE(e.issued_at, e.created_at) >= ?`,
  ).bind(email, boQua).all<{ id: number }>()).results.map((r) => r.id);
  if (!ids.length) return c.json({ ok: true, so_loi: 0, so_nguoi: 0 });
  return c.json({ ok: true, ...(await ghiNhacNho(c.env.DB, u, ids, b.noi_dung)) });
});

export default app;
