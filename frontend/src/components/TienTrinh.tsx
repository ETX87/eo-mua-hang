import { ngay, ngayGio, soLuong } from "../lib/format";
import { gioTxt } from "../lib/giaiDoan";

/**
 * Duong tien trinh 8 giai doan (backend lib/giaiDoan.ts) - 1 dong don hang hoac ca EO (gop cac dong).
 * Du lieu: dong cua GET /so-don-hang[?eo_id=] (gd_moc, gd_gio_tung, gd_tre_tung, gd_hien_tai, so_lan_tra_ve...).
 * Loi theo doi gan vao giai doan theo quy tac: R3 khong push -> G4, R1 khong co ngay DK 24h -> G5, R4 qua han cap nhat -> G6.
 * G4 chay SONG SONG (mail gui NCC), G7 CHI DO (khong bao gio "dang o").
 */
export interface GdDef { k: string; l: string; vai_tro: string }
type Row = Record<string, any>;
export const LOI_GD: Record<string, string> = { R3: "G4", R1: "G5", R4: "G6" };
const PHU: Record<string, string> = { G4: "song song", G7: "chỉ đo" };

type TrangThai = "xong" | "dang" | "tre" | "mot_phan" | "chua";
const MAU: Record<TrangThai, { nen: string; vien: string; chu: string }> = {
  xong: { nen: "#22C55E", vien: "#16A34A", chu: "#fff" },
  mot_phan: { nen: "#BBF7D0", vien: "#22C55E", chu: "#166534" },
  dang: { nen: "#F59E0B", vien: "#D97706", chu: "#fff" },
  tre: { nen: "#EF4444", vien: "#DC2626", chu: "#fff" },
  chua: { nen: "#fff", vien: "#CBD5E1", chu: "#94A3B8" },
};

export interface NutGd {
  g: GdDef; tt: TrangThai; batDau: Row[]; xong: Row[]; dang: Row[]; tre: Row[];
  gioMax: number | null; gioTb: number | null; loi: Row[]; loiCho: number; traVe: number;
}

/** Tinh trang thai tung giai doan cho 1 hoac nhieu dong (bo dong da huy neu con dong khac). */
export function tinhNut(defs: GdDef[], rowsIn: Row[], loiIn: Row[] = []): NutGd[] {
  const song = rowsIn.filter((r) => r.gd_hien_tai !== "HUY");
  const rows = song.length ? song : rowsIn;
  const ids = new Set(rows.map((r) => r.item_id));
  return defs.map((g) => {
    const m = (r: Row) => r.gd_moc?.[g.k];
    const batDau = rows.filter((r) => m(r)?.bd);
    const xong = rows.filter((r) => m(r)?.kt);
    const dang = g.k === "G7" ? [] : g.k === "G4"
      ? rows.filter((r) => m(r)?.bd && !m(r)?.kt && !["XONG", "HUY"].includes(r.gd_hien_tai))
      : rows.filter((r) => r.gd_hien_tai === g.k);
    const tre = rows.filter((r) => r.gd_tre_tung?.[g.k]);
    const gio = batDau.map((r) => r.gd_gio_tung?.[g.k]).filter((v): v is number => v != null);
    const loi = loiIn.filter((l) => LOI_GD[l.quy_tac] === g.k && ids.has(l.eo_item_id));
    const tt: TrangThai = dang.length ? (dang.some((r) => r.gd_tre_tung?.[g.k]) ? "tre" : "dang")
      : rows.length && xong.length === rows.length ? "xong" : xong.length ? "mot_phan" : batDau.length ? "dang" : "chua";
    return {
      g, tt, batDau, xong, dang, tre, loi, loiCho: loi.filter((l) => l.trang_thai === "CHO_GIAI_TRINH").length,
      gioMax: gio.length ? Math.max(...gio) : null, gioTb: gio.length ? Math.round((gio.reduce((s, x) => s + x, 0) / gio.length) * 10) / 10 : null,
      traVe: g.k === "G2" ? Math.max(0, ...rows.map((r) => r.so_lan_tra_ve ?? 0)) : 0,
    };
  });
}

const hanTxt = (g: string, sla: Record<string, number>, r?: Row) =>
  g === "G6" ? (r?.gd_moc?.G6?.han ? `hạn ${ngay(r.gd_moc.G6.han)}` : "hạn = ngày DK đầu") : sla[g] != null ? `hạn ${gioTxt(sla[g])}` : "";

