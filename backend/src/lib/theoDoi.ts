import type { Env } from "../types";
import { computeTienDo01, TRANG_THAI_DONG } from "../routes/reports";
import { cachedReport } from "./reportCache";
import { bumpVersions } from "./dataVersions";
import { nowVN, todayVN } from "./vnTime";
import { laNhomR1_24h } from "./chuanHoa";

/**
 * "Theo doi linh kien dat" - kiem soat ngay du kien hang ve tung dong EO (migrations/0012). Quy tac:
 *  R1  tu luc dong bat dau (EO ban hanh / dong them sau ban hanh duoc duyet) -> 48h LAM VIEC (bo Chu nhat, tu 2026-11-05; truoc la 24h) phai co
 *      ngay du kien (co it nhat 1 item_plan, ke ca da xoa mem). Tre -> loi.
 *  R3  Thu 2 / thu 4 (ngay X, dong bat dau truoc X): het ngay X ma dong van chua tung co ngay du kien va khong nam
 *      trong dot push doi tac (tl_push_item ngay X) / khong co mail (tl_mail) / lien he ghi tay (tl_lien_he) trong ky -> loi.
 *  R4  Ngay du kien gan nhat D < hom nay, dong chua du hang: tu 00:00 ngay D+1 + 24h lam viec phai nhap ngay moi
 *      (ngay du kien gan nhat > D). Qua han -> loi (khoa theo D, moi lan qua han 1 loi).
 *  Cap CEO (1 trong 3): lui ngay du kien >= 3 lan | ngay du kien gan nhat - ngay dat >= 30 ngay ma chua du | >= 3 loi.
 * Chi mien khi hang VE DU (chot 2026-10-21): ve thieu van canh bao - phai ve du hoac sua lai SL dat. Dong da ve du =
 * 'Ket thuc' (ngoai pham vi). R1/R3 khong ghi loi neu ngay chung tu AMIS lam du SL <= han (nhap AMIS muon khong bi loi oan).
 * Chi ap cho dong cua EO ban hanh tu app_settings 'theo_doi_ap_dung_tu'. Khong cron: danhGiaQuyTac() chay sau
 * request (toi da 10 phut/lan, khoa tl_state) + khi mo man Theo doi. Loi ghi theo dung han, idempotent (khoa UNIQUE).
 */

const DONG = TRANG_THAI_DONG;
const EVAL_GAP_MS = 10 * 60_000;
/** R1: so gio LAM VIEC tu luc dong bat dau den han phai co ngay du kien (2026-11-05: 24 -> 48). */
export const GIO_R1 = 48;
/** R1 nhom Karofi / Livotec / Korihome (lib/chuanHoa laNhomR1_24h): 24h - chi dong BAT DAU tu app_settings 'r1_24h_tu' (2026-11-08),
 *  dong cu giu 48h (khong ghi loi hoi to). */
