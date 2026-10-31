/**
 * Gom muc log trung khi HIEN THI (du lieu goc giu nguyen):
 *  - tl_mail: app theodoimuahang luu 1 ban ghi / dong linh kien cho cung 1 thu -> 1 thu gui 25 dong = 25 ban ghi.
 *  - tl_loi R3 / R4: ghi theo tung ngay (dung quy tac) -> nhieu loi cung loai tren 1 dong / nhieu dong cung han.
 *  - event_log ke hoach chuyen tu Google Sheet cu (06-09/2026): nhieu dot tuan cung giay, cung noi dung.
 * Giu thu tu xuat hien dau tien; moi nhom: x = ban dai dien, ds = moi ban trong nhom.
 */
export function gopTrung<T>(ds: T[], khoa: (x: T) => string): { x: T; ds: T[] }[] {
  const m = new Map<string, { x: T; ds: T[] }>();
  for (const x of ds) {
    const k = khoa(x);
    const g = m.get(k);
    if (g) g.ds.push(x);
    else m.set(k, { x, ds: [x] });
  }
  return [...m.values()];
}

/** 1 thu = cung huong + tieu de + thoi gian (ext_id moi dong 1 khac nhau). */
export const khoaMail = <T extends { huong?: string; tieu_de?: string | null; thoi_gian?: string | null }>(m: T) =>
  `${m.huong ?? ""}|${m.tieu_de ?? ""}|${m.thoi_gian ?? ""}`;

/** "A, B, C +n" - liet ke gon cac ma (ma LK, ngay...). */
export const lietKe = (xs: (string | null | undefined)[], toiDa = 4) => {
  const u = [...new Set(xs.filter(Boolean) as string[])];
  return u.length <= toiDa ? u.join(", ") : `${u.slice(0, toiDa).join(", ")} +${u.length - toiDa}`;
};
