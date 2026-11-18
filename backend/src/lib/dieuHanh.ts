import type { Env } from "../types";
import { cachedReport } from "./reportCache";
import { layDongTheoDoi, type DongTheoDoi } from "./theoDoi";
import { layGiaiDoan, GIAI_DOAN } from "./giaiDoan";
import { nowVN, todayVN } from "./vnTime";
import { weekStart } from "./week";
import { versionTag } from "./dataVersions";

/**
 * BANG DIEU HANH (v0.084, yeu cau lanh dao 2026-11-18 - ../QUAN_TRI_DIEU_HANH.md): ghep "ton <-> nguoi <-> hanh dong <-> nguyen nhan"
 * cho tung dong LK DANG MO trong pham vi theo doi (cung moc bo qua voi lib/theoDoi -> so khop man Vi pham / LK dat).
 *  - MUC canh bao DO / VANG / XANH + ly do bang chu (muc 3.1 tai lieu).
 *  - TAC DONG = viec cua nguoi mua hang: them / sua dot ke hoach, dot push, mail GUI gan dong, lien he ghi tay, giai trinh.
 *    IM LANG = so ngay tu tac dong cuoi (hoac tu ngay bat dau) den hom nay.
 *  - THUC NCC = dot push + mail GUI + lien he. PHAN HOI NCC = mail NHAN gan dong.
 * Phan doc DB (hoat dong theo dong, loi 30 ngay, giai trinh, lich su giai doan) cache theo version eo/amis/theo_doi + ngay;
 * phan "bay gio" (muc, im lang) tinh moi request tu layDongTheoDoi (da tach phan bay gio).
 * Dung chung: routes/dieuHanh (man Dieu hanh) + routes/eo (cot canh bao o danh sach Don PO, gom theo eo_id).
 */

export const IM_LANG_DO = 7;
export const IM_LANG_VANG = 3;
export const LOI_CHO_DO = 7;
const KHOA_CACHE = "dh:goc:v1";

const ngayGiua = (a: string, b: string) =>
  Math.max(0, Math.floor((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400_000));
const lonNhat = (...xs: (string | null | undefined)[]) => xs.reduce<string | null>((m, x) => (x && (!m || x > m) ? x : m), null);
const truNgay = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };

interface HdDong {
  kh_luc?: string; kh_ai?: string; kh7?: number;
  push?: number; push7?: number; push_luc?: string; push_ai?: string;
  gui?: number; gui7?: number; gui_luc?: string; nhan?: number; nhan_luc?: string; nhan_tt?: string;
  lh?: number; lh7?: number; lh_luc?: string; lh_ai?: string; lh_kq?: string;
  gt?: number; gt7?: number; gt_luc?: string; gt_ai?: string; gt_ai_ma?: string; gt_loi_ma?: string; gt_nd?: string;
  loi?: number; loi_cho?: number; loi_cho_tu?: string; r1?: number; r3?: number; r4?: number; tay?: number;
  nhac?: number; nhac_luc?: string;
}
interface Goc {
  hd: Record<number, HdDong>;
  /** lich su giai doan: item -> {eo_id, ncc}, eo -> {created_by, final, reviewer cuoi} */
  item: Record<number, [number, string | null]>;
  eo: Record<number, { tao: string; final: string | null; tham_dinh: string | null; tt: string; bh: string | null; ma: string }>;
  loi30: { qt: string; ai: string | null; ncc: string | null; cho: number; n: number }[];
  loi_ngay: { d: string; n: number }[]; gt_ngay: { d: string; n: number }[]; nhac_ngay: { d: string; n: number }[];
  nguyen_nhan: { ai_ma: string; loi_ma: string; n: number }[];
  dm: { loai: string; ma: string; ten: string }[];
  bo_qua: string;
}

