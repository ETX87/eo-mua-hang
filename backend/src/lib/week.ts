/**
 * Tuan Chu nhat - Thu Bay (xem REPORT_SPEC.md §5). Nhan `Yyy-Wnn`, ky/thang `Yyymm` theo ngay
 * THU BAY (cuoi tuan). W01 = tuan (CN-T7) chua ngay 01/01 cua nam do.
 * !!! Phai doi chieu voi bang `Set tuan` cua Google Sheet o buoc UAT - neu lech tuan giao nam,
 *     thay bang tra cuu.
 */
function d(s: string): Date {
  return new Date(s.slice(0, 10) + "T00:00:00Z");
}
export function weekStart(dateStr: string): string {
  const x = d(dateStr);
  x.setUTCDate(x.getUTCDate() - x.getUTCDay()); // ve Chu nhat
  return x.toISOString().slice(0, 10);
}
export function weekEnd(dateStr: string): string {
  const x = d(weekStart(dateStr));
  x.setUTCDate(x.getUTCDate() + 6); // Thu Bay
  return x.toISOString().slice(0, 10);
}
export interface WeekLabel {
  nam: string; // 'Y26'
  namFull: number; // 2026
  wk: number; // 1..53
  label: string; // 'Y26-W18'
  ky: string; // 'Y2605'  (Yyymm theo Thu Bay)
}
export function weekLabel(dateStr: string): WeekLabel {
  const sat = d(weekEnd(dateStr));
  const namFull = sat.getUTCFullYear();
  const yearWkStart = d(weekStart(`${namFull}-01-01`));
  const wk = Math.floor((sat.getTime() - yearWkStart.getTime()) / (7 * 86400000)) + 1;
  const yy = String(namFull).slice(2);
  const mm = String(sat.getUTCMonth() + 1).padStart(2, "0");
  return { nam: `Y${yy}`, namFull, wk, label: `Y${yy}-W${String(wk).padStart(2, "0")}`, ky: `Y${yy}${mm}` };
}
