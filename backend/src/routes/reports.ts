import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { todayVN } from "../lib/vnTime";
import { weekStart, weekEnd, weekLabel } from "../lib/week";
import { cachedReport } from "../lib/reportCache";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function sum(arr: any[], k: string) {
  return Math.round(arr.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 1000) / 1000;
}

// ==================================================================== 0.1 - tinh full dataset (cache)
/** Bao cao 0.1 day du (1 dong / eo_item). Dung chung cho GET /tien-do-don-hang va dong bo sang DVBH (lib/dvbhSync.ts). */
export async function computeTienDo01(env: Env) {
  const buckets = (
    await env.DB.prepare("SELECT min_days, label FROM settings_speed_bucket ORDER BY min_days").all<{ min_days: number; label: string }>()
  ).results;

  const rows = (
    await env.DB.prepare(`
      WITH
      actual_eo AS MATERIALIZED (
        SELECT matched_eo_item_id item_id, SUM(qty_in) qty, MAX(doc_date) last_date
        FROM amis_receipt WHERE match_status = 'MATCHED_EO' AND matched_eo_item_id IS NOT NULL
        GROUP BY matched_eo_item_id),
      actual_wh AS MATERIALIZED (
        SELECT warehouse_name, part_code, MAX(doc_date) last_date
        FROM amis_receipt WHERE voided_at IS NULL GROUP BY warehouse_name, part_code),
      actual_nat AS MATERIALIZED (
        SELECT part_code, MAX(doc_date) last_date FROM amis_receipt WHERE voided_at IS NULL GROUP BY part_code),
      plan_live AS MATERIALIZED (
        SELECT eo_item_id, planned_date, COALESCE(updated_at, created_at) || '#' || id ord
        FROM item_plan WHERE deleted_at IS NULL),
      plan_agg AS (
        SELECT eo_item_id, MIN(planned_date) first_date FROM plan_live GROUP BY eo_item_id),
      plan_latest AS (
        SELECT eo_item_id, planned_date FROM (
          SELECT eo_item_id, planned_date, ROW_NUMBER() OVER (PARTITION BY eo_item_id ORDER BY ord DESC) rn FROM plan_live
        ) WHERE rn = 1),
      -- event_log quet 1 lan (di tru DAT LK Update -> UPDATE_PLAN)
      evt_plan AS MATERIALIZED (
        SELECT CAST(json_extract(metadata_json, '$.eo_item_id') AS INTEGER) item_id,
               json_extract(after_json, '$.planned_date') pd, created_at, id
        FROM event_log
        WHERE event_type IN ('ADD_PLAN', 'UPDATE_PLAN', 'DELETE_PLAN')
          AND json_extract(metadata_json, '$.eo_item_id') IS NOT NULL),
      evt_agg AS (
        SELECT item_id, MIN(pd) first_date, COUNT(*) cnt FROM evt_plan GROUP BY item_id),
      evt_last AS (
        SELECT item_id, pd planned_date FROM (
          SELECT item_id, pd, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY created_at DESC, id DESC) rn
          FROM evt_plan WHERE pd IS NOT NULL
        ) WHERE rn = 1),
      qtychg AS (
        SELECT entity_id item_id, MAX(created_at) last_at
        FROM event_log WHERE entity_type = 'eo_item' AND event_type = 'UPDATE_QUANTITY'
        GROUP BY entity_id)
      SELECT
        i.id item_id, e.id eo_id, i.legacy_id id_dat_lk, e.eo_code, e.legacy_id id_tai_lieu, e.approval_code,
        e.loai_hinh, i.reason ly_do, i.crm_id, i.order_id, i.ghi_chu, i.warehouse kho, i.supplier doi_tac,
        i.part_code, i.part_code_goc, i.part_name, i.current_qty, COALESCE(i.updated_at, i.created_at) item_updated_at,
        e.final_approver_email, e.issued_at,
        COALESCE(ae.qty, 0) actual_eo,
        ae.last_date ngay_ve_eo, aw.last_date ngay_ve_kho, an.last_date ngay_ve_nat,
        COALESCE(ea.cnt, 0) so_lan_doi_ngay,
        MIN(COALESCE(pa.first_date, ea.first_date), COALESCE(ea.first_date, pa.first_date)) ngay_dk_dau,
        COALESCE(pl.planned_date, el.planned_date) ngay_dk_gan_nhat,
        qc.last_at ngay_cap_nhat_sl, i.created_at ngay_tao,
        e.trang_thai eo_status, i.line_status, i.created_after_issue, i.post_issue_status,
        (julianday(COALESCE(ae.last_date, ?)) - julianday(substr(i.created_at, 1, 10))) tg_xu_ly
      FROM eo_item i
      JOIN eo e ON e.id = i.eo_id
      LEFT JOIN actual_eo ae ON ae.item_id = i.id
      LEFT JOIN actual_wh aw ON aw.warehouse_name = i.warehouse AND aw.part_code = i.part_code
      LEFT JOIN actual_nat an ON an.part_code = i.part_code
      LEFT JOIN plan_agg pa ON pa.eo_item_id = i.id
      LEFT JOIN plan_latest pl ON pl.eo_item_id = i.id
      LEFT JOIN evt_agg ea ON ea.item_id = i.id
      LEFT JOIN evt_last el ON el.item_id = i.id
      LEFT JOIN qtychg qc ON qc.item_id = i.id
    `).bind(todayVN()).all<any>()
  ).results;

  const today = todayVN();
  const speed = (days: number | null) => {
    if (days == null) return "";
    let label = buckets[0]?.label ?? "";
    for (const b of buckets) if (days >= b.min_days) label = b.label;
    return label;
  };

  return rows.map((r) => {
    const cancelled = r.eo_status === "CANCELLED" || r.line_status === "CANCELLED_LINE";
    let trang_thai: string;
    if (cancelled) trang_thai = "Đơn trên EO bị hủy";
    else if (r.ngay_ve_eo) trang_thai = r.actual_eo >= r.current_qty ? "Kết thúc" : "Chưa đủ hàng";
    else if (r.eo_status !== "ISSUED") trang_thai = "Chưa ban hành";
    else trang_thai = "Hàng chưa về";

    let canh_bao = "";
    if (["Chưa đủ hàng", "Chưa ban hành", "Hàng chưa về"].includes(trang_thai)) {
      if (!r.ngay_dk_gan_nhat) canh_bao = "Chưa có ngày dự kiến";
      else canh_bao = today >= r.ngay_dk_gan_nhat ? "Quá dự kiến" : "Chưa quá dự kiến";
    }

    let phan_loai: string;
    if (cancelled) phan_loai = "Đơn hàng đã hủy bỏ";
    else if (r.eo_status !== "ISSUED") phan_loai = "Chưa ban hành";
    else if (r.created_after_issue === 0) phan_loai = "Tạo trước ban hành";
    else if (r.post_issue_status === "APPROVED") phan_loai = "Tạo sau ban hành (Đã duyệt)";
    else phan_loai = "Tạo sau ban hành (chờ duyệt)";

    const tg = r.tg_xu_ly == null ? null : Math.max(0, Math.round(r.tg_xu_ly * 100) / 100);

    return {
      trang_thai_don_hang: trang_thai, canh_bao, toc_do_hang_ve: speed(tg),
      ma_phe_duyet: r.approval_code, phan_loai_thoi_diem_dat: phan_loai,
      // dong tao tren app moi khong co ID DAT LK cu -> 'EOI-<id>' (khoa dong dung chung voi DVBH)
      id_dat_lk: r.id_dat_lk || `EOI-${r.item_id}`, id_tai_lieu: r.id_tai_lieu,
      loai_hinh: r.loai_hinh, ly_do_ps: r.ly_do, id_crm: r.crm_id, id_dat_hang: r.order_id, ghi_chu: r.ghi_chu,
      kho: r.kho, doi_tac: r.doi_tac, part_code: r.part_code, part_name: r.part_name,
      so_luong_dat: r.current_qty, sl_nhap_amis_dung_eo: r.actual_eo,
      doi_chieu_sai_thua: Math.round((r.actual_eo - r.current_qty) * 1000) / 1000,
      so_luong_con_thieu: Math.max(0, Math.round((r.current_qty - r.actual_eo) * 1000) / 1000),
      thoi_gian_xu_ly_ngay: tg, so_lan_doi_ngay_du_kien: r.so_lan_doi_ngay,
      ngay_du_kien_lan_dau: r.ngay_dk_dau, ngay_du_kien_gan_nhat: r.ngay_dk_gan_nhat,
      ngay_nhap_kho_amis_theo_eo: r.ngay_ve_eo, ngay_nhap_kho_amis: r.ngay_ve_kho,
      ngay_nhap_toan_quoc_amis: r.ngay_ve_nat, ngay_cap_nhat_so_luong: r.ngay_cap_nhat_sl, ngay_tao: r.ngay_tao,
      // them cho dong bo DVBH (bang bao cao FE khong dung)
      item_id: r.item_id as number, eo_id: r.eo_id as number, eo_code: r.eo_code as string, trang_thai_eo: r.eo_status as string,
      part_code_goc: r.part_code_goc as string | null, ngay_cap_nhat_dong: r.item_updated_at as string,
      nguoi_duyet_cuoi: r.final_approver_email as string | null, ngay_ban_hanh: r.issued_at as string | null,
    };
  });
}