async function docGoc(env: Env): Promise<Goc> {
  const db = env.DB;
  const hom = todayVN();
  const d7 = truNgay(hom, 7), d30 = truNgay(hom, 30), d60 = truNgay(hom, 63);
  const boQua = ((await db.prepare("SELECT value FROM app_settings WHERE key = 'theo_doi_bo_qua_truoc'").first<{ value: string }>())?.value || "2026-07-01").slice(0, 10);
  // SQLite: cot "tran" (khong gop) trong SELECT co MAX(...) lay tu dong dat MAX -> nguoi / noi dung cua lan cuoi.
  const [kh, push, mail, nhanTt, lh, gt, loi, nhac, items, eos, thamDinh, loi30, loiNgay, gtNgay, nhacNgay, nn, dm] = await db.batch([
    db.prepare(`SELECT eo_item_id id, MAX(t) luc, ai, SUM(t >= ?1) n7 FROM (SELECT eo_item_id, COALESCE(updated_at, created_at) t, COALESCE(updated_by, created_by) ai FROM item_plan
                UNION ALL SELECT eo_item_id, deleted_at, deleted_by FROM item_plan WHERE deleted_at IS NOT NULL) GROUP BY eo_item_id`).bind(d7),
    db.prepare(`SELECT pi.eo_item_id id, COUNT(*) n, SUM(pi.ngay >= ?1) n7, MAX(p.created_at) luc, p.created_by ai FROM tl_push_item pi JOIN tl_push p ON p.id = pi.push_id GROUP BY pi.eo_item_id`).bind(d7),
    db.prepare(`SELECT eo_item_id id, SUM(huong = 'GUI') gui, SUM(huong = 'GUI' AND thoi_gian >= ?1) gui7, MAX(CASE WHEN huong = 'GUI' THEN thoi_gian END) gui_luc,
                SUM(huong = 'NHAN') nhan, MAX(CASE WHEN huong = 'NHAN' THEN thoi_gian END) nhan_luc FROM tl_mail WHERE eo_item_id IS NOT NULL GROUP BY eo_item_id`).bind(d7),
    db.prepare(`SELECT eo_item_id id, MAX(thoi_gian) luc, substr(COALESCE(NULLIF(tom_tat, ''), tieu_de), 1, 160) tt FROM tl_mail WHERE huong = 'NHAN' AND eo_item_id IS NOT NULL GROUP BY eo_item_id`),
    db.prepare(`SELECT eo_item_id id, COUNT(*) n, SUM(ngay_lien_he >= ?1) n7, MAX(ngay_lien_he) luc, created_by ai, substr(kenh || ': ' || ket_qua, 1, 160) kq FROM tl_lien_he GROUP BY eo_item_id`).bind(d7),
    db.prepare(`SELECT eo_item_id id, COUNT(*) n, SUM(created_at >= ?1) n7, MAX(created_at) luc, created_by ai, ai_ma, loi_ma, substr(noi_dung, 1, 200) nd FROM tl_giai_trinh GROUP BY eo_item_id`).bind(d7),
    db.prepare(`SELECT eo_item_id id, COUNT(*) n, SUM(trang_thai = 'CHO_GIAI_TRINH') cho, MIN(CASE WHEN trang_thai = 'CHO_GIAI_TRINH' THEN COALESCE(han, created_at) END) cho_tu,
                SUM(quy_tac = 'R1') r1, SUM(quy_tac = 'R3') r3, SUM(quy_tac = 'R4') r4, SUM(quy_tac = 'TAY') tay FROM tl_loi GROUP BY eo_item_id`),
    db.prepare("SELECT eo_item_id id, COUNT(*) n, MAX(created_at) luc FROM tl_nhac_nho GROUP BY eo_item_id"),
    db.prepare("SELECT id, eo_id, supplier FROM eo_item"),
    db.prepare("SELECT id, created_by, final_approver_email, trang_thai, issued_at, COALESCE(approval_code, eo_code) ma FROM eo"),
    // nguoi tham dinh "cuoi" (duyet muon nhat) cua lan trinh gan nhat - quy trach nhiem tre G2
    db.prepare(`SELECT s.eo_id, a.approver_email ai, MAX(COALESCE(a.action_at, a.assigned_at)) luc FROM eo_approval a JOIN eo_submission s ON s.id = a.submission_id
                WHERE a.step_type = 'REVIEW' AND a.status IN ('APPROVED', 'PENDING') GROUP BY s.eo_id`),
    db.prepare(`SELECT l.quy_tac qt, COALESCE(l.ai_email, e.created_by) ai, i.supplier ncc, SUM(l.trang_thai = 'CHO_GIAI_TRINH') cho, COUNT(*) n
                FROM tl_loi l JOIN eo e ON e.id = l.eo_id JOIN eo_item i ON i.id = l.eo_item_id
                WHERE l.created_at >= ?1 AND COALESCE(e.issued_at, e.created_at) >= ?2 GROUP BY 1, 2, 3`).bind(d30, boQua),
    db.prepare(`SELECT substr(l.created_at, 1, 10) d, COUNT(*) n FROM tl_loi l JOIN eo e ON e.id = l.eo_id WHERE l.created_at >= ?1 AND COALESCE(e.issued_at, e.created_at) >= ?2 GROUP BY 1`).bind(d60, boQua),
    db.prepare("SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM tl_giai_trinh WHERE created_at >= ?1 GROUP BY 1").bind(d60),
    db.prepare("SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM tl_nhac_nho WHERE created_at >= ?1 GROUP BY 1").bind(d60),
    db.prepare("SELECT ai_ma, loi_ma, COUNT(*) n FROM tl_giai_trinh GROUP BY 1, 2 ORDER BY n DESC"),
    db.prepare("SELECT loai, ma, ten FROM tl_danh_muc"),
  ]);
  const hd: Record<number, HdDong> = {};
  const lay = (id: number) => (hd[id] ??= {});
  for (const r of kh.results as any[]) Object.assign(lay(r.id), { kh_luc: r.luc, kh_ai: r.ai, kh7: r.n7 });
  for (const r of push.results as any[]) Object.assign(lay(r.id), { push: r.n, push7: r.n7, push_luc: r.luc, push_ai: r.ai });
  for (const r of mail.results as any[]) Object.assign(lay(r.id), { gui: r.gui, gui7: r.gui7, gui_luc: r.gui_luc ?? undefined, nhan: r.nhan, nhan_luc: r.nhan_luc ?? undefined });
  for (const r of nhanTt.results as any[]) lay(r.id).nhan_tt = r.tt ?? undefined;
  for (const r of lh.results as any[]) Object.assign(lay(r.id), { lh: r.n, lh7: r.n7, lh_luc: r.luc, lh_ai: r.ai, lh_kq: r.kq });
  for (const r of gt.results as any[]) Object.assign(lay(r.id), { gt: r.n, gt7: r.n7, gt_luc: r.luc, gt_ai: r.ai, gt_ai_ma: r.ai_ma, gt_loi_ma: r.loi_ma, gt_nd: r.nd });
  for (const r of loi.results as any[]) Object.assign(lay(r.id), { loi: r.n, loi_cho: r.cho, loi_cho_tu: r.cho_tu ?? undefined, r1: r.r1, r3: r.r3, r4: r.r4, tay: r.tay });
  for (const r of nhac.results as any[]) Object.assign(lay(r.id), { nhac: r.n, nhac_luc: r.luc });
  const td = new Map((thamDinh.results as any[]).map((r) => [r.eo_id, r.ai as string]));
  return {
    hd,
    item: Object.fromEntries((items.results as any[]).map((r) => [r.id, [r.eo_id, r.supplier ?? null]])),
    eo: Object.fromEntries((eos.results as any[]).map((r) => [r.id, { tao: r.created_by, final: r.final_approver_email, tham_dinh: td.get(r.id) ?? null, tt: r.trang_thai, bh: r.issued_at, ma: r.ma }])),
    loi30: loi30.results as any[], loi_ngay: loiNgay.results as any[], gt_ngay: gtNgay.results as any[], nhac_ngay: nhacNgay.results as any[],
    nguyen_nhan: nn.results as any[], dm: dm.results as any[], bo_qua: boQua,
  };
}

