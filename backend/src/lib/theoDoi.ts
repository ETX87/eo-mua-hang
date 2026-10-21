import type { Env } from "../types";
import { computeTienDo01 } from "../routes/reports";
import { cachedReport } from "./reportCache";
import { bumpVersions } from "./dataVersions";
import { nowVN, todayVN } from "./vnTime";

/**
 * "Theo doi linh kien dat" - kiem soat ngay du kien hang ve tung dong EO (migrations/0012). Quy tac:
 *  R1  tu luc dong bat dau (EO ban hanh / dong them sau ban hanh duoc duyet) -> 24h LAM VIEC (bo Chu nhat) phai co
 *      ngay du kien (co it nhat 1 item_plan, ke ca da xoa mem). Tre -> loi.
 *  R3  Thu 2 / thu 4 (ngay X, dong bat dau truoc X): het ngay X ma dong van chua tung co ngay du kien va khong nam
 *      trong dot push doi tac (tl_push_item ngay X) -> loi.
 *  R4  Ngay du kien gan nhat D < hom nay, dong chua du hang: tu 00:00 ngay D+1 + 24h lam viec phai nhap ngay moi
 *      (ngay du kien gan nhat > D). Qua han -> loi (khoa theo D, moi lan qua han 1 loi).
 *  Cap CEO (1 trong 3): lui ngay du kien >= 3 lan | ngay du kien gan nhat - ngay dat >= 30 ngay ma chua du | >= 3 loi.
 * Chi mien khi hang VE DU (chot 2026-10-21): ve thieu van canh bao - phai ve du hoac sua lai SL dat. Dong da ve du =
 * 'Ket thuc' (ngoai pham vi). R1/R3 khong ghi loi neu ngay chung tu AMIS lam du SL <= han (nhap AMIS muon khong bi loi oan).
 * Chi ap cho dong cua EO ban hanh tu app_settings 'theo_doi_ap_dung_tu'. Khong cron: danhGiaQuyTac() chay sau
 * request (toi da 10 phut/lan, khoa tl_state) + khi mo man Theo doi. Loi ghi theo dung han, idempotent (khoa UNIQUE).
 */

const DONG = ["Kết thúc", "Đơn trên EO bị hủy"];
const EVAL_GAP_MS = 10 * 60_000;

const parseVN = (s: string) => new Date(s.slice(0, 19).replace(" ", "T") + "Z");
const fmtVN = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const vnPlus = (ms: number) => fmtVN(new Date(Date.now() + 7 * 3600_000 + ms));

/** Cong N gio LAM VIEC (bo qua tron ngay Chu nhat) vao 1 moc gio VN 'YYYY-MM-DD HH:MM:SS'. */
export function congGioLamViec(start: string, gio = 24): string {
  let t = parseVN(start);
  let con = gio * 3600_000;
  while (con > 0) {
    const nuaDem = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
    if (t.getUTCDay() === 0) { t = new Date(nuaDem); continue; }
    const buoc = Math.min(con, nuaDem - t.getTime());
    t = new Date(t.getTime() + buoc);
    con -= buoc;
  }
  return fmtVN(t);
}
const ngaySau = (d: string) => { const x = parseVN(`${d.slice(0, 10)} 00:00:00`); x.setUTCDate(x.getUTCDate() + 1); return fmtVN(x); };
const soNgay = (a: string, b: string) => Math.round((parseVN(`${b.slice(0, 10)} 00:00:00`).getTime() - parseVN(`${a.slice(0, 10)} 00:00:00`).getTime()) / 86400_000);