app.get("/tien-do-don-hang", async (c) => {
  const kieuXem = c.req.query("kieu_xem") ?? "toan_bo";
  const out = await cachedReport(c.env.DB, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(c.env));
  const filtered = out.filter((r) =>
    kieuXem === "ton" ? !["Kết thúc", "Đơn trên EO bị hủy"].includes(r.trang_thai_don_hang)
      : kieuXem === "dong" ? ["Kết thúc", "Đơn trên EO bị hủy"].includes(r.trang_thai_don_hang)
        : true);
  const tong = {
    so_dong: filtered.length,
    so_luong_dat: sum(filtered, "so_luong_dat"),
    sl_nhap_amis_dung_eo: sum(filtered, "sl_nhap_amis_dung_eo"),
    doi_chieu_sai_thua: sum(filtered, "doi_chieu_sai_thua"),
    so_luong_con_thieu: sum(filtered, "so_luong_con_thieu"),
  };
  return c.json({ rows: filtered, tong, kieu_xem: kieuXem });
});

// ============================================================================ 0.2 AMIS khong co EO
app.get("/amis-khong-eo", async (c) => {
  const data = await cachedReport(c.env.DB, "rep:amis-khong-eo", ["eo", "amis"], async () => {
    const rows = await c.env.DB.prepare(
      `SELECT doc_no, warehouse_name, part_code, part_name, qty_in, doc_date, approval_code_raw
       FROM amis_receipt WHERE match_status = 'CODE_ONLY_NO_LINE' ORDER BY doc_date DESC`,
    ).all();
    const tong = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(qty_in),0) so_luong_nhap, COUNT(*) so_dong FROM amis_receipt WHERE match_status = 'CODE_ONLY_NO_LINE'",
    ).first();
    return { rows: rows.results, tong };
  }, { dateSensitive: false });
  return c.json(data);
});