/** Gom ly do muc DO ve nhan chung (bo so ngay / so loi) - dem "do vi ..." theo PO / toan he thong. FE pages/DieuHanh nhomLyDo dong bo tay. */
export function nhomLyDo(s: string): string {
  if (s.startsWith("Cấp CEO")) return "Cấp CEO";
  if (s.startsWith("Quá ngày DK")) return "Quá ngày DK";
  if (s.startsWith("Trễ hạn")) return "Trễ hạn chưa có ngày DK";
  if (s.includes("lỗi chờ giải trình")) return `Lỗi chờ giải trình ≥ ${LOI_CHO_DO} ngày`;
  if (s.startsWith("Im lặng")) return `Im lặng ≥ ${IM_LANG_DO} ngày`;
  return s;
}

/** 1 dong dang mo tren bang dieu hanh (khoa ngan - ~1.200 dong / payload). */
export interface DongDh {
  id: number; eo: number; po: string; ma: string; ten: string; kho: string; ncc: string | null; nguoi: string | null;
  dat: number; ve: number; thieu: number; bd: string | null; ton: number;
  gd: string | null; gd_tre: boolean; tt: string; ndk: string | null; qua_dk: number; lui: number; ceo: string[];
  loi: number; loi_cho: number; loi_cho_ngay: number; qt: Record<string, number>;
  thuc: number; thuc7: number; thuc_luc: string | null; phan_hoi: number; phan_hoi_luc: string | null; phan_hoi_tt: string | null;
  gt: number; gt_luc: string | null; gt_ai_ma: string | null; gt_loi_ma: string | null; gt_nd: string | null;
  td_luc: string | null; td_loai: string | null; td_ai: string | null; td7: number; im_lang: number;
  nhac: number; nhac_luc: string | null;
  muc: "DO" | "VANG" | "XANH"; ly_do: string[]; diem: number;
}

