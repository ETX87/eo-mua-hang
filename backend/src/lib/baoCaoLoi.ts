import type { Env } from "../types";
import { todayVN, nowVN } from "./vnTime";
import { demGioLV } from "./gioLamViec";
import { hanGiaiTrinh } from "./theoDoi";
import { layDongTheoDoi } from "./theoDoi";
import { layBangMaLoi, maCuaLoi, maCeo, khoaViPham, type BangMaLoi } from "./maLoi";

/**
 * Danh sach LOI day du + tong hop theo MA LOI ER.MH (v0.091) - dung chung: man Vi pham (routes/viPham, loc theo pham vi nguoi xem),
 * Ca ton CEO (routes/caCeo) va API doc cho he khac (routes/partner). Muc do (chot 2026-11-04):
 *   CEO = dong dang cap CEO · CAO = cung loai lap >= 3 lan / cho >= 12h LV · TB = lap 2 / cho >= 8h LV · THAP con lai (v0.110, han GT 16h LV).
 *   v0.103: "cho" tinh theo GIO LAM VIEC (lib/gioLamViec) - 3 / 7 ngay cu x 8h. tuoi_ngay van tra de hien thi.
 * Chi loi cua dong con trong layDongTheoDoi (PO ban hanh truoc moc 'theo_doi_bo_qua_truoc' khong tinh).
 */
