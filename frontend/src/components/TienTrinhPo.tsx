import { GD_CHINH } from "../lib/giaiDoan";

/**
 * Luong tien trinh GON cua 1 PO (cot "Tien trinh" o Don PO, v0.086 - thay nhan trang thai "Đã ban hành" vi do chi la 1 giai doan).
 * Moc: G1 Lap → G2 Tham dinh → G3 Duyet mua → G5 Co ngay DK → G6 Cho hang → G8 Giao bu → ✓ Du hang. Nhin 1 giay biet PO dang o dau:
 *  - moc da qua: xanh · moc dang co dong o: cam (do neu co dong tre han), kem so dong · moc chua toi: xam.
 *  - PO chua ban hanh: theo trang thai duyet (Nhap = G1, Dang tham dinh = G2, Cho duyet mua = G3).
 *  - PO da ban hanh: theo so dong dang o tung giai doan (backend lib/dieuHanh tomTatTheoPo.gd); moc qua = truoc giai doan som nhat con dong.
 * Dong tieu de duoi duong: ten moc dang xu ly som nhat + so dong; re chuot xem tung moc.
 */
const MOC = [...GD_CHINH.map((g) => ({ k: g.k as string, l: g.l as string })), { k: "XONG", l: "Đủ hàng" }];
const NGAN: Record<string, string> = { G1: "Lập", G2: "Thẩm định", G3: "Duyệt mua", G5: "Có ngày DK", G6: "Chờ hàng", G8: "Giao bù", XONG: "Đủ hàng" };
const MAU = { xong: "#22C55E", dang: "#F59E0B", tre: "#EF4444", chua: "#CBD5E1" };

export interface GdPo { dem: Record<string, number>; tre: Record<string, number> }

export function TienTrinhPo({ trangThai, xong, gd }: { trangThai: string; xong?: boolean; gd?: GdPo | null }) {
  if (trangThai === "REJECTED" || trangThai === "CANCELLED") {
    return <span className="badge reject">{trangThai === "REJECTED" ? "Từ chối" : "Đã hủy"}</span>;
  }
  // so dong dang o tung moc
  const dem: Record<string, number> = {};
  const tre: Record<string, number> = {};
  if (trangThai === "ISSUED") {
    for (const [k, n] of Object.entries(gd?.dem ?? {})) {
      const kk = k === "G4" ? "G5" : k === "G7" ? "G8" : k; // G4 song song, G7 chi do -> gop vao moc chinh ke
      if (kk === "HUY") continue;
      dem[kk] = (dem[kk] ?? 0) + n;
    }
    for (const [k, n] of Object.entries(gd?.tre ?? {})) tre[k] = (tre[k] ?? 0) + n;
    if (xong) { for (const k of Object.keys(dem)) if (k !== "XONG") delete dem[k]; dem.XONG = dem.XONG || 1; }
  } else {
    dem[trangThai === "IN_REVIEW" ? "G2" : trangThai === "WAITING_FINAL_APPROVAL" ? "G3" : "G1"] = 1;
  }
  const chuaXong = MOC.filter((m) => m.k !== "XONG" && dem[m.k]);
  const idxSom = chuaXong.length ? MOC.findIndex((m) => m.k === chuaXong[0].k) : MOC.length - 1;
  const dangK = chuaXong[0]?.k ?? "XONG";
  const soTre = Object.values(tre).reduce((s, n) => s + n, 0);
  const banHanh = trangThai === "ISSUED";
  const tieuDe = MOC.map((m, i) => {
    const n = dem[m.k] ?? 0;
    const tt = i < idxSom ? "đã qua" : n ? `${banHanh && m.k !== "XONG" ? `${n} dòng đang ở` : "đang ở"}${tre[m.k] ? ` · ${tre[m.k]} trễ hạn` : ""}` : "chưa tới";
    return `${m.k === "XONG" ? "✓" : m.k} ${m.l}: ${tt}`;
  }).join("\n");
  return (
    <div title={tieuDe} style={{ minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {MOC.map((m, i) => {
          const n = dem[m.k] ?? 0;
          const mau = m.k === "XONG" ? (dangK === "XONG" ? MAU.xong : MAU.chua)
            : i < idxSom ? MAU.xong : n ? (tre[m.k] ? MAU.tre : MAU.dang) : MAU.chua;
          const noi = i > 0 ? (i <= idxSom ? MAU.xong : MAU.chua) : null;
          const dang = n > 0 && m.k !== "XONG";
          return (
            <div key={m.k} style={{ display: "flex", alignItems: "center", flex: i ? 1 : "none" }}>
              {noi && <div style={{ height: 2, flex: 1, minWidth: 6, background: noi }} />}
              <div style={{ width: dang ? 12 : 9, height: dang ? 12 : 9, borderRadius: 99, background: mau, flexShrink: 0,
                boxShadow: dang ? `0 0 0 2px ${mau}33` : undefined }} />
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, marginTop: 3, whiteSpace: "nowrap", fontWeight: 700, color: dangK === "XONG" ? "var(--ok-ink)" : soTre ? "var(--danger-ink)" : "var(--warn-ink)" }}>
        {dangK === "XONG" ? "✓ Đủ hàng" : `${NGAN[dangK]}${banHanh ? ` · ${dem[dangK]} dòng` : ""}`}
        {chuaXong.length > 1 && <span className="muted" style={{ fontWeight: 400 }}> +{chuaXong.length - 1} bước</span>}
        {soTre > 0 && <span> · {soTre} trễ</span>}
        {trangThai === "DRAFT" && <span className="muted" style={{ fontWeight: 400 }}> (nháp)</span>}
      </div>
    </div>
  );
}
