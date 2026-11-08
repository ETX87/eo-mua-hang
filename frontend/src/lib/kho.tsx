/**
 * Ten kho hien thi RUT GON (2026-11-08): dung "Mã kho" cai o Cai dat › Danh muc › Kho (settings_warehouse.ma_kho), khong co ma
 * thi giu ten goc. Danh sach nap 1 lan o App (GET /danh-muc/kho) -> datKho. Du lieu / loc / xuat Excel van dung ten day du.
 */
let MA: Record<string, string> = {};
export function datKho(ds: { ten_kho: string; ma_kho?: string | null }[]) {
  MA = Object.fromEntries(ds.filter((k) => k.ma_kho?.trim()).map((k) => [k.ten_kho.trim().toLowerCase(), k.ma_kho!.trim()]));
}
export function khoGon(ten: string | null | undefined): string {
  if (!ten) return "";
  return MA[String(ten).trim().toLowerCase()] ?? String(ten);
}
/** O hien thi kho: ma kho + tooltip ten day du. */
export function Kho({ t }: { t: string | null | undefined }) {
  if (!t) return null;
  const g = khoGon(t);
  return <span title={t} style={{ whiteSpace: "nowrap" }}>{g}</span>;
}