export interface DongTheoDoi {
  item_id: number; eo_id: number; eo_code: string; ma_phe_duyet: string | null; id_dat_lk: string;
  part_code: string; part_name: string; kho: string; doi_tac: string | null; loai_hinh: string | null;
  id_crm: string | null; ghi_chu: string | null; nguoi_dat: string | null;
  so_luong_dat: number; sl_nhap_amis: number; so_luong_con_thieu: number;
  trang_thai_don_hang: string; canh_bao: string; toc_do_hang_ve: string;
  ngay_ban_hanh: string | null; ngay_du_kien_gan_nhat: string | null;
  ap_dung: boolean; bat_dau: string | null; han_ngay_du_kien: string | null; co_ngay_du_kien: boolean; lan_dau_co_ndk: string | null;
  han_cap_nhat_lai: string | null; so_lan_lui: number; so_loi: number; so_loi_cho_gt: number;
  tinh_trang: "CHO_NDK" | "TRE_NDK" | "QUA_HAN_NDK" | "CHO_HANG" | "DONG";
  /** ngay chung tu AMIS ma luy ke ve DU so luong dat (null = chua ve du) */
  ngay_ve_du: string | null;
  /** ngay hang ve thuc te gan nhat (phieu AMIS khop dong, ke ca ve thieu) */
  ngay_hang_ve: string | null;
  /** ngay nha may cam ket cua dot ke hoach cap nhat gan nhat co dien */
  ngay_nm_cam_ket: string | null;
  ceo_ly_do: string[];
}

async function ngayApDung(env: Env): Promise<string> {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'theo_doi_ap_dung_tu'").first<{ value: string }>();
  return (r?.value || "2026-10-21").slice(0, 10);
}
/** Dong dat (ban hanh / tao dong) TRUOC ngay nay bi bo khoi Theo doi hoan toan (chot 2026-10-21: bo don tu thang 06/2026
 *  ve truoc). app_settings 'theo_doi_bo_qua_truoc', Admin sua o Cau hinh he thong. */
async function ngayBoQuaTruoc(env: Env): Promise<string> {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'").first<{ value: string }>();
  return (r?.value || "2026-07-01").slice(0, 10);
}

