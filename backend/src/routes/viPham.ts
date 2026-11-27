import { Hono } from "hono";
import type { Env, AppVariables, AppUser } from "../types";
import { nowVN, todayVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { eventStmt } from "../lib/audit";
import { canEditPlan, duocGiaiTrinh, isViewOnly, xemToanBoTheoDoi } from "../lib/eoAccess";
import { danhGiaQuyTac, layDongTheoDoi, GIO_TU_DONG, GIO_NHAC_HET_HAN, hanGiaiTrinh, kiemBangChung } from "../lib/theoDoi";
import { congGioLV, demGioLV } from "../lib/gioLamViec";
import { dsLoiDayDu, tongHopTheoMa, dsCaCeo, QUA_LAU_GIO, RAT_LAU_GIO } from "../lib/baoCaoLoi";
import { layDongDieuHanh, thongKeGiaiDoan } from "../lib/dieuHanh";
import { layBangMaLoi } from "../lib/maLoi";

/**
 * /api/vi-pham - man "Vi pham & giai trinh" (FE pages/ViPham.tsx, migrations/0016). Moi dong = 1 loi (tl_loi) kem:
 *  nguoi vi pham (ai_email, mac dinh nguoi dat), muc do, lan thu / so lan cung loai tren dong, so ngay cho, giai trinh, nhac nho,
 *  chi so dong (cap CEO, so lan lui, tinh trang). Muc do (chot 2026-11-04):
 *    CEO  dong dang cap CEO (lib/theoDoi)
 *    CAO  cung loai lap >= 3 lan tren dong | cho giai trinh >= 7 ngay
 *    TB   cung loai lap 2 lan | cho giai trinh >= 3 ngay ("qua lau")
 *    THAP con lai
 * Pham vi: Admin / KH cung ung / Theo doi tien do / tai khoan chi xem: tat ca. Con lai: loi minh vi pham, don minh dat,
 * Kho: + kho phu trach. PO ban hanh truoc moc 'theo_doi_bo_qua_truoc' (mac dinh 2026-07-01) khong tinh (chot 2026-11-04).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

export { QUA_LAU_GIO, RAT_LAU_GIO };

/**
 * GET /api/vi-pham/nhac-cua-toi (v0.105) - popup nhac khi MO APP (FE components/NhacGiaiTrinhPopup.tsx). Loi CHO_GIAI_TRINH cua toi
 * (cung dieu kien so "Vi pham cua ban cho giai trinh" o viecCanLam), gop theo dong LK, kem han giai trinh (han loi som nhat + GIO_TU_DONG
 * gio LV) va so gio LV con lai. Chi doc, khong ghi.
 */
app.get("/nhac-cua-toi", async (c) => {
  const u = c.get("user");
  const now = nowVN();
  const rs = (await c.env.DB.prepare(
    `SELECT l.eo_item_id item_id, l.eo_id, COALESCE(e.approval_code, e.eo_code) ma_po, i.part_code, i.part_name, COUNT(*) so_loi,
       GROUP_CONCAT(DISTINCT l.quy_tac) quy_tac, MIN(CASE WHEN l.quy_tac <> 'TAY' THEN COALESCE(l.han, l.created_at) END) moc,
       MAX(l.nhac_het_han_luc) nhac_luc
     FROM tl_loi l JOIN eo e ON e.id = l.eo_id LEFT JOIN eo_item i ON i.id = l.eo_item_id
     WHERE l.trang_thai = 'CHO_GIAI_TRINH' AND (COALESCE(l.ai_email, e.created_by) = ?1 OR (e.created_by = ?1 AND l.quy_tac <> 'R5'))
       AND substr(COALESCE(e.issued_at, e.created_at), 1, 10) >= COALESCE((SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'), '2026-07-01')
     GROUP BY l.eo_item_id`,
  ).bind(u.email).all<{ item_id: number; eo_id: number; ma_po: string; part_code: string | null; part_name: string | null; so_loi: number;
    quy_tac: string; moc: string | null; nhac_luc: string | null }>()).results;
  const rows = rs.map((r) => {
    const han = r.moc ? hanGiaiTrinh(r.moc) : null;
    const conGio = han ? (han >= now ? demGioLV(now, han) : -demGioLV(han, now)) : null;
    return { ...r, han, con_gio: conGio, sap_het: conGio != null && conGio <= GIO_NHAC_HET_HAN };
  }).sort((a, b) => String(a.han ?? "9").localeCompare(String(b.han ?? "9")));
  return c.json({ rows, tong_loi: rows.reduce((t, r) => t + r.so_loi, 0), gio_nhac: GIO_NHAC_HET_HAN, gio_tu_dong: GIO_TU_DONG });
});

const soNgay = (a: string, b: string) => Math.max(0, Math.floor((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400_000));

function phamVi(u: AppUser) {
  const tatCa = xemToanBoTheoDoi(u) || isViewOnly(u);
  const khoCua = (u.khu_vuc_kho ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return { tatCa, thay: (r: { nguoi_dat: string; nguoi_vp: string | null; kho: string }) =>
    tatCa || r.nguoi_dat === u.email || r.nguoi_vp === u.email || (u.vai_tro === "Kho" && (khoCua.length === 0 || khoCua.includes(r.kho))) };
}

// GET / - toan bo loi trong pham vi (moi trang thai), FE tu loc / gom / dem
app.get("/", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  await danhGiaQuyTac(c.env).catch((e) => console.error("danhGiaQuyTac", e));
  // v0.091: danh sach loi day du (kem ma ER.MH) dung chung lib/baoCaoLoi - route chi loc pham vi nguoi xem
  const { rows: tatCa } = await dsLoiDayDu(c.env);
  const pv = phamVi(u);
  const rows = tatCa.filter((l) => pv.thay({ nguoi_dat: l.nguoi_dat, nguoi_vp: l.nguoi_vp, kho: l.kho }))
    .map((l) => ({ ...l, cua_toi: l.nguoi_vp === u.email || (l.nguoi_dat === u.email && l.quy_tac !== "R5") }));
  const st = await db.prepare("SELECT danh_gia_luc FROM tl_state WHERE id = 1").first<{ danh_gia_luc: string | null }>();
  return c.json({
    // v0.125: nguoi duyet co loi R5 cua minh cung giai trinh duoc (chi loi do - FE an nut giai trinh ca PO / ngay DK voi R5)
    rows, tat_ca: pv.tatCa, quan_ly: xemToanBoTheoDoi(u), co_the_gt: canEditPlan(u) || rows.some((l) => l.quy_tac === "R5" && l.nguoi_vp === u.email), me: u.email, vai_tro: u.vai_tro,
    qua_lau_gio: QUA_LAU_GIO, rat_lau_gio: RAT_LAU_GIO, danh_gia_luc: st?.danh_gia_luc ?? null,
  });
});

// GET /ma-loi - bang ma loi ER.MH (v0.091) + tong hop theo ma trong pham vi nguoi xem (Vi pham > Theo ma loi)
app.get("/ma-loi", async (c) => {
  const u = c.get("user");
  const { rows, bang } = await dsLoiDayDu(c.env);
  const pv = phamVi(u);
  // v0.092 (Bang ma loi): so dang dem cua nhom CEO (2xx, dong dang mo) + tre han buoc (3xx: dang tre / tre 30 ngay) - toan he thong
  const [ceo, dh] = await Promise.all([dsCaCeo(c.env), layDongDieuHanh(c.env)]);
  const demCeo: Record<string, number> = {};
  const daDem = new Set<string>(); // v0.100: 1 ca CEO = 1 PO + 1 ma (gop dong)
  for (const r of ceo) for (const m of r.ma_ceo) { const k = `${r.eo_id}|${m.ma}`; if (daDem.has(k)) continue; daDem.add(k); demCeo[m.ma] = (demCeo[m.ma] ?? 0) + 1; }
  const demGd = Object.fromEntries(thongKeGiaiDoan(dh.goc, dh.gd).map((g) => [g.k, { dang: g.dang, dang_tre: g.dang_tre, xong30: g.xong30, tre30: g.tre30 }]));
  return c.json({ bang: bang.ds, tong_hop: tongHopTheoMa(rows.filter((l) => pv.thay({ nguoi_dat: l.nguoi_dat, nguoi_vp: l.nguoi_vp, kho: l.kho })), bang),
    dem_ceo: demCeo, dem_gd: demGd, so_ngay_tu_dong: 7 });
});
// GET /bang-ma - chi bang ma (popup, huong dan)
app.get("/bang-ma", async (c) => c.json((await layBangMaLoi(c.env.DB)).ds));

// GET /po/:eoId - du lieu form "Giai trinh ca PO": loi dang cho cua EO + cac dong dang mo (ghi loi moi cho ca PO)
app.get("/po/:eoId", async (c) => {
  const eoId = Number(c.req.param("eoId"));
  const db = c.env.DB;
  const [eo, loi, mo] = await Promise.all([
    db.prepare("SELECT id, eo_code, approval_code, tieu_de, created_by FROM eo WHERE id = ?").bind(eoId).first(),
    db.prepare(
      `SELECT l.id, l.eo_item_id, l.quy_tac, l.han, l.ngay_tham_chieu, l.ai_email, i.part_code, i.part_name
       FROM tl_loi l JOIN eo_item i ON i.id = l.eo_item_id WHERE l.eo_id = ? AND l.trang_thai = 'CHO_GIAI_TRINH' AND l.quy_tac <> 'R5' ORDER BY i.id, l.han`,
    ).bind(eoId).all(),
    layDongTheoDoi(c.env, "dang_mo"),
  ]);
  if (!eo) return c.json({ error: "EO_NOT_FOUND" }, 404);
  return c.json({ eo, loi: loi.results, dong_mo: mo.filter((r) => r.eo_id === eoId).map((r) => ({ item_id: r.item_id, part_code: r.part_code, part_name: r.part_name })) });
});

// GET /dong/:itemId/nhac-nho - cac lan nhac nho cua 1 dong (popup chi tiet vi pham)
app.get("/dong/:itemId/nhac-nho", async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM tl_nhac_nho WHERE eo_item_id = ? ORDER BY id DESC LIMIT 200").bind(Number(c.req.param("itemId"))).all();
  return c.json(r.results);
});

// POST /nhac-nho { loi_ids: number[], noi_dung? } - quan ly nhac nguoi vi pham giai trinh (chi loi dang cho). 1 thong bao / (nguoi, EO).
app.post("/nhac-nho", async (c) => {
  const u = c.get("user");
  if (!xemToanBoTheoDoi(u)) return c.json({ error: "FORBIDDEN" }, 403);
  const b = (await c.req.json().catch(() => ({}))) as { loi_ids?: number[]; noi_dung?: string };
  const ids = [...new Set((b.loi_ids ?? []).map(Number).filter((x) => x > 0))];
  if (!ids.length || ids.length > 2000) return c.json({ error: "BAD_INPUT" }, 400);
  return c.json({ ok: true, ...(await ghiNhacNho(c.env.DB, u, ids, b.noi_dung)) });
});

/** Ghi nhac nho TAY cho cac loi DANG CHO (1 thong bao / (nguoi, EO)) - dung chung /vi-pham/nhac-nho + /dieu-hanh/nhac-nguoi. */
export async function ghiNhacNho(db: D1Database, u: AppUser, ids: number[], noiDung?: string): Promise<{ so_loi: number; so_nguoi: number }> {
  const loiNhan = (noiDung ?? "").trim().slice(0, 500);
  const now = nowVN();
  const tenNguoi = u.ho_ten || u.email.split("@")[0];
  const res = await db.batch([
    db.prepare(
      `INSERT INTO tl_nhac_nho (eo_item_id, eo_id, loi_id, den_email, kenh, noi_dung, created_by, created_at)
       SELECT l.eo_item_id, l.eo_id, l.id, COALESCE(l.ai_email, e.created_by), 'TAY', ?, ?, ?
       FROM tl_loi l JOIN eo e ON e.id = l.eo_id WHERE l.id IN (SELECT value FROM json_each(?)) AND l.trang_thai = 'CHO_GIAI_TRINH'`,
    ).bind(loiNhan || null, u.email, now, JSON.stringify(ids)),
    db.prepare(
      `INSERT INTO notification (email, loai, noi_dung, eo_id, created_at)
       SELECT n.email, 'nhac_vi_pham', ? || ' nhắc giải trình ' || COUNT(*) || ' lỗi ở ' || COALESCE(e.approval_code, e.eo_code) || CASE WHEN ? <> '' THEN ': ' || ? ELSE '' END, l.eo_id, ?
       FROM tl_loi l JOIN eo e ON e.id = l.eo_id
       JOIN users n ON n.email = COALESCE(l.ai_email, e.created_by)
       WHERE l.id IN (SELECT value FROM json_each(?)) AND l.trang_thai = 'CHO_GIAI_TRINH' GROUP BY n.email, l.eo_id`,
    ).bind(tenNguoi, loiNhan, loiNhan, now, JSON.stringify(ids)),
  ]);
  const soLoi = res[0].meta.changes ?? 0;
  if (soLoi) {
    await db.prepare(
      `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
       SELECT 'eo', l.eo_id, l.eo_id, 'NHAC_NHO_VI_PHAM', json_object('so_loi', COUNT(*), 'noi_dung', ?), json_object('loi_ids', json_group_array(l.id)), ?, ?
       FROM tl_loi l WHERE l.id IN (SELECT value FROM json_each(?)) AND l.trang_thai = 'CHO_GIAI_TRINH' GROUP BY l.eo_id`,
    ).bind(loiNhan || null, u.email, now, JSON.stringify(ids)).run();
    await bumpVersions(db, ["theo_doi"]);
  }
  return { so_loi: soLoi, so_nguoi: res[1].meta.changes ?? 0 };
}

/**
 * POST /giai-trinh-po { eo_id, quy_tac?: string[], eo_item_ids?: number[], moi?: boolean, ai_ma, ai_email?, loi_ma, noi_dung, hinh_anh }
 * Giai trinh CHUNG cho ca PO (1 EO): 1 noi dung dung cho moi dong linh kien trong PO.
 *  - mac dinh: dong MOI loi dang cho cua PO (loc quy_tac / eo_item_ids neu co). Co loi R1/R4 -> bat buoc anh.
 *  - moi = true: ghi 1 loi tay (TAY) cho moi dong DANG MO cua PO (vd NCC bao tre ca don) - nhu giai trinh khong gan loi o 1 dong.
 * Moi dong 1 ban ghi tl_giai_trinh (pham_vi 'PO', chung khoa nhom) -> lich su tung dong / popup cu doc duoc nhu giai trinh thuong.
 */
app.post("/giai-trinh-po", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  const b = (await c.req.json().catch(() => ({}))) as {
    eo_id?: number; quy_tac?: string[]; eo_item_ids?: number[]; moi?: boolean;
    ai_ma?: string; ai_email?: string; loi_ma?: string; noi_dung?: string; hinh_anh?: unknown[]; dung_mail?: boolean;
  };
  const eoId = Number(b.eo_id);
  const eo = await db.prepare("SELECT id, eo_code, approval_code, created_by FROM eo WHERE id = ?").bind(eoId)
    .first<{ id: number; eo_code: string; approval_code: string | null; created_by: string }>();
  if (!eo) return c.json({ error: "EO_NOT_FOUND" }, 404);
  if (!canEditPlan(u, eo)) return c.json({ error: "READ_ONLY" }, 403);
  const noiDung = (b.noi_dung ?? "").trim();
  if (!b.ai_ma || !b.loi_ma || !noiDung) return c.json({ error: "MISSING_FIELDS" }, 400);
  const dm = await db.prepare("SELECT loai FROM tl_danh_muc WHERE (loai = 'AI' AND ma = ?) OR (loai = 'LOI' AND ma = ?)").bind(b.ai_ma, b.loi_ma).all();
  if (dm.results.length < 2) return c.json({ error: "BAD_CATALOG" }, 400);
  const hinh = JSON.stringify((Array.isArray(b.hinh_anh) ? b.hinh_anh : []).filter((x: any) => x && x.url).slice(0, 10));
  const aiEmail = b.ai_email?.trim() || null;
  const quyTac = JSON.stringify((b.quy_tac ?? []).filter((x) => ["R1", "R3", "R4"].includes(x)));
  const chiDong = JSON.stringify((b.eo_item_ids ?? []).map(Number).filter((x) => x > 0));
  const now = nowVN();
  const nhom = `PO:${eoId}:${crypto.randomUUID().slice(0, 8)}`;
  const gtCols = "eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, hinh_anh, created_by, created_at, pham_vi, nhom";

  if (b.moi) {
    const mo = (await layDongTheoDoi(c.env, "dang_mo")).filter((r) => r.eo_id === eoId).map((r) => r.item_id);
    const chon = JSON.parse(chiDong) as number[];
    const ids = chon.length ? mo.filter((x) => chon.includes(x)) : mo;
    if (!ids.length) return c.json({ error: "KHONG_CO_DONG" }, 400);
    await db.batch([
      db.prepare(`INSERT INTO tl_giai_trinh (${gtCols}) SELECT value, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'PO', ? FROM json_each(?)`)
        .bind(eoId, b.ai_ma, aiEmail, b.loi_ma, noiDung, hinh, u.email, now, nhom, JSON.stringify(ids)),
      db.prepare(
        `INSERT INTO tl_loi (eo_item_id, eo_id, quy_tac, khoa, han, ai_ma, ai_email, loi_ma, trang_thai, giai_trinh_id, created_at)
         SELECT g.eo_item_id, g.eo_id, 'TAY', 'TAY:' || g.eo_item_id || ':' || g.id, ?, g.ai_ma, g.ai_email, g.loi_ma, 'DA_GIAI_TRINH', g.id, ?
         FROM tl_giai_trinh g WHERE g.nhom = ?`,
      ).bind(now, now, nhom),
      eventStmt(db, { entity_type: "eo", entity_id: eoId, eo_id: eoId, event_type: "GIAI_TRINH_THEO_DOI", user_email: u.email, at: now,
        after: { ai_ma: b.ai_ma, ai_email: aiEmail, loi_ma: b.loi_ma, noi_dung: noiDung, pham_vi: "PO", so_dong: ids.length },
        metadata: { quy_tac: "TAY", nhom, eo_item_ids: ids } }),
    ]);
    await bumpVersions(db, ["theo_doi"]);
    return c.json({ ok: true, so_dong: ids.length, so_loi: ids.length });
  }

  // v0.125: R5 (cham duyet) chi nguoi duyet tu giai trinh -> khong dong theo giai trinh ca PO
  const loc = `l.eo_id = ?1 AND l.trang_thai = 'CHO_GIAI_TRINH' AND l.quy_tac <> 'R5'
    AND (?2 = '[]' OR l.quy_tac IN (SELECT value FROM json_each(?2)))
    AND (?3 = '[]' OR l.eo_item_id IN (SELECT value FROM json_each(?3)))`;
  const dem = await db.prepare(`SELECT COUNT(*) n, SUM(l.quy_tac IN ('R1', 'R4')) can_anh FROM tl_loi l WHERE ${loc}`)
    .bind(eoId, quyTac, chiDong).first<{ n: number; can_anh: number }>();
  if (!dem?.n) return c.json({ error: "KHONG_CO_LOI" }, 400);
  if ((dem.can_anh ?? 0) > 0 && hinh === "[]") {
    const dongR = (await db.prepare(`SELECT DISTINCT l.eo_item_id FROM tl_loi l WHERE ${loc} AND l.quy_tac IN ('R1', 'R4')`).bind(eoId, quyTac, chiDong)
      .all<{ eo_item_id: number }>()).results.map((r) => r.eo_item_id);
    const bc = await kiemBangChung(db, true, false, b.dung_mail, dongR);
    if (bc) return c.json(bc, 400);
  }
  const res = await db.batch([
    db.prepare(
      `INSERT INTO tl_giai_trinh (${gtCols})
       SELECT l.eo_item_id, l.eo_id, MIN(l.id), ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'PO', ?11 FROM tl_loi l WHERE ${loc} GROUP BY l.eo_item_id`,
    ).bind(eoId, quyTac, chiDong, b.ai_ma, aiEmail, b.loi_ma, noiDung, hinh, u.email, now, nhom),
    // chi dong loi cua dong da co ban ghi giai trinh trong nhom (loi moi ghi chen giua 2 lenh van cho giai trinh)
    db.prepare(
      `UPDATE tl_loi AS l SET trang_thai = 'DA_GIAI_TRINH', ai_ma = ?4, ai_email = ?5, loi_ma = ?6,
         giai_trinh_id = (SELECT g.id FROM tl_giai_trinh g WHERE g.nhom = ?7 AND g.eo_item_id = l.eo_item_id)
       WHERE ${loc} AND l.eo_item_id IN (SELECT g.eo_item_id FROM tl_giai_trinh g WHERE g.nhom = ?7)`,
    ).bind(eoId, quyTac, chiDong, b.ai_ma, aiEmail, b.loi_ma, nhom),
    eventStmt(db, { entity_type: "eo", entity_id: eoId, eo_id: eoId, event_type: "GIAI_TRINH_THEO_DOI", user_email: u.email, at: now,
      after: { ai_ma: b.ai_ma, ai_email: aiEmail, loi_ma: b.loi_ma, noi_dung: noiDung, pham_vi: "PO", so_loi: dem.n },
      metadata: { quy_tac: JSON.parse(quyTac), nhom } }),
  ]);
  await bumpVersions(db, ["theo_doi"]);
  return c.json({ ok: true, so_dong: res[0].meta.changes ?? 0, so_loi: res[1].meta.changes ?? 0 });
});

