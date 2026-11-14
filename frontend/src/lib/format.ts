export const nf = new Intl.NumberFormat("vi-VN");

export function soLuong(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  return nf.format(Number(v));
}

export function tien(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (n === 0) return "0 đ";
  return nf.format(Math.round(n)) + " đ";
}

export function ngay(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export function ngayGio(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : ngay(v);
}

export function tuBayGio(v: string | null | undefined): string {
  if (!v) return "";
  const t = new Date(String(v).replace(" ", "T") + "+07:00").getTime();
  if (Number.isNaN(t)) return ngayGio(v);
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  return ngay(v);
}

export function pct(v: number | string | null | undefined, digits = 1): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return (n <= 1 && n >= -1 ? n * 100 : n).toFixed(digits) + "%";
}

/**
 * Ten hien thi theo Gmail (2026-11-08): UU TIEN ho ten tren ETX nhan su (GET /users/ten, nap 1 lan o App truoc khi ve man),
 * khong co moi hien Gmail (phan truoc @). Gmail phu cua 1 tai khoan hien ten tai khoan chinh.
 */
let TEN: Record<string, string> = {};
export function datTenHienThi(m: Record<string, string>) { TEN = m; }
export function ten(email: string | null | undefined): string {
  if (!email) return "";
  const s = String(email).trim();
  const t = TEN[s.toLowerCase()];
  if (t) return t;
  return s.includes("@") ? s.split("@")[0] : s;
}

/** Thong bao loi 400 GIA_TRI_KHONG_CHUAN (doi tac / ly do PS ngoai danh muc chuan - backend lib/chuanHoa.ts). */
export function loiChuanTxt(body: any): string | null {
  if (body?.error !== "GIA_TRI_KHONG_CHUAN") return null;
  const ds = (body.loi ?? []) as { loai: string; gia_tri: string }[];
  const dt = ds.filter((x) => x.loai === "DOI_TAC").map((x) => `"${x.gia_tri}"`);
  const ld = ds.filter((x) => x.loai === "LY_DO").map((x) => `"${x.gia_tri}"`);
  return [
    dt.length ? `Đối tác không có trong danh mục: ${dt.join(", ")} — chọn đối tác từ danh sách gợi ý (đối tác mới: nhờ Admin thêm ở Cài đặt › Danh mục).` : "",
    ld.length ? `Lý do phát sinh không hợp lệ: ${ld.join(", ")} — chỉ chọn: Ký gửi, Đặt lần đầu, Kế hoạch tháng, Phát sinh, Hết hàng.` : "",
  ].filter(Boolean).join(" ");
}