function danhGiaDong(r: DongTheoDoi, h: HdDong, gdK: { gd: string | null; tre: boolean }, poMa: string, today: string): DongDh {
  const bd = r.bat_dau ?? r.ngay_ban_hanh;
  const ton = bd ? ngayGiua(bd, today) : 0;
  // tac dong cuoi cua nguoi mua hang (ke hoach / push / mail gui / lien he / giai trinh)
  const td: [string | null | undefined, string, string | null | undefined][] = [
    [h.kh_luc, "Cập nhật kế hoạch / ngày DK", h.kh_ai], [h.push_luc, "Tạo đợt push NCC", h.push_ai], [h.gui_luc, "Gửi mail NCC", null],
    [h.lh_luc, "Gọi / nhắn NCC", h.lh_ai], [h.gt_luc, "Giải trình", h.gt_ai],
  ];
  const cuoi = td.filter((x) => x[0]).sort((a, b) => String(b[0]).localeCompare(String(a[0])))[0];
  const tdLuc = cuoi?.[0] ?? null;
  const imLang = ngayGiua(lonNhat(tdLuc, bd) ?? today, today);
  const thuc = (h.push ?? 0) + (h.gui ?? 0) + (h.lh ?? 0);
  const thuc7 = (h.push7 ?? 0) + (h.gui7 ?? 0) + (h.lh7 ?? 0);
  const loiCho = r.so_loi_cho_gt;
  const loiChoNgay = loiCho && h.loi_cho_tu ? ngayGiua(h.loi_cho_tu, today) : 0;
  const quaDk = r.tinh_trang === "QUA_HAN_NDK" && r.ngay_du_kien_gan_nhat ? ngayGiua(r.ngay_du_kien_gan_nhat, today) : 0;
  const ceo = r.ceo_ly_do ?? [];

  const do_: string[] = [], vang: string[] = [];
  if (ceo.length) do_.push(`Cấp CEO: ${ceo.join("; ")}`);
  if (r.tinh_trang === "QUA_HAN_NDK") do_.push(`Quá ngày DK ${quaDk} ngày`);
  if (r.tinh_trang === "TRE_NDK") do_.push(`Trễ hạn ${r.gio_r1}h chưa có ngày DK`);
  if (loiCho && loiChoNgay >= LOI_CHO_DO) do_.push(`${loiCho} lỗi chờ giải trình ${loiChoNgay} ngày`);
  if (imLang >= IM_LANG_DO && ton >= IM_LANG_DO) do_.push(`Im lặng ${imLang} ngày`);
  if (r.tinh_trang === "CHO_NDK") vang.push("Đang chờ ngày DK");
  if (loiCho && loiChoNgay < LOI_CHO_DO) vang.push(`${loiCho} lỗi chờ giải trình`);
  if (imLang >= IM_LANG_VANG && imLang < IM_LANG_DO) vang.push(`Im lặng ${imLang} ngày`);
  if (r.tinh_trang === "CHO_HANG" && r.ngay_du_kien_gan_nhat && ngayGiua(today, r.ngay_du_kien_gan_nhat) <= 2) vang.push("Ngày DK trong 2 ngày tới");
  if (ton > 30) vang.push(`Tồn ${ton} ngày`);
  const muc = do_.length ? "DO" : vang.length ? "VANG" : "XANH";
  const diem = (muc === "DO" ? 1000 : muc === "VANG" ? 100 : 0) + (ceo.length ? 200 : 0) + quaDk * 5 + loiCho * 3 + imLang * 4 + ton;
  const qt: Record<string, number> = {};
  for (const k of ["r1", "r3", "r4", "tay"] as const) if (h[k]) qt[k.toUpperCase()] = h[k]!;
  return {
    id: r.item_id, eo: r.eo_id, po: poMa, ma: r.part_code, ten: r.part_name, kho: r.kho, ncc: r.doi_tac, nguoi: r.nguoi_dat,
    dat: r.so_luong_dat, ve: r.sl_nhap_amis, thieu: r.so_luong_con_thieu, bd, ton,
    gd: gdK.gd, gd_tre: gdK.tre, tt: r.tinh_trang, ndk: r.ngay_du_kien_gan_nhat, qua_dk: quaDk, lui: r.so_lan_lui, ceo,
    loi: r.so_loi, loi_cho: loiCho, loi_cho_ngay: loiChoNgay, qt,
    thuc, thuc7, thuc_luc: lonNhat(h.push_luc, h.gui_luc, h.lh_luc), phan_hoi: h.nhan ?? 0, phan_hoi_luc: h.nhan_luc ?? null, phan_hoi_tt: h.nhan_tt ?? h.lh_kq ?? null,
    gt: h.gt ?? 0, gt_luc: h.gt_luc ?? null, gt_ai_ma: h.gt_ai_ma ?? null, gt_loi_ma: h.gt_loi_ma ?? null, gt_nd: h.gt_nd ?? null,
    td_luc: tdLuc, td_loai: cuoi?.[1] ?? null, td_ai: cuoi?.[2] ?? null,
    td7: (h.kh7 ?? 0) + thuc7 + (h.gt7 ?? 0), im_lang: imLang, nhac: h.nhac ?? 0, nhac_luc: h.nhac_luc ?? null,
    muc, ly_do: muc === "DO" ? do_ : vang, diem,
  };
}

