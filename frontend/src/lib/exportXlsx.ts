import * as XLSX from "xlsx";

export interface ExportCol<T> {
  header: string;
  get: (row: T) => string | number | null | undefined;
}

export function exportRowsToXlsx<T>(rows: T[], cols: ExportCol<T>[], filename: string, sheetName = "Sheet1") {
  const data = rows.map((r) => {
    const o: Record<string, string | number> = {};
    for (const c of cols) o[c.header] = c.get(r) ?? "";
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.header) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
