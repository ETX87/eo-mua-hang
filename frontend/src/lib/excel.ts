import * as XLSX from "xlsx";

/** Bo dau + thuong + chi giu chu/so - so khop tieu de cot Excel ("Mã LK", "ma lk", "MÃ_LK" -> "malk"). */
export function normKey(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/gi, "d")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Doc sheet dau tien -> mang dong (key = tieu de da normKey) + danh sach tieu de goc. */
export async function readSheet(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  // CSV doc dang text (UTF-8) - doc dang byte SheetJS hieu la codepage cu -> vo dau tieng Viet
  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(await file.text(), { type: "string", raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: false });
  // dong tieu de = dong dau tien co >= 2 o khac rong (bo qua dong tieu de/ghi chu phia tren)
  const hIdx = aoa.findIndex((r) => (r ?? []).filter((x) => x != null && String(x).trim() !== "").length >= 2);
  if (hIdx < 0) return { headers: [], rows: [] };
  const headers = (aoa[hIdx] ?? []).map((h) => String(h ?? "").trim());
  const keys = headers.map(normKey);
  const rows: Record<string, unknown>[] = [];
  for (let i = hIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (!r.some((x) => x != null && String(x).trim() !== "")) continue;
    const o: Record<string, unknown> = { _row: i + 1 };
    keys.forEach((k, j) => { if (k) o[k] = r[j]; });
    rows.push(o);
  }
  return { headers, rows };
}

/** Lay gia tri theo 1 trong cac ten cot (da normKey). */
export function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    const v = row[normKey(n)];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}
export const str = (v: unknown) => (v == null ? "" : String(v).trim());

/** So: nhan number, "1.000" (nghin VN), "1,000", "12,5". Rong -> null; sai -> NaN. */
export function parseNum(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Ngay -> 'YYYY-MM-DD'. Nhan Date (cellDates), so serial Excel, 'dd/mm/yyyy', 'yyyy-mm-dd'. Rong -> null; sai -> 'INVALID'. */
export function parseDate(v: unknown): string | null {
  if (v == null || String(v).trim() === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // xlsx tao Date theo gio dia phuong luc 00:00 - cong 12h tranh lech mui gio
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : "INVALID";
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  return "INVALID";
}
function valid(y: number, mo: number, d: number): string {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : "INVALID";
}

/** Ghi file mau / file xuat nhieu sheet tu mang 2 chieu. */
export function writeBook(filename: string, sheets: { name: string; rows: unknown[][]; widths?: number[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.widths) ws["!cols"] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

// ---- tuan CN-T7, nhan 'Yyy-Wnn' (khop backend lib/week.ts)
function utc(s: string) { return new Date(s.slice(0, 10) + "T00:00:00Z"); }
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function weekStartOf(s: string): string { const x = utc(s); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return iso(x); }
export function weekEndOf(s: string): string { const x = utc(weekStartOf(s)); x.setUTCDate(x.getUTCDate() + 6); return iso(x); }
export function weekLabelOf(s: string): string {
  const sat = utc(weekEndOf(s));
  const y = sat.getUTCFullYear();
  const wk = Math.floor((sat.getTime() - utc(weekStartOf(`${y}-01-01`)).getTime()) / (7 * 86400000)) + 1;
  return `Y${String(y).slice(2)}-W${pad(wk)}`;
}
/** Nhan tuan hop le -> nhan chuan 'Y26-W05'; khong phai nhan tuan -> null. */
export function normWeek(s: unknown): string | null {
  const m = /^\s*Y?(\d{2}|\d{4})\s*-?\s*W\s*(\d{1,2})\s*$/i.exec(String(s ?? ""));
  if (!m) return null;
  const yy = m[1].length === 4 ? m[1].slice(2) : m[1];
  const wk = Number(m[2]);
  return wk >= 1 && wk <= 53 ? `Y${yy}-W${pad(wk)}` : null;
}
/** Thu Bay cua tuan 'Y26-W05'. */
export function weekSat(label: string): string {
  const m = /^Y(\d{2})-W(\d{2})$/.exec(label)!;
  const x = utc(weekStartOf(`20${m[1]}-01-01`));
  x.setUTCDate(x.getUTCDate() + (Number(m[2]) - 1) * 7 + 6);
  return iso(x);
}
/** n tuan lien tiep tinh tu tuan chua `from`. */
export function nextWeeks(from: string, n: number): string[] {
  const out: string[] = [];
  const x = utc(weekEndOf(from));
  for (let i = 0; i < n; i++) { out.push(weekLabelOf(iso(x))); x.setUTCDate(x.getUTCDate() + 7); }
  return out;
}
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
