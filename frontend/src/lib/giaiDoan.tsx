import { ngayGio } from "./format";

/**
 * 8 giai doan cua 1 dong don hang - khop backend lib/giaiDoan.ts (G4 song song, G7 chi do).
 * Dong co: gd_hien_tai ('G1'..'G8' | 'XONG' | 'HUY'), gd_hien_tai_ten, gd_bat_dau, gd_gio (gio lam viec), gd_tre.
 */
export const GD_CHINH = [
  { k: "G1", l: "Lập & trình EO" }, { k: "G2", l: "Thẩm định" }, { k: "G3", l: "Duyệt cuối & ban hành" },
  { k: "G5", l: "Có ngày dự kiến" }, { k: "G6", l: "Chờ sản xuất & giao" }, { k: "G8", l: "Giao bù đến đủ" },
] as const;

/** Gio lam viec -> "5 giờ" / "2.5 ngày" (1 ngay = 24 gio lam viec). */
export const gioTxt = (g: number | null | undefined) => (g == null ? "" : g < 24 ? `${g} giờ` : `${Math.round((g / 24) * 10) / 10} ngày`);


/** Nhan giai doan hien tai + thoi gian da o + tre han. */
export function GdBadge({ r }: { r: Record<string, any> }) {
  if (!r.gd_hien_tai) return <span className="muted">—</span>;
  const xong = r.gd_hien_tai === "XONG", huy = r.gd_hien_tai === "HUY";
  return (
    <span title={r.gd_bat_dau ? `Bắt đầu ${ngayGio(r.gd_bat_dau)} · đã ${gioTxt(r.gd_gio)} làm việc` : undefined} style={{ whiteSpace: "nowrap" }}>
      <span className={`badge ${xong ? "issued" : huy ? "nhap" : r.gd_tre ? "reject" : "review"}`}>{xong || huy ? r.gd_hien_tai_ten : `${r.gd_hien_tai} · ${r.gd_hien_tai_ten}`}</span>
      {!xong && !huy && r.gd_gio != null && <div style={{ fontSize: 11, color: r.gd_tre ? "var(--danger-ink)" : "var(--text-muted)" }}>{gioTxt(r.gd_gio)}{r.gd_tre ? " · trễ hạn" : ""}</div>}
    </span>
  );
}

