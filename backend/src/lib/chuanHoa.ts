/**
 * Chuan hoa Doi tac (NCC) / Ly do phat sinh cua dong linh kien (2026-11-08, migration 0020).
 * Danh muc chuan `dm_chuan` + bi danh `dm_bi_danh` (khoa = khoa() ben duoi - PHAI khop scripts/gen_0020_chuan_hoa.py).
 * Moi duong ghi eo_item (tao EO, them dong, sua dong) goi chuanHoaDong: nhap "KRF" / "KAROFI" -> luu "Karofi";
 * gia tri khong nhan ra -> 400 GIA_TRI_KHONG_CHUAN (Admin them doi tac / bi danh o Danh muc). Ly do PS chi 4 gia tri chuan.
 */

/** chu thuong khong dau, bo moi ky tu khac a-z0-9 ("ĐIỀU HÒA LIVOTEC" -> "dieuhoalivotec"). */
export const khoa = (s: string) =>
  s.replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type LoaiChuan = "DOI_TAC" | "LY_DO";
export interface BoChuan { map: Record<LoaiChuan, Map<string, string>>; ten: Record<LoaiChuan, string[]> }

export async function layBoChuan(db: D1Database): Promise<BoChuan> {
  const [c, b] = await Promise.all([
    db.prepare("SELECT loai, ten FROM dm_chuan WHERE active = 1 ORDER BY loai, thu_tu, ten").all<{ loai: LoaiChuan; ten: string }>(),
    db.prepare("SELECT loai, khoa, ten_chuan FROM dm_bi_danh").all<{ loai: LoaiChuan; khoa: string; ten_chuan: string }>(),
  ]);
  const bo: BoChuan = { map: { DOI_TAC: new Map(), LY_DO: new Map() }, ten: { DOI_TAC: [], LY_DO: [] } };
  for (const r of c.results) { bo.ten[r.loai].push(r.ten); bo.map[r.loai].set(khoa(r.ten), r.ten); }
  for (const r of b.results) if (bo.ten[r.loai].includes(r.ten_chuan) && !bo.map[r.loai].has(r.khoa)) bo.map[r.loai].set(r.khoa, r.ten_chuan);
  return bo;
}

/** Gia tri chuan cua 1 o nhap: "" -> null; khong nhan ra -> undefined. Doi tac: them luat "chua dung 1 ten chuan" (vd "Hút mùi Livotec"). */
export function chuan(bo: BoChuan, loai: LoaiChuan, raw: string | null | undefined): string | null | undefined {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const k = khoa(s);
  const m = bo.map[loai].get(k);
  if (m) return m;
  if (loai === "DOI_TAC" && k.length >= 4) {
    const hit = bo.ten.DOI_TAC.filter((t) => { const kt = khoa(t); return kt.length >= 4 && k.includes(kt); });
    if (hit.length === 1) return hit[0];
  }
  return undefined;
}

/**
 * Chuan hoa supplier / reason cua cac dong (sua tai cho). Tra danh sach gia tri khong hop le (rong = ok).
 * Chi dong co truong do moi xet (PATCH chi gui supplier).
 */
export function chuanHoaDong(bo: BoChuan, items: { supplier?: string | null; reason?: string | null }[]): { loai: LoaiChuan; gia_tri: string }[] {
  const loi: { loai: LoaiChuan; gia_tri: string }[] = [];
  for (const it of items) {
    if ("supplier" in it) {
      const v = chuan(bo, "DOI_TAC", it.supplier);
      if (v === undefined) loi.push({ loai: "DOI_TAC", gia_tri: String(it.supplier).trim() }); else it.supplier = v;
    }
    if ("reason" in it) {
      const v = chuan(bo, "LY_DO", it.reason);
      if (v === undefined) loi.push({ loai: "LY_DO", gia_tri: String(it.reason).trim() }); else it.reason = v;
    }
  }
  const seen = new Set<string>();
  return loi.filter((l) => { const k = l.loai + "|" + l.gia_tri; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Nhom doi tac co moc R1 24h (thay 48h) - yeu cau 2026-11-08: Karofi (KRF), Livotec (LVT), Korihome (KRH). */
const NHOM_R1_24H = ["karofi", "krf", "livotec", "lvt", "korihome", "krh"];
export const laNhomR1_24h = (doiTac: string | null | undefined) => {
  const k = khoa(doiTac ?? "");
  return !!k && NHOM_R1_24H.some((x) => k === x || (x.length >= 5 && k.includes(x)));
};