/** Moi dong LK dang mo trong pham vi theo doi + muc canh bao (dung cho Dieu hanh va cot canh bao Don PO). */
export async function layDongDieuHanh(env: Env): Promise<{ dong: DongDh[]; goc: Goc; gd: Awaited<ReturnType<typeof layGiaiDoan>> }> {
  const [ds, goc, gd] = await Promise.all([
    layDongTheoDoi(env, "dang_mo"),
    cachedReport(env.DB, KHOA_CACHE, ["eo", "amis", "theo_doi"], () => docGoc(env)),
    layGiaiDoan(env),
  ]);
  const today = todayVN();
  const dong = ds.map((r) => {
    const g = gd.map.get(r.item_id);
    return danhGiaDong(r, goc.hd[r.item_id] ?? {}, { gd: g?.gd_hien_tai ?? null, tre: !!g?.gd_tre }, r.ma_phe_duyet || r.eo_code, today);
  });
  return { dong, goc, gd };
}

/** Tom tat canh bao theo PO (cot o danh sach Don PO). */
export interface DhPo { do: number; vang: number; qua_dk: number; chua_dk: number; loi_cho: number; ceo: number; thuc7: number; thuc: number;
  thuc_luc: string | null; im_lang: number; td_luc: string | null; td_loai: string | null; td_ai: string | null; ly_do: string[]; mo: number }
