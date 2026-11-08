import type { Env } from "../types";
import { versionTag } from "./dataVersions";
import { nowVN, todayVN } from "./vnTime";
import { ketQuaGd } from "./giaiDoan";
import { tinhTrangBayGio } from "./theoDoi";

/**
 * Cache THEO TUNG DONG cua /api/so-don-hang (2026-11-08, yeu cau #25, migration 0021).
 *  - damBaoDongCache: khi tag (version eo/amis/settings/theo_doi + ngay VN) doi -> dung lai TOAN BO dong bang ham `xay` (pipeline cu,
 *    co cache blob), so chu ky (sig) voi ban cu, CHI GHI dong khac (seq moi). Lan dau ghi het. Khoa building_until chong 2 request cung dung.
 *  - Phan "bay gio" (NOW_KEYS) KHONG tinh vao sig: dong dang mo (mo = 1) tinh lai moi request tu nguon_now (re) -> khong ghi lai dong
 *    chi vi thoi gian troi.
 *  - Doc: theo PO (eo_id), theo seq (FE tai phan doi), hoac tat ca.
 */
const DOMAINS = ["eo", "amis", "settings", "theo_doi"] as const;
const NOW_KEYS = new Set(["gd_gio", "gd_tre", "g4_trang_thai", "gd_gio_tung", "gd_tre_tung", "tinh_trang"]);
const KHOA_MS = 60_000;
const TOI_DA_KY_TU = 45_000; // ky tu JSON / cau lenh (UTF-8 tieng Viet ~1.3 byte/ky tu -> < 100KB)
const LO_BATCH = 40;

type Row = Record<string, any>;
export interface MetaCache { seq: number; epoch: string; sla: Record<string, number> }

