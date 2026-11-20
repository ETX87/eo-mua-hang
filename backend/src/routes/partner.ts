import { Hono } from "hono";
import type { Env } from "../types";
import { bumpVersions } from "../lib/dataVersions";
import { tuDongDienKrf } from "../lib/krfGoiY";
import { dsLoiDayDu, tongHopTheoMa, dsCaCeo, gomViPham } from "../lib/baoCaoLoi";
import { layBangMaLoi } from "../lib/maLoi";
import { dsCaCeoXuLy, demTheoMuc, gomCaCeo } from "../lib/caCeo";
import { danhGiaQuyTac } from "../lib/theoDoi";
import { versionTag } from "../lib/dataVersions";
import { dongCacheTheo } from "../lib/dongCache";
import { TRANG_THAI_DONG } from "./reports";

/**
 * /api/partner - API cho he ngoai, KHONG dung session (mount TRUOC verifySessionMiddleware o index.ts).
 * POST /mail-events: app "theo-doi-mua-hang" (tong hop mail theodoimuahang@gmail.com qua Apps Script) day luong mail
 * da danh gia ve. Khop dot push theo ma "PUSH-YYMMDD-NNNN" (trong tieu de / ten file push chuan - routes/theoDoi.ts),
 * hoac theo id dong "EOI-<id>" / "LK-..." ma app do doc duoc trong file phan hoi.
 * Thu KRF (NHAN) co payload.dong.ngay_dap_ung -> tu dong dien ngay NM cam ket cho dong khop chac (lib/krfGoiY.ts tuDongDienKrf).
 * Xac thuc: header X-API-Key = secret THEODOI_MUAHANG_API_KEY (chua dat -> 503).
 */
const app = new Hono<{ Bindings: Env }>();

