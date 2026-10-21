import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { cachedReport } from "../lib/reportCache";
import { computeTienDo01 } from "./reports";
import { layDongTheoDoi } from "../lib/theoDoi";
import { nowVN } from "../lib/vnTime";

/**
 * /api/xem - du lieu cho 2 popup xem nhanh (FE components/quickview):
 *   GET /eo/:id/bo-sung  - phan BO SUNG cho popup EO (phan goc lay tu GET /api/eo/:id): theo doi tung dong, loi,
 *                          giai trinh, push, mail theodoimuahang, phieu nhap AMIS (khop + co ma EO nhung khong khop dong),
 *                          canh bao tong hop.
 *   GET /linh-kien?ma=   - moi thong tin theo MA LINH KIEN: cac dong EO (ca ma goc khi da thay ma), phieu nhap AMIS,
 *                          log sua / ke hoach / thay ma / loi giai trinh, chi so tong hop.
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

type CanhBao = { muc: "danger" | "warn" | "info"; text: string };
const ngayGiua = (a: string, b: string) => Math.floor((Date.parse(b.replace(" ", "T") + "Z") - Date.parse(a.replace(" ", "T") + "Z")) / 86400_000);

app.get("/eo/:id/bo-sung", async (c) => {
  const id = Number(c.req.param("id"));
  const db = c.env.DB;
  const eo = await db.prepare("SELECT id, trang_thai, approval_code, current_submission_id FROM eo WHERE id = ?").bind(id)
    .first<{ id: number; trang_thai: string; approval_code: string | null; current_submission_id: number | null }>();
  if (!eo) return c.json({ error: "NOT_FOUND" }, 404);

  const [loi, gt, push, mail, nhap, khongKhop, choDuyet, postIssue, traVe] = await Promise.all([
    db.prepare("SELECT * FROM tl_loi WHERE eo_id = ? ORDER BY COALESCE(han, created_at) DESC").bind(id).all<any>(),
    db.prepare("SELECT * FROM tl_giai_trinh WHERE eo_id = ? ORDER BY id DESC").bind(id).all<any>(),
    db.prepare(
      `SELECT p.*, GROUP_CONCAT(pi.eo_item_id) item_ids FROM tl_push p JOIN tl_push_item pi ON pi.push_id = p.id
       JOIN eo_item i ON i.id = pi.eo_item_id WHERE i.eo_id = ? GROUP BY p.id ORDER BY p.id DESC`,
    ).bind(id).all<any>(),
    db.prepare(
      `SELECT m.* FROM tl_mail m WHERE m.eo_item_id IN (SELECT id FROM eo_item WHERE eo_id = ?)
         OR m.ma_push IN (SELECT p.ma_push FROM tl_push p JOIN tl_push_item pi ON pi.push_id = p.id JOIN eo_item i ON i.id = pi.eo_item_id WHERE i.eo_id = ?)
       ORDER BY m.thoi_gian DESC LIMIT 200`,
    ).bind(id, id).all<any>(),
    db.prepare(
      `SELECT r.id, r.matched_eo_item_id, r.doc_no, r.doc_date, r.warehouse_name, r.part_code, r.qty_in
       FROM amis_receipt r WHERE r.match_status = 'MATCHED_EO' AND r.matched_eo_item_id IN (SELECT id FROM eo_item WHERE eo_id = ?)
       ORDER BY r.doc_date DESC, r.id DESC`,
    ).bind(id).all<any>(),
    eo.approval_code
      ? db.prepare(
          `SELECT id, doc_no, doc_date, warehouse_name, part_code, part_name, qty_in FROM amis_receipt
           WHERE approval_code_raw = ? AND match_status = 'CODE_ONLY_NO_LINE' AND voided_at IS NULL ORDER BY doc_date DESC`,
        ).bind(eo.approval_code).all<any>()
      : Promise.resolve({ results: [] as any[] }),
    db.prepare(
      `SELECT a.approver_email, a.step_type, a.assigned_at FROM eo_approval a
       WHERE a.submission_id = ? AND a.status = 'PENDING'`,
    ).bind(eo.current_submission_id ?? -1).all<any>(),
    db.prepare("SELECT COUNT(*) n FROM eo_item WHERE eo_id = ? AND post_issue_status = 'PENDING'").bind(id).first<{ n: number }>(),
    db.prepare("SELECT status, note FROM eo_submission WHERE eo_id = ? ORDER BY version DESC LIMIT 1").bind(id).first<{ status: string; note: string | null }>(),
  ]);

  // theo doi tung dong (chi EO da ban hanh; dong dat truoc moc bo qua se khong co)
  const td = eo.trang_thai === "ISSUED" ? (await layDongTheoDoi(c.env, "tat_ca")).filter((r) => r.eo_id === id) : [];

  const cb: CanhBao[] = [];
  const now = nowVN();
  if (eo.trang_thai === "DRAFT" && traVe && ["REQUEST_UPDATE", "SUPERSEDED", "REJECTED"].includes(traVe.status)) {
    cb.push({ muc: "warn", text: traVe.status === "REQUEST_UPDATE" ? "EO bị yêu cầu cập nhật — sửa và gửi trình lại" : "EO đã rút về nháp — cần gửi trình lại" });
  }
  for (const a of choDuyet.results) {
    const d = ngayGiua(a.assigned_at, now);
    cb.push({ muc: d >= 2 ? "warn" : "info", text: `Chờ ${a.step_type === "FINAL" ? "duyệt cuối" : "thẩm định"}: ${a.approver_email} (${d > 0 ? `${d} ngày` : "hôm nay"})` });
  }
  if (postIssue?.n) cb.push({ muc: "warn", text: `${postIssue.n} dòng thêm sau ban hành đang chờ người duyệt cuối duyệt` });
  const dem = (f: (r: any) => boolean) => td.filter(f).length;
  const tre = dem((r) => r.ap_dung && r.tinh_trang === "TRE_NDK");
  const cho = dem((r) => r.ap_dung && r.tinh_trang === "CHO_NDK");
  const qua = dem((r) => r.ap_dung && r.tinh_trang === "QUA_HAN_NDK");
  const loiCho = loi.results.filter((l) => l.trang_thai === "CHO_GIAI_TRINH").length;
  const ceo = td.filter((r) => r.ceo_ly_do.length > 0);
  if (tre) cb.push({ muc: "danger", text: `${tre} dòng quá 24h chưa có ngày dự kiến` });
  if (cho) cb.push({ muc: "warn", text: `${cho} dòng cần nhập ngày dự kiến (trong 24h làm việc)` });
  if (qua) cb.push({ muc: "danger", text: `${qua} dòng đã quá ngày dự kiến — phải nhập ngày mới` });
  if (loiCho) cb.push({ muc: "danger", text: `${loiCho} lỗi chờ giải trình` });
  if (ceo.length) cb.push({ muc: "danger", text: `${ceo.length} dòng ở cấp CEO: ${[...new Set(ceo.flatMap((r) => r.ceo_ly_do))].join("; ")}` });
  if (khongKhop.results.length) cb.push({ muc: "warn", text: `${khongKhop.results.length} phiếu nhập AMIS mang mã ${eo.approval_code} nhưng không khớp dòng nào (kho / mã hàng lệch)` });
  const chuaKh = dem((r) => !r.ap_dung && r.tinh_trang !== "DONG" && !r.co_ngay_du_kien);
  if (chuaKh) cb.push({ muc: "info", text: `${chuaKh} dòng đang mở chưa có kế hoạch hàng về` });

  return c.json({
    theo_doi: td, loi: loi.results, giai_trinh: gt.results, push: push.results, mail: mail.results,
    phieu_nhap: nhap.results, phieu_khong_khop: khongKhop.results, cho_duyet: choDuyet.results, canh_bao: cb,
  });
});

app.get("/linh-kien", async (c) => {
  const ma = (c.req.query("ma") ?? "").trim();
  if (!ma) return c.json({ error: "MISSING_MA" }, 400);
  const db = c.env.DB;
  const base = await cachedReport(db, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(c.env));
  const up = ma.toUpperCase();
  const dong = base.filter((r) => String(r.part_code).toUpperCase() === up || String(r.part_code_goc ?? "").toUpperCase() === up)
    .sort((a, b) => String(b.ngay_tao).localeCompare(String(a.ngay_tao)));
  const ids = JSON.stringify(dong.map((r) => r.item_id));
  const [nhap, log, loi, gia] = await Promise.all([
    db.prepare(
      `SELECT r.id, r.doc_no, r.doc_date, r.warehouse_name, r.part_name, r.qty_in, r.approval_code_raw, r.match_status, r.voided_at,
              e.id eo_id, e.eo_code
       FROM amis_receipt r LEFT JOIN eo_item i ON i.id = r.matched_eo_item_id LEFT JOIN eo e ON e.id = i.eo_id
       WHERE UPPER(r.part_code) = ? ORDER BY r.doc_date DESC, r.id DESC LIMIT 500`,
    ).bind(up).all<any>(),
    db.prepare(
      `SELECT l.id, l.entity_id, l.eo_id, l.event_type, l.before_json, l.after_json, l.metadata_json, l.user_email, l.created_at, e.eo_code
       FROM event_log l LEFT JOIN eo e ON e.id = l.eo_id
       WHERE (l.entity_type = 'eo_item' AND l.entity_id IN (SELECT value FROM json_each(?)))
          OR (l.event_type IN ('ADD_PLAN','UPDATE_PLAN','DELETE_PLAN') AND CAST(json_extract(l.metadata_json,'$.eo_item_id') AS INTEGER) IN (SELECT value FROM json_each(?)))
       ORDER BY l.created_at DESC, l.id DESC LIMIT 400`,
    ).bind(ids, ids).all<any>(),
    db.prepare("SELECT l.*, e.eo_code FROM tl_loi l JOIN eo e ON e.id = l.eo_id WHERE l.eo_item_id IN (SELECT value FROM json_each(?)) ORDER BY l.id DESC").bind(ids).all<any>(),
    db.prepare("SELECT don_gia_du_kien g, created_at FROM eo_item WHERE id IN (SELECT value FROM json_each(?)) AND don_gia_du_kien IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(ids).first<any>(),
  ]);
  const mo = dong.filter((r) => !["Kết thúc", "Đơn trên EO bị hủy"].includes(r.trang_thai_don_hang) && r.trang_thai_eo === "ISSUED");
  const xong = dong.filter((r) => r.trang_thai_don_hang === "Kết thúc" && r.thoi_gian_xu_ly_ngay != null);
  const tenMoiNhat = dong.find((r) => r.part_name)?.part_name ?? nhap.results.find((r) => r.part_name)?.part_name ?? "";
  const thayMa = [...new Set(dong.filter((r) => r.part_code_goc).map((r) => `${r.part_code_goc} → ${r.part_code}`))];
  return c.json({
    ma, ten: tenMoiNhat, thay_ma: thayMa,
    tong: {
      so_eo: new Set(dong.map((r) => r.eo_id)).size, so_dong: dong.length,
      sl_dat: dong.filter((r) => r.trang_thai_eo === "ISSUED").reduce((s, r) => s + (r.so_luong_dat || 0), 0),
      sl_ve: dong.reduce((s, r) => s + (r.sl_nhap_amis_dung_eo || 0), 0),
      sl_thieu: mo.reduce((s, r) => s + (r.so_luong_con_thieu || 0), 0),
      dong_mo: mo.length,
      lead_time_tb: xong.length ? Math.round((xong.reduce((s, r) => s + (r.thoi_gian_xu_ly_ngay ?? 0), 0) / xong.length) * 10) / 10 : null,
      ve_gan_nhat: nhap.results.find((r) => !r.voided_at)?.doc_date ?? null,
      doi_tac: [...new Set(dong.map((r) => r.doi_tac).filter(Boolean))],
      don_gia_gan_nhat: gia?.g ?? null,
    },
    dong, phieu_nhap: nhap.results, log: log.results, loi: loi.results,
  });
});

export default app;
