/**
 * LICH GIO LAM VIEC dung chung cho MOI SLA / han (v0.103, chot chu he thong 2026-11-19):
 *   "chuyen doi toan bo sla, han giai trinh theo moc gio lam viec. 24h = 8h lam viec. bo qua CN + nua thu 7 = 8h + 4h"
 *   Thu 2 - Thu 6: 08:00-12:00 + 13:00-17:00 (8h) · Thu 7: 08:00-12:00 (4h) · Chu nhat nghi  -> 44h / tuan.
 *   Quy doi moc cu (gio lich, chi bo Chu nhat): 24h -> 8h LV, 48h -> 16h LV, 7 ngay (168h) -> 56h LV.
 * Moi moc la gio tuong VN 'YYYY-MM-DD HH:MM:SS' (khong UTC). Ngay le CHUA tinh.
 * Chi ap dung TU MOC `GIO_LV_TU`: loi da ghi truoc moc giu nguyen han cu (khong tinh lai / khong tu xoa - lib/theoDoi dong bo R1).
 */
export const GIO_LV_TU = "2026-11-19 11:24:00";
/** gio lam viec / ngay lich cu: 24h cu = 8h LV */
export const QUY_DOI = 8 / 24;

const H = 3600_000, NGAY = 24 * H, TUAN_GIO = 44;
/** ca lam viec theo thu (0 = CN): [gio bat dau, gio ket thuc] */
const CA: [number, number][][] = [[], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12]]];

const parse = (s: string) => Date.parse(s.slice(0, 19).replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z"));
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/** So ms lam viec trong [tu, den] cua 1 ngay (dau = 00:00 ngay do). */
function trongNgay(dau: number, tu: number, den: number): number {
  let ms = 0;
  for (const [a, b] of CA[new Date(dau).getUTCDay()]) {
    const s = Math.max(tu, dau + a * H), e = Math.min(den, dau + b * H);
    if (e > s) ms += e - s;
  }
  return ms;
}

/** Cong N gio LAM VIEC vao 1 moc. Moc ngoai gio -> bat dau tu dau ca ke tiep. Ket qua luon nam trong / cuoi 1 ca (vd 17:00). */
export function congGioLV(start: string, gio: number): string {
  let t = parse(start);
  let con = Math.round(gio * H);
  if (!(con > 0)) return fmt(t);
  for (let i = 0; i < 4000; i++) {
    const dau = t - (t % NGAY);
    for (const [a, b] of CA[new Date(dau).getUTCDay()]) {
      const we = dau + b * H;
      if (t >= we) continue;
      const s = Math.max(t, dau + a * H);
      if (con <= we - s) return fmt(s + con);
      con -= we - s;
      t = we;
    }
    t = dau + NGAY;
  }
  return fmt(t);
}

/** So GIO LAM VIEC giua 2 moc (lam tron 0,1h). Nhanh: tuan tron = 44h. */
export function demGioLV(a: string, b: string): number {
  const tu = parse(a), den = parse(b);
  if (!(den > tu)) return 0;
  const d0 = tu - (tu % NGAY), d1 = den - (den % NGAY);
  let ms: number;
  if (d0 === d1) ms = trongNgay(d0, tu, den);
  else {
    ms = trongNgay(d0, tu, d0 + NGAY) + trongNgay(d1, d1, den);
    let d = d0 + NGAY;
    const soNgay = Math.round((d1 - d) / NGAY);
    const tuan = Math.floor(soNgay / 7);
    ms += tuan * TUAN_GIO * H;
    d += tuan * 7 * NGAY;
    for (; d < d1; d += NGAY) ms += trongNgay(d, d, d + NGAY);
  }
  return Math.round((ms / H) * 10) / 10;
}
