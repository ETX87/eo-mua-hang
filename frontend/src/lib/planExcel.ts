import { readSheet, pick, str, parseNum, parseDate, normWeek, writeBook, weekSat, weekStartOf } from "./excel";
import { ngay } from "./format";

/** Dong gui len POST /api/plans/bulk (khop backend routes/plans.ts BulkRow). */
export interface BulkRow {
  _row?: number;
  eo_item_id?: number;
  ma_po?: string; part_code?: string; warehouse?: string;
  planned_date?: string; tuan?: string; planned_qty: number;
  factory_committed_date?: string | null; ghi_chu?: string | null;
}
export interface PlanLine {
  id: number; eo_id: number; eo_code: string; approval_code: string | null; part_code: string; part_code_goc: string | null;
  part_name: string; warehouse: string; supplier?: string | null; current_qty: number; da_len_kh: number; da_len_kh_loai: number; da_ve: number;
}
export const maPO = (l: { eo_code: string; approval_code?: string | null }) => l.approval_code || l.eo_code;

export interface Parsed { rows: BulkRow[]; errs: string[]; skipped: number; weeks?: string[] }

const COL_ID = ["ID dòng", "ID dong", "ID"];
const COL_PO = ["Mã PO", "Mã phê duyệt", "Mã EO", "PO"];
const COL_LK = ["Mã linh kiện", "Mã LK", "Mã hàng"];
const COL_KHO = ["Kho", "Kho cần đặt"];

function ident(r: Record<string, unknown>, errs: string[]): Partial<BulkRow> | null {
  const id = parseNum(pick(r, ...COL_ID));
  if (id && id > 0) return { eo_item_id: id };
  const po = str(pick(r, ...COL_PO));
  const lk = str(pick(r, ...COL_LK));
  if (!po || !lk) { errs.push(`Dòng ${r._row}: thiếu Mã PO / Mã linh kiện`); return null; }
  return { ma_po: po, part_code: lk, warehouse: str(pick(r, ...COL_KHO)) || undefined };
}

// ------------------------------------------------------------------ ke hoach THEO NGAY
const DAILY_HEAD = ["ID dòng", "Mã PO", "Mã EO", "Mã linh kiện", "Tên linh kiện", "Kho", "SL đặt", "Đã lên KH", "Còn lại",
  "Ngày về dự kiến", "SL kế hoạch", "Ngày NM cam kết", "Ghi chú"];

export function dailyTemplate(lines: PlanLine[], filename: string) {
  writeBook(filename, [
    {
      name: "Ke hoach hang ve",
      rows: [
        DAILY_HEAD,
        ...lines.map((l) => [l.id, maPO(l), l.eo_code, l.part_code, l.part_name, l.warehouse, l.current_qty, l.da_len_kh,
          Math.max(0, l.current_qty - l.da_len_kh), "", "", "", ""]),
      ],
      widths: [9, 15, 13, 16, 30, 18, 9, 10, 9, 15, 11, 15, 24],
    },
    {
      name: "Huong dan",
      rows: [
        ["Cách điền"],
        ["- Mỗi dòng = 1 mốc hàng về. 1 linh kiện về nhiều đợt: copy thêm dòng, giữ nguyên ID dòng / Mã PO / Mã LK / Kho."],
        ["- Bắt buộc: Ngày về dự kiến (dd/mm/yyyy) + SL kế hoạch. Dòng để trống cả 2 cột sẽ được bỏ qua."],
        ["- Không có ID dòng thì hệ thống tìm theo Mã PO (mã 3TDO hoặc mã EO) + Mã linh kiện (+ Kho nếu mã có ở nhiều kho)."],
        ["- Chọn 'Ghi đè' khi import: kế hoạch theo ngày CŨ của các linh kiện có trong file bị thay bằng file này (import lại cùng file không bị nhân đôi)."],
        ["- Các cột SL đặt / Đã lên KH / Còn lại chỉ để tham khảo, không đọc khi import."],
      ],
      widths: [120],
    },
  ]);
}

export async function parseDailyFile(file: File): Promise<Parsed> {
  const { rows } = await readSheet(file);
  const out: BulkRow[] = [];
  const errs: string[] = [];
  let skipped = 0;
  for (const r of rows) {
    const d = parseDate(pick(r, "Ngày về dự kiến", "Ngày về", "Ngày đáp ứng", "Ngày"));
    const q = parseNum(pick(r, "SL kế hoạch", "Số lượng", "SL về", "SL"));
    if (d == null && q == null) { skipped++; continue; }
    const id = ident(r, errs);
    if (!id) continue;
    if (d == null || d === "INVALID") { errs.push(`Dòng ${r._row}: Ngày về dự kiến trống / sai định dạng`); continue; }
    if (q == null || Number.isNaN(q) || q < 0) { errs.push(`Dòng ${r._row}: SL kế hoạch không hợp lệ`); continue; }
    const nm = parseDate(pick(r, "Ngày NM cam kết", "Ngày nhà máy cam kết"));
    if (nm === "INVALID") { errs.push(`Dòng ${r._row}: Ngày NM cam kết sai định dạng`); continue; }
    out.push({ _row: Number(r._row), ...id, planned_date: d, planned_qty: q, factory_committed_date: nm, ghi_chu: str(pick(r, "Ghi chú", "Ghi chú nhà máy")) || null });
  }
  return { rows: out, errs, skipped };
}