/** Toan bo dong EO DA BAN HANH (khong gom EO huy) + chi so theo doi. pham_vi 'dang_mo' = chua ket thuc. */
export async function layDongTheoDoi(env: Env, phamVi: "dang_mo" | "tat_ca" = "dang_mo"): Promise<DongTheoDoi[]> {
  const db = env.DB;
  const [apDung, boQuaTruoc] = await Promise.all([ngayApDung(env), ngayBoQuaTruoc(env)]);
  const base = (await cachedReport(db, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(env)))
    .filter((r) => r.trang_thai_eo === "ISSUED" && (phamVi === "tat_ca" || !DONG.includes(r.trang_thai_don_hang))
      // ngay dat = muon hon giua ngay ban hanh EO va ngay tao dong (dong them sau ban hanh)
      && [r.ngay_ban_hanh, r.ngay_tao].filter(Boolean).sort().pop()!.slice(0, 10) >= boQuaTruoc);
  if (!base.length) return [];
  const ids = JSON.stringify(base.map((r) => r.item_id));
  const [meta, firstPlan, loi, ev, veDau] = await Promise.all([
    db.prepare(
      `SELECT i.id, i.created_after_issue, i.post_issue_approved_at, i.created_at, e.created_by, e.issued_at
       FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id IN (SELECT value FROM json_each(?))`,
    ).bind(ids).all<any>(),
    db.prepare(
      `SELECT p.eo_item_id, MIN(p.created_at) t,
              (SELECT p2.factory_committed_date FROM item_plan p2 WHERE p2.eo_item_id = p.eo_item_id AND p2.deleted_at IS NULL
                 AND p2.factory_committed_date IS NOT NULL ORDER BY COALESCE(p2.updated_at, p2.created_at) DESC, p2.id DESC LIMIT 1) nm
       FROM item_plan p WHERE p.eo_item_id IN (SELECT value FROM json_each(?)) GROUP BY p.eo_item_id`,
    ).bind(ids).all<any>(),
    db.prepare(
      `SELECT eo_item_id, COUNT(*) n, SUM(trang_thai = 'CHO_GIAI_TRINH') cho FROM tl_loi
       WHERE eo_item_id IN (SELECT value FROM json_each(?)) GROUP BY eo_item_id`,
    ).bind(ids).all<any>(),
    // lich su ngay du kien (dem so lan lui) - chi dong ap dung de nhe
    db.prepare(
      `SELECT entity_id, event_type, after_json, metadata_json, created_at FROM event_log
       WHERE event_type IN ('ADD_PLAN','UPDATE_PLAN','BULK_PLAN') AND created_at >= ?
         AND eo_id IN (SELECT id FROM eo WHERE issued_at >= ?) ORDER BY created_at, id`,
    ).bind(apDung, apDung).all<any>(),
    // phieu nhap AMIS khop dong (tinh ngay ve DU)
    db.prepare(
      `SELECT matched_eo_item_id id, doc_date d, qty_in q FROM amis_receipt
       WHERE match_status = 'MATCHED_EO' AND matched_eo_item_id IN (SELECT value FROM json_each(?)) ORDER BY doc_date, id`,
    ).bind(ids).all<any>(),
  ]);
  const slDat = new Map(base.map((r) => [r.item_id, r.so_luong_dat as number]));
  const luyKe = new Map<number, number>();
  const veDuBy = new Map<number, string>();
  const veCuoiBy = new Map<number, string>();
  for (const x of veDau.results as any[]) {
    veCuoiBy.set(x.id, x.d);
    if (veDuBy.has(x.id)) continue;
    const t = (luyKe.get(x.id) ?? 0) + (x.q || 0);
    luyKe.set(x.id, t);
    if ((slDat.get(x.id) ?? 0) > 0 && t >= (slDat.get(x.id) ?? 0)) veDuBy.set(x.id, x.d);
  }
  const metaBy = new Map(meta.results.map((r: any) => [r.id, r]));
  const fpBy = new Map(firstPlan.results.map((r: any) => [r.eo_item_id, r.t as string]));
  const nmBy = new Map(firstPlan.results.map((r: any) => [r.eo_item_id, (r.nm as string | null) ?? null]));
  const loiBy = new Map(loi.results.map((r: any) => [r.eo_item_id, r]));
  // so lan lui: chuoi ngay du kien moi nhat theo thoi gian, dem lan ngay moi > ngay truoc
  const luiBy = new Map<number, number>();
  const lastBy = new Map<number, string>();
  for (const e of ev.results) {
    let itemId: number | null = null;
    let ngay: string | null = null;
    try {
      const a = e.after_json ? JSON.parse(e.after_json) : null;
      const m = e.metadata_json ? JSON.parse(e.metadata_json) : null;
      if (e.event_type === "BULK_PLAN") {
        itemId = e.entity_id;
        const ds = (Array.isArray(a) ? a : []).map((x: any) => x.planned_date).filter(Boolean).sort();
        ngay = ds.length ? ds[ds.length - 1] : null;
      } else {
        itemId = Number(m?.eo_item_id ?? e.entity_id);
        ngay = a?.planned_date ?? null;
      }
    } catch { continue; }
    if (!itemId || !ngay) continue;
    const truoc = lastBy.get(itemId);
    if (truoc && ngay > truoc) luiBy.set(itemId, (luiBy.get(itemId) ?? 0) + 1);
    lastBy.set(itemId, ngay);
  }

  const now = nowVN();
  const today = todayVN();
  return base.map((r) => {
    const m = metaBy.get(r.item_id);
    const batDau: string | null = m ? (m.created_after_issue ? (m.post_issue_approved_at || m.created_at) : m.issued_at) : null;
    const apDungDong = !!batDau && batDau.slice(0, 10) >= apDung;
    const han = batDau ? congGioLamViec(batDau) : null;
    const lanDau = fpBy.get(r.item_id) ?? null;
    const coNdk = !!r.ngay_du_kien_gan_nhat;
    const dong = DONG.includes(r.trang_thai_don_hang);
    const ndk = r.ngay_du_kien_gan_nhat as string | null;
    const quaHan = !dong && !!ndk && ndk < today;
    const hanLai = quaHan ? congGioLamViec(ngaySau(ndk!)) : null;
    const tinhTrang: DongTheoDoi["tinh_trang"] = dong ? "DONG" : quaHan ? "QUA_HAN_NDK"
      : !coNdk ? (han && now > han ? "TRE_NDK" : "CHO_NDK") : "CHO_HANG";
    const l = loiBy.get(r.item_id);
    const soLoi = l?.n ?? 0;
    const soLui = luiBy.get(r.item_id) ?? 0;
    const ceo: string[] = [];
    if (apDungDong && !dong) {
      if (soLui >= 3) ceo.push(`Lùi ngày dự kiến ${soLui} lần`);
      const ngayDat = (batDau ?? r.ngay_tao).slice(0, 10);
      if (ndk && soNgay(ngayDat, ndk) >= 30) ceo.push(`Ngày dự kiến cách ngày đặt ${soNgay(ngayDat, ndk)} ngày, chưa có hàng`);
      if (soLoi >= 3) ceo.push(`${soLoi} lỗi`);
    }
    return {
      item_id: r.item_id, eo_id: r.eo_id, eo_code: r.eo_code, ma_phe_duyet: r.ma_phe_duyet ?? null, id_dat_lk: r.id_dat_lk,
      part_code: r.part_code, part_name: r.part_name ?? "", kho: r.kho, doi_tac: r.doi_tac ?? null, loai_hinh: r.loai_hinh ?? null,
      id_crm: r.id_crm || null, ghi_chu: r.ghi_chu || null, nguoi_dat: m?.created_by ?? null,
      so_luong_dat: r.so_luong_dat, sl_nhap_amis: r.sl_nhap_amis_dung_eo, so_luong_con_thieu: r.so_luong_con_thieu,
      trang_thai_don_hang: r.trang_thai_don_hang, canh_bao: r.canh_bao, toc_do_hang_ve: r.toc_do_hang_ve,
      ngay_ban_hanh: r.ngay_ban_hanh, ngay_du_kien_gan_nhat: ndk,
      ap_dung: apDungDong, bat_dau: batDau, han_ngay_du_kien: han, co_ngay_du_kien: coNdk, lan_dau_co_ndk: lanDau,
      han_cap_nhat_lai: hanLai, so_lan_lui: soLui, so_loi: soLoi, so_loi_cho_gt: l?.cho ?? 0,
      tinh_trang: tinhTrang, ceo_ly_do: ceo, ngay_ve_du: veDuBy.get(r.item_id) ?? null,
      ngay_hang_ve: veCuoiBy.get(r.item_id) ?? null, ngay_nm_cam_ket: nmBy.get(r.item_id) ?? null,
    };
  });
}