/** Giai doan theo PO (cot "Tien trinh" o Don PO, v0.086): so dong DANG O tung giai doan (G1..G8 / XONG / HUY) + so dong dang tre han. */
export interface GdPo { dem: Record<string, number>; tre: Record<string, number> }
export interface TomTatPo { dh: Map<number, DhPo>; gd: Map<number, GdPo> }
let memoPo: { tag: string; luc: number; v: TomTatPo } | null = null;
/** Ghi nho trong isolate <= 5 phut khi version du lieu khong doi (phan "bay gio" thay doi cham: theo gio / ngay) - danh sach Don PO goi moi lan. */
export async function tomTatTheoPo(env: Env): Promise<TomTatPo> {
  const tag = await versionTag(env.DB, ["eo", "amis", "settings", "theo_doi"], todayVN());
  if (memoPo && memoPo.tag === tag && Date.now() - memoPo.luc < 5 * 60_000) return memoPo.v;
  const v = await tinhTheoPo(env);
  memoPo = { tag, luc: Date.now(), v };
  return v;
}
async function tinhTheoPo(env: Env): Promise<TomTatPo> {
  const { dong, goc, gd: gdAll } = await layDongDieuHanh(env);
  const gd = new Map<number, GdPo>();
  for (const [id, k] of gdAll.map) {
    const eo = goc.item[id]?.[0];
    if (eo == null) continue;
    const x = gd.get(eo) ?? { dem: {}, tre: {} };
    x.dem[k.gd_hien_tai] = (x.dem[k.gd_hien_tai] ?? 0) + 1;
    if (k.gd_tre && !["XONG", "HUY"].includes(k.gd_hien_tai)) x.tre[k.gd_hien_tai] = (x.tre[k.gd_hien_tai] ?? 0) + 1;
    gd.set(eo, x);
  }
  const m = new Map<number, DhPo>();
  for (const d of dong) {
    const x = m.get(d.eo) ?? { do: 0, vang: 0, qua_dk: 0, chua_dk: 0, loi_cho: 0, ceo: 0, thuc7: 0, thuc: 0, thuc_luc: null, im_lang: 0, td_luc: null, td_loai: null, td_ai: null, ly_do: [], mo: 0 };
    x.mo += 1;
    if (d.muc === "DO") x.do += 1; else if (d.muc === "VANG") x.vang += 1;
    if (d.tt === "QUA_HAN_NDK") x.qua_dk += 1;
    if (d.tt === "TRE_NDK" || d.tt === "CHO_NDK") x.chua_dk += 1;
    x.loi_cho += d.loi_cho; if (d.ceo.length) x.ceo += 1;
    x.thuc7 += d.thuc7; x.thuc += d.thuc; x.thuc_luc = lonNhat(x.thuc_luc, d.thuc_luc);
    x.im_lang = Math.max(x.im_lang, d.im_lang);
    if (d.td_luc && (!x.td_luc || d.td_luc > x.td_luc)) { x.td_luc = d.td_luc; x.td_loai = d.td_loai; x.td_ai = d.td_ai; }
    if (d.muc === "DO") for (const l of d.ly_do) { const k = nhomLyDo(l); if (!x.ly_do.includes(k)) x.ly_do.push(k); }
    m.set(d.eo, x);
  }
  return { dh: m, gd };
}

