import { readSheet, pick, str, normKey, parseNum, parseDate, normWeek, writeBook, weekSat, weekStartOf } from "./excel";
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
  part_name: string; warehouse: string; supplier?: string | null; ghi_chu?: string | null; current_qty: number; da_len_kh: number; da_len_kh_loai: number; da_ve: number;
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
// File mau: cot nhan dien (khong sua) + cot tham khao + 4 cot DIEN. Dong 2 = dong huong dan (bat dau "↓"), parser bo qua.
// Moi dong = 1 dot hang ve; dien san cac dot DANG CO cua dong -> import che do thay the khong lam mat dot cu.
const DAILY_HEAD = ["ID dòng", "Mã PO", "Mã linh kiện", "Tên linh kiện", "Kho", "SL đặt", "Đã về AMIS (tham khảo)", "Chưa có kế hoạch",
  "Ngày nhà máy cam kết", "Ngày dự kiến", "SL dự kiến về", "Ghi chú / nguồn"];
const DAILY_HUONG_DAN = ["↓ không sửa", "↓ không sửa", "↓ không sửa", "(tham khảo)", "↓ không sửa", "(tham khảo)", "(tham khảo)", "(tham khảo)",
  "✎ ĐIỀN dd/mm/yyyy", "✎ trống = ngày NM", "✎ ĐIỀN số lượng", "✎ tuỳ chọn"];

export function dailyTemplate(lines: PlanLine[], plans: any[], filename: string) {
  const byLine = new Map<number, any[]>();
  for (const p of plans) if ((p.loai ?? "NGAY") !== "TUAN") byLine.set(p.eo_item_id, [...(byLine.get(p.eo_item_id) ?? []), p]);
  const rows: unknown[][] = [];
  for (const l of lines) {
    const base = [l.id, maPO(l), l.part_code, l.part_name, l.warehouse, l.current_qty, l.da_ve, Math.max(0, l.current_qty - l.da_len_kh)];
    const ps = byLine.get(l.id) ?? [];
    if (!ps.length) rows.push([...base, "", "", "", ""]);
    for (const p of ps) rows.push([...base, ngay(p.factory_committed_date) || "", ngay(p.planned_date), p.planned_qty, p.ghi_chu ?? ""]);
  }
  writeBook(filename, [
    {
      name: "Ke hoach hang ve",
      rows: [DAILY_HEAD, DAILY_HUONG_DAN, ...rows],
      widths: [9, 15, 16, 30, 22, 9, 11, 13, 19, 17, 15, 26],
    },
    {
      name: "Huong dan",
      rows: [
        ["CÁCH ĐIỀN — chỉ điền 4 cột cuối (có dấu ✎), các cột khác giữ nguyên"],
        ["1. Mỗi dòng = 1 đợt hàng về của 1 linh kiện. Linh kiện về nhiều đợt: copy dòng đó thêm 1 dòng, sửa ngày + số lượng."],
        ["2. Ngày nhà máy cam kết: ngày nhà máy / NCC xác nhận sẽ giao (dd/mm/yyyy)."],
        ["3. Ngày dự kiến: ngày ước tính hàng về kho. Để TRỐNG = lấy bằng ngày nhà máy cam kết (thường 2 ngày trùng nhau)."],
        ["4. SL dự kiến về: số lượng về trong đợt đó. Tổng các đợt của 1 linh kiện không được lớn hơn SL đặt."],
        ["5. Dòng đã điền sẵn = kế hoạch HIỆN TẠI. Sửa thẳng vào đó. Xóa trắng 1 dòng = bỏ đợt đó. Linh kiện để trống hết = giữ nguyên."],
        ["6. Ngày hàng về THỰC TẾ lấy tự động từ phiếu nhập AMIS — không điền ở file này."],
      ],
      widths: [120],
    },
  ]);
}

/** Cot mang nghia hang DA VE thuc te - lay tu dong tu phieu nhap AMIS, khong cho import (tranh nhap tay ngay hang ve). */
const COT_THUC_TE = ["Ngày hàng về", "Ngày về", "Ngày hàng về thực tế", "Ngày về thực tế", "Ngày nhập kho", "Ngày nhập",
  "SL về", "SL đã về", "SL hàng về", "SL nhập kho", "Đã về", "Đã về (AMIS)"];

export async function parseDailyFile(file: File): Promise<Parsed> {
  const { headers, rows } = await readSheet(file);
  const out: BulkRow[] = [];
  const errs: string[] = [];
  let skipped = 0;
  const cam = new Set(COT_THUC_TE.map(normKey));
  const cotCam = headers.filter((h) => cam.has(normKey(h)) && rows.some((r) => str(r[normKey(h)]) !== ""));
  if (cotCam.length) {
    errs.push(`File có cột ${cotCam.map((h) => `"${h}"`).join(", ")}: ngày hàng về / số lượng đã về lấy TỰ ĐỘNG từ phiếu nhập AMIS, không nhập tay được. `
      + `Nếu đó là ngày ước tính hàng sẽ về, đổi tên cột thành "Ngày dự kiến" (số lượng: "SL kế hoạch"); nếu là số liệu thực tế, xóa cột rồi import lại.`);
    return { rows: [], errs, skipped: 0 };
  }
  for (const r of rows) {
    if (/^[↓(]/.test(str(pick(r, ...COL_ID)))) continue; // dong huong dan cua file mau
    const nm = parseDate(pick(r, "Ngày nhà máy cam kết", "Ngày NM cam kết"));
    // Ngay du kien de trong -> lay theo ngay nha may cam ket (thuong 2 ngay trung nhau)
    const d = parseDate(pick(r, "Ngày dự kiến", "Ngày về dự kiến", "Ngày đáp ứng", "Ngày")) ?? (nm && nm !== "INVALID" ? nm : null);
    const q = parseNum(pick(r, "SL dự kiến về", "SL kế hoạch", "Số lượng", "SL"));
    if (d == null && q == null) { skipped++; continue; }
    const id = ident(r, errs);
    if (!id) continue;
    if (d == null || d === "INVALID") { errs.push(`Dòng ${r._row}: Ngày dự kiến (hoặc Ngày nhà máy cam kết) trống / sai định dạng`); continue; }
    if (q == null || Number.isNaN(q) || q < 0) { errs.push(`Dòng ${r._row}: SL dự kiến về không hợp lệ`); continue; }
    if (nm === "INVALID") { errs.push(`Dòng ${r._row}: Ngày nhà máy cam kết sai định dạng`); continue; }
    out.push({ _row: Number(r._row), ...id, planned_date: d, planned_qty: q, factory_committed_date: nm, ghi_chu: str(pick(r, "Ghi chú / nguồn", "Ghi chú", "Ghi chú nhà máy")) || null });
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