export const GIO_R1_NHOM = 24;
export const gioR1 = (doiTac: string | null | undefined, batDau: string | null, tu: string) =>
  laNhomR1_24h(doiTac) && !!batDau && batDau.slice(0, 10) >= tu ? GIO_R1_NHOM : GIO_R1;

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
  ap_dung: boolean; bat_dau: string | null; han_ngay_du_kien: string | null; /** 24 (nhom Karofi/Livotec/Korihome) | 48 */ gio_r1: number; co_ngay_du_kien: boolean; lan_dau_co_ndk: string | null;
  han_cap_nhat_lai: string | null; so_lan_lui: number; so_loi: number; so_loi_cho_gt: number;
  tinh_trang: "CHO_NDK" | "TRE_NDK" | "QUA_HAN_NDK" | "CHO_HANG" | "DONG";
  /** ngay chung tu AMIS ma luy ke ve DU so luong dat (null = chua ve du) */
  ngay_ve_du: string | null;
  /** ngay chung tu AMIS LAN VE DAU TIEN (ke ca ve thieu) - tu ngay nay moi loi R1/R3/R4 bo qua (2026-11-08) */
  ngay_ve_dau: string | null;
  /** ngay hang ve thuc te gan nhat (phieu AMIS khop dong, ke ca ve thieu) */
  ngay_hang_ve: string | null;
  /** ngay nha may cam ket cua dot ke hoach cap nhat gan nhat co dien */
  ngay_nm_cam_ket: string | null;
  /** dong them SAU khi EO ban hanh (1) hay co tu luc trinh duyet (0) */
  sau_ban_hanh: boolean;
  /** chuoi ngan (viecCanLam loc theo noi dung: "Lùi…", "…ngày đặt…", "…lỗi") - KHONG doi chu */
  ceo_ly_do: string[];
  /** dien giai tung ly do cap CEO (nguong, gia tri, cac lan lui / moc ngay / loi theo quy tac) - FE GiaiThichCeo */
  ceo_chi_tiet: CeoChiTiet[];
  /** cac lan LUI ngay du kien (ngay moi > ngay truoc) - chi dong co lui */
  lui_ds?: LanLui[];
  /** so loi theo quy tac { R1: 1, R3: 4, ... } */
  loi_qt?: Record<string, number>;
}
export interface LanLui { luc: string; tu: string; den: string; ai: string | null }
export interface CeoChiTiet { ma: "LUI" | "XA" | "LOI"; tieu_de: string; nguong: string; gia_tri: string; dong: string[] }
const QT_TEN: Record<string, string> = { R1: "Không có ngày DK trong 24h/48h", R3: "Không push đối tác (thứ 2/4)", R4: "Quá ngày DK không cập nhật", TAY: "Lỗi ghi khi giải trình" };
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

async function ngayApDung(env: Env): Promise<string> {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'theo_doi_ap_dung_tu'").first<{ value: string }>();
  return (r?.value || "2026-10-21").slice(0, 10);
}
/** PO (EO) BAN HANH TRUOC ngay nay bi bo khoi Theo doi + Vi pham hoan toan, ke ca dong them sau (chot 2026-10-21: bo don tu
 *  thang 06/2026 ve truoc; 2026-11-04: tinh theo ngay ban hanh PO). app_settings 'theo_doi_bo_qua_truoc'. */
async function ngayR1_24h(env: Env): Promise<string> {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'r1_24h_tu'").first<{ value: string }>();
  return (r?.value || "2026-11-08").slice(0, 10);
}
async function ngayBoQuaTruoc(env: Env): Promise<string> {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'").first<{ value: string }>();
  return (r?.value || "2026-07-01").slice(0, 10);
}

/** Phan doc DB cua 1 dong theo doi (khong phu thuoc gio hien tai) - cache theo version, xem layDongTheoDoi. */
type GocDong = Omit<DongTheoDoi, "tinh_trang" | "han_cap_nhat_lai" | "ceo_ly_do" | "ceo_chi_tiet" | "co_ngay_du_kien"> & { ngay_tao: string };

/**
 * Toan bo dong EO DA BAN HANH (khong gom EO huy) + chi so theo doi. pham_vi 'dang_mo' = chua ket thuc.
 * Hieu nang (2026-10-31, d1 insights: ~900 lan / tuan x 5 truy van khi chua cache): phan doc DB (meta, ke hoach dau, loi,
 * so lan lui tu event_log, ngay ve du) cache qua cachedReport theo version eo/amis/settings/theo_doi + ngay;
 * phan phu thuoc "bay gio" (tre 48h, qua ngay DK, han cap nhat lai, cap CEO) tinh lai moi lan goi - re, trong bo nho.
 */
/** Tinh trang theo doi "bay gio" (dung chung layDongTheoDoi + lib/dongCache tinh lai dong dang mo moi request). */
export function tinhTrangBayGio(r: { trang_thai_don_hang: string; ngay_du_kien_gan_nhat: string | null; han_ngay_du_kien: string | null }, now: string, today: string): DongTheoDoi["tinh_trang"] {
  const dong = DONG.includes(r.trang_thai_don_hang);
  const ndk = r.ngay_du_kien_gan_nhat;
  return dong ? "DONG" : !!ndk && ndk < today ? "QUA_HAN_NDK"
    : !ndk ? (r.han_ngay_du_kien && now > r.han_ngay_du_kien ? "TRE_NDK" : "CHO_NDK") : "CHO_HANG";
}

