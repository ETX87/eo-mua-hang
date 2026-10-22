import { normKey } from "./excel";

/**
 * Doc sheet AMIS/MISA -> mang dong voi KHOA CHUAN ma backend routes/amis.ts doc ("Tên kho", "Mã hàng", "Ngày chứng từ",
 * "Số chứng từ", "Số lượng Nhập", "Mã phê duyệt"...). Nhan ca 2 dang:
 *  - File mau cua app: 1 dong tieu de phang o dong 1.
 *  - Bao cao goc MISA "Sổ chi tiết vật tư hàng hóa": vai dong tieu de bao cao o tren, tieu de 2 tang
 *    ("Nhập / Xuất / Tồn" + dong duoi "Số lượng"), cot ma PD ten "Mã PD EO", dong "Tổng cộng" cuoi.
 * Vao: mang 2 chieu (sheet_to_json header:1, raw:false). Ngay dang so serial Excel (46296) -> 'YYYY-MM-DD'.
 */
const ALIAS: Record<string, string> = {
  makho: "Mã kho", tenkho: "Tên kho", mahang: "Mã hàng", tenhang: "Tên hàng",
  ngayhachtoan: "Ngày hạch toán", ngaychungtu: "Ngày chứng từ", sochungtu: "Số chứng từ",
  dvt: "ĐVT", diengiai: "Diễn giải", tkkho: "TK Kho", tkdoiung: "TK đối ứng",
  soluongnhap: "Số lượng Nhập", slnhap: "Số lượng Nhập", nhap: "Số lượng Nhập", nhapsoluong: "Số lượng Nhập",
  soluongxuat: "Số lượng Xuất", slxuat: "Số lượng Xuất", xuat: "Số lượng Xuất", xuatsoluong: "Số lượng Xuất",
  soluongton: "Số lượng Tồn", slton: "Số lượng Tồn", ton: "Số lượng Tồn", tonsoluong: "Số lượng Tồn",
  mapheduyet: "Mã phê duyệt", mapdeo: "Mã phê duyệt", mapd: "Mã phê duyệt",
  mapheduyeteo: "Mã phê duyệt",
};
const BAT_BUOC = ["Tên kho", "Mã hàng", "Số chứng từ", "Ngày chứng từ"];
const COT_NGAY = ["Ngày chứng từ", "Ngày hạch toán"];

const serialToIso = (n: number) => new Date(Math.round((n - 25569) * 86400_000)).toISOString().slice(0, 10);

export interface KetQuaDoc { rows: Record<string, unknown>[]; dongTieuDe: number; nhanDang: "mau" | "so_chi_tiet"; thieuCot: string[] }

export function docSheetAmis(aoa: unknown[][]): KetQuaDoc {
  // dong tieu de = dong dau tien (trong 20 dong) chua >= 3 cot bat buoc
  let h = 0;
  for (let i = 0; i < Math.min(20, aoa.length); i++) {
    const keys = (aoa[i] ?? []).map((c) => ALIAS[normKey(c)]).filter(Boolean);
    if (BAT_BUOC.filter((b) => keys.includes(b)).length >= 3) { h = i; break; }
  }
  const head = (aoa[h] ?? []).map((c) => String(c ?? "").trim());
  const sub = (aoa[h + 1] ?? []).map((c) => String(c ?? "").trim());
  // tieu de 2 tang: dong duoi co "Số lượng" va (hau nhu) khong co du lieu khac -> ghep "Số lượng" + cot cha (Nhập/Xuất/Tồn)
  const haiTang = sub.some((x) => normKey(x) === "soluong") && sub.filter((x) => x && normKey(x) !== "soluong").length === 0;
  const cols: (string | null)[] = head.map((t, i) => {
    let k = normKey(t);
    if (!k && haiTang && i > 0) k = normKey(head.slice(0, i).reverse().find((x) => x) ?? ""); // o gop ngang
    if (haiTang && normKey(sub[i]) === "soluong") k = `soluong${k}`;
    return ALIAS[k] ?? (t || null);
  });
  const start = h + 1 + (haiTang ? 1 : 0);
  const rows: Record<string, unknown>[] = [];
  for (const r of aoa.slice(start)) {
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;
    if (/^t[oổ]ng c[oộ]ng/i.test(String(r[0] ?? "").trim())) continue; // dong tong cuoi bao cao
    const o: Record<string, unknown> = {};
    cols.forEach((k, i) => {
      if (!k) return;
      let v = r[i] ?? null;
      if (COT_NGAY.includes(k) && v != null && /^\d{5}(\.\d+)?$/.test(String(v).trim())) v = serialToIso(Number(v));
      if (o[k] == null || o[k] === "") o[k] = v;
    });
    rows.push(o);
  }
  const coCot = new Set(cols.filter(Boolean) as string[]);
  const thieuCot = [...BAT_BUOC, "Số lượng Nhập", "Mã phê duyệt"].filter((k) => !coCot.has(k));
  return { rows, dongTieuDe: h + 1, nhanDang: h > 0 || haiTang ? "so_chi_tiet" : "mau", thieuCot };
}