// ------------------------------------------------------------------ ke hoach THEO TUAN (pivot)
const WEEK_FIXED = ["ID dòng", "Mã PO", "Mã EO", "Mã linh kiện", "Tên linh kiện", "Kho", "SL đặt", "Đã về (AMIS)"];

export function weeklyTemplate(lines: PlanLine[], plans: { eo_item_id: number; tuan: string | null; planned_qty: number }[], weeks: string[], filename: string) {
  const cell = new Map<string, number>();
  for (const p of plans) if (p.tuan) cell.set(`${p.eo_item_id}|${p.tuan}`, (cell.get(`${p.eo_item_id}|${p.tuan}`) ?? 0) + p.planned_qty);
  writeBook(filename, [
    {
      name: "Ke hoach tuan",
      rows: [
        [...WEEK_FIXED, ...weeks],
        ["", "", "", "", "(dòng này: ngày CN–T7 của tuần, không sửa)", "", "", "", ...weeks.map((w) => `${ngay(weekStartOf(weekSat(w)))}–${ngay(weekSat(w))}`)],
        ...lines.map((l) => [l.id, maPO(l), l.eo_code, l.part_code, l.part_name, l.warehouse, l.current_qty, l.da_ve,
          ...weeks.map((w) => cell.get(`${l.id}|${w}`) ?? "")]),
      ],
      widths: [9, 15, 13, 16, 30, 18, 9, 11, ...weeks.map(() => 10)],
    },
    {
      name: "Huong dan",
      rows: [
        ["Cách điền"],
        ["- Mỗi dòng = 1 linh kiện; mỗi cột Yyy-Wnn = SL dự kiến về trong tuần đó (tuần Chủ nhật – Thứ bảy)."],
        ["- Thêm tuần: chèn cột mới, tiêu đề đúng dạng Y26-W45. Ô để trống = không có kế hoạch tuần đó."],
        ["- Khi import, kế hoạch TUẦN cũ của các linh kiện có ít nhất 1 ô số sẽ được thay toàn bộ bằng số trong file."],
        ["- Muốn xóa hết kế hoạch tuần của 1 linh kiện: ghi 0 vào 1 ô bất kỳ của dòng đó. Dòng để trống hết sẽ không bị đụng tới."],
        ["- Không có ID dòng thì hệ thống tìm theo Mã PO (mã 3TDO hoặc mã EO) + Mã linh kiện (+ Kho)."],
      ],
      widths: [120],
    },
  ]);
}

export async function parseWeeklyFile(file: File): Promise<Parsed> {
  const { headers, rows } = await readSheet(file);
  const weekCols = headers.map((h) => ({ h, w: normWeek(h) })).filter((x) => x.w) as { h: string; w: string }[];
  const errs: string[] = [];
  if (!weekCols.length) return { rows: [], errs: ["Không thấy cột tuần nào (tiêu đề dạng Y26-W42)."], skipped: 0, weeks: [] };
  const out: BulkRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    const vals = weekCols.map((c) => ({ w: c.w, v: parseNum(pick(r, c.h)) }));
    // dong mo ta ngay tuan trong file mau ("dd/mm–dd/mm") -> parseNum = NaN o moi o -> bo qua
    if (vals.every((x) => x.v == null || Number.isNaN(x.v)) && !str(pick(r, ...COL_LK))) { skipped++; continue; }
    const filled = vals.filter((x) => x.v != null);
    if (!filled.length) { skipped++; continue; }
    const id = ident(r, errs);
    if (!id) continue;
    const bad = filled.find((x) => Number.isNaN(x.v) || (x.v as number) < 0);
    if (bad) { errs.push(`Dòng ${r._row}: ô tuần ${bad.w} không phải số hợp lệ`); continue; }
    const pos = filled.filter((x) => (x.v as number) > 0);
    if (!pos.length) out.push({ _row: Number(r._row), ...id, tuan: filled[0].w, planned_qty: 0 });
    else for (const x of pos) out.push({ _row: Number(r._row), ...id, tuan: x.w, planned_qty: x.v as number });
  }
  return { rows: out, errs, skipped, weeks: weekCols.map((c) => c.w) };
}
