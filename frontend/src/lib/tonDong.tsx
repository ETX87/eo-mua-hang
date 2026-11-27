/**
 * Moc thoi gian TON cua don hang (tinh tu ngay dat = muon hon ngay ban hanh EO / ngay tao dong, theo gio).
 * Khop backend routes/dashboard.ts MOC_TON. Dung cho Tong quan, Theo doi, Danh sach EO, Bao cao tien do, Canh bao CEO.
 */
export const MOC_TON = [
  { k: "lt1", l: "Dưới 1 ngày", tu: 0, den: 1, mau: "#1d8a3c", nen: "#e2f6e7" },
  { k: "1_3", l: "1–3 ngày", tu: 1, den: 3, mau: "#65A30D", nen: "#ECFCCB" },
  { k: "3_7", l: "3–7 ngày", tu: 3, den: 7, mau: "#CA8A04", nen: "#fff6e8" },
  { k: "7_10", l: "7–10 ngày", tu: 7, den: 10, mau: "#c26400", nen: "#fff1dc" },
  { k: "10_14", l: "10–14 ngày", tu: 10, den: 14, mau: "#ff6b00", nen: "#ffeddc" },
  { k: "14_21", l: "14–21 ngày", tu: 14, den: 21, mau: "#d70015", nen: "#ffe7e5" },
  { k: "21_30", l: "21–30 ngày", tu: 21, den: 30, mau: "#d70015", nen: "#ffd0cc" },
  { k: "gt30", l: "Trên 30 ngày", tu: 30, den: Infinity, mau: "#8a0010", nen: "#ffb3ad" },
] as const;
export type KhoaMoc = (typeof MOC_TON)[number]["k"];

const msVN = (t: string) => Date.parse(t.replace(" ", "T") + (t.length <= 10 ? "T00:00:00Z" : "Z"));
const nowVNms = () => Date.now() + 7 * 3600_000;

/** So ngay ton (thap phan) tu moc thoi gian gio VN 'YYYY-MM-DD[ HH:MM:SS]'. */
export const soNgayTon = (tu?: string | null) => (tu ? Math.max(0, (nowVNms() - msVN(tu)) / 86400_000) : null);
export const mocCua = (ngay: number | null) => (ngay == null ? null : MOC_TON.find((m) => ngay >= m.tu && ngay < m.den) ?? MOC_TON[0]);
/** Ngay dat cua 1 dong (khop lib/theoDoi bat_dau): dong them sau ban hanh -> ngay tao dong; con lai -> ngay ban hanh EO. */
export const ngayDat = (banHanh?: string | null, tao?: string | null, sauBh?: boolean) => (sauBh ? tao : banHanh ?? tao) ?? null;

/** Nhan moc ton: "5 ngày" + mau theo moc. tu = moc bat dau ton. */
export function MocTon({ tu, nho }: { tu?: string | null; nho?: boolean }) {
  const n = soNgayTon(tu);
  const m = mocCua(n);
  if (n == null || !m) return <span className="muted">—</span>;
  const txt = n < 1 ? `${Math.max(1, Math.round(n * 24))} giờ` : `${Math.floor(n)} ngày`;
  return (
    <span title={`Tồn ${txt} (mốc ${m.l}) — tính từ ${tu}`} style={{ display: "inline-block", whiteSpace: "nowrap", background: m.nen, color: m.mau, fontWeight: 700, fontSize: nho ? 11 : 12, borderRadius: 8, padding: nho ? "1px 6px" : "2px 8px" }}>
      {txt}
    </span>
  );
}

/** Bo dau tieng Viet + thuong - tim kiem khong dau dung chung. */
export const boDau = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0111\u0110]/g, "d").toLowerCase();

/** Ham loc "tim nhanh" khong dau tren moi gia tri (1 cap long nhau) cua 1 doi tuong - dung cho bang tu dung / popup. */
export function khopTim(q: string): (o: unknown) => boolean {
  const tu = boDau(q).split(/\s+/).filter(Boolean);
  if (!tu.length) return () => true;
  return (o) => {
    const h = boDau(o != null && typeof o === "object"
      ? Object.values(o as Record<string, unknown>).map((v) => (v != null && typeof v === "object" ? Object.values(v as object).join(" ") : String(v ?? ""))).join(" ")
      : String(o ?? ""));
    return tu.every((x) => h.includes(x));
  };
}
