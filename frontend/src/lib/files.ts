import { api } from "../api/client";

/** Khop backend routes/eo.ts ALLOWED_EXT / MAX_FILE_BYTES. */
export const FILE_ACCEPT = ".xlsx,.xlsm,.xls,.csv,.png,.jpg,.jpeg,.gif,.webp,.heic,.bmp,.pdf,.doc,.docx";
export const FILE_MAX = 20 * 1024 * 1024;
const EXT_OK = /\.(xlsx|xlsm|xls|csv|png|jpe?g|gif|webp|heic|bmp|pdf|docx?)$/i;

export function checkFile(f: File): string | null {
  if (!EXT_OK.test(f.name)) return `${f.name}: chỉ nhận Excel, ảnh, PDF, Word`;
  if (f.size > FILE_MAX) return `${f.name}: vượt 20MB`;
  if (f.size === 0) return `${f.name}: tệp rỗng`;
  return null;
}

export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(name);
export const isExcel = (name: string) => /\.(xlsx|xlsm|xls|csv)$/i.test(name);

export function fileSize(n?: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const UPLOAD_ERR: Record<string, string> = {
  GOOGLE_DRIVE_NOT_CONNECTED: "chưa kết nối Google Drive (Admin vào Cài đặt › Cấu hình hệ thống)",
  BAD_FILE_TYPE: "loại tệp không được phép",
  FILE_TOO_LARGE: "vượt 20MB",
  EMPTY_FILE: "tệp rỗng",
};

/** Upload lan luot; tra ve danh sach loi (rong = tat ca thanh cong). */
export async function uploadEoFiles(eoId: number | string, files: File[], ghiChu?: string): Promise<string[]> {
  const errs: string[] = [];
  for (const f of files) {
    try {
      const qs = `filename=${encodeURIComponent(f.name)}${ghiChu ? `&ghi_chu=${encodeURIComponent(ghiChu)}` : ""}`;
      await api.postBinary(`/eo/${eoId}/files?${qs}`, await f.arrayBuffer(), f.type || "application/octet-stream");
    } catch (e: any) {
      errs.push(`${f.name}: ${UPLOAD_ERR[e?.body?.error] ?? "lỗi tải lên"}`);
    }
  }
  return errs;
}

/** Anh thu nho cua file Drive da chia se cong khai. */
export const driveThumb = (driveFileId: string) => `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w320`;