/**
 * POST /giai-trinh-nhieu { loi_ids, ai_ma, ai_email?, loi_ma, noi_dung, hinh_anh } - 1 giai trinh cho NHIEU loi CUNG LOAI
 * (cung quy tac) duoc chon o man Vi pham, co the tren nhieu dong / nhieu PO (2026-11-05). Moi dong 1 ban ghi tl_giai_trinh
 * (pham_vi 'NHIEU', chung khoa nhom). Phai co quyen tren moi EO lien quan; R1/R4 bat buoc anh.
 */
app.post("/giai-trinh-nhieu", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  const b = (await c.req.json().catch(() => ({}))) as { loi_ids?: number[]; ai_ma?: string; ai_email?: string; loi_ma?: string; noi_dung?: string; hinh_anh?: unknown[]; dung_mail?: boolean };
  const ids = JSON.stringify([...new Set((b.loi_ids ?? []).map(Number).filter((x) => x > 0))].slice(0, 2000));
  const noiDung = (b.noi_dung ?? "").trim();
  if (ids === "[]") return c.json({ error: "BAD_INPUT" }, 400);
  if (!b.ai_ma || !b.loi_ma || !noiDung) return c.json({ error: "MISSING_FIELDS" }, 400);
  const dm = await db.prepare("SELECT loai FROM tl_danh_muc WHERE (loai = 'AI' AND ma = ?) OR (loai = 'LOI' AND ma = ?)").bind(b.ai_ma, b.loi_ma).all();
  if (dm.results.length < 2) return c.json({ error: "BAD_CATALOG" }, 400);
  const ds = (await db.prepare(
    `SELECT l.id, l.quy_tac, l.eo_id, l.eo_item_id, l.ai_email, e.created_by FROM tl_loi l JOIN eo e ON e.id = l.eo_id
     WHERE l.id IN (SELECT value FROM json_each(?)) AND l.trang_thai = 'CHO_GIAI_TRINH'`,
  ).bind(ids).all<{ id: number; quy_tac: string; eo_id: number; eo_item_id: number; ai_email: string | null; created_by: string }>()).results;
  if (!ds.length) return c.json({ error: "KHONG_CO_LOI" }, 400);
  if (new Set(ds.map((l) => l.quy_tac)).size > 1) return c.json({ error: "KHAC_LOAI" }, 400);
  // v0.136: R5 luon tinh cho nguoi duyet bi ghi loi (Do ai = NGUOI_DUYET, giu ai_email cua loi) - xem SQL ben duoi
  // v0.125: R5 (cham duyet) - chinh nguoi duyet (hoac Admin) giai trinh; loi khac - nguoi sua duoc ke hoach (nguoi dat / KH cung ung / Admin)
  if (ds.some((l) => !duocGiaiTrinh(u, l))) return c.json({ error: "READ_ONLY" }, 403);
  const hinh = JSON.stringify((Array.isArray(b.hinh_anh) ? b.hinh_anh : []).filter((x: any) => x && x.url).slice(0, 10));
  const bc = await kiemBangChung(db, ds[0].quy_tac === "R1" || ds[0].quy_tac === "R4", hinh !== "[]", b.dung_mail, ds.map((l) => l.eo_item_id));
  if (bc) return c.json(bc, 400);
  const aiEmail = b.ai_email?.trim() || null;
  const now = nowVN();
  const nhom = `N:${crypto.randomUUID().slice(0, 12)}`;
  const chon = JSON.stringify(ds.map((l) => l.id));
  const res = await db.batch([
    db.prepare(
      `INSERT INTO tl_giai_trinh (eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, hinh_anh, created_by, created_at, pham_vi, nhom)
       SELECT eo_item_id, eo_id, MIN(id), CASE WHEN MIN(quy_tac) = 'R5' THEN 'NGUOI_DUYET' ELSE ?2 END, CASE WHEN MIN(quy_tac) = 'R5' THEN MIN(ai_email) ELSE ?3 END, ?4, ?5, ?6, ?7, ?8, 'NHIEU', ?9 FROM tl_loi
       WHERE id IN (SELECT value FROM json_each(?1)) AND trang_thai = 'CHO_GIAI_TRINH' GROUP BY eo_item_id`,
    ).bind(chon, b.ai_ma, aiEmail, b.loi_ma, noiDung, hinh, u.email, now, nhom),
    db.prepare(
      `UPDATE tl_loi AS l SET trang_thai = 'DA_GIAI_TRINH', ai_ma = CASE WHEN l.quy_tac = 'R5' THEN 'NGUOI_DUYET' ELSE ?2 END, ai_email = CASE WHEN l.quy_tac = 'R5' THEN l.ai_email ELSE ?3 END, loi_ma = ?4,
         giai_trinh_id = (SELECT g.id FROM tl_giai_trinh g WHERE g.nhom = ?5 AND g.eo_item_id = l.eo_item_id)
       WHERE l.id IN (SELECT value FROM json_each(?1)) AND l.trang_thai = 'CHO_GIAI_TRINH'
         AND l.eo_item_id IN (SELECT g.eo_item_id FROM tl_giai_trinh g WHERE g.nhom = ?5)`,
    ).bind(chon, b.ai_ma, aiEmail, b.loi_ma, nhom),
    db.prepare(
      `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
       SELECT 'eo', g.eo_id, g.eo_id, 'GIAI_TRINH_THEO_DOI',
              json_object('ai_ma', ?2, 'ai_email', ?3, 'loi_ma', ?4, 'noi_dung', ?5, 'pham_vi', 'NHIEU', 'so_dong', COUNT(*)),
              json_object('quy_tac', ?6, 'nhom', ?1, 'eo_item_ids', json_group_array(g.eo_item_id)), ?7, ?8
       FROM tl_giai_trinh g WHERE g.nhom = ?1 GROUP BY g.eo_id`,
    ).bind(nhom, b.ai_ma, aiEmail, b.loi_ma, noiDung, ds[0].quy_tac, u.email, now),
  ]);
  await bumpVersions(db, ["theo_doi"]);
  return c.json({ ok: true, so_dong: res[0].meta.changes ?? 0, so_loi: res[1].meta.changes ?? 0, so_po: res[2].meta.changes ?? 0 });
});