// v0.110: han giai trinh 16h LV -> "qua lau" 8h LV (nua han), "rat lau" 12h LV (con <= 4h). Truoc: 24 / 56.
export const QUA_LAU_GIO = 8;
export const RAT_LAU_GIO = 12;
const soNgay = (a: string, b: string) => Math.max(0, Math.floor((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400_000));

export async function dsLoiDayDu(env: Env): Promise<{ rows: any[]; bang: BangMaLoi }> {
  const db = env.DB;
  const [loiRs, gtRs, nnRs, dong, bang] = await Promise.all([
    db.prepare(
      `SELECT l.id, l.eo_item_id, l.eo_id, l.quy_tac, l.han, l.ngay_tham_chieu, l.ai_ma, l.ai_email, l.loi_ma, l.trang_thai,
              l.giai_trinh_id, l.created_at, i.part_code, i.part_name, i.warehouse kho, i.supplier doi_tac, i.line_status,
              e.eo_code, e.approval_code, e.created_by nguoi_dat
       FROM tl_loi l JOIN eo_item i ON i.id = l.eo_item_id JOIN eo e ON e.id = l.eo_id ORDER BY l.id`,
    ).all<any>(),
    db.prepare(
      `SELECT id, substr(noi_dung, 1, 400) noi_dung, pham_vi, nhom, ai_ma, ai_email, loi_ma, created_by, created_at, hinh_anh IS NOT NULL AND hinh_anh <> '[]' co_anh
       FROM tl_giai_trinh WHERE id IN (SELECT giai_trinh_id FROM tl_loi WHERE giai_trinh_id IS NOT NULL)`,
    ).all<any>(),
    db.prepare("SELECT eo_item_id, COUNT(*) n, SUM(kenh = 'TAY') tay, MAX(created_at) moi FROM tl_nhac_nho GROUP BY eo_item_id").all<any>(),
    layDongTheoDoi(env, "tat_ca"),
    layBangMaLoi(db),
  ]);
  const today = todayVN();
  const now = nowVN();
  const gtBy = new Map(gtRs.results.map((g: any) => [g.id, g]));
  const nnBy = new Map(nnRs.results.map((n: any) => [n.eo_item_id, n]));
  const dongBy = new Map(dong.map((d) => [d.item_id, d]));
  const nhomLoai = new Map<string, any[]>();
  for (const l of loiRs.results) {
    const k = `${l.eo_item_id}|${l.quy_tac}`;
    nhomLoai.set(k, [...(nhomLoai.get(k) ?? []), l]);
  }
  for (const ds of nhomLoai.values()) ds.sort((a, b) => String(a.han ?? a.created_at).localeCompare(String(b.han ?? b.created_at)) || a.id - b.id);

  // v0.110 (chu he thong 2026-11-23): "het han khong giai trinh thi moi tinh la vi pham loi".
  //  han_gt = moc + GIO_TU_DONG gio LV; vi_pham = tu dong QUA_HAN, hoac con cho ma da qua han (nen chua chot). Loi TAY khong co han, khong la vi pham.
  const hanGtCua = (l: any) => (l.quy_tac === "TAY" ? null : hanGiaiTrinh((l.han ?? l.created_at) as string));
  const laViPham = (l: any) => {
    if (l.quy_tac === "TAY") return false;
    if (l.trang_thai === "CHO_GIAI_TRINH") { const h = hanGtCua(l); return !!h && h <= now; }
    const g = l.giai_trinh_id ? gtBy.get(l.giai_trinh_id) : null;
    return g?.pham_vi === "AUTO" && g.nhom === "AUTO:QUA_HAN";
  };
  const vpBy = new Map<number, boolean>(loiRs.results.map((l: any) => [l.id, laViPham(l)]));
  const rows: any[] = [];
  for (const l of loiRs.results) {
    if (!dongBy.has(l.eo_item_id)) continue;
    const ds = nhomLoai.get(`${l.eo_item_id}|${l.quy_tac}`)!;
    const soLan = ds.length;
    const cho = l.trang_thai === "CHO_GIAI_TRINH";
    // muc do: "lap" chi dem lan CHUA xu ly trong han (dang cho / vi pham) - lan da giai trinh / khac phuc dung han khong nang muc
    const soLanXau = ds.filter((y) => y.trang_thai === "CHO_GIAI_TRINH" || vpBy.get(y.id)).length;
    const hanGt = hanGtCua(l);
    const gt = l.giai_trinh_id ? gtBy.get(l.giai_trinh_id) : null;
    const moc = (l.han ?? l.created_at) as string;
    const tuoi = cho ? soNgay(moc, today) : gt ? soNgay(moc, gt.created_at) : 0;
    const tuoiGio = cho ? demGioLV(moc, now) : gt ? demGioLV(moc, gt.created_at) : 0;
    const d = dongBy.get(l.eo_item_id)!;
    const ceo = d.ceo_ly_do.length > 0;
    const muc = ceo ? "CEO" : soLanXau >= 3 || (cho && tuoiGio >= RAT_LAU_GIO) ? "CAO" : soLanXau >= 2 || (cho && tuoiGio >= QUA_LAU_GIO) ? "TB" : "THAP";
    const nn = nnBy.get(l.eo_item_id);
    const m = maCuaLoi(bang, l, l.doi_tac);
    rows.push({
      ...l, nguoi_vp: (l.ai_email || l.nguoi_dat) as string | null, vp_khoa: khoaViPham(l), ma_loi: m.ma, ten_ma: m.ten, buoc: m.buoc,
      so_lan: soLan, so_lan_xau: soLanXau, vi_pham: vpBy.get(l.id) ?? false, han_gt: hanGt, con_gio_gt: cho && hanGt && hanGt > now ? demGioLV(now, hanGt) : 0, lan_thu: ds.indexOf(l) + 1, tuoi_ngay: tuoi, tuoi_gio: tuoiGio, qua_lau: cho && tuoiGio >= QUA_LAU_GIO, muc,
      gt_noi_dung: gt?.noi_dung ?? null, gt_luc: gt?.created_at ?? null, gt_boi: gt?.created_by ?? null, gt_pham_vi: gt?.pham_vi ?? null, gt_co_anh: !!gt?.co_anh,
      gt_ai_ma: gt?.ai_ma ?? null, gt_ai_email: gt?.ai_email ?? null, gt_loi_ma: gt?.loi_ma ?? null,
      /** v0.092: dong tu dong (AUTO:KHAC_PHUC = da khac phuc sau do · AUTO:QUA_HAN = qua han giai trinh 56h LV, truoc v0.103 la 7 ngay) */
      tu_dong: gt?.pham_vi === "AUTO" ? (gt.nhom === "AUTO:QUA_HAN" ? "QUA_HAN" : "KHAC_PHUC") : null,
      so_nhac: nn?.n ?? 0, so_nhac_tay: nn?.tay ?? 0, nhac_gan_nhat: nn?.moi ?? null,
      ceo, ceo_ly_do: d.ceo_ly_do, so_lan_lui: d.so_lan_lui, tinh_trang: d.tinh_trang,
      ngay_du_kien: d.ngay_du_kien_gan_nhat, so_luong_dat: d.so_luong_dat, sl_ve: d.sl_nhap_amis,
    });
  }
  return { rows, bang };
}

/** Tong hop theo ma loi: so loi, cho / da giai trinh, so dong / PO, top nguoi bi gan, top nguyen nhan (Ai theo giai trinh). */
/** Trang thai 1 VI PHAM GOP tu cac dong cua no (lib/maLoi khoaViPham). */
// v0.110: TU_QUA_HAN = VI PHAM THAT (co dong het han khong giai trinh) - xet truoc DA_GT; CHO = con dong can giai trinh (trong han)
export function trangThaiViPham(ds: any[]): "CHO" | "DA_GT" | "TU_KHAC_PHUC" | "TU_QUA_HAN" {
  if (ds.some((r) => r.trang_thai === "CHO_GIAI_TRINH" && !r.vi_pham)) return "CHO";
  if (ds.some((r) => r.vi_pham || r.tu_dong === "QUA_HAN")) return "TU_QUA_HAN";
  if (ds.some((r) => !r.tu_dong)) return "DA_GT";
  return "TU_KHAC_PHUC";
}
/** Gom loi theo khoa vi pham -> danh sach vi pham (dai dien = dong cho / moi nhat). */
export function gomViPham(rows: any[]) {
  const m = new Map<string, any[]>();
  for (const r of rows) { const k = r.vp_khoa; m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m.entries()].map(([k, ds]) => ({ khoa: k, ds, tt: trangThaiViPham(ds), x: ds.find((r) => r.trang_thai === "CHO_GIAI_TRINH") ?? ds[ds.length - 1] }));
}

/**
 * Tong hop theo ma loi - DEM THEO VI PHAM GOP (v0.093): so_loi = so vi pham (PO + loai + ky), cho / da_gt / tu dong theo trang thai vi pham;
 * so_ban_ghi = so dong bi anh huong (ban ghi tl_loi), so_dong / so_po phu.
 */
export function tongHopTheoMa(rows: any[], bang: BangMaLoi) {
  const m = new Map<string, { ma: string; ten: string; nhom: string; buoc: string | null; so_loi: number; so_ban_ghi: number; cho: number; da_gt: number; qua_lau: number; tu_khac_phuc: number; tu_qua_han: number;
    _dong: Set<number>; _po: Set<number>; _nguoi: Map<string, number>; _ai: Map<string, number>; moi_nhat: string | null }>();
  for (const d of bang.ds.filter((x) => x.nhom === "HE_THONG" || x.nhom === "TAY")) {
    m.set(d.ma, { ma: d.ma, ten: d.ten, nhom: d.nhom, buoc: d.buoc, so_loi: 0, so_ban_ghi: 0, cho: 0, da_gt: 0, qua_lau: 0, tu_khac_phuc: 0, tu_qua_han: 0, _dong: new Set(), _po: new Set(), _nguoi: new Map(), _ai: new Map(), moi_nhat: null });
  }
  for (const v of gomViPham(rows)) {
    const x = m.get(v.x.ma_loi);
    if (!x) continue;
    x.so_loi += 1; x.so_ban_ghi += v.ds.length;
    if (v.tt === "CHO") x.cho += 1; else if (v.tt === "DA_GT") x.da_gt += 1; else if (v.tt === "TU_QUA_HAN") x.tu_qua_han += 1; else x.tu_khac_phuc += 1;
    if (v.ds.some((r: any) => r.qua_lau)) x.qua_lau += 1;
    for (const r of v.ds) { x._dong.add(r.eo_item_id); x._po.add(r.eo_id); const t = r.han ?? r.created_at; if (t && (!x.moi_nhat || t > x.moi_nhat)) x.moi_nhat = t; }
    const ng = v.x.nguoi_vp ?? ""; x._nguoi.set(ng, (x._nguoi.get(ng) ?? 0) + 1);
    const gt = v.ds.find((r: any) => r.gt_ai_ma && !r.tu_dong);
    if (gt) x._ai.set(gt.gt_ai_ma, (x._ai.get(gt.gt_ai_ma) ?? 0) + 1);
  }
  const top = (mp: Map<string, number>) => [...mp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ k, n }));
  return [...m.values()].map(({ _dong, _po, _nguoi, _ai, ...x }) => ({
    ...x, so_dong: _dong.size, so_po: _po.size, ty_le_gt: x.so_loi ? Math.round((x.da_gt / x.so_loi) * 1000) / 10 : null,
    nguoi: top(_nguoi), nguyen_nhan: top(_ai),
  }));
}

