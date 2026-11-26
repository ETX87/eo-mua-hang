import { MAIL_DONG_BO_THEO_DONG } from "./mailNhacDongBo";
import type { Env } from "../types";
import { computeTienDo01, TRANG_THAI_DONG } from "../routes/reports";
import { cachedReport } from "./reportCache";
import { bumpVersions } from "./dataVersions";
import { nowVN, todayVN } from "./vnTime";
import { laNhomR1_24h } from "./chuanHoa";
import { AI_MAC_DINH } from "./maLoi";
import { congGioLV, demGioLV, GIO_LV_TU } from "./gioLamViec";
import { sendPushToUser } from "./webPush";

/**
 * "Theo doi linh kien dat" - kiem soat ngay du kien hang ve tung dong EO (migrations/0012). Quy tac:
 *  R1  tu luc dong bat dau (EO ban hanh / dong them sau ban hanh duoc duyet) -> 16h LAM VIEC (lib/gioLamViec: T2-T6 8h, T7 4h, CN nghi;
 *      v0.103 quy doi tu 48h cu) phai co
 *      ngay du kien (co it nhat 1 item_plan, ke ca da xoa mem). Tre -> loi.
 *  R3  Thu 2 / thu 4 (ngay X, dong bat dau truoc X): het ngay X ma dong van chua tung co ngay du kien va khong nam
 *      co mail dong bo hoac lien he ghi tay trong ky -> loi.
 *  R4  Ngay du kien gan nhat D < hom nay, dong chua du hang: tu 00:00 ngay D+1 + 8h lam viec phai nhap ngay moi
 *      (ngay du kien gan nhat > D). Qua han -> loi (khoa theo D, moi lan qua han 1 loi).
 *  Cap CEO (1 trong 3): lui ngay du kien >= 3 lan | ngay du kien gan nhat - ngay dat >= 30 ngay ma chua du | >= 3 loi.
 * Chi mien khi hang VE DU (chot 2026-10-21): ve thieu van canh bao - phai ve du hoac sua lai SL dat. Dong da ve du =
 * 'Ket thuc' (ngoai pham vi). R1/R3 khong ghi loi neu ngay chung tu AMIS lam du SL <= han (nhap AMIS muon khong bi loi oan).
 * Chi ap cho dong cua EO ban hanh tu app_settings 'theo_doi_ap_dung_tu'. Khong cron: danhGiaQuyTac() chay sau
 * request (toi da 10 phut/lan, khoa tl_state) + khi mo man Theo doi. Loi ghi theo dung han, idempotent (khoa UNIQUE).
 */

const DONG = TRANG_THAI_DONG;
const EVAL_GAP_MS = 10 * 60_000;
/** R1: so gio LAM VIEC tu luc dong bat dau den han phai co ngay du kien (2026-11-05: 24 -> 48 gio lich; v0.103: 16h LV = 48h cu). */
export const GIO_R1 = 16;
/** v0.095: R1 lap lai moi thu 3 / thu 6 khi van chua co ngay du kien - tinh tu ngay nay (app_settings 'r1_lap_tu' de doi). */
export const R1_LAP_TU_MAC_DINH = "2026-11-18";
/** R1 nhom Karofi / Livotec / Korihome (lib/chuanHoa laNhomR1_24h): 8h LV (= 24h cu) - chi dong BAT DAU tu app_settings 'r1_24h_tu' (2026-11-08),
 *  dong cu giu 16h LV (khong ghi loi hoi to). */
export const GIO_R1_NHOM = 8;
/** R4: gio LAM VIEC tu 00:00 ngay sau ngay du kien bi qua (= 24h cu). */
export const GIO_R4 = 8;
export const gioR1 = (doiTac: string | null | undefined, batDau: string | null, tu: string) =>
  laNhomR1_24h(doiTac) && !!batDau && batDau.slice(0, 10) >= tu ? GIO_R1_NHOM : GIO_R1;

const parseVN = (s: string) => new Date(s.slice(0, 19).replace(" ", "T") + "Z");
const fmtVN = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const vnPlus = (ms: number) => fmtVN(new Date(Date.now() + 7 * 3600_000 + ms));