export async function layDongTheoDoi(env: Env, phamVi: "dang_mo" | "tat_ca" = "dang_mo"): Promise<DongTheoDoi[]> {
  const goc = await cachedReport(env.DB, "tl:goc-theo-doi:v6", ["eo", "amis", "settings", "theo_doi"], () => tinhGocTheoDoi(env));
  const now = nowVN();
  const today = todayVN();
  const out: DongTheoDoi[] = [];
  for (const g of goc) {
    const dong = DONG.includes(g.trang_thai_don_hang);
    if (phamVi === "dang_mo" && dong) continue;
    const { ngay_tao, ...r } = g;
    const ndk = r.ngay_du_kien_gan_nhat;
    const coNdk = !!ndk;
    const quaHan = !dong && !!ndk && ndk < today;
    const tinhTrang = tinhTrangBayGio(r, now, today);
    const ceo: string[] = [];
    const ct: CeoChiTiet[] = [];
    if (r.ap_dung && !dong) {
      if (r.so_lan_lui >= 3) {
        ceo.push(`Lùi ngày dự kiến ${r.so_lan_lui} lần`);
        ct.push({ ma: "LUI", tieu_de: "Lùi ngày dự kiến nhiều lần", nguong: "≥ 3 lần", gia_tri: `${r.so_lan_lui} lần`,
          dong: (r.lui_ds ?? []).map((x, i) => `Lần ${i + 1}: ${dmy(x.luc)} ${x.luc.slice(11, 16)}${x.ai ? ` · ${x.ai}` : " · Hệ thống"} — ${dmy(x.tu)} → ${dmy(x.den)} (+${soNgay(x.tu, x.den)} ngày)`) });
      }
      const ngayDat = (r.bat_dau ?? ngay_tao).slice(0, 10);
      if (ndk && soNgay(ngayDat, ndk) >= 30) {
        ceo.push(`Ngày dự kiến cách ngày đặt ${soNgay(ngayDat, ndk)} ngày, chưa có hàng`);
        ct.push({ ma: "XA", tieu_de: "Ngày dự kiến quá xa ngày đặt", nguong: "≥ 30 ngày", gia_tri: `${soNgay(ngayDat, ndk)} ngày`,
          dong: [`Ngày đặt ${dmy(ngayDat)} (${r.sau_ban_hanh ? "dòng thêm sau ban hành được duyệt" : "EO ban hành"})`,
            `Ngày dự kiến gần nhất ${dmy(ndk)} → cách ${soNgay(ngayDat, ndk)} ngày`,
            `Đã về ${r.sl_nhap_amis} / ${r.so_luong_dat}, còn thiếu ${r.so_luong_con_thieu}`] });
      }
      if (r.so_loi >= 3) {
        ceo.push(`${r.so_loi} lỗi`);
        ct.push({ ma: "LOI", tieu_de: "Nhiều lỗi theo dõi", nguong: "≥ 3 lỗi (đếm từng lần)", gia_tri: `${r.so_loi} lỗi, ${r.so_loi_cho_gt} chờ giải trình`,
          dong: Object.entries(r.loi_qt ?? {}).map(([q, n]) => `${QT_TEN[q] ?? q}: ${n} lần`) });
      }
    }
    out.push({ ...r, co_ngay_du_kien: coNdk, han_cap_nhat_lai: quaHan ? congGioLamViec(ngaySau(ndk!)) : null, tinh_trang: tinhTrang, ceo_ly_do: ceo, ceo_chi_tiet: ct });
  }
  return out;
}

