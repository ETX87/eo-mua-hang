/**
 * Gio VN hien tai "YYYY-MM-DD HH:MM:SS" - dung cho moi cot timestamp he thong tu sinh khi ghi tu
 * code JS. Toan he quy uoc luu gio VN dia phuong (khong UTC) - khop DEFAULT
 * datetime('now','+7 hours') trong migrations va REPORT_SPEC.md.
 */
export function nowVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

/** Ngay VN hom nay "YYYY-MM-DD". */
export function todayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