const vnSau = (ms: number) => new Date(Date.now() + 7 * 3600_000 + ms).toISOString().slice(0, 19).replace("T", " ");
/** FNV-1a 32 bit + do dai - du de phat hien noi dung doi (khong can bao mat). */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${h.toString(36)}:${s.length}`;
}
const tinh = (r: Row) => { const o: Row = {}; for (const k of Object.keys(r)) if (!NOW_KEYS.has(k)) o[k] = r[k]; return JSON.stringify(o); };
/** Dong con thay doi theo thoi gian: chua ket thuc giai doan / con trong theo doi chua dong. */
const laMo = (r: Row) => (r.gd_hien_tai !== "XONG" && r.gd_hien_tai !== "HUY") || (!!r.tinh_trang && r.tinh_trang !== "DONG");
const nguonNow = (r: Row) => ({
  gd_moc: r.gd_moc ?? {}, gd_hien_tai: r.gd_hien_tai, so_lan_trinh: r.so_lan_trinh ?? 0, so_lan_tra_ve: r.so_lan_tra_ve ?? 0,
  trang_thai_don_hang: r.trang_thai_don_hang, ngay_du_kien_gan_nhat: r.ngay_du_kien_gan_nhat ?? null,
  han_ngay_du_kien: r.han_ngay_du_kien ?? null, theo_doi: !!r.theo_doi,
});

/** Cac truong "bay gio" cua 1 dong dang mo (giong het /so-don-hang cu: lib/giaiDoan ketQuaGd + lib/theoDoi tinhTrangBayGio). */
export function phanBayGio(s: Row, now: string, today: string): Row {
  const ket = s.gd_hien_tai === "XONG" || s.gd_hien_tai === "HUY" ? s.gd_hien_tai : null;
  const g = s.gd_moc && Object.keys(s.gd_moc).length
    ? ketQuaGd({ gd: s.gd_moc, ket_thuc: ket, so_lan_trinh: s.so_lan_trinh ?? 0, so_lan_tra_ve: s.so_lan_tra_ve ?? 0 }, now) : null;
  return {
    gd_gio: g?.gd_gio ?? null, gd_tre: g?.gd_tre ?? null, g4_trang_thai: g?.g4_trang_thai ?? null,
    gd_gio_tung: g?.gio ?? {}, gd_tre_tung: g?.tre ?? {},
    tinh_trang: s.theo_doi ? tinhTrangBayGio(s as any, now, today) : null,
  };
}

async function docMeta(db: D1Database) {
  return (await db.prepare("SELECT tag, seq, epoch, sla, building_until FROM dong_cache_meta WHERE id = 1").first<any>())!;
}
const ketQua = (m: any): MetaCache => ({ seq: m.seq, epoch: m.epoch, sla: m.sla ? JSON.parse(m.sla) : {} });

export async function damBaoDongCache(env: Env, xay: () => Promise<{ rows: Row[]; sla: Record<string, number> }>): Promise<MetaCache> {
  const db = env.DB;
  const tag = await versionTag(db, [...DOMAINS], todayVN());
  let m = await docMeta(db);
  if (m.tag === tag) return ketQua(m);
  const claim = await db.prepare(
    "UPDATE dong_cache_meta SET building_until = ? WHERE id = 1 AND (building_until IS NULL OR building_until < ?)",
  ).bind(vnSau(KHOA_MS), nowVN()).run();
  if (!claim.meta.changes) {
    // request khac dang dung -> cho toi da 20s doc ket qua cua no
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      m = await docMeta(db);
      if (m.tag === tag) return ketQua(m);
    }
  }
  try {
    const { rows, sla } = await xay();
    const cu = new Map((await db.prepare("SELECT item_id, sig FROM dong_cache").all<{ item_id: number; sig: string }>()).results.map((r) => [r.item_id, r.sig]));
    const seq = (m.seq ?? 0) + 1;
    const doi: unknown[][] = [];
    for (const r of rows) {
      const sig = fnv(tinh(r));
      if (cu.get(r.item_id) !== sig) doi.push([r.item_id, r.eo_id, sig, seq, laMo(r) ? 1 : 0, JSON.stringify(r), JSON.stringify(nguonNow(r)),
        String(r.part_code ?? "").trim().toUpperCase() || null, String(r.part_code_goc ?? "").trim().toUpperCase() || null]);
    }
    // D1: moi cau lenh <= 100KB (KE CA tham so - local khong chan) + ca batch <= 30s -> chia theo DO DAI (<= TOI_DA_KY_TU / cau lenh,
    // chu Viet UTF-8 nhieu byte nen de du), moi batch <= LO_BATCH cau lenh. Lan dung dau ghi ~9.000 dong -> vai chuc batch.
    const sql = `INSERT INTO dong_cache (item_id, eo_id, sig, seq, mo, data, nguon_now, ma_lk, ma_goc)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'),
                json_extract(value, '$[8]') FROM json_each(?) WHERE true
         ON CONFLICT(item_id) DO UPDATE SET eo_id = excluded.eo_id, sig = excluded.sig, seq = excluded.seq, mo = excluded.mo,
           data = excluded.data, nguon_now = excluded.nguon_now, ma_lk = excluded.ma_lk, ma_goc = excluded.ma_goc`;
    const stmts: D1PreparedStatement[] = [];
    let goi: string[] = [], dai = 0;
    const dong = () => { if (goi.length) stmts.push(db.prepare(sql).bind(`[${goi.join(",")}]`)); goi = []; dai = 0; };
    for (const x of doi) {
      const s = JSON.stringify(x);
      if (goi.length && dai + s.length > TOI_DA_KY_TU) dong();
      goi.push(s); dai += s.length + 1;
    }
    dong();
    for (let i = 0; i < stmts.length; i += LO_BATCH) await db.batch(stmts.slice(i, i + LO_BATCH));
    await db.prepare("UPDATE dong_cache_meta SET tag = ?, seq = ?, sla = ?, building_until = NULL, loi = NULL WHERE id = 1")
      .bind(tag, doi.length ? seq : m.seq, JSON.stringify(sla)).run();
    return { seq: doi.length ? seq : m.seq, epoch: m.epoch, sla };
  } catch (e) {
    // ghi loi de chan doan (migration 0022); dong da ghi xong o cac batch truoc van giu (lan sau so sig, khong ghi lai)
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await db.prepare("UPDATE dong_cache_meta SET building_until = NULL, loi = ?, loi_luc = ? WHERE id = 1").bind(msg.slice(0, 800), nowVN()).run()
      .catch(() => db.prepare("UPDATE dong_cache_meta SET building_until = NULL WHERE id = 1").run().catch(() => {}));
    throw e;
  }
}

/** Doc dong da cache + lam tuoi phan "bay gio" cho dong dang mo. */
export function lamTuoi(ds: { data: string; mo: number; nguon_now: string | null }[]): Row[] {
  const now = nowVN(), today = todayVN();
  return ds.map((x) => {
    const r = JSON.parse(x.data);
    return x.mo && x.nguon_now ? { ...r, ...phanBayGio(JSON.parse(x.nguon_now), now, today) } : r;
  });
}
export function phanBayGioDs(ds: { item_id: number; nguon_now: string | null }[]): Row[] {
  const now = nowVN(), today = todayVN();
  return ds.filter((x) => x.nguon_now).map((x) => ({ item_id: x.item_id, ...phanBayGio(JSON.parse(x.nguon_now!), now, today) }));
}

/**
 * Doc dong da gop tu cache theo dieu kien (vd "eo_id = ?1", "ma_lk = ?1 OR ma_goc = ?1") - dam bao cache moi truoc.
 * Dung cho popup EO / popup ma LK (routes/xemNhanh) - chi doc dung cac dong can.
 */
export async function dongCacheTheo(env: Env, where: string, thamSo: unknown, loc: (r: Row) => boolean): Promise<Row[]> {
  const { xayDongSdh } = await import("../routes/soDonHang");
  try { await damBaoDongCache(env, () => xayDongSdh(env)); } catch (e) {
    // cache loi -> tinh truc tiep (cham hon nhung dung)
    console.error("dongCache", e);
    return (await xayDongSdh(env)).rows.filter(loc);
  }
  const ds = (await env.DB.prepare(`SELECT data, mo, nguon_now FROM dong_cache WHERE ${where} ORDER BY item_id`).bind(thamSo)
    .all<{ data: string; mo: number; nguon_now: string | null }>()).results;
  return lamTuoi(ds);
}