export function TienTrinh({ defs, sla, rows, loi, onChonNut }: {
  defs: GdDef[]; sla: Record<string, number>; rows: Row[]; loi?: Row[]; onChonNut?: (k: string) => void;
}) {
  if (!defs.length || !rows.length) return null;
  const nut = tinhNut(defs, rows, loi);
  const mot = rows.length === 1 ? rows[0] : null;
  const dangO = nut.filter((n) => n.dang.length && n.g.k !== "G4");
  const ketThuc = mot && ["XONG", "HUY"].includes(mot.gd_hien_tai);
  return (
    <div className="tt-wrap">
      <div style={{ fontSize: 12, marginBottom: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <b style={{ fontSize: 12.5 }}>Tiến trình {mot ? "đơn hàng" : `EO (${rows.length} dòng)`}</b>
        {ketThuc ? <span className={`badge ${mot!.gd_hien_tai === "XONG" ? "issued" : "nhap"}`}>{mot!.gd_hien_tai_ten}</span>
          : dangO.length ? <span>Đang ở: {dangO.map((n) => <span key={n.g.k} className={`badge ${n.tt === "tre" ? "reject" : "review"}`} style={{ marginRight: 4 }}>
            {n.g.k} · {n.g.l}{mot ? ` · ${gioTxt(mot.gd_gio_tung?.[n.g.k])}` : ` · ${n.dang.length} dòng`}{n.tt === "tre" ? " · trễ hạn" : ""}</span>)}</span>
          : <span className="muted">Chưa bắt đầu</span>}
        <span className="muted" style={{ marginLeft: "auto" }}>Giờ làm việc (bỏ Chủ nhật){mot ? "" : " · thời gian = dòng chậm nhất"}</span>
      </div>
      <div className="tt-line">
        {nut.map((n, i) => {
          const c = MAU[n.tt];
          const m = mot?.gd_moc?.[n.g.k];
          const gio = mot ? mot.gd_gio_tung?.[n.g.k] : n.gioMax;
          const title = [
            `${n.g.k} ${n.g.l} — ${n.g.vai_tro}${PHU[n.g.k] ? ` (${PHU[n.g.k]})` : ""}`,
            m?.bd ? `Bắt đầu ${ngayGio(m.bd)}` : "", m?.kt ? `Kết thúc ${ngayGio(m.kt)}` : "", m?.han ? `Hạn ${ngayGio(m.han)}` : "",
            !mot && n.gioTb != null ? `Trung bình ${gioTxt(n.gioTb)} · chậm nhất ${gioTxt(n.gioMax)}` : "",
            !mot ? `${n.xong.length}/${rows.length} dòng xong · ${n.dang.length} đang ở · ${n.tre.length} trễ hạn` : "",
            n.loi.length ? `${n.loi.length} lỗi theo dõi (${n.loiCho} chờ giải trình)` : "",
          ].filter(Boolean).join("\n");
          return (
            <div key={n.g.k} className="tt-nut" title={title} onClick={onChonNut ? () => onChonNut(n.g.k) : undefined} style={{ cursor: onChonNut ? "pointer" : undefined }}>
              {i > 0 && <div className="tt-noi" style={{ background: nut[i - 1].tt === "xong" ? "#22C55E" : nut[i - 1].tt === "mot_phan" ? "#86EFAC" : "#E2E8F0" }} />}
              <div className="tt-tron" style={{ background: c.nen, borderColor: c.vien, color: c.chu, borderStyle: PHU[n.g.k] ? "dashed" : "solid" }}>
                {n.tt === "xong" ? "✓" : n.g.k.slice(1)}
              </div>
              <div className="tt-ten">{n.g.l}</div>
              <div className="tt-phu">{n.g.vai_tro}{PHU[n.g.k] ? ` · ${PHU[n.g.k]}` : ""}</div>
              {gio != null && <div className="tt-gio" style={{ color: n.tre.length ? "var(--danger-ink)" : undefined }}>{gioTxt(gio)}{n.tre.length ? " · trễ" : ""}</div>}
              {mot && m?.bd && <div className="tt-phu">{ngay(m.bd)}{m.kt ? ` → ${ngay(m.kt)}` : " → nay"}</div>}
              <div className="tt-phu">{hanTxt(n.g.k, sla, mot ?? undefined)}</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
                {!mot && n.dang.length > 0 && <span className="badge review" style={{ fontSize: 10 }}>{soLuong(n.dang.length)} đang ở</span>}
                {!mot && n.tre.length > 0 && <span className="badge reject" style={{ fontSize: 10 }}>{soLuong(n.tre.length)} trễ</span>}
                {n.loi.length > 0 && <span className={`badge ${n.loiCho ? "reject" : "nhap"}`} style={{ fontSize: 10 }}>{n.loi.length} lỗi{n.loiCho ? ` · ${n.loiCho} chờ GT` : ""}</span>}
                {n.traVe > 0 && <span className="badge final" style={{ fontSize: 10 }}>trả về {n.traVe} lần</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
