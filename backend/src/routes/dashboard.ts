import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { cachedReport } from "../lib/reportCache";
import { computeTienDo01 } from "./reports";
import { nowVN } from "../lib/vnTime";
import { weekLabel, weekStart } from "../lib/week";

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
  const soThang = [3, 6, 12].includes(Number(c.req.query("thang"))) ? Number(c.req.query("thang")) : 6;
  // trend phu thuoc thang hien tai -> cache theo ngay (mac dinh dateSensitive)
  const data = await cachedReport(c.env.DB, `dash:summary:${soThang}`, ["eo"], async () => {
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

    const now = new Date(Date.now() + 7 * 3600_000);
    const months: string[] = [];
    for (let i = soThang - 1; i >= 0; i--) {
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
  });
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
// ?tuan=<lech tuan so voi tuan nay, -4..8>. Tuan = Chu nhat -> Thu bay (giong lib/week.ts).
app.get("/plan-tuan", (c) => {
  const raw = Number(c.req.query("tuan") ?? 0);
  const lech = Number.isInteger(raw) && raw >= -4 && raw <= 8 ? raw : 0;
  return cachedReport(c.env.DB, `dash:plan-tuan:${lech}`, ["eo"], async () => {
    const start = `${lech * 7} days`;
    const range = await c.env.DB.prepare(
      `SELECT date('now','+7 hours','-6 days','weekday 0', ?) tu, date('now','+7 hours','-6 days','weekday 0', ?, '+6 days') den`,
    ).bind(start, start).first<{ tu: string; den: string }>();
    const rows = (
      await c.env.DB.prepare(`
        SELECT p.planned_date, e.eo_code, e.id eo_id,
               COUNT(*) so_dong, SUM(p.planned_qty) tong_sl
        FROM item_plan p JOIN eo_item i ON i.id = p.eo_item_id JOIN eo e ON e.id = i.eo_id
        WHERE p.deleted_at IS NULL AND p.planned_date >= ? AND p.planned_date <= ?
        GROUP BY p.planned_date, e.id ORDER BY p.planned_date, e.eo_code
      `).bind(range!.tu, range!.den).all()
    ).results;
    return { tu: range!.tu, den: range!.den, rows };
  }).then((d) => c.json(d));
});

// ============================================================ GET /quan-ly  (bang dieu khien cho quan ly)
// Doc tu bao cao 0.1 da cache (rep:tien-do-01) -> chi gom JS (nhanh). KHONG cache ket qua vi moc ton "< 1 ngay" tinh theo gio.
// Dong tinh: EO da ban hanh, dong khong huy. Ngay dat: dong truoc BH = ngay ban hanh, dong them sau BH = ngay tao (khop lib/theoDoi).
// Ty le dap ung = SUM(min(ve, dat)) / SUM(dat) cua cac dong DAT trong ky (ve thua khong lam phong ty le).
export const MOC_TON = [
  { k: "lt1", l: "Dưới 1 ngày", tu: 0, den: 1 }, { k: "1_3", l: "1–3 ngày", tu: 1, den: 3 }, { k: "3_7", l: "3–7 ngày", tu: 3, den: 7 },
  { k: "7_10", l: "7–10 ngày", tu: 7, den: 10 }, { k: "10_14", l: "10–14 ngày", tu: 10, den: 14 }, { k: "14_21", l: "14–21 ngày", tu: 14, den: 21 },
  { k: "21_30", l: "21–30 ngày", tu: 21, den: 30 }, { k: "gt30", l: "Trên 30 ngày", tu: 30, den: Infinity },
];
const msVN = (t: string) => Date.parse(t.replace(" ", "T") + (t.length <= 10 ? "T00:00:00Z" : "Z"));
const MO = ["Hàng chưa về", "Chưa đủ hàng"];

app.get("/quan-ly", async (c) => {
  const db = c.env.DB;
  const [base, choDuyet, sauBh, boQua] = await Promise.all([
    cachedReport(db, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(c.env)),
    db.prepare(
      `SELECT e.id, e.trang_thai, COALESCE(s.submitted_at, e.updated_at, e.created_at) t FROM eo e
       LEFT JOIN eo_submission s ON s.id = e.current_submission_id WHERE e.trang_thai IN ('IN_REVIEW','WAITING_FINAL_APPROVAL')`,
    ).all<{ id: number; trang_thai: string; t: string }>(),
    db.prepare("SELECT COUNT(*) n FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.post_issue_status = 'PENDING' AND e.trang_thai = 'ISSUED'").first<{ n: number }>(),
    db.prepare("SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'").first<{ value: string }>(),
  ]);
  // ton dong dung CUNG moc bo qua voi "Theo doi linh kien" (don dat truoc moc khong tinh) -> so tren Tong quan = so o danh sach
  const now = msVN(nowVN());
  const dong = base.filter((r) => r.trang_thai_eo === "ISSUED" && r.trang_thai_don_hang !== "Đơn trên EO bị hủy" && (r.so_luong_dat || 0) > 0);
  // ngay dat = khop lib/theoDoi bat_dau: dong co tu luc trinh -> ngay ban hanh EO; dong them sau ban hanh -> ngay tao dong
  const ngayDat = (r: any) => (String(r.phan_loai_thoi_diem_dat).startsWith("Tạo sau") ? r.ngay_tao : r.ngay_ban_hanh ?? r.ngay_tao) as string;

  // ---- ty le dap ung theo thang (12) / tuan (12), theo ky DAT hang
  type Ky = { ky: string; nhan: string; sl_dat: number; sl_ve: number; so_dong: number; so_dong_du: number };
  const thang = new Map<string, Ky>();
  const tuan = new Map<string, Ky>();
  const cong = (m: Map<string, Ky>, ky: string, nhan: string, r: any) => {
    const x = m.get(ky) ?? { ky, nhan, sl_dat: 0, sl_ve: 0, so_dong: 0, so_dong_du: 0 };
    const dat = r.so_luong_dat || 0, ve = r.sl_nhap_amis_dung_eo || 0;
    x.sl_dat += dat; x.sl_ve += Math.min(ve, dat); x.so_dong += 1; if (ve >= dat) x.so_dong_du += 1;
    m.set(ky, x);
  };
  for (const r of dong) {
    const d = ngayDat(r).slice(0, 10);
    cong(thang, d.slice(0, 7), `${d.slice(5, 7)}/${d.slice(0, 4)}`, r);
    const w = weekLabel(d);
    cong(tuan, weekStart(d), `Tuần ${w.wk}`, r);
  }
  const tyLe = (x: Ky) => ({ ...x, ty_le_sl: x.sl_dat ? Math.round((x.sl_ve / x.sl_dat) * 1000) / 10 : null, ty_le_dong: x.so_dong ? Math.round((x.so_dong_du / x.so_dong) * 1000) / 10 : null });
  const cuoi = (m: Map<string, Ky>, n: number) => [...m.values()].sort((a, b) => a.ky.localeCompare(b.ky)).slice(-n).map(tyLe);

  // ---- ton dong: dong chua ve du + moc thoi gian ton (tinh tu ngay dat, theo gio)
  const tuNgay = (boQua?.value || "2026-07-01").slice(0, 10); // khop lib/theoDoi ngayBoQuaTruoc
  const mo = dong.filter((r) => MO.includes(r.trang_thai_don_hang) && ngayDat(r).slice(0, 10) >= tuNgay);
  const moc = MOC_TON.map((m) => ({ ...m, den: Number.isFinite(m.den) ? m.den : null, so_dong: 0, so_eo: 0, sl_thieu: 0, _eo: new Set<number>() }));
  let qua = 0, chuaNdk = 0;
  for (const r of mo) {
    const ngay = (now - msVN(ngayDat(r))) / 86400_000;
    const m = moc.find((x) => ngay >= x.tu && (x.den == null || ngay < x.den)) ?? moc[0];
    m.so_dong += 1; m.sl_thieu += r.so_luong_con_thieu || 0; m._eo.add(r.eo_id);
    if (r.canh_bao === "Quá dự kiến") qua += 1;
    if (r.canh_bao === "Chưa có ngày dự kiến") chuaNdk += 1;
  }
  const mocDuyet = MOC_TON.map((m) => ({ k: m.k, l: m.l, so_eo: 0 }));
  for (const e of choDuyet.results) {
    const ngay = (now - msVN(e.t)) / 86400_000;
    const i = MOC_TON.findIndex((x) => ngay >= x.tu && ngay < x.den);
    mocDuyet[i < 0 ? 0 : i].so_eo += 1;
  }
  return c.json({
    luc: nowVN(),
    dap_ung: { thang: cuoi(thang, 12), tuan: cuoi(tuan, 12) },
    ton: {
      dong_chua_du: mo.length,
      dong_ve_0: mo.filter((r) => r.trang_thai_don_hang === "Hàng chưa về").length,
      dong_ve_thieu: mo.filter((r) => r.trang_thai_don_hang === "Chưa đủ hàng").length,
      sl_thieu: Math.round(mo.reduce((s, r) => s + (r.so_luong_con_thieu || 0), 0)),
      eo_ton: new Set(mo.map((r) => r.eo_id)).size,
      eo_chua_duyet: choDuyet.results.length,
      eo_tham_dinh: choDuyet.results.filter((e) => e.trang_thai === "IN_REVIEW").length,
      dong_sau_bh_cho_duyet: sauBh?.n ?? 0,
      dong_qua_du_kien: qua, dong_chua_ngay_du_kien: chuaNdk,
    },
    moc_ton: moc.map(({ _eo, ...m }) => ({ ...m, so_eo: _eo.size, sl_thieu: Math.round(m.sl_thieu) })),
    moc_cho_duyet: mocDuyet,
    bo_qua_truoc: tuNgay,
  });
});

// ============================================================ GET /tim-linh-kien?q=  (o tim nhanh linh kien, khong dau)
app.get("/tim-linh-kien", async (c) => {
  const bo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0111\u0110]/g, "d").toLowerCase();
  const tu = bo(c.req.query("q") ?? "").split(/\s+/).filter(Boolean);
  if (!tu.length) return c.json([]);
  const rs = await cachedReport(c.env.DB, "dash:ds-linh-kien", ["eo", "amis"], async () => (await c.env.DB.prepare(
    `SELECT part_code ma, MAX(part_name) ten, COUNT(*) so_dong, SUM(current_qty) sl FROM eo_item WHERE line_status = 'ACTIVE' GROUP BY UPPER(part_code)
     UNION ALL
     SELECT part_code, MAX(part_name), 0, 0 FROM amis_receipt WHERE voided_at IS NULL AND UPPER(part_code) NOT IN (SELECT UPPER(part_code) FROM eo_item) GROUP BY UPPER(part_code)`,
  ).all<{ ma: string; ten: string; so_dong: number; sl: number }>()).results);
  const out = rs.filter((r) => { const h = bo(`${r.ma} ${r.ten ?? ""}`); return tu.every((x) => h.includes(x)); })
    .sort((a, b) => (bo(a.ma).startsWith(tu[0]) ? 0 : 1) - (bo(b.ma).startsWith(tu[0]) ? 0 : 1) || b.so_dong - a.so_dong).slice(0, 15);
  return c.json(out);
});

export default app;