// ---------------------------------------------------------------------------- base plan-row dataset
async function planRowDataset(env: Env) {
  const plans = (
    await env.DB.prepare(`
      SELECT p.id plan_id, p.eo_item_id, p.planned_date, p.planned_qty, p.factory_committed_date,
             i.warehouse, i.part_code, i.part_name, i.current_qty, e.approval_code, e.trang_thai eo_status
      FROM item_plan p JOIN eo_item i ON i.id = p.eo_item_id JOIN eo e ON e.id = i.eo_id
      WHERE p.deleted_at IS NULL AND e.trang_thai <> 'CANCELLED' AND e.approval_code IS NOT NULL
      ORDER BY p.eo_item_id, p.planned_date, p.id
    `).all<any>()
  ).results;

  const acts = (
    await env.DB.prepare(`
      SELECT match_key, doc_date, SUM(qty_in) qty
      FROM amis_receipt WHERE match_status = 'MATCHED_EO'
      GROUP BY match_key, doc_date
    `).all<{ match_key: string; doc_date: string; qty: number }>()
  ).results;
  const actByKey = new Map<string, Array<{ d: string; q: number }>>();
  for (const a of acts) {
    const arr = actByKey.get(a.match_key) ?? [];
    arr.push({ d: a.doc_date, q: a.qty });
    actByKey.set(a.match_key, arr);
  }

  const byItem = new Map<number, any[]>();
  for (const p of plans) {
    (byItem.get(p.eo_item_id) ?? byItem.set(p.eo_item_id, []).get(p.eo_item_id)!).push(p);
  }

  const result: any[] = [];
  for (const [, ps] of byItem) {
    const key = `${ps[0].warehouse};${ps[0].part_code};${ps[0].approval_code}`;
    const actsK = actByKey.get(key) ?? [];
    const sumAct = (lo: string | null, hiIncl: string) =>
      actsK.reduce((s, a) => s + ((lo === null || a.d >= lo) && a.d <= hiIncl ? a.q : 0), 0);
    const sumActAfter = (loExcl: string) =>
      actsK.reduce((s, a) => s + (a.d > loExcl ? a.q : 0), 0);

    const lastEnd = weekEnd(ps[ps.length - 1].planned_date);
    ps.forEach((p, k) => {
      const ws = weekStart(p.planned_date);
      const we = weekEnd(p.planned_date);
      const wl = weekLabel(p.planned_date);
      const W = sumAct(k === 0 ? null : ws, we);
      const X = k === ps.length - 1 ? sumActAfter(lastEnd) : 0;
      const Y = ps.reduce((s, q) => s + (weekEnd(q.planned_date) < ws ? q.planned_qty : 0), 0);
      let Z = 0;
      ps.forEach((q, kk) => {
        if (weekEnd(q.planned_date) <= we) {
          const qws = weekStart(q.planned_date);
          Z += sumAct(kk === 0 ? null : qws, weekEnd(q.planned_date));
        }
      });
      const AA = Z - Y >= 0 ? Math.min(Z - Y, p.planned_qty) : 0;

      result.push({
        plan_id: p.plan_id, eo_item_id: p.eo_item_id, approval_code: p.approval_code,
        warehouse: p.warehouse, part_code: p.part_code, part_name: p.part_name,
        factory_note: p.factory_committed_date,
        ky: wl.ky, tuan: wl.label, nam: wl.namFull, wk: wl.wk,
        sl_eo: p.current_qty, sl_ke_hoach_tuan: p.planned_qty,
        sl_ve_theo_moc: Math.round(W * 1000) / 1000,
        sl_ve_sau_ke_hoach: Math.round(X * 1000) / 1000,
        can_bang: Math.round(AA * 1000) / 1000,
      });
    });
  }
  return result;
}
const getPlanRows = (env: Env) =>
  cachedReport(env.DB, "rep:plan-rows", ["eo", "amis"], () => planRowDataset(env), { dateSensitive: false });