/**
 * POST /giai-trinh-dong { eo_item_ids, xem?, moi?, ai_ma, ai_email?, loi_ma, noi_dung, hinh_anh } - giai trinh CHUNG cho cac DONG
 * linh kien duoc tick o man LK dat (1 / nhieu dong / ca nhom theo PO hoac theo ma LK; co the nhieu PO, nhieu loai loi) - 2026-11-08.
 *  - xem = true: chi tra loi dang cho theo dong (quy_tac, so lan) + dong dang mo -> form hien truoc khi gui.
 *  - mac dinh: dong MOI loi dang cho cua cac dong da chon (co R1/R4 -> bat buoc anh).
 *  - moi = true: ghi 1 loi TAY (da giai trinh) cho moi dong DANG MO da chon - van de chung chua co loi he thong.
 * Moi dong 1 ban ghi tl_giai_trinh (pham_vi 'NHIEU', chung khoa nhom); quyen canEditPlan tren MOI EO lien quan.
 */
app.post("/giai-trinh-dong", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  const b = (await c.req.json().catch(() => ({}))) as {
    eo_item_ids?: number[]; xem?: boolean; moi?: boolean; ai_ma?: string; ai_email?: string; loi_ma?: string; noi_dung?: string; hinh_anh?: unknown[]; dung_mail?: boolean;
  };
  const idList = [...new Set((b.eo_item_ids ?? []).map(Number).filter((x) => x > 0))].slice(0, 2000);
  if (!idList.length) return c.json({ error: "BAD_INPUT" }, 400);
  const ids = JSON.stringify(idList);
  const loiCho = (await db.prepare(
    `SELECT eo_item_id, quy_tac, COUNT(*) n FROM tl_loi
     WHERE eo_item_id IN (SELECT value FROM json_each(?)) AND trang_thai = 'CHO_GIAI_TRINH' AND quy_tac <> 'R5' GROUP BY eo_item_id, quy_tac`,
  ).bind(ids).all<{ eo_item_id: number; quy_tac: string; n: number }>()).results;
  const dangMo = (await layDongTheoDoi(c.env, "dang_mo")).filter((r) => idList.includes(r.item_id)).map((r) => ({ i: r.item_id, e: r.eo_id }));
  if (b.xem) return c.json({ loi: loiCho, dong_mo: dangMo.map((x) => x.i) });

  const eos = (await db.prepare(
    `SELECT DISTINCT e.id, e.created_by FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id IN (SELECT value FROM json_each(?))`,
  ).bind(ids).all<{ id: number; created_by: string }>()).results;
  if (eos.some((e) => !canEditPlan(u, e))) return c.json({ error: "READ_ONLY" }, 403);
  const noiDung = (b.noi_dung ?? "").trim();
  if (!b.ai_ma || !b.loi_ma || !noiDung) return c.json({ error: "MISSING_FIELDS" }, 400);
  const dm = await db.prepare("SELECT loai FROM tl_danh_muc WHERE (loai = 'AI' AND ma = ?) OR (loai = 'LOI' AND ma = ?)").bind(b.ai_ma, b.loi_ma).all();
  if (dm.results.length < 2) return c.json({ error: "BAD_CATALOG" }, 400);
  const hinh = JSON.stringify((Array.isArray(b.hinh_anh) ? b.hinh_anh : []).filter((x: any) => x && x.url).slice(0, 10));
  const aiEmail = b.ai_email?.trim() || null;
  const now = nowVN();
  const nhom = `D:${crypto.randomUUID().slice(0, 12)}`;
  const gtCols = "eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, hinh_anh, created_by, created_at, pham_vi, nhom";
  // 1 dong event_log / EO (giong giai-trinh-nhieu)
  const suKien = (quyTac: unknown) => db.prepare(
    `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
     SELECT 'eo', g.eo_id, g.eo_id, 'GIAI_TRINH_THEO_DOI',
            json_object('ai_ma', ?2, 'ai_email', ?3, 'loi_ma', ?4, 'noi_dung', ?5, 'pham_vi', 'NHIEU', 'so_dong', COUNT(*)),
            json_object('quy_tac', json(?6), 'nhom', ?1, 'eo_item_ids', json_group_array(g.eo_item_id)), ?7, ?8
     FROM tl_giai_trinh g WHERE g.nhom = ?1 GROUP BY g.eo_id`,
  ).bind(nhom, b.ai_ma, aiEmail, b.loi_ma, noiDung, JSON.stringify(quyTac), u.email, now);

  if (b.moi) {
    if (!dangMo.length) return c.json({ error: "KHONG_CO_DONG" }, 400);
    const res = await db.batch([
      db.prepare(`INSERT INTO tl_giai_trinh (${gtCols})
        SELECT json_extract(value, '$.i'), json_extract(value, '$.e'), NULL, ?, ?, ?, ?, ?, ?, ?, 'NHIEU', ? FROM json_each(?)`)
        .bind(b.ai_ma, aiEmail, b.loi_ma, noiDung, hinh, u.email, now, nhom, JSON.stringify(dangMo)),
      db.prepare(
        `INSERT INTO tl_loi (eo_item_id, eo_id, quy_tac, khoa, han, ai_ma, ai_email, loi_ma, trang_thai, giai_trinh_id, created_at)
         SELECT g.eo_item_id, g.eo_id, 'TAY', 'TAY:' || g.eo_item_id || ':' || g.id, ?, g.ai_ma, g.ai_email, g.loi_ma, 'DA_GIAI_TRINH', g.id, ?
         FROM tl_giai_trinh g WHERE g.nhom = ?`,
      ).bind(now, now, nhom),
      suKien("TAY"),
    ]);
    await bumpVersions(db, ["theo_doi"]);
    return c.json({ ok: true, so_dong: res[0].meta.changes ?? 0, so_loi: res[1].meta.changes ?? 0, so_po: res[2].meta.changes ?? 0 });
  }

  if (!loiCho.length) return c.json({ error: "KHONG_CO_LOI" }, 400);
  const bcD = await kiemBangChung(db, loiCho.some((l) => l.quy_tac === "R1" || l.quy_tac === "R4"), hinh !== "[]", b.dung_mail,
    loiCho.filter((l) => l.quy_tac === "R1" || l.quy_tac === "R4").map((l) => l.eo_item_id));
  if (bcD) return c.json(bcD, 400);
  const loc = "l.eo_item_id IN (SELECT value FROM json_each(?1)) AND l.trang_thai = 'CHO_GIAI_TRINH' AND l.quy_tac <> 'R5'";
  const res = await db.batch([
    db.prepare(`INSERT INTO tl_giai_trinh (${gtCols})
      SELECT l.eo_item_id, l.eo_id, MIN(l.id), ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'NHIEU', ?9 FROM tl_loi l WHERE ${loc} GROUP BY l.eo_item_id`)
      .bind(ids, b.ai_ma, aiEmail, b.loi_ma, noiDung, hinh, u.email, now, nhom),
    // chi dong loi cua dong da co ban ghi giai trinh trong nhom (loi moi ghi chen giua 2 lenh van cho giai trinh)
    db.prepare(
      `UPDATE tl_loi AS l SET trang_thai = 'DA_GIAI_TRINH', ai_ma = ?2, ai_email = ?3, loi_ma = ?4,
         giai_trinh_id = (SELECT g.id FROM tl_giai_trinh g WHERE g.nhom = ?5 AND g.eo_item_id = l.eo_item_id)
       WHERE ${loc} AND l.eo_item_id IN (SELECT g.eo_item_id FROM tl_giai_trinh g WHERE g.nhom = ?5)`,
    ).bind(ids, b.ai_ma, aiEmail, b.loi_ma, nhom),
    suKien([...new Set(loiCho.map((l) => l.quy_tac))]),
  ]);
  await bumpVersions(db, ["theo_doi"]);
  return c.json({ ok: true, so_dong: res[0].meta.changes ?? 0, so_loi: res[1].meta.changes ?? 0, so_po: res[2].meta.changes ?? 0 });
});

export default app;