/** Ca ton cap CEO (dong dang mo) kem ma 201-203 + dien giai. */
export async function dsCaCeo(env: Env) {
  const ds = (await layDongTheoDoi(env, "dang_mo")).filter((r) => r.ceo_ly_do.length > 0);
  return ds.map((r) => ({
    item_id: r.item_id, eo_id: r.eo_id, po: r.ma_phe_duyet || r.eo_code, eo_code: r.eo_code, ma_lk: r.part_code, ten_lk: r.part_name, kho: r.kho,
    doi_tac: r.doi_tac, nguoi_dat: r.nguoi_dat, so_luong_dat: r.so_luong_dat, sl_ve: r.sl_nhap_amis, con_thieu: r.so_luong_con_thieu,
    bat_dau: r.bat_dau, ngay_du_kien: r.ngay_du_kien_gan_nhat, ngay_nm_cam_ket: r.ngay_nm_cam_ket, tinh_trang: r.tinh_trang,
    so_lan_lui: r.so_lan_lui, so_loi: r.so_loi, so_loi_cho_gt: r.so_loi_cho_gt,
    ma_ceo: r.ceo_chi_tiet.map((c) => ({ ma: maCeo(c.ma)?.ma ?? c.ma, ten: c.tieu_de, nguong: c.nguong, gia_tri: c.gia_tri, chi_tiet: c.dong })),
  }));
}