// ============================================================================ 0.3 Tien do ve theo tuan
app.get("/tien-do-tuan", async (c) => {
  const ky = c.req.query("ky");
  const ma = c.req.query("ma");
  let ds = await getPlanRows(c.env);
  if (ma) ds = ds.filter((r) => r.approval_code === ma);
  if (ky) ds = ds.filter((r) => r.ky === ky);

  const rows = ds.map((r) => ({
    id_dat_lk: r.eo_item_id, ma_eo: r.approval_code, kho: r.warehouse,
    part_code: r.part_code, part_name: r.part_name, ghi_chu_nha_may: r.factory_note,
    ky_tinh: r.ky, tuan: r.tuan,
    sl_lk_eo: r.sl_eo, sl_ke_hoach_tuan: r.sl_ke_hoach_tuan,
    sl_ve_amis_theo_moc: r.sl_ve_theo_moc, sl_amis_sau_ke_hoach: r.sl_ve_sau_ke_hoach,
    can_bang: r.can_bang,
    pc_ke_hoach_tuan_tren_eo: r.sl_eo ? r.sl_ke_hoach_tuan / r.sl_eo : "",
    pc_hang_ve_tren_eo: r.sl_eo ? (r.sl_ke_hoach_tuan + r.sl_ve_theo_moc) / r.sl_eo : "",
    pc_hang_ve_can_doi: r.sl_ke_hoach_tuan ? r.can_bang / r.sl_ke_hoach_tuan : "",
  }));
  const tong = {
    sl_ke_hoach_tuan: sum(ds, "sl_ke_hoach_tuan"),
    sl_ve_amis_theo_moc: sum(ds, "sl_ve_theo_moc"),
    sl_amis_sau_ke_hoach: sum(ds, "sl_ve_sau_ke_hoach"),
    can_bang: sum(ds, "can_bang"),
  };
  return c.json({ rows, tong });
});