/** Ghi loi tu dong R1/R3/R4 (idempotent). Tra so loi moi. force = bo qua khoang cach 10 phut. */
export async function danhGiaQuyTac(env: Env, force = false): Promise<number> {
  const db = env.DB;
  const now = nowVN();
  if (!force) {
    // chi doc (re) - tranh 1 lan ghi khoa moi request
    const st = await db.prepare("SELECT danh_gia_luc, running_until FROM tl_state WHERE id = 1").first<{ danh_gia_luc: string | null; running_until: string | null }>();
    if (st?.danh_gia_luc && st.danh_gia_luc >= vnPlus(-EVAL_GAP_MS)) return 0;
    if (st?.running_until && st.running_until > now) return 0;
  }
  const claim = await db.prepare(
    `UPDATE tl_state SET running_until = ?
     WHERE id = 1 AND (running_until IS NULL OR running_until < ?) AND (? = 1 OR danh_gia_luc IS NULL OR danh_gia_luc < ?)`,
  ).bind(vnPlus(120_000), now, force ? 1 : 0, vnPlus(-EVAL_GAP_MS)).run();
  if (!claim.meta.changes) return 0;
  let moi = 0;
  try {
    const rows = (await layDongTheoDoi(env, "dang_mo")).filter((r) => r.ap_dung);
    const today = todayVN();
    const pushRs = rows.length
      ? (await db.prepare("SELECT eo_item_id, ngay FROM tl_push_item WHERE eo_item_id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ eo_item_id: number; ngay: string }>()).results
      : [];
    const pushed = new Set(pushRs.map((p) => `${p.eo_item_id}|${p.ngay}`));
    const loi: unknown[][] = [];
    const add = (r: DongTheoDoi, quyTac: string, khoa: string, han: string, ngayTc: string | null, loiMa: string) =>
      loi.push([r.item_id, r.eo_id, quyTac, khoa, han, ngayTc, "NGUOI_DAT", r.nguoi_dat, loiMa]);
    for (const r of rows) {
      // R1
      // hang da ve DU truoc moc (theo ngay chung tu) -> khong loi
      const veTruoc = (moc: string) => !!r.ngay_ve_du && r.ngay_ve_du <= moc.slice(0, 10);
      if (r.han_ngay_du_kien && now > r.han_ngay_du_kien && (!r.lan_dau_co_ndk || r.lan_dau_co_ndk > r.han_ngay_du_kien) && !veTruoc(r.han_ngay_du_kien)) {
        add(r, "R1", `R1:${r.item_id}`, r.han_ngay_du_kien, null, "KHONG_NDK_24H");
      }
      // R4
      if (r.han_cap_nhat_lai && now > r.han_cap_nhat_lai && r.ngay_du_kien_gan_nhat) {
        add(r, "R4", `R4:${r.item_id}:${r.ngay_du_kien_gan_nhat}`, r.han_cap_nhat_lai, r.ngay_du_kien_gan_nhat, "KHONG_NDK_QUA_HAN");
      }
      // R3: moi thu 2 / thu 4 da qua, ke tu ngay sau khi dong bat dau, ma het ngay do dong chua tung co ngay du kien
      if (r.bat_dau) {
        const d = parseVN(`${r.bat_dau.slice(0, 10)} 00:00:00`);
        d.setUTCDate(d.getUTCDate() + 1);
        for (; fmtVN(d).slice(0, 10) < today; d.setUTCDate(d.getUTCDate() + 1)) {
          const dow = d.getUTCDay();
          if (dow !== 1 && dow !== 3) continue;
          const x = fmtVN(d).slice(0, 10);
          const hetNgay = `${x} 23:59:59`;
          if (r.lan_dau_co_ndk && r.lan_dau_co_ndk <= hetNgay) break; // da co ngay du kien tu truoc -> het nghia vu push
          if (veTruoc(x)) break; // hang da ve du -> het nghia vu push
          if (!pushed.has(`${r.item_id}|${x}`)) add(r, "R3", `R3:${r.item_id}:${x}`, hetNgay, x, "KHONG_PUSH");
        }
      }
    }
    for (let i = 0; i < loi.length; i += 300) {
      const res = await db.prepare(
        `INSERT OR IGNORE INTO tl_loi (eo_item_id, eo_id, quy_tac, khoa, han, ngay_tham_chieu, ai_ma, ai_email, loi_ma, created_at)
         SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'),
                json_extract(value,'$[4]'), json_extract(value,'$[5]'), json_extract(value,'$[6]'), json_extract(value,'$[7]'),
                json_extract(value,'$[8]'), ? FROM json_each(?)`,
      ).bind(now, JSON.stringify(loi.slice(i, i + 300))).run();
      moi += res.meta.changes ?? 0;
    }
    if (moi > 0) await bumpVersions(db, ["theo_doi"]);
    await db.prepare("UPDATE tl_state SET danh_gia_luc = ?, running_until = NULL, so_loi_moi = ? WHERE id = 1").bind(nowVN(), moi).run();
  } catch (err) {
    await db.prepare("UPDATE tl_state SET running_until = NULL WHERE id = 1").run();
    throw err;
  }
  return moi;
}