/** Cong N gio LAM VIEC vao 1 moc gio VN 'YYYY-MM-DD HH:MM:SS' - lich chung lib/gioLamViec (T2-T6 8-12 + 13-17, T7 8-12, CN nghi; v0.103). */
export function congGioLamViec(start: string, gio = GIO_R4): string {
  return congGioLV(start, gio);
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
const QT_TEN: Record<string, string> = { R1: "Không có ngày DK trong 8h/16h LV", R3: "Không push đối tác (thứ 2/4)", R4: "Quá ngày DK không cập nhật", TAY: "Lỗi ghi khi giải trình" };
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
  const goc = await cachedReport(env.DB, "tl:goc-theo-doi:v9", ["eo", "amis", "settings", "theo_doi"], () => tinhGocTheoDoi(env));
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
      `SELECT i.id, i.created_after_issue, i.post_issue_status, i.post_issue_approved_at, i.created_at, e.created_by, e.issued_at
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
      `SELECT entity_id, event_type, before_json, after_json, metadata_json, created_at, user_email FROM event_log
       WHERE event_type IN ('ADD_PLAN','UPDATE_PLAN','DELETE_PLAN','BULK_PLAN') AND created_at >= ?
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
  // so lan lui (2026-11-13): dem THEO TUNG DOT - xem demLui. Them dot giao bu ngay muon hon KHONG tinh la lui.
  const luiDs = demLui(ev.results as any[]);
  const luiBy = new Map<number, number>([...luiDs].map(([k, v]) => [k, v.length]));

  return base.map((r) => {
    const m = metaBy.get(r.item_id);
    // v0.124 (sua loi may): dong them sau BH CON CHO DUYET -> chua bat dau (truoc lay created_at -> ghi R1 "chua co ngay DK" khi NV chua duoc dat;
    // tre do nguoi duyet, khong phai NV / NCC). Da duyet -> tu luc duyet; du lieu cu khong co moc duyet -> created_at nhu truoc.
    const batDau: string | null = m ? (m.created_after_issue ? (m.post_issue_status === "PENDING" ? null : (m.post_issue_approved_at || m.created_at)) : m.issued_at) : null;
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

export interface SuKienKh { entity_id: number; event_type: string; before_json: string | null; after_json: string | null; metadata_json: string | null; created_at: string; user_email: string | null }

/**
 * Dem cac lan LUI ngay du kien cua tung dong tu event_log ke hoach (sap xep theo thoi gian). Lui = 1 DOT bi doi sang ngay muon hon:
 *  - UPDATE_PLAN: ngay moi > ngay cu cua chinh dot do (before_json, khong co thi ngay da biet cua dot) - sua tay, KRF tu dien...;
 *  - xoa dot roi them dot moi ngay muon hon trong vong 30 phut (cung nguoi) = doi ngay kieu "xoa - them lai";
 *  - BULK_PLAN thay_the (import Excel thay ke hoach): ngay muon nhat moi > ngay muon nhat cu.
 * KHONG tinh: them dot moi (giao bu / chia dot) du ngay muon hon cac dot khac; import them (khong thay the); cat ke hoach khi giam SL / ket thuc som.
 * Truoc 2026-11-13 dem theo "ngay moi nhat duoc ghi > ngay truoc do cua ca dong" nen them dot giao bu cung bi tinh la lui.
 */
export function demLui(evs: SuKienKh[]): Map<number, LanLui[]> {
  const out = new Map<number, LanLui[]>();
  const dot = new Map<number, Map<string, string>>(); // item -> (khoa dot -> ngay)
  const xoa = new Map<number, { ngay: string; luc: string; ai: string | null }>();
  const j = (x: string | null) => { try { return x ? JSON.parse(x) : null; } catch { return null; } };
  const lui = (id: number, luc: string, tu: string, den: string, ai: string | null) => out.set(id, [...(out.get(id) ?? []), { luc, tu, den, ai }]);
  const phut = (a: string, b: string) => Math.abs(Date.parse(a.replace(" ", "T") + "Z") - Date.parse(b.replace(" ", "T") + "Z")) / 60000;
  let syn = 0;
  for (const e of evs) {
    const a = j(e.after_json), bf = j(e.before_json), m = j(e.metadata_json);
    const id = Number(e.event_type === "BULK_PLAN" ? e.entity_id : (m?.eo_item_id ?? e.entity_id));
    if (!id) continue;
    const ds = dot.get(id) ?? new Map<string, string>();
    dot.set(id, ds);
    const k = m?.plan_id != null ? `p${m.plan_id}` : `s${++syn}`;
    if (e.event_type === "ADD_PLAN") {
      const nd = a?.planned_date as string | undefined;
      if (!nd) continue;
      const x = xoa.get(id);
      if (x && nd > x.ngay && x.ai === e.user_email && phut(x.luc, e.created_at) <= 30) lui(id, e.created_at, x.ngay, nd, e.user_email);
      xoa.delete(id);
      ds.set(k, nd);
    } else if (e.event_type === "UPDATE_PLAN") {
      const nd = a?.planned_date as string | undefined;
      const cu = (bf?.planned_date as string | undefined) ?? ds.get(k);
      if (nd && cu && nd > cu) lui(id, e.created_at, cu, nd, e.user_email);
      if (nd) ds.set(k, nd);
    } else if (e.event_type === "DELETE_PLAN") {
      // cat ke hoach (giam SL / ket thuc som) co metadata.ly_do - khong phai doi ngay
      if (!m?.ly_do && bf?.planned_date) xoa.set(id, { ngay: bf.planned_date, luc: e.created_at, ai: e.user_email });
      ds.delete(k);
    } else if (e.event_type === "BULK_PLAN") {
      const moi = (Array.isArray(a) ? a : []).map((x: any) => x.planned_date).filter(Boolean).sort() as string[];
      if (m?.thay_the) {
        const cu = [...ds.values()].sort();
        if (moi.length && cu.length && moi[moi.length - 1] > cu[cu.length - 1]) lui(id, e.created_at, cu[cu.length - 1], moi[moi.length - 1], e.user_email);
        ds.clear();
      }
      for (const d of moi) ds.set(`s${++syn}`, d);
    }
  }
  return out;
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
    const dangMo = await layDongTheoDoi(env, "dang_mo");
    const rows = dangMo.filter((r) => r.ap_dung);
    const today = todayVN();
    // R1 lap lai thu 3 / thu 6 ap dung tu ngay nay (khong ghi hoi to) - app_settings 'r1_lap_tu'
    const r1LapTu = ((await db.prepare("SELECT value FROM app_settings WHERE key = 'r1_lap_tu'").first<{ value: string }>())?.value || R1_LAP_TU_MAC_DINH).slice(0, 10);
    const mailRs = rows.length
      ? (await db.prepare(`SELECT eo_item_id, d FROM (${MAIL_DONG_BO_THEO_DONG}) WHERE eo_item_id IN (SELECT value FROM json_each(?))`)
          .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ eo_item_id: number; d: string }>()).results
      : [];
    // 2026-11-13 (migration 0023): nhac doi tac khong qua mail (goi dien / Zalo / tin nhan) ghi nhan tay = nhu co mail trong ky
    const lienHeRs = rows.length
      ? (await db.prepare("SELECT DISTINCT eo_item_id, substr(ngay_lien_he, 1, 10) d FROM tl_lien_he WHERE eo_item_id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ eo_item_id: number; d: string }>()).results
      : [];
    const mailBy = new Map<number, string[]>();
    for (const m of [...mailRs, ...lienHeRs]) mailBy.set(m.eo_item_id, [...(mailBy.get(m.eo_item_id) ?? []), m.d]);
    // v0.113 "Cho NCC bao ngay" (migration 0026 tl_lien_he.hen_lai): NCC chua co ngay, NV hen hoi lai -> trong [ngay lien he, hen_lai]
    // KHONG ghi loi lap R1 (thu 3/6) / R3 (thu 2/4) cho dong. Loi R1 DAU TIEN (khong co ngay DK dung han) van ghi.
    const choNccRs = rows.length
      ? (await db.prepare("SELECT eo_item_id, substr(ngay_lien_he, 1, 10) tu, hen_lai den FROM tl_lien_he WHERE hen_lai IS NOT NULL AND eo_item_id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(rows.map((r) => r.item_id))).all<{ eo_item_id: number; tu: string; den: string }>()).results
      : [];
    const choNccBy = new Map<number, { tu: string; den: string }[]>();
    for (const x of choNccRs) choNccBy.set(x.eo_item_id, [...(choNccBy.get(x.eo_item_id) ?? []), x]);
    const dangChoNcc = (id: number, ngay: string) => (choNccBy.get(id) ?? []).some((k) => k.tu <= ngay && ngay <= k.den);
    const loi: unknown[][] = [];
    const add = (r: DongTheoDoi, quyTac: string, khoa: string, han: string, ngayTc: string | null, loiMa: string) =>
      loi.push([r.item_id, r.eo_id, quyTac, khoa, han, ngayTc, AI_MAC_DINH[quyTac] ?? "NGUOI_DAT", r.nguoi_dat, loiMa]); // v0.121 Do ai mac dinh theo giai doan; ai_email = nguoi phai giai trinh
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
        // v0.095 R1 LAP LAI (yeu cau 2026-11-18): da tre 8h/16h LV ma VAN chua co ngay du kien -> moi THU 3 / THU 6 sau han ghi lai 1 loi R1
        // (khoa R1:<item>:<ngay>, han = het ngay do). Co ngay du kien -> het ghi + loi dang cho tu giai trinh (tuGiaiTrinh KHAC_PHUC). Chi ngay >= r1LapTu.
        const hanNgay = r.han_ngay_du_kien!.slice(0, 10);
        const d = parseVN(`${hanNgay} 00:00:00`);
        for (d.setUTCDate(d.getUTCDate() + 1); fmtVN(d).slice(0, 10) < today; d.setUTCDate(d.getUTCDate() + 1)) {
          const dow = d.getUTCDay();
          if (dow !== 2 && dow !== 5) continue;
          const x = fmtVN(d).slice(0, 10);
          if (x < r1LapTu) continue;
          if (dangChoNcc(r.item_id, x)) continue; // dang cho NCC bao ngay (da hen hoi lai) -> khong ghi lap
          const hetNgay = `${x} 23:59:59`;
          if (r.lan_dau_co_ndk && r.lan_dau_co_ndk <= hetNgay) break;
          if (daVe(r, x)) break;
          add(r, "R1", `R1:${r.item_id}:${x}`, hetNgay, x, "KHONG_NDK_24H");
        }
      }
      // R4
      if (r.han_cap_nhat_lai && now > r.han_cap_nhat_lai && r.ngay_du_kien_gan_nhat && !daVe(r, r.han_cap_nhat_lai)) {
        add(r, "R4", `R4:${r.item_id}:${r.ngay_du_kien_gan_nhat}`, r.han_cap_nhat_lai, r.ngay_du_kien_gan_nhat, "KHONG_NDK_QUA_HAN");
        // v0.115 (chu he thong 2026-11-23: "truoc 1/11 bo loi thoi, chu ton thi van tiep tuc day giai trinh vi pham va theo doi tiep"): R4 chi ghi 1 lan / ngay DK
        // -> dong qua ngay DK TU TRUOC 01/11 (loi cu da bo AUTO:CU) van ton thi ghi THEM 1 loi R4 moi, moc R4_TON_TU (han giai trinh 16h LV) - khoa rieng ":TON".
        if (r.han_cap_nhat_lai < VP_CU_TRUOC && now > R4_TON_TU && !daVe(r, R4_TON_TU)) {
          add(r, "R4", `R4:${r.item_id}:${r.ngay_du_kien_gan_nhat}:TON`, R4_TON_TU, r.ngay_du_kien_gan_nhat, "KHONG_NDK_QUA_HAN");
        }
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
          const coMail = (mailBy.get(r.item_id) ?? []).some((m) => m > kyTu && m <= x) || dangChoNcc(r.item_id, x);
          if (!coMail) add(r, "R3", `R3:${r.item_id}:${x}`, hetNgay, x, "KHONG_PUSH");
        }
      }
    }
    // v0.120 (chu he thong 2026-11-26, noi tiep v0.115 "ton thi van tiep tuc day giai trinh vi pham"): dong cua PO ban hanh TRUOC moc ap dung
    // (theo_doi_ap_dung_tu, nhung >= theo_doi_bo_qua_truoc) van ton + qua ngay DK -> R4 TU NAY (khong ghi hoi to): qua ngay DK truoc
    // R4_TON_CU_TU -> 1 loi khoa ':TON' moc R4_TON_CU_TU; qua ngay DK sau moc -> R4 thuong (moi ngay DK 1 loi). Chi R4 (khong R1/R3).
    if (now > R4_TON_CU_TU) {
      for (const r of dangMo) {
        if (r.ap_dung || !r.han_cap_nhat_lai || !r.ngay_du_kien_gan_nhat || now <= r.han_cap_nhat_lai) continue;
        const ton = r.han_cap_nhat_lai < R4_TON_CU_TU;
        const moc = ton ? R4_TON_CU_TU : r.han_cap_nhat_lai;
        if (daVe(r, moc)) continue;
        add(r, "R4", `R4:${r.item_id}:${r.ngay_du_kien_gan_nhat}${ton ? ":TON" : ""}`, moc, r.ngay_du_kien_gan_nhat, "KHONG_NDK_QUA_HAN");
      }
    }
    // Dong bo loi R1 DANG CHO voi moc hien tai (doi 24h -> 48h 2026-11-05): het vi pham -> bo (ghi event_log); con -> cap nhat han.
    // v0.103: CHI loi ghi tu GIO_LV_TU (doi sang gio lam viec) - loi ghi truoc giu nguyen han cu, khong tu xoa (chot 2026-11-19 "chi ap dung tu nay").
    const r1Cho = rows.length
      ? (await db.prepare("SELECT id, eo_item_id, eo_id, han FROM tl_loi WHERE quy_tac = 'R1' AND khoa = 'R1:' || eo_item_id AND trang_thai = 'CHO_GIAI_TRINH' AND created_at >= ? AND eo_item_id IN (SELECT value FROM json_each(?))")
          .bind(GIO_LV_TU, JSON.stringify(rows.map((r) => r.item_id))).all<{ id: number; eo_item_id: number; eo_id: number; han: string | null }>()).results
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
        ).bind("8/16", now, ids),
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
    // Bo loi R3 dang cho khi mail dong bo dong bo muon hoac co lien he ghi tay trong ky.
    const boR3 = (await db.prepare(
      `WITH mail_dong_bo AS (${MAIL_DONG_BO_THEO_DONG}), r AS (SELECT id, eo_item_id, ngay_tham_chieu x,
                  date(ngay_tham_chieu, CASE strftime('%w', ngay_tham_chieu) WHEN '1' THEN '-5 days' ELSE '-2 days' END) tu
                  FROM tl_loi WHERE quy_tac = 'R3' AND trang_thai = 'CHO_GIAI_TRINH' AND ngay_tham_chieu IS NOT NULL)
       SELECT r.id FROM r WHERE
         EXISTS (SELECT 1 FROM mail_dong_bo m WHERE m.eo_item_id = r.eo_item_id AND m.d > r.tu AND m.d <= r.x)
         OR EXISTS (SELECT 1 FROM tl_lien_he h WHERE h.eo_item_id = r.eo_item_id AND substr(h.ngay_lien_he, 1, 10) > r.tu AND substr(h.ngay_lien_he, 1, 10) <= r.x)`,
    ).all<{ id: number }>()).results.map((x) => x.id);
    if (boR3.length) {
      const ids = JSON.stringify(boR3);
      await db.batch([
        db.prepare(
          `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, before_json, metadata_json, user_email, created_at)
           SELECT 'eo', eo_id, eo_id, 'XOA_LOI_THEO_DOI', json_group_array(json_object('id', id, 'khoa', khoa, 'han', han)),
                  json_object('ly_do', 'Có mail / liên hệ / push với NCC trong kỳ kiểm tra R3 (ghi nhận muộn hoặc lỗi ghi trước khi R3 tính mail) — không phải lỗi không push'), NULL, ?
           FROM tl_loi WHERE id IN (SELECT value FROM json_each(?)) GROUP BY eo_id`,
        ).bind(now, ids),
        db.prepare("DELETE FROM tl_nhac_nho WHERE loi_id IN (SELECT value FROM json_each(?))").bind(ids),
        db.prepare("DELETE FROM tl_loi WHERE trang_thai = 'CHO_GIAI_TRINH' AND id IN (SELECT value FROM json_each(?))").bind(ids),
      ]);
      await bumpVersions(db, ["theo_doi"]);
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
      // v0.105: day thong bao (Web Push) dich danh nguoi vi pham - gop 1 tin / nguoi
      await dayPushLoi(env, "l.created_at = ?1 AND l.quy_tac <> 'TAY'", now, (n, han) =>
        ({ title: "⏰ Lỗi mới cần giải trình", body: `Bạn có ${n} lỗi mới cần giải trình (hạn giải trình sớm nhất ${hanNgan(han)}). Mở "Vi phạm & giải trình".` }));
      await bumpVersions(db, ["theo_doi"]);
    }
    await tuGiaiTrinh(env, now).catch((e) => console.error("tu giai trinh", e));
    await nhacSapHetHan(env, now).catch((e) => console.error("nhac sap het han", e));
    await db.prepare("UPDATE tl_state SET danh_gia_luc = ?, running_until = NULL, so_loi_moi = ? WHERE id = 1").bind(nowVN(), moi).run();
  } catch (err) {
    await db.prepare("UPDATE tl_state SET running_until = NULL WHERE id = 1").run();
    throw err;
  }
  return moi;
}

/**
 * TU GIAI TRINH (v0.092, yeu cau lanh dao 2026-11-18): loi DANG CHO khong can giai trinh nua -> he thong tu dong, ghi 1 ban ghi tl_giai_trinh
 * pham_vi 'AUTO' (nhom = 'AUTO:<ly do>', noi dung "Auto giải trình vi phạm do …"), loi chuyen DA_GIAI_TRINH. v0.110: CHI AUTO:QUA_HAN la VI PHAM (dem o man Vi pham / Don PO / Dieu hanh); KHAC_PHUC khong tinh vi pham. Van giu trong tl_loi (so loi,
 * so loi, nguong CEO) nhung KHONG tinh la "giai trinh that" (dieuHanh do phu, Vi pham % giai trinh, hoat dong cuoi loai pham_vi AUTO). Thu tu ly do:
 *  KHAC_PHUC  da khac phuc sau do:  R3 - co mail / goi-Zalo / push voi NCC SAU ngay kiem tra · R1 - dong da co ngay du kien ·
 *             R4 - da nhap ngay du kien moi > ngay bi qua · moi quy tac - da co giai trinh THAT cung loi tren dong sau han loi nay
 *  QUA_HAN    qua GIO_TU_DONG gio LAM VIEC (tinh tu han; v0.103 = 56h LV, truoc la 7 ngay lich) khong giai trinh -> ghi nhan vi pham, khong can giai trinh nua
 * Nguoi ghi = BOOTSTRAP_ADMIN_EMAIL (FK users, giong tu dien ngay KRF); event AUTO_GIAI_TRINH user_email NULL (FE hien "Hệ thống").
 */
/** v0.105 (2026-11-19, "nhac lai khi con 6 gio la het han giai trinh"): con <= GIO_NHAC_HET_HAN gio LAM VIEC toi han giai trinh
 *  (han loi + GIO_TU_DONG) ma chua giai trinh -> nhac 1 lan / loi (tl_loi.nhac_het_han_luc): tl_nhac_nho + notification + Web Push dich danh. */
export const GIO_NHAC_HET_HAN = 6;
const NGUOI_LOI_SQL = "COALESCE(l.ai_email, e.created_by)";
const hanNgan = (h: string | null) => (h ? `${h.slice(11, 16)} ${h.slice(8, 10)}/${h.slice(5, 7)}` : "—");

/** Gui push gop theo nguoi cho cac loi khop dieu kien (alias l = tl_loi, e = eo; ?1 = tham so). han = han giai trinh som nhat. */
async function dayPushLoi(env: Env, dk: string, thamSo: string, tin: (n: number, han: string | null) => { title: string; body: string }) {
  if (!env.VAPID_SERVER_PRIVATE_KEY) return;
  const rs = (await env.DB.prepare(
    `SELECT ${NGUOI_LOI_SQL} email, COUNT(*) n, MIN(COALESCE(l.han, l.created_at)) moc FROM tl_loi l JOIN eo e ON e.id = l.eo_id
     WHERE ${dk} AND ${NGUOI_LOI_SQL} IS NOT NULL GROUP BY 1`,
  ).bind(thamSo).all<{ email: string; n: number; moc: string | null }>()).results;
  await Promise.all(rs.map((r) => sendPushToUser(env, r.email, { ...tin(r.n, r.moc ? hanGiaiTrinh(r.moc) : null), url: "/?nhac_giai_trinh=1" })
    .catch((e) => console.error("push loi", e))));
}

async function nhacSapHetHan(env: Env, now: string): Promise<number> {
  const db = env.DB;
  // SQL loc tho: (16 - 6) = 10h LV > 1 ngay lam viec -> moc truoc it nhat 1 ngay lich; loc that bang hanGiaiTrinh.
  const rs = (await db.prepare(
    `SELECT l.id, COALESCE(l.han, l.created_at) moc FROM tl_loi l JOIN eo e ON e.id = l.eo_id
     WHERE l.trang_thai = 'CHO_GIAI_TRINH' AND l.quy_tac <> 'TAY' AND l.nhac_het_han_luc IS NULL
       AND date(COALESCE(l.han, l.created_at)) <= date(?1, '-1 days') AND COALESCE(l.han, l.created_at) >= '${VP_CU_TRUOC}'
       AND substr(COALESCE(e.issued_at, e.created_at), 1, 10) >= COALESCE((SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'), '2026-07-01')`,
  ).bind(now.slice(0, 10)).all<{ id: number; moc: string }>()).results
    .filter((r) => { const han = hanGiaiTrinh(r.moc); return han > now && demGioLV(now, han) <= GIO_NHAC_HET_HAN; });
  if (!rs.length) return 0;
  const ids = JSON.stringify(rs.map((r) => r.id));
  await db.batch([
    db.prepare("UPDATE tl_loi SET nhac_het_han_luc = ?1 WHERE nhac_het_han_luc IS NULL AND id IN (SELECT value FROM json_each(?2))").bind(now, ids),
    db.prepare(
      `INSERT INTO tl_nhac_nho (eo_item_id, eo_id, loi_id, den_email, kenh, noi_dung, created_at)
       SELECT l.eo_item_id, l.eo_id, l.id, ${NGUOI_LOI_SQL}, 'HE_THONG', 'Sắp hết hạn giải trình (còn ≤ ${GIO_NHAC_HET_HAN} giờ làm việc)', ?1
       FROM tl_loi l JOIN eo e ON e.id = l.eo_id WHERE l.nhac_het_han_luc = ?1`,
    ).bind(now),
    db.prepare(
      `INSERT INTO notification (email, loai, noi_dung, eo_id, created_at)
       SELECT ${NGUOI_LOI_SQL}, 'vi_pham', '⚠ ' || COUNT(*) || ' lỗi ở ' || COALESCE(e.approval_code, e.eo_code) || ' sắp hết hạn giải trình (còn ≤ ${GIO_NHAC_HET_HAN} giờ làm việc). Quá hạn sẽ bị ghi nhận vi phạm — mở "Vi phạm & giải trình"', l.eo_id, ?1
       FROM tl_loi l JOIN eo e ON e.id = l.eo_id JOIN users u ON u.email = ${NGUOI_LOI_SQL}
       WHERE l.nhac_het_han_luc = ?1 GROUP BY 1, l.eo_id`,
    ).bind(now),
  ]);
  await dayPushLoi(env, "l.nhac_het_han_luc = ?1", now, (n, han) =>
    ({ title: "⚠ Sắp hết hạn giải trình", body: `${n} lỗi của bạn sắp hết hạn giải trình (sớm nhất ${hanNgan(han)}). Quá hạn sẽ bị ghi nhận vi phạm, không giải trình được nữa.` }));
  await bumpVersions(db, ["theo_doi"]);
  return rs.length;
}

/** Han giai trinh: qua bay nhieu gio LAM VIEC tu moc loi ma chua giai trinh -> he thong ghi VI PHAM (AUTO:QUA_HAN).
 *  v0.110 (chu he thong 2026-11-23: "thoi gian giai trinh la 16h lam viec truoc khi bi tinh loi") = 16h LV, CHI loi co moc tu HAN_GT_16_TU;
 *  loi co moc truoc giu 56h LV (da hua 56h - khong bien loi dang cho thanh vi pham hang loat). FE lib/giaiTrinh.tsx PHAI khop. */
export const GIO_TU_DONG = 16;
/** v0.113 (chu he thong 2026-11-23 "loi vi pham cu truoc thang 11 thi bo qua (auto bo vi pham do vi pham cu)"): loi co moc truoc ngay nay
 *  KHONG tinh vi pham - tuGiaiTrinh dong 'AUTO:CU'; migration 0026 doi cac AUTO:QUA_HAN cu sang AUTO:CU. */
export const VP_CU_TRUOC = "2026-11-01";
/** v0.115: dong ton qua ngay DK tu truoc VP_CU_TRUOC -> 1 loi R4 moi voi moc nay (sau khi bo loi cu van tiep tuc day giai trinh). */
export const R4_TON_TU = "2026-11-24 08:00:00";
/** v0.120: dong cua PO ban hanh truoc moc ap dung quy tac (theo_doi_ap_dung_tu) van ton qua ngay DK -> R4 tu moc nay (khong hoi to). */
export const R4_TON_CU_TU = "2026-11-27 08:00:00";
export const GIO_TU_DONG_CU = 56;
export const HAN_GT_16_TU = "2026-11-24 00:00:00";
export const gioHanGt = (moc: string) => (moc >= HAN_GT_16_TU ? GIO_TU_DONG : GIO_TU_DONG_CU);
/** Han giai trinh cua 1 loi tu moc (COALESCE(han, created_at)). */
export const hanGiaiTrinh = (moc: string) => congGioLV(moc, gioHanGt(moc));
/** nhan hien thi */
export const HAN_GT_TXT = `${GIO_TU_DONG} giờ làm việc`;
async function tuGiaiTrinh(env: Env, now: string): Promise<number> {
  const db = env.DB;
  if (!env.BOOTSTRAP_ADMIN_EMAIL) return 0;
  const rs = (await db.prepare(
    `WITH l AS (SELECT * FROM tl_loi WHERE trang_thai = 'CHO_GIAI_TRINH' AND quy_tac <> 'TAY'),
     k AS (
       SELECT l.id, l.quy_tac,
         CASE WHEN l.quy_tac = 'R3' THEN (SELECT MIN(d) FROM (
                SELECT substr(m.thoi_gian, 1, 10) d FROM tl_mail m WHERE m.eo_item_id = l.eo_item_id AND substr(m.thoi_gian, 1, 10) > l.ngay_tham_chieu
                UNION ALL SELECT substr(h.ngay_lien_he, 1, 10) FROM tl_lien_he h WHERE h.eo_item_id = l.eo_item_id AND substr(h.ngay_lien_he, 1, 10) > l.ngay_tham_chieu
                UNION ALL SELECT p.ngay FROM tl_push_item p WHERE p.eo_item_id = l.eo_item_id AND p.ngay > l.ngay_tham_chieu))
              WHEN l.quy_tac = 'R1' THEN (SELECT substr(MIN(p.created_at), 1, 10) FROM item_plan p WHERE p.eo_item_id = l.eo_item_id)
              WHEN l.quy_tac = 'R4' THEN (SELECT substr(MIN(p.created_at), 1, 10) FROM item_plan p WHERE p.eo_item_id = l.eo_item_id AND p.deleted_at IS NULL AND p.planned_date > l.ngay_tham_chieu)
         END khac_phuc,
         (SELECT substr(MIN(g.created_at), 1, 10) FROM tl_loi l2 JOIN tl_giai_trinh g ON g.id = l2.giai_trinh_id
          WHERE l2.eo_item_id = l.eo_item_id AND l2.quy_tac = l.quy_tac AND l2.id <> l.id AND COALESCE(g.pham_vi, '') <> 'AUTO' AND g.created_at > COALESCE(l.han, l.created_at)) gt_cung,
         date(COALESCE(l.han, l.created_at)) <= date(?1, '-1 days') qua_han, COALESCE(l.han, l.created_at) moc
       FROM l)
     SELECT id, quy_tac, khac_phuc, gt_cung, qua_han, moc, moc < ?2 cu FROM k WHERE khac_phuc IS NOT NULL OR gt_cung IS NOT NULL OR qua_han = 1 OR moc < ?2`,
  ).bind(now.slice(0, 10), VP_CU_TRUOC).all<{ id: number; quy_tac: string; khac_phuc: string | null; gt_cung: string | null; qua_han: number; moc: string; cu: number }>()).results
    // SQL loc tho (>= 1 ngay lich - 16h LV luon qua it nhat 1 ngay); qua han that = hanGiaiTrinh(moc) <= bay gio
    .filter((r) => r.khac_phuc || r.gt_cung || r.cu || hanGiaiTrinh(r.moc) <= now);
  if (!rs.length) return 0;
  const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const KP: Record<string, string> = {
    R3: "đã thúc NCC sau đó (mail / push / gọi-Zalo ngày %)", R1: "dòng đã có ngày dự kiến (nhập ngày %)", R4: "đã cập nhật ngày dự kiến mới (ngày %)",
  };
  const ds = rs.map((r) => r.khac_phuc
    ? [r.id, `Tự đóng lỗi do ${KP[r.quy_tac].replace("%", dmy(r.khac_phuc))} — đã khắc phục trong hạn, không tính vi phạm.`, "AUTO:KHAC_PHUC"]
    : r.gt_cung
      ? [r.id, `Tự đóng lỗi do đã có giải trình cùng lỗi ngày ${dmy(r.gt_cung)} — không cần giải trình lại, không tính vi phạm.`, "AUTO:KHAC_PHUC"]
      : r.cu
        ? [r.id, `Tự bỏ vi phạm do vi phạm cũ (mốc lỗi trước ${dmy(VP_CU_TRUOC)}) — không tính vi phạm.`, "AUTO:CU"]
        : [r.id, `Hết hạn giải trình (${gioHanGt(r.moc)} giờ làm việc từ mốc lỗi) mà không giải trình → ghi nhận VI PHẠM, không giải trình được nữa.`, "AUTO:QUA_HAN"]);
  let xong = 0;
  for (let i = 0; i < ds.length; i += 250) {
    const lo = JSON.stringify(ds.slice(i, i + 250));
    const ids = JSON.stringify(ds.slice(i, i + 250).map((x) => x[0]));
    const res = await db.batch([
      db.prepare(
        `INSERT INTO tl_giai_trinh (eo_item_id, eo_id, loi_id, ai_ma, ai_email, loi_ma, noi_dung, created_by, created_at, pham_vi, nhom)
         SELECT l.eo_item_id, l.eo_id, l.id, COALESCE(l.ai_ma, 'NGUOI_DAT'), l.ai_email, COALESCE(l.loi_ma, 'KHAC'), json_extract(v.value, '$[1]'), ?1, ?2, 'AUTO', json_extract(v.value, '$[2]')
         FROM json_each(?3) v JOIN tl_loi l ON l.id = json_extract(v.value, '$[0]') AND l.trang_thai = 'CHO_GIAI_TRINH'`,
      ).bind(env.BOOTSTRAP_ADMIN_EMAIL, now, lo),
      db.prepare(
        `UPDATE tl_loi SET trang_thai = 'DA_GIAI_TRINH',
           giai_trinh_id = (SELECT MAX(g.id) FROM tl_giai_trinh g WHERE g.loi_id = tl_loi.id AND g.pham_vi = 'AUTO')
         WHERE trang_thai = 'CHO_GIAI_TRINH' AND id IN (SELECT value FROM json_each(?1))
           AND EXISTS (SELECT 1 FROM tl_giai_trinh g WHERE g.loi_id = tl_loi.id AND g.pham_vi = 'AUTO')`,
      ).bind(ids),
      db.prepare(
        `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
         SELECT 'eo', g.eo_id, g.eo_id, 'AUTO_GIAI_TRINH', json_object('so_loi', COUNT(*), 'khac_phuc', SUM(g.nhom = 'AUTO:KHAC_PHUC'), 'qua_han', SUM(g.nhom = 'AUTO:QUA_HAN'), 'cu', SUM(g.nhom = 'AUTO:CU')),
                json_object('loi_ids', json_group_array(g.loi_id)), NULL, ?1
         FROM tl_giai_trinh g WHERE g.pham_vi = 'AUTO' AND g.created_at = ?1 AND g.loi_id IN (SELECT value FROM json_each(?2)) GROUP BY g.eo_id`,
      ).bind(now, ids),
    ]);
    xong += res[1].meta.changes ?? 0;
  }
  if (xong) await bumpVersions(db, ["theo_doi"]);
  return xong;
}

/**
 * BANG CHUNG loi R1/R4 (v0.114; v0.121 TUY CHON): anh HOAC "dung thu NCC da luu" (dung_mail) - khi dung_mail, MOI dong can bang chung phai co it nhat 1 thu
 * da dong bo (tl_mail theo dong / theo dot push - MAIL_DONG_BO_THEO_DONG) hoac 1 ghi nhan lien he (tl_lien_he). Tra ma loi hoac null.
 */
export async function kiemBangChung(db: D1Database, canAnh: boolean, coAnh: boolean, dungMail: boolean | undefined, itemIds: number[]):
  Promise<{ error: "CAN_HINH_ANH" | "THIEU_THU"; dong?: number[] } | null> {
  // v0.121 (chu he thong 2026-11-26 "bang chung khong bat buoc"): khong anh / khong tick thu van luu; chi khi TICK "dung thu NCC" ma dong khong co thu -> bao
  if (!canAnh || coAnh || !dungMail) return null;
  const ids = [...new Set(itemIds)];
  if (!ids.length) return null;
  const co = new Set((await db.prepare(
    `SELECT eo_item_id FROM (${MAIL_DONG_BO_THEO_DONG}) WHERE eo_item_id IN (SELECT value FROM json_each(?1))
     UNION SELECT eo_item_id FROM tl_lien_he WHERE eo_item_id IN (SELECT value FROM json_each(?1))`,
  ).bind(JSON.stringify(ids)).all<{ eo_item_id: number }>()).results.map((r) => r.eo_item_id));
  const thieu = ids.filter((i) => !co.has(i));
  return thieu.length ? { error: "THIEU_THU", dong: thieu } : null;
}