async function tinhGocTheoDoi(env: Env): Promise<GocDong[]> {
  const db = env.DB;
  const [apDung, boQuaTruoc, r1Tu] = await Promise.all([ngayApDung(env), ngayBoQuaTruoc(env), ngayR1_24h(env)]);
  const base = (await cachedReport(db, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(env)))
    .filter((r) => r.trang_thai_eo === "ISSUED"
      // theo NGAY BAN HANH PO (chot 2026-11-04): PO ban hanh truoc moc -> bo ca PO, ke ca dong them sau moc
      && String(r.ngay_ban_hanh ?? r.ngay_tao).slice(0, 10) >= boQuaTruoc);
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
      `SELECT eo_item_id, quy_tac, COUNT(*) n, SUM(trang_thai = 'CHO_GIAI_TRINH') cho FROM tl_loi
       WHERE eo_item_id IN (SELECT value FROM json_each(?)) GROUP BY eo_item_id, quy_tac`,
    ).bind(ids).all<any>(),
    // lich su ngay du kien (dem so lan lui) - chi dong ap dung de nhe
    db.prepare(
      `SELECT entity_id, event_type, after_json, metadata_json, created_at, user_email FROM event_log
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
  const veDauBy = new Map<number, string>();
  for (const x of veDau.results as any[]) {
    veCuoiBy.set(x.id, x.d);
    if ((x.q || 0) > 0 && x.d && !veDauBy.has(x.id)) veDauBy.set(x.id, String(x.d).slice(0, 10));
    if (veDuBy.has(x.id)) continue;
    const t = (luyKe.get(x.id) ?? 0) + (x.q || 0);
    luyKe.set(x.id, t);
    if ((slDat.get(x.id) ?? 0) > 0 && t >= (slDat.get(x.id) ?? 0)) veDuBy.set(x.id, x.d);
  }
  const metaBy = new Map(meta.results.map((r: any) => [r.id, r]));
  const fpBy = new Map(firstPlan.results.map((r: any) => [r.eo_item_id, r.t as string]));
  const nmBy = new Map(firstPlan.results.map((r: any) => [r.eo_item_id, (r.nm as string | null) ?? null]));
  // loi: tong + theo quy tac (dien giai cap CEO)
  const loiBy = new Map<number, { n: number; cho: number; qt: Record<string, number> }>();
  for (const x of loi.results as any[]) {
    const g = loiBy.get(x.eo_item_id) ?? { n: 0, cho: 0, qt: {} };
    g.n += x.n; g.cho += x.cho ?? 0; g.qt[x.quy_tac] = x.n;
    loiBy.set(x.eo_item_id, g);
  }
  const luiDs = new Map<number, LanLui[]>();
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
    if (truoc && ngay > truoc) {
      luiBy.set(itemId, (luiBy.get(itemId) ?? 0) + 1);
      luiDs.set(itemId, [...(luiDs.get(itemId) ?? []), { luc: e.created_at, tu: truoc, den: ngay, ai: e.user_email ?? null }]);
    }
    lastBy.set(itemId, ngay);
  }

  return base.map((r) => {
    const m = metaBy.get(r.item_id);
    const batDau: string | null = m ? (m.created_after_issue ? (m.post_issue_approved_at || m.created_at) : m.issued_at) : null;
    const apDungDong = !!batDau && batDau.slice(0, 10) >= apDung;
    const gioR1Dong = gioR1(r.doi_tac, batDau, r1Tu);
    const han = batDau ? congGioLamViec(batDau, gioR1Dong) : null;
    const lanDau = fpBy.get(r.item_id) ?? null;
    const ndk = r.ngay_du_kien_gan_nhat as string | null;
    const l = loiBy.get(r.item_id);
    const soLoi = l?.n ?? 0;
    const soLui = luiBy.get(r.item_id) ?? 0;
    return {
      item_id: r.item_id, eo_id: r.eo_id, eo_code: r.eo_code, ma_phe_duyet: r.ma_phe_duyet ?? null, id_dat_lk: r.id_dat_lk,
      part_code: r.part_code, part_name: r.part_name ?? "", kho: r.kho, doi_tac: r.doi_tac ?? null, loai_hinh: r.loai_hinh ?? null,
      id_crm: r.id_crm || null, ghi_chu: r.ghi_chu || null, nguoi_dat: m?.created_by ?? null,
      so_luong_dat: r.so_luong_dat, sl_nhap_amis: r.sl_nhap_amis_dung_eo, so_luong_con_thieu: r.so_luong_con_thieu,
      trang_thai_don_hang: r.trang_thai_don_hang, canh_bao: r.canh_bao, toc_do_hang_ve: r.toc_do_hang_ve,
      ngay_ban_hanh: r.ngay_ban_hanh, ngay_du_kien_gan_nhat: ndk,
      ap_dung: apDungDong, bat_dau: batDau, han_ngay_du_kien: han, lan_dau_co_ndk: lanDau, gio_r1: gioR1Dong,
      so_lan_lui: soLui, so_loi: soLoi, so_loi_cho_gt: l?.cho ?? 0, ngay_ve_du: veDuBy.get(r.item_id) ?? null, ngay_ve_dau: veDauBy.get(r.item_id) ?? null,
      ngay_hang_ve: veCuoiBy.get(r.item_id) ?? null, ngay_nm_cam_ket: nmBy.get(r.item_id) ?? null,
      sau_ban_hanh: m?.created_after_issue === 1, ngay_tao: r.ngay_tao,
      ...(luiDs.has(r.item_id) ? { lui_ds: luiDs.get(r.item_id) } : {}), ...(l ? { loi_qt: l.qt } : {}),
    };
  });
}

/** Ky cua lan kiem tra R3 ngay x (thu 2 / thu 4, YYYY-MM-DD): (ngay kiem tra truoc, x] - tra ngay bat dau (khong tinh). */
export function kyR3Tu(x: string): string {
  const d = parseVN(`${x} 00:00:00`);
  return fmtVN(new Date(d.getTime() - (d.getUTCDay() === 1 ? 5 : 2) * 86400_000)).slice(0, 10);
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
    // R3 (2026-11-05): mail voi doi tac cua dong (tl_mail, app theodoimuahang - GUI hoac NHAN) trong ky = da push.
    // Ky cua thu 2 / thu 4 X = sau ngay kiem tra truoc (X-5 voi thu 2, X-2 voi thu 4) den het ngay X.
    const mailRs = rows.length
      ? (await db.prepare("SELECT DISTINCT eo_item_id, substr(thoi_gian, 1, 10) d FROM tl_mail WHERE thoi_gian IS NOT NULL AND eo_item_id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ eo_item_id: number; d: string }>()).results
      : [];
    // 2026-11-13 (migration 0023): nhac doi tac khong qua mail (goi dien / Zalo / tin nhan) ghi nhan tay = nhu co mail trong ky
    const lienHeRs = rows.length
      ? (await db.prepare("SELECT DISTINCT eo_item_id, substr(ngay_lien_he, 1, 10) d FROM tl_lien_he WHERE eo_item_id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ eo_item_id: number; d: string }>()).results
      : [];
    const mailBy = new Map<number, string[]>();
    for (const m of [...mailRs, ...lienHeRs]) mailBy.set(m.eo_item_id, [...(mailBy.get(m.eo_item_id) ?? []), m.d]);
    const loi: unknown[][] = [];
    const add = (r: DongTheoDoi, quyTac: string, khoa: string, han: string, ngayTc: string | null, loiMa: string) =>
      loi.push([r.item_id, r.eo_id, quyTac, khoa, han, ngayTc, "NGUOI_DAT", r.nguoi_dat, loiMa]);
    // Hang DA VE (lan dau, theo ngay chung tu AMIS) truoc / dung moc -> moi loi tu moc do bo qua (2026-11-08: "hang da ve nhung van bat loi")
    const daVe = (r: DongTheoDoi, moc: string) => !!r.ngay_ve_dau && r.ngay_ve_dau <= moc.slice(0, 10);
    // R1 vi pham? (hang da ve truoc han theo ngay chung tu -> khong loi)
    const viPhamR1 = (r: DongTheoDoi) => !!r.han_ngay_du_kien && now > r.han_ngay_du_kien
      && (!r.lan_dau_co_ndk || r.lan_dau_co_ndk > r.han_ngay_du_kien) && !daVe(r, r.han_ngay_du_kien);
    for (const r of rows) {
      // R1
      // hang da ve DU truoc moc (theo ngay chung tu) -> khong loi
      const veTruoc = (moc: string) => !!r.ngay_ve_du && r.ngay_ve_du <= moc.slice(0, 10);
      if (viPhamR1(r)) {
        add(r, "R1", `R1:${r.item_id}`, r.han_ngay_du_kien!, null, "KHONG_NDK_24H");
      }
      // R4
      if (r.han_cap_nhat_lai && now > r.han_cap_nhat_lai && r.ngay_du_kien_gan_nhat && !daVe(r, r.han_cap_nhat_lai)) {
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
          if (veTruoc(x) || daVe(r, x)) break; // hang da ve -> het nghia vu push
          const kyTu = fmtVN(new Date(d.getTime() - (dow === 1 ? 5 : 2) * 86400_000)).slice(0, 10);
          const coMail = (mailBy.get(r.item_id) ?? []).some((m) => m > kyTu && m <= x);
          if (!pushed.has(`${r.item_id}|${x}`) && !coMail) add(r, "R3", `R3:${r.item_id}:${x}`, hetNgay, x, "KHONG_PUSH");
        }
      }
    }
    // Dong bo loi R1 DANG CHO voi moc hien tai (doi 24h -> 48h 2026-11-05): het vi pham -> bo (ghi event_log); con -> cap nhat han.
    const r1Cho = rows.length
      ? (await db.prepare("SELECT id, eo_item_id, eo_id, han FROM tl_loi WHERE quy_tac = 'R1' AND trang_thai = 'CHO_GIAI_TRINH' AND eo_item_id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ id: number; eo_item_id: number; eo_id: number; han: string | null }>()).results
      : [];
    const dongBy = new Map(rows.map((r) => [r.item_id, r]));
    const bo = r1Cho.filter((l) => !viPhamR1(dongBy.get(l.eo_item_id)!));
    const doiHan = r1Cho.filter((l) => !bo.includes(l) && l.han !== dongBy.get(l.eo_item_id)!.han_ngay_du_kien);
    if (bo.length || doiHan.length) {
      const ids = JSON.stringify(bo.map((l) => l.id));
      await db.batch([
        db.prepare(
          `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, before_json, metadata_json, user_email, created_at)
           SELECT 'eo', eo_id, eo_id, 'XOA_LOI_THEO_DOI', json_group_array(json_object('id', id, 'khoa', khoa, 'han', han)),
                  json_object('ly_do', 'Không còn vi phạm theo mốc R1 hiện tại (' || ? || ' giờ làm việc)'), NULL, ?
           FROM tl_loi WHERE id IN (SELECT value FROM json_each(?)) GROUP BY eo_id`,
        ).bind("24/48", now, ids),
        db.prepare("DELETE FROM tl_nhac_nho WHERE loi_id IN (SELECT value FROM json_each(?))").bind(ids),
        db.prepare("DELETE FROM tl_loi WHERE trang_thai = 'CHO_GIAI_TRINH' AND id IN (SELECT value FROM json_each(?))").bind(ids),
        db.prepare(
          `UPDATE tl_loi SET han = json_extract(v.value, '$[1]') FROM json_each(?) v
           WHERE tl_loi.id = json_extract(v.value, '$[0]') AND tl_loi.trang_thai = 'CHO_GIAI_TRINH'`,
        ).bind(JSON.stringify(doiHan.map((l) => [l.id, dongBy.get(l.eo_item_id)!.han_ngay_du_kien]))),
      ]);
      await bumpVersions(db, ["theo_doi"]);
    }
    // Dong DA SANG GIAI DOAN SAU -> loi DANG CHO cua giai doan truoc co han tu moc chuyen giai doan tro di tu bo (2026-11-08):
    //  - co ngay du kien (xong G5): R1 (chua co ngay DK) + R3 (chua push) het nghia vu;
    //  - hang ve lan dau (G7, theo ngay chung tu AMIS - ke ca nhap muon / ve thieu): R1 + R3 + R4.
    // Ca dong da dong (ve du) - chi xet dong con loi cho de tham so nho. Ghi event_log.
    const veDauLoi = (await layDongTheoDoi(env, "tat_ca")).filter((r) => (r.ngay_ve_dau || r.lan_dau_co_ndk) && r.so_loi_cho_gt > 0)
      .map((r) => [r.item_id, r.ngay_ve_dau ?? null, r.lan_dau_co_ndk ?? null]);
    if (veDauLoi.length) {
      const boVe = (await db.prepare(
        `SELECT l.id FROM tl_loi l JOIN json_each(?) v ON l.eo_item_id = json_extract(v.value, '$[0]')
         WHERE l.trang_thai = 'CHO_GIAI_TRINH' AND (
           (l.quy_tac IN ('R1', 'R3', 'R4') AND json_extract(v.value, '$[1]') IS NOT NULL AND substr(l.han, 1, 10) >= json_extract(v.value, '$[1]'))
           OR (l.quy_tac IN ('R1', 'R3') AND json_extract(v.value, '$[2]') IS NOT NULL AND l.han >= json_extract(v.value, '$[2]')))`,
      ).bind(JSON.stringify(veDauLoi)).all<{ id: number }>()).results.map((x) => x.id);
      if (boVe.length) {
        const ids = JSON.stringify(boVe);
        await db.batch([
          db.prepare(
            `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, before_json, metadata_json, user_email, created_at)
             SELECT 'eo', eo_id, eo_id, 'XOA_LOI_THEO_DOI', json_group_array(json_object('id', id, 'khoa', khoa, 'han', han)),
                    json_object('ly_do', 'Đơn đã sang giai đoạn sau (đã có ngày dự kiến / hàng đã về) — lỗi của giai đoạn trước phát sinh sau thời điểm đó tự bỏ qua'), NULL, ?
             FROM tl_loi WHERE id IN (SELECT value FROM json_each(?)) GROUP BY eo_id`,
          ).bind(now, ids),
          db.prepare("DELETE FROM tl_nhac_nho WHERE loi_id IN (SELECT value FROM json_each(?))").bind(ids),
          db.prepare("DELETE FROM tl_loi WHERE trang_thai = 'CHO_GIAI_TRINH' AND id IN (SELECT value FROM json_each(?))").bind(ids),
        ]);
        await bumpVersions(db, ["theo_doi"]);
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
    if (moi > 0) {
      // nhac nho tu dong (migrations/0016): moi loi moi 1 ban ghi tl_nhac_nho + 1 thong bao / (nguoi vi pham, EO)
      await db.batch([
        db.prepare(
          `INSERT INTO tl_nhac_nho (eo_item_id, eo_id, loi_id, den_email, kenh, noi_dung, created_at)
           SELECT eo_item_id, eo_id, id, ai_email, 'HE_THONG', 'Hệ thống ghi lỗi — cần giải trình', ? FROM tl_loi WHERE created_at = ? AND quy_tac <> 'TAY'`,
        ).bind(now, now),
        db.prepare(
          `INSERT INTO notification (email, loai, noi_dung, eo_id, created_at)
           SELECT l.ai_email, 'vi_pham', 'Có ' || COUNT(*) || ' lỗi mới cần giải trình ở ' || COALESCE(e.approval_code, e.eo_code) || ' — mở "Vi phạm & giải trình"', l.eo_id, ?
           FROM tl_loi l JOIN eo e ON e.id = l.eo_id JOIN users u ON u.email = l.ai_email
           WHERE l.created_at = ? AND l.quy_tac <> 'TAY' GROUP BY l.ai_email, l.eo_id`,
        ).bind(now, now),
      ]).catch((e) => console.error("nhac nho tu dong", e));
      await bumpVersions(db, ["theo_doi"]);
    }
    await db.prepare("UPDATE tl_state SET danh_gia_luc = ?, running_until = NULL, so_loi_moi = ? WHERE id = 1").bind(nowVN(), moi).run();
  } catch (err) {
    await db.prepare("UPDATE tl_state SET running_until = NULL WHERE id = 1").run();
    throw err;
  }
  return moi;
}
