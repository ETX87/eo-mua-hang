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

export function ten(email: string | null | undefined): string {
  if (!email) return "";
  const s = String(email);
  return s.includes("@") ? s.split("@")[0] : s;
}