function eqConst(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

interface MailEvent {
  ext_id: string; huong: "GUI" | "NHAN"; ma_push?: string | null; id_dong?: string[];
  doi_tac?: string; tu?: string; den?: string; tieu_de?: string; tom_tat?: string; thoi_gian?: string; payload?: unknown;
}

app.post("/mail-events", async (c) => {
  const key = c.env.THEODOI_MUAHANG_API_KEY;
  if (!key) return c.json({ error: "NOT_CONFIGURED" }, 503);
  if (!eqConst(c.req.header("X-API-Key") ?? "", key)) return c.json({ error: "INVALID_API_KEY" }, 401);
  const b = (await c.req.json().catch(() => null)) as { events?: MailEvent[] } | null;
  const evs = Array.isArray(b?.events) ? b!.events : null;
  if (!evs || evs.length > 500) return c.json({ error: "INVALID_BODY" }, 400);
  const db = c.env.DB;
  // Ghi THEO LO (2026-10-31): truoc day moi dong cua moi thu = 1 INSERT tuan tu (+1 SELECT / ma LK-...) -> 1 lo 10 thu x 121 dong
  // = 1.210 truy van, vuot gioi han 1.000 truy van / request cua D1 (mat thu). Nay: 1 truy van tra ma LK-, 1 truy van ext_id da co,
  // INSERT ... SELECT FROM json_each theo goi (~700KB / goi), 1 batch cap nhat trang thai push -> so truy van khong phu thuoc so dong.
  const hopLe = evs.filter((e) => e?.ext_id && (e.huong === "GUI" || e.huong === "NHAN"));
  const maLk = [...new Set(hopLe.flatMap((e) => (e.id_dong ?? []).map((d) => String(d).trim())).filter((d) => d && !/^EOI-\d+$/.test(d)))];
  const lkId = new Map<string, number>();
  for (let i = 0; i < maLk.length; i += 500) {
    const rs = await db.prepare("SELECT id, legacy_id FROM eo_item WHERE legacy_id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(maLk.slice(i, i + 500))).all<{ id: number; legacy_id: string }>();
    for (const r of rs.results) lkId.set(r.legacy_id, r.id);
  }
  // 1 ban ghi / dong (app doc mail tach theo ma 3TDO + ma LK); payload qua 20.000 ky tu -> bo (truoc day cat ngang chuoi JSON -> hong JSON)
  type Dong = [string, string | null, number | null, string, string | null, string | null, string | null, string | null, string | null, string | null, string | null];
  const dong: Dong[] = [];
  const pushCapNhat = new Set<string>();
  for (const e of hopLe) {
    const maPush = (e.ma_push ?? /PUSH-\d{6}-\d{4,}\b/.exec(`${e.tieu_de ?? ""}`)?.[0]) || null;
    const itemIds: number[] = [];
    for (const d of e.id_dong ?? []) {
      const m = /^EOI-(\d+)$/.exec(String(d).trim());
      const id = m ? Number(m[1]) : lkId.get(String(d).trim());
      if (id) itemIds.push(id);
    }
    const targets = itemIds.length ? itemIds : [null];
    const pl = e.payload ? JSON.stringify(e.payload) : null;
    for (const [i, itemId] of targets.entries()) {
      dong.push([targets.length > 1 ? `${e.ext_id}#${i}` : e.ext_id, maPush, itemId, e.huong, e.doi_tac ?? null, e.tu ?? null, e.den ?? null,
        e.tieu_de ?? null, (e.tom_tat ?? "").slice(0, 2000) || null, e.thoi_gian ?? null, pl && pl.length <= 20000 ? pl : null]);
    }
    if (maPush) pushCapNhat.add(maPush);
  }
  // ext_id da co (chong trung, UNIQUE) -> biet chinh xac dong nao MOI (de tu dong dien ngay KRF chi cho thu moi)
  const daCo = new Set<string>();
  const ext = dong.map((d) => d[0]);
  for (let i = 0; i < ext.length; i += 500) {
    const rs = await db.prepare("SELECT ext_id FROM tl_mail WHERE ext_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ext.slice(i, i + 500))).all<{ ext_id: string }>();
    for (const r of rs.results) daCo.add(r.ext_id);
  }
  const moi = dong.filter((d) => !daCo.has(d[0]));
  let them = 0;
  for (let i = 0; i < moi.length;) {
    // goi theo kich thuoc (gioi han do dai tham so D1)
    let j = i, kt = 0;
    while (j < moi.length && (j === i || kt + JSON.stringify(moi[j]).length < 700_000)) kt += JSON.stringify(moi[j++]).length;
    const res = await db.prepare(
      `INSERT OR IGNORE INTO tl_mail (ext_id, ma_push, eo_item_id, huong, doi_tac, tu, den, tieu_de, tom_tat, thoi_gian, payload)
       SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'), json_extract(value,'$[4]'),
              json_extract(value,'$[5]'), json_extract(value,'$[6]'), json_extract(value,'$[7]'), json_extract(value,'$[8]'), json_extract(value,'$[9]'),
              json_extract(value,'$[10]') FROM json_each(?)`,
    ).bind(JSON.stringify(moi.slice(i, j))).run();
    them += res.meta.changes ?? 0;
    i = j;
  }
  if (pushCapNhat.size) {
    await db.prepare(
      `UPDATE tl_push SET trang_thai = CASE
         WHEN EXISTS (SELECT 1 FROM tl_mail m WHERE m.ma_push = tl_push.ma_push AND m.huong = 'NHAN') THEN 'DA_PHAN_HOI'
         WHEN EXISTS (SELECT 1 FROM tl_mail m WHERE m.ma_push = tl_push.ma_push) THEN 'DA_GUI'
         ELSE 'DA_TAO'
       END
       WHERE ma_push IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify([...pushCapNhat])).run();
  }
  // Thu KRF tra loi co ngay "KRF dap ung" cho dong nay -> tu dong dien ngay NM cam ket (lib/krfGoiY.ts, chi dong khop chac, chi thu MOI).
  const krfDong = new Set<number>();
  for (const d of moi) {
    if (d[2] && d[3] === "NHAN" && d[10]) {
      try { if (JSON.parse(d[10])?.dong?.ngay_dap_ung) krfDong.add(d[2]); } catch { /* bo qua */ }
    }
  }
  if (them) await bumpVersions(db, ["theo_doi"]);
  // Loi tu dong dien khong lam hong viec nhan mail (mail da ghi; dong khong dien duoc van hien o "Ngày KRF từ mail").
  const tuDong = await tuDongDienKrf(c.env, [...krfDong]).catch((err) => {
    console.error("tuDongDienKrf", err);
    return null;
  });
  return c.json({ received: evs.length, inserted: them, krf_tu_dong: tuDong ? { them: tuDong.them, sua: tuDong.sua } : null });
});

// ============================================================ API DOC (v0.091) - he khac lay ca ton CEO, tong hop / chi tiet loi theo ma ER.MH
// Xac thuc: header X-API-Key = secret DOC_API_KEY (chua dat -> 503 NOT_CONFIGURED). Chi doc, khong ghi.
//  GET /ma-loi                    bang ma loi ER.MH (001-004, 101-199, 201-203, 301-308)
//  GET /ca-ceo                    dong dang mo cap CEO kem ma 201-203 + dien giai
//  GET /loi/tong-hop              tong hop theo ma: so loi, cho / da giai trinh, % giai trinh, so dong / PO, nguoi bi gan, nguyen nhan (Ai)
//  GET /loi?ma=&po=&trang_thai=&tu=&den=&limit=&offset=   chi tiet tung loi + giai trinh (ma / po nhieu gia tri noi "|"; tu/den theo han YYYY-MM-DD)
//  GET /theo-id?ids=&po_lk=       (v0.108) ket qua mua hang theo ID case / ID don app linh kien - xem routes "theo-id" ben duoi
const docKey = async (c: any, next: () => Promise<void>) => {
  const key = c.env.DOC_API_KEY;
  if (!key) return c.json({ error: "NOT_CONFIGURED" }, 503);
  if (!eqConst(c.req.header("X-API-Key") ?? "", key)) return c.json({ error: "INVALID_API_KEY" }, 401);
  await next();
};
app.get("/ma-loi", docKey, async (c) => c.json({ ma_loi: (await layBangMaLoi(c.env.DB)).ds }));
app.get("/ca-ceo", docKey, async (c) => {
  await danhGiaQuyTac(c.env).catch(() => {});
  // v0.097: moi ca kem muc_xu_ly (TON_DONG / BO_QUA_GT / DA_XU_LY) + ly_do_xu_ly; dem = so dong / PO theo muc
  const rows = await dsCaCeoXuLy(c.env);
  // v0.100: ca = PO + ma CEO (gop nhieu dong); dem theo ca / dong / PO
  const ca = gomCaCeo(rows).map(({ dong, ...x }) => ({ ...x, item_ids: dong.map((r) => r.item_id) }));
  return c.json({ so_ca: ca.length, so_dong: rows.length, dem: demTheoMuc(rows), ca, rows });
});
app.get("/loi/tong-hop", docKey, async (c) => {
  await danhGiaQuyTac(c.env).catch(() => {});
  const { rows, bang } = await dsLoiDayDu(c.env);
  const vp = gomViPham(rows);
  // v0.093: dem theo VI PHAM GOP (PO + loai + ky); so_ban_ghi = so dong bi anh huong
  return c.json({ tong_vi_pham: vp.length, cho_giai_trinh: vp.filter((v) => v.tt === "CHO").length, so_ban_ghi: rows.length, theo_ma: tongHopTheoMa(rows, bang) });
});
app.get("/loi", docKey, async (c) => {
  const q = (k: string) => (c.req.query(k) ?? "").trim();
  const ds = (k: string) => q(k).split("|").map((x) => x.trim().toUpperCase()).filter(Boolean);
  const ma = ds("ma"), po = ds("po"), tt = ds("trang_thai"), tu = q("tu"), den = q("den");
  const limit = Math.min(Math.max(1, Number(q("limit")) || 500), 2000), offset = Math.max(0, Number(q("offset")) || 0);
  const { rows } = await dsLoiDayDu(c.env);
  const loc = rows.filter((r) => (!ma.length || ma.includes(r.ma_loi)) && (!po.length || po.includes(String(r.approval_code ?? "").toUpperCase()) || po.includes(String(r.eo_code).toUpperCase()))
    && (!tt.length || tt.includes(r.trang_thai)) && (!tu || String(r.han ?? r.created_at).slice(0, 10) >= tu) && (!den || String(r.han ?? r.created_at).slice(0, 10) <= den));
  const out = loc.slice(offset, offset + limit).map((r) => ({
    id: r.id, vi_pham: r.vp_khoa, ma_loi: r.ma_loi, ten_loi: r.ten_ma, buoc: r.buoc, quy_tac: r.quy_tac, trang_thai: r.trang_thai, muc_do: r.muc, han: r.han,
    ngay_tham_chieu: r.ngay_tham_chieu, lan_thu: r.lan_thu, so_lan: r.so_lan, tuoi_ngay: r.tuoi_ngay,
    po: r.approval_code ?? r.eo_code, eo_code: r.eo_code, item_id: r.eo_item_id, ma_lk: r.part_code, ten_lk: r.part_name, kho: r.kho, doi_tac: r.doi_tac,
    nguoi_dat: r.nguoi_dat, nguoi_bi_gan: r.nguoi_vp, so_nhac: r.so_nhac, cap_ceo: r.ceo,
    giai_trinh: r.gt_luc ? { luc: r.gt_luc, boi: r.gt_boi, ai_ma: r.gt_ai_ma, ai_email: r.gt_ai_email, loi_ma: r.gt_loi_ma, noi_dung: r.gt_noi_dung, pham_vi: r.gt_pham_vi, co_anh: r.gt_co_anh, tu_dong: r.tu_dong } : null,
  }));
  return c.json({ total: loc.length, limit, offset, rows: out });
});

// ============================================================ GET /theo-id (v0.108, 20/11/2026)
// App linh kien (linhkien) hoi: "ticket / don / case nay da duoc Mua hang dat chua, PO nao, ve chua, ngay du kien?".
//  ids   = cac ma noi "|" (<= 50): ma case (B1467882, T21306, 1149078...), DDH-xxxxxx (don), TLK-xxxxxx (ticket thieu hang)
//          -> khop neu ma xuat hien trong O "ID CRM" HOAC O "ID dat hang" cua dong EO (du lieu that: nhap lan cot, nhieu ma 1 o, co dau nhay
//          -> tach tung ma trong o, khong phan biet hoa thuong).
//  po_lk = cap "3TDO-000778~MA_LK" noi "|" (<= 50): ticket da ghi ma EO mua hang -> dong cua PO do co ma LK do (ke ca ma goc truoc khi thay ma).
// Tra moi dong khop 1 lan + khop_theo (ma nao khop). Chi doc. Doc it: chi muc ma trong bo nho isolate theo version eo + dong_cache theo item_id.
const tachMa = (s: unknown) => String(s ?? "").toUpperCase().split(/[\s,;|/"'()]+/)
  .map((x) => x.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "")).filter((x) => x.length >= 3);
let chiMucMa: { tag: string; map: Map<string, number[]> } | null = null;
async function layChiMucMa(db: D1Database): Promise<Map<string, number[]>> {
  const tag = await versionTag(db, ["eo"]);
  if (chiMucMa?.tag === tag) return chiMucMa.map;
  const rs = (await db.prepare(
    `SELECT id, crm_id, order_id FROM eo_item WHERE (crm_id IS NOT NULL AND crm_id <> '') OR (order_id IS NOT NULL AND order_id <> '')`,
  ).all<{ id: number; crm_id: string | null; order_id: string | null }>()).results;
  const map = new Map<string, number[]>();
  for (const r of rs) for (const m of new Set([...tachMa(r.crm_id), ...tachMa(r.order_id)])) map.set(m, [...(map.get(m) ?? []), r.id]);
  chiMucMa = { tag, map };
  return map;
}
app.get("/theo-id", docKey, async (c) => {
  const db = c.env.DB;
  const ids = [...new Set((c.req.query("ids") ?? "").split("|").flatMap(tachMa))].slice(0, 50);
  const cap = [...new Set((c.req.query("po_lk") ?? "").split("|").map((x) => x.trim().toUpperCase()).filter((x) => x.includes("~")))].slice(0, 50)
    .map((x) => { const [po, lk] = x.split("~"); return { k: x, po: po.trim(), lk: lk.trim() }; }).filter((x) => x.po && x.lk);
  if (!ids.length && !cap.length) return c.json({ error: "THIEU_THAM_SO", chi_tiet: "Cần ids hoặc po_lk" }, 400);
  const khop = new Map<number, Set<string>>();
  const ghi = (id: number, ma: string) => khop.set(id, (khop.get(id) ?? new Set()).add(ma));
  if (ids.length) {
    const map = await layChiMucMa(db);
    for (const m of ids) for (const id of map.get(m) ?? []) ghi(id, m);
  }
  if (cap.length) {
    const rs = (await db.prepare(
      `SELECT i.id, x.value k FROM json_each(?) x JOIN eo e ON e.approval_code = json_extract(x.value, '$.po')
       JOIN eo_item i ON i.eo_id = e.id AND (UPPER(i.part_code) = json_extract(x.value, '$.lk') OR UPPER(i.part_code_goc) = json_extract(x.value, '$.lk'))`,
    ).bind(JSON.stringify(cap.map((x) => JSON.stringify({ po: x.po, lk: x.lk })))).all<{ id: number; k: string }>()).results;
    for (const r of rs) { const v = JSON.parse(r.k); ghi(r.id, `${v.po}~${v.lk}`); }
  }
  const itemIds = [...khop.keys()];
  const dong = itemIds.length ? await dongCacheTheo(c.env, "item_id IN (SELECT value FROM json_each(?1))", JSON.stringify(itemIds), (r) => khop.has(r.item_id)) : [];
  const rows = dong.map((r: any) => ({
    khop_theo: [...(khop.get(r.item_id) ?? [])],
    eo_item_id: r.item_id, eo_id: r.eo_id, eo_code: r.eo_code, ma_phe_duyet: r.ma_phe_duyet ?? null, link: `https://muahang.dichvu3t.workers.dev/eo/${r.eo_id}`,
    trang_thai_eo: r.trang_thai_eo, ngay_ban_hanh: r.ngay_ban_hanh ?? null, ngay_dat_hang: r.ngay_dat_hang ?? null, nguoi_dat: r.nguoi_tao ?? null,
    id_crm: String(r.id_crm ?? "").replace(/^[\s"']+|[\s"']+$/g, "") || null, id_dat_hang: String(r.id_dat_hang ?? "").replace(/^[\s"']+|[\s"']+$/g, "") || null,
    ma_lk: r.part_code, ma_lk_goc: r.part_code_goc ?? null, ten_lk: r.part_name ?? "", kho: r.kho, doi_tac: r.doi_tac ?? null,
    sl_dat: r.so_luong_dat, sl_ve: r.sl_nhap_amis_dung_eo ?? 0, sl_con_thieu: r.so_luong_con_thieu ?? 0,
    trang_thai: r.trang_thai_don_hang, ket_thuc: TRANG_THAI_DONG.includes(r.trang_thai_don_hang),
    ngay_du_kien: r.ngay_du_kien_gan_nhat ?? null, ngay_nm_cam_ket: r.ngay_nm_cam_ket ?? null, ngay_ve_gan_nhat: r.ngay_nhap_kho_amis_theo_eo ?? null,
    canh_bao: r.canh_bao || null, so_lan_lui: r.so_lan_doi_ngay_du_kien ?? 0,
  })).sort((a, b) => String(b.ngay_dat_hang ?? "").localeCompare(String(a.ngay_dat_hang ?? "")) || b.eo_item_id - a.eo_item_id);
  return c.json({ so_dong: rows.length, khong_khop: [...ids, ...cap.map((x) => `${x.po}~${x.lk}`)].filter((m) => !rows.some((r) => r.khop_theo.includes(m))), rows });
});

export default app;
