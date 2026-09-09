import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { cachedReport } from "../lib/reportCache";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  IN_REVIEW: "Đang thẩm định",
  WAITING_FINAL_APPROVAL: "Chờ duyệt cuối",
  ISSUED: "Đã ban hành",
  REJECTED: "Từ chối / Đã hủy",
  CANCELLED: "Từ chối / Đã hủy",
};

// ============================================================ GET /summary  (man Tong quan)
app.get("/summary", async (c) => {
  const data = await cachedReport(c.env.DB, "dash:summary", ["eo"], async () => {
    // 1 lan quet `eo` -> KPI + trend. substr thay strftime (khong sargable nhung tranh ham).
    const eoRows = (
      await c.env.DB.prepare(`
        SELECT trang_thai,
               substr(created_at, 1, 7) m_created,
               substr(COALESCE(issued_at, created_at), 1, 7) m_issued,
               substr(COALESCE(cancelled_at, updated_at, created_at), 1, 7) m_closed
        FROM eo
      `).all<{ trang_thai: string; m_created: string; m_issued: string; m_closed: string }>()
    ).results;

    const cnt: Record<string, number> = {};
    for (const r of eoRows) cnt[r.trang_thai] = (cnt[r.trang_thai] ?? 0) + 1;
    const tong = eoRows.length;

    const donutMap = new Map<string, number>();
    for (const [k, v] of Object.entries(cnt)) {
      const label = STATUS_LABEL[k] ?? k;
      donutMap.set(label, (donutMap.get(label) ?? 0) + v);
    }
    const donut = ["Nháp", "Đang thẩm định", "Chờ duyệt cuối", "Đã ban hành", "Từ chối / Đã hủy"]
      .filter((l) => donutMap.has(l))
      .map((label) => {
        const count = donutMap.get(label)!;
        return { label, count, pct: tong ? Math.round((count / tong) * 1000) / 10 : 0 };
      });

    // 6 thang gan nhat
    const now = new Date(Date.now() + 7 * 3600_000);
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const trend = months.map((ym) => ({
      thang: ym.slice(5) + "/" + ym.slice(0, 4),
      tong: eoRows.filter((r) => r.m_created === ym).length,
      ban_hanh: eoRows.filter((r) => r.trang_thai === "ISSUED" && r.m_issued === ym).length,
      tu_choi: eoRows.filter((r) => (r.trang_thai === "REJECTED" || r.trang_thai === "CANCELLED") && r.m_closed === ym).length,
    }));

    const inbox = (
      await c.env.DB.prepare(`
        SELECT id, eo_code, tieu_de, trang_thai, created_by, updated_at, created_at
        FROM eo WHERE trang_thai IN ('IN_REVIEW', 'WAITING_FINAL_APPROVAL')
        ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 6
      `).all()
    ).results;

    return {
      kpi: {
        tong,
        tham_dinh: cnt["IN_REVIEW"] ?? 0,
        cho_duyet: cnt["WAITING_FINAL_APPROVAL"] ?? 0,
        ban_hanh: cnt["ISSUED"] ?? 0,
        tu_choi: (cnt["REJECTED"] ?? 0) + (cnt["CANCELLED"] ?? 0),
      },
      donut,
      trend,
      viec_can_duyet: inbox.map((r: any) => ({
        id: r.id, eo_code: r.eo_code, tieu_de: r.tieu_de,
        trang_thai: r.trang_thai, trang_thai_label: STATUS_LABEL[r.trang_thai],
        nguoi_tao: r.created_by, luc: r.updated_at ?? r.created_at,
      })),
    };
  }, { dateSensitive: false });
  return c.json(data);
});

// ============================================================ GET /tien-do-tomtat  (widget stacked bar)
app.get("/tien-do-tomtat", (c) =>
  cachedReport(c.env.DB, "dash:tien-do-tomtat", ["eo", "amis"], async () => {
    const rows = (
      await c.env.DB.prepare(`
        WITH actual_eo AS (
          SELECT matched_eo_item_id item_id, SUM(qty_in) qty, MAX(doc_date) last_date
          FROM amis_receipt WHERE match_status = 'MATCHED_EO' AND matched_eo_item_id IS NOT NULL GROUP BY matched_eo_item_id),
        plan_latest AS (
          SELECT p.eo_item_id, MAX(p.planned_date) latest FROM item_plan p WHERE p.deleted_at IS NULL GROUP BY p.eo_item_id)
        SELECT i.id, i.current_qty, e.trang_thai eo_status, i.line_status,
               COALESCE(ae.qty, 0) actual, ae.last_date, pl.latest planned,
               strftime('%Y-%W', COALESCE(ae.last_date, i.created_at)) wk
        FROM eo_item i JOIN eo e ON e.id = i.eo_id
        LEFT JOIN actual_eo ae ON ae.item_id = i.id
        LEFT JOIN plan_latest pl ON pl.eo_item_id = i.id
        WHERE e.trang_thai IN ('ISSUED', 'CANCELLED')
      `).all<any>()
    ).results;

    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    let hoan_thanh = 0, dang_giao = 0, cham = 0;
    const byWeek = new Map<string, { hoan_thanh: number; dang_giao: number; cham: number }>();
    for (const r of rows) {
      const cancelled = r.eo_status === "CANCELLED" || r.line_status === "CANCELLED_LINE";
      if (cancelled) continue;
      let bucket: "hoan_thanh" | "dang_giao" | "cham";
      if (r.last_date && r.actual >= r.current_qty) bucket = "hoan_thanh";
      else if (r.planned && today >= r.planned) bucket = "cham";
      else bucket = "dang_giao";
      if (bucket === "hoan_thanh") hoan_thanh++; else if (bucket === "dang_giao") dang_giao++; else cham++;
      const w = r.wk ?? "?";
      const g = byWeek.get(w) ?? { hoan_thanh: 0, dang_giao: 0, cham: 0 };
      g[bucket]++;
      byWeek.set(w, g);
    }
    const tong = hoan_thanh + dang_giao + cham;
    const chart = [...byWeek.entries()].sort().slice(-8).map(([w, g]) => ({ ky: w, ...g }));
    const p = (x: number) => (tong ? Math.round((x / tong) * 1000) / 10 : 0);
    return {
      tong_don_hang: tong,
      hoan_thanh: { so: hoan_thanh, pc: p(hoan_thanh) },
      dang_giao: { so: dang_giao, pc: p(dang_giao) },
      cham: { so: cham, pc: p(cham) },
      chart,
    };
  }).then((d) => c.json(d)));