/** Nguoi / NCC chiu trach nhiem 1 giai doan (quy trach nhiem tre SLA + dang o). */
export function chiuTrachNhiem(k: string, eo: Goc["eo"][number] | undefined, ncc: string | null): string {
  if (k === "G2") return eo?.tham_dinh ?? "(chưa rõ người thẩm định)";
  if (k === "G3") return eo?.final ?? "(chưa rõ người duyệt mua)";
  if (k === "G6" || k === "G8") return `NCC: ${ncc ?? "(trống)"}`;
  if (k === "G7") return "Kho / Kế toán";
  return eo?.tao ?? "(không rõ)";
}

/** Lich su giai doan 30 ngay (da qua / tre theo nguoi chiu) + dang o (moi dong chua xong, ke ca EO chua ban hanh). */
export function thongKeGiaiDoan(goc: Goc, gd: Awaited<ReturnType<typeof layGiaiDoan>>) {
  const d30 = truNgay(todayVN(), 30);
  const out = GIAI_DOAN.map((g) => ({ k: g.k, l: g.l, vai_tro: g.vai_tro, xong30: 0, tre30: 0, tre30_ai: {} as Record<string, number>, dang: 0, dang_tre: 0, dang_ai: {} as Record<string, number> }));
  const by = new Map<string, (typeof out)[number]>(out.map((x) => [x.k, x]));
  for (const [idS, k] of gd.map) {
    const it = goc.item[idS];
    if (!it) continue;
    const eo = goc.eo[it[0]];
    if (!eo || ["REJECTED", "CANCELLED"].includes(eo.tt)) continue;
    // PO ban hanh truoc moc bo qua: khong tinh (khop Theo doi / Tong quan)
    if (eo.tt === "ISSUED" && (eo.bh ?? "").slice(0, 10) < goc.bo_qua) continue;
    for (const [gk, m] of Object.entries(k.moc)) {
      const x = by.get(gk);
      if (!x || !m.kt || m.kt < d30) continue;
      x.xong30 += 1;
      if (k.tre[gk]) { x.tre30 += 1; const ai = chiuTrachNhiem(gk, eo, it[1]); x.tre30_ai[ai] = (x.tre30_ai[ai] ?? 0) + 1; }
    }
    if (["XONG", "HUY"].includes(k.gd_hien_tai)) continue;
    const x = by.get(k.gd_hien_tai);
    if (!x) continue;
    x.dang += 1;
    if (k.gd_tre) x.dang_tre += 1;
    const ai = chiuTrachNhiem(k.gd_hien_tai, eo, it[1]);
    x.dang_ai[ai] = (x.dang_ai[ai] ?? 0) + 1;
  }
  const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ai, n]) => ({ ai, n }));
  return out.map((x) => ({ ...x, tre30_ai: top(x.tre30_ai), dang_ai: top(x.dang_ai) }));
}

/** Xu huong 8 tuan (tuan CN - T7 nhu lib/week): loi phat sinh / giai trinh / nhac. */
export function xuHuong(goc: Goc) {
  const m = new Map<string, { tuan: string; loi: number; gt: number; nhac: number }>();
  const cong = (ds: { d: string; n: number }[], k: "loi" | "gt" | "nhac") => {
    for (const r of ds) { const w = weekStart(r.d); const x = m.get(w) ?? { tuan: w, loi: 0, gt: 0, nhac: 0 }; x[k] += r.n; m.set(w, x); }
  };
  cong(goc.loi_ngay, "loi"); cong(goc.gt_ngay, "gt"); cong(goc.nhac_ngay, "nhac");
  return [...m.values()].sort((a, b) => a.tuan.localeCompare(b.tuan)).slice(-9);
}

export { nowVN };