// ============================================================================ 0.3.1 Ke hoach luy ke nam
app.get("/luy-ke-nam", async (c) => {
  const nam = Number(c.req.query("nam") ?? new Date().getUTCFullYear());
  const kieuXem = c.req.query("kieu_xem") ?? "eo";
  const ma = c.req.query("ma");

  let ds = (await getPlanRows(c.env)).filter((r) => r.nam === nam);
  if (ma) ds = ds.filter((r) => r.approval_code === ma);

  const keyOf = (r: any) => (kieuXem === "eo_kho" ? `${r.approval_code}${r.warehouse}` : r.approval_code);
  const groups = new Map<string, any>();
  for (const r of ds) {
    const k = keyOf(r);
    let g = groups.get(k);
    if (!g) {
      g = {
        ma_eo: r.approval_code, kho: kieuXem === "eo_kho" ? r.warehouse : null,
        items: new Set<number>(), sl_ke_hoach: 0, tong_da_ve: 0,
        KH: new Array(54).fill(0), W: new Array(54).fill(0), CB: new Array(54).fill(0),
      };
      groups.set(k, g);
    }
    g.items.add(r.eo_item_id);
    g.sl_ke_hoach += r.sl_ke_hoach_tuan;
    g.tong_da_ve += r.sl_ve_theo_moc + r.sl_ve_sau_ke_hoach;
    if (r.wk >= 1 && r.wk <= 53) {
      g.KH[r.wk] += r.sl_ke_hoach_tuan;
      g.W[r.wk] += r.can_bang;
      g.CB[r.wk] += r.can_bang;
    }
  }

  const itemQty = new Map<number, number>();
  for (const r of ds) itemQty.set(r.eo_item_id, r.sl_eo);

  const rows = [...groups.values()].map((g) => {
    const slLkEo = [...g.items].reduce((s, id) => s + (itemQty.get(id) ?? 0), 0);
    const wk = (arr: number[]) => Object.fromEntries(arr.slice(1, 54).map((v, i) => [`W${String(i + 1).padStart(2, "0")}`, Math.round(v * 1000) / 1000]));
    return {
      ma_eo: g.ma_eo, kho: g.kho,
      sl_lk_eo: slLkEo, sl_ke_hoach: Math.round(g.sl_ke_hoach * 1000) / 1000,
      sl_thieu_ke_hoach: Math.round((slLkEo - g.sl_ke_hoach) * 1000) / 1000,
      tong_da_ve: Math.round(g.tong_da_ve * 1000) / 1000,
      pc_hang_da_ve: slLkEo ? Math.round((g.tong_da_ve / slLkEo) * 1000) / 1000 : "",
      pc_hoan_thanh_kh: g.KH.reduce((a: number, b: number) => a + b, 0)
        ? Math.round((g.CB.reduce((a: number, b: number) => a + b, 0) / g.KH.reduce((a: number, b: number) => a + b, 0)) * 1000) / 1000
        : "",
      ve_tuan: wk(g.W), kh_tuan: wk(g.KH), cb_tuan: wk(g.CB),
    };
  });
  return c.json({ nam, kieu_xem: kieuXem, rows });
});

export default app;