// ============================================================ GET /tuan-tomtat
app.get("/tuan-tomtat", (c) =>
  cachedReport(c.env.DB, "dash:tuan-tomtat", ["eo", "amis"], async () => {
    const r = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM eo WHERE created_at >= date('now','+7 hours','-7 days')) so_eo_tao_moi,
        (SELECT COUNT(*) FROM eo WHERE trang_thai='ISSUED' AND issued_at >= date('now','+7 hours','-7 days')) so_eo_ban_hanh,
        (SELECT COUNT(*) FROM eo_item i JOIN eo e ON e.id=i.eo_id WHERE e.created_at >= date('now','+7 hours','-7 days')) so_dong,
        (SELECT COALESCE(SUM(i.current_qty),0) FROM eo_item i JOIN eo e ON e.id=i.eo_id WHERE e.created_at >= date('now','+7 hours','-7 days')) tong_sl
    `).first<any>();
    const done = await c.env.DB.prepare(`
      WITH a AS (SELECT matched_eo_item_id id, SUM(qty_in) q FROM amis_receipt WHERE match_status='MATCHED_EO' GROUP BY matched_eo_item_id)
      SELECT COUNT(*) n,
             SUM(CASE WHEN COALESCE(a.q,0) >= i.current_qty AND i.current_qty > 0 THEN 1 ELSE 0 END) done
      FROM eo_item i JOIN eo e ON e.id=i.eo_id LEFT JOIN a ON a.id=i.id
      WHERE e.trang_thai='ISSUED'
    `).first<{ n: number; done: number }>();
    const ty_le = done && done.n ? Math.round((done.done / done.n) * 1000) / 10 : 0;
    return { ...r, ty_le_hoan_thanh: ty_le };
  }).then((d) => c.json(d)));

// ============================================================ GET /amis-tomtat  (widget Nhap AMIS)
app.get("/amis-tomtat", (c) =>
  cachedReport(c.env.DB, "dash:amis-tomtat", ["eo", "amis"], async () => {
    const r = await c.env.DB.prepare(`
      WITH a AS (SELECT matched_eo_item_id id, SUM(qty_in) q FROM amis_receipt WHERE match_status='MATCHED_EO' GROUP BY matched_eo_item_id)
      SELECT COUNT(*) tong,
             SUM(CASE WHEN COALESCE(a.q,0) >= i.current_qty THEN 1 ELSE 0 END) da_nhap,
             SUM(CASE WHEN COALESCE(a.q,0) <  i.current_qty THEN 1 ELSE 0 END) chua_nhap
      FROM eo_item i JOIN eo e ON e.id=i.eo_id LEFT JOIN a ON a.id=i.id
      WHERE e.trang_thai='ISSUED' AND i.line_status='ACTIVE'
    `).first<any>();
    const cho = (
      await c.env.DB.prepare(`
        WITH a AS (SELECT matched_eo_item_id id, SUM(qty_in) q FROM amis_receipt WHERE match_status='MATCHED_EO' GROUP BY matched_eo_item_id)
        SELECT e.id, e.eo_code, e.issued_at, COUNT(*) so_dong_thieu
        FROM eo_item i JOIN eo e ON e.id=i.eo_id LEFT JOIN a ON a.id=i.id
        WHERE e.trang_thai='ISSUED' AND i.line_status='ACTIVE' AND COALESCE(a.q,0) < i.current_qty
        GROUP BY e.id ORDER BY e.issued_at DESC LIMIT 8
      `).all()
    ).results;
    return { ...r, danh_sach_cho: cho };
  }, { dateSensitive: false }).then((d) => c.json(d)));

// ============================================================ GET /plan-tuan  (widget Ke hoach hang ve)
app.get("/plan-tuan", (c) =>
  cachedReport(c.env.DB, "dash:plan-tuan", ["eo"], async () => {
    const rows = (
      await c.env.DB.prepare(`
        SELECT p.planned_date, e.eo_code, e.id eo_id,
               COUNT(*) so_dong, SUM(p.planned_qty) tong_sl
        FROM item_plan p JOIN eo_item i ON i.id = p.eo_item_id JOIN eo e ON e.id = i.eo_id
        WHERE p.deleted_at IS NULL
          AND p.planned_date >= date('now','+7 hours','weekday 0','-7 days')
          AND p.planned_date <  date('now','+7 hours','weekday 0','+7 days')
        GROUP BY p.planned_date, e.id ORDER BY p.planned_date LIMIT 30
      `).all()
    ).results;
    return { rows };
  }).then((d) => c.json(d)));

export default app;
