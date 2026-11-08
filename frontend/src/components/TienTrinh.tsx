import { useState, type ReactNode } from "react";
import { ngay, ngayGio, soLuong, ten } from "../lib/format";
import { gioTxt } from "../lib/giaiDoan";

/**
 * Duong tien trinh 8 giai doan (backend lib/giaiDoan.ts) - 1 dong don hang hoac ca EO (gop cac dong).
 * Du lieu: dong cua GET /so-don-hang[?eo_id=] (gd_moc, gd_gio_tung, gd_tre_tung, gd_hien_tai, so_lan_tra_ve...).
 * Loi theo doi gan vao giai doan theo quy tac: R3 khong push -> G4, R1 khong co ngay DK 48h -> G5, R4 qua han cap nhat -> G6.
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

export function TienTrinh({ defs, sla, rows, loi, onChonNut, nhung }: {
  defs: GdDef[]; sla: Record<string, number>; rows: Row[]; loi?: Row[]; onChonNut?: (k: string) => void;
  /** true = nam trong QuyTrinh (ban mo rong): bo khung + dong tieu de */
  nhung?: boolean;
}) {
  if (!defs.length || !rows.length) return null;
  const nut = tinhNut(defs, rows, loi);
  const mot = rows.length === 1 ? rows[0] : null;
  const dangO = nut.filter((n) => n.dang.length && n.g.k !== "G4");
  const ketThuc = mot && ["XONG", "HUY"].includes(mot.gd_hien_tai);
  return (
    <div className={nhung ? undefined : "tt-wrap"} style={nhung ? { marginTop: 8 } : undefined}>
      {!nhung && <div style={{ fontSize: 12, marginBottom: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <b style={{ fontSize: 12.5 }}>Tiến trình {mot ? "đơn hàng" : `EO (${rows.length} dòng)`}</b>
        {ketThuc ? <span className={`badge ${mot!.gd_hien_tai === "XONG" ? "issued" : "nhap"}`}>{mot!.gd_hien_tai_ten}</span>
          : dangO.length ? <span>Đang ở: {dangO.map((n) => <span key={n.g.k} className={`badge ${n.tt === "tre" ? "reject" : "review"}`} style={{ marginRight: 4 }}>
            {n.g.k} · {n.g.l}{mot ? ` · ${gioTxt(mot.gd_gio_tung?.[n.g.k])}` : ` · ${n.dang.length} dòng`}{n.tt === "tre" ? " · trễ hạn" : ""}</span>)}</span>
          : <span className="muted">Chưa bắt đầu</span>}
        <span className="muted" style={{ marginLeft: "auto" }}>Giờ làm việc (bỏ Chủ nhật){mot ? "" : " · thời gian = dòng chậm nhất"}</span>
      </div>}
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

/** 8 giai doan (khop backend lib/giaiDoan GIAI_DOAN) - dung cho tien trinh thu gon khi khong co defs tu API. */
export const GD_8: GdDef[] = [
  { k: "G1", l: "Lập & trình EO", vai_tro: "Người tạo EO" }, { k: "G2", l: "Thẩm định", vai_tro: "Người thẩm định" },
  { k: "G3", l: "Duyệt mua & ban hành", vai_tro: "Người duyệt mua" }, { k: "G4", l: "Gửi đơn cho NCC (mail)", vai_tro: "NV đặt hàng" },
  { k: "G5", l: "Có ngày dự kiến", vai_tro: "NV đặt hàng" }, { k: "G6", l: "Chờ sản xuất & giao", vai_tro: "Nhà cung cấp" },
  { k: "G7", l: "Nhập kho & lên hệ thống", vai_tro: "Kho / Kế toán" }, { k: "G8", l: "Giao bù đến đủ", vai_tro: "NCC + NV theo dõi" },
];

/**
 * Tien trinh THU GON cua 1 dong (1 o bang): 8 cham noi lien + "Gx ten · thoi gian · tre" + so loi. Bam -> popup don hang.
 * r: dong co gd_moc / gd_gio_tung / gd_tre_tung / gd_hien_tai (GET /so-don-hang, /xem/linh-kien giai_doan).
 */
export function TienTrinhGon({ r, soLoi = 0, loiCho = 0, onClick }: { r: Row | null | undefined; soLoi?: number; loiCho?: number; onClick?: () => void }) {
  if (!r?.gd_hien_tai) return <span className="muted">—</span>;
  const xongHet = r.gd_hien_tai === "XONG", huy = r.gd_hien_tai === "HUY";
  const cur = GD_8.find((g) => g.k === r.gd_hien_tai);
  const tre = !!r.gd_tre;
  return (
    <div className="ttg" onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} style={{ cursor: onClick ? "pointer" : undefined }}
      title={GD_8.map((g) => {
        const m = r.gd_moc?.[g.k];
        const gio = r.gd_gio_tung?.[g.k];
        return `${g.k} ${g.l}: ${!m?.bd ? "chưa tới" : m.kt ? `xong${gio != null ? ` (${gioTxt(gio)})` : ""}` : `đang${gio != null ? ` ${gioTxt(gio)}` : ""}`}${r.gd_tre_tung?.[g.k] ? " · trễ" : ""}`;
      }).join("\n") + (onClick ? "\n— Bấm để xem chi tiết đơn hàng" : "")}>
      <div className="ttg-cham">
        {GD_8.map((g, i) => {
          const m = r.gd_moc?.[g.k];
          const dang = r.gd_hien_tai === g.k;
          const tt: TrangThai = dang ? (r.gd_tre_tung?.[g.k] ? "tre" : "dang") : m?.kt ? (r.gd_tre_tung?.[g.k] ? "mot_phan" : "xong") : m?.bd && g.k === "G4" ? "dang" : "chua";
          const c = MAU[tt];
          return (
            <span key={g.k} style={{ display: "inline-flex", alignItems: "center" }}>
              {i > 0 && <span className="ttg-noi" style={{ background: r.gd_moc?.[GD_8[i - 1].k]?.kt ? "#22C55E" : "#E2E8F0" }} />}
              <span className={`ttg-dot${dang ? " on" : ""}`} style={{ background: c.nen, borderColor: c.vien }} />
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 11, whiteSpace: "nowrap", color: tre && !xongHet && !huy ? "var(--danger-ink)" : "var(--text-muted)" }}>
        {xongHet ? "✓ Hoàn tất (về đủ)" : huy ? "Đã hủy" : `${r.gd_hien_tai} ${cur?.l ?? r.gd_hien_tai_ten ?? ""}${r.gd_gio != null ? ` · ${gioTxt(r.gd_gio)}` : ""}${tre ? " · trễ" : ""}`}
        {soLoi > 0 && <span className={`badge ${loiCho ? "reject" : "nhap"}`} style={{ fontSize: 9.5, marginLeft: 4, padding: "0 5px" }}>{soLoi} lỗi</span>}
      </div>
    </div>
  );
}

export interface CeoCt { ma: string; tieu_de: string; nguong: string; gia_tri: string; dong: string[] }
/** Chuoi giai thich cap CEO (tooltip / Excel). */
export const ceoTxt = (ct?: CeoCt[], lyDo?: string[]) =>
  ct?.length ? ct.map((c) => `• ${c.tieu_de}: ${c.gia_tri} (ngưỡng ${c.nguong})${c.dong.length ? "\n   " + c.dong.join("\n   ") : ""}`).join("\n") : (lyDo ?? []).join("\n");

/** Khung "Vi sao don nay o cap CEO" - dien giai tung ly do (backend lib/theoDoi ceo_chi_tiet). */
export function GiaiThichCeo({ ct, lyDo }: { ct?: CeoCt[]; lyDo?: string[] }) {
  if (!ct?.length && !lyDo?.length) return null;
  return (
    <div style={{ marginTop: 10, border: "1px solid #FCA5A5", background: "#FEF2F2", borderRadius: 10, padding: "8px 12px", fontSize: 12.5 }}>
      <b style={{ color: "var(--danger-ink)" }}>Vì sao đơn này ở cấp CEO</b>
      <span className="muted" style={{ marginLeft: 8, fontSize: 11.5 }}>Lên cấp CEO khi có 1 trong 3: lùi ngày dự kiến ≥ 3 lần · ngày dự kiến cách ngày đặt ≥ 30 ngày · ≥ 3 lỗi theo dõi</span>
      {(ct?.length ? ct : (lyDo ?? []).map((x) => ({ ma: "", tieu_de: x, nguong: "", gia_tri: "", dong: [] }))).map((c, i) => (
        <div key={i} style={{ marginTop: 6 }}>
          <div><b>{i + 1}. {c.tieu_de}</b>{c.gia_tri && <>: <b style={{ color: "var(--danger-ink)" }}>{c.gia_tri}</b> <span className="muted">(ngưỡng {c.nguong})</span></>}</div>
          {c.dong.length > 0 && <ul style={{ margin: "2px 0 0", paddingLeft: 20 }}>{c.dong.map((d, j) => <li key={j}>{d}</li>)}</ul>}
        </div>
      ))}
    </div>
  );
}

/* ====================================================================================================================
 * QuyTrinh (2026-11-08, yeu cau chu he thong): khung quy trinh GON cho popup EO / don hang (1 dong).
 *  - Mac dinh: 1 duong ngang 8 moc (moc da qua to mau + ngay ngan, moc dang o to noi, moc chua toi xam, bong do = so loi)
 *    + nut "▾ Xem chi tiết" mo ban day du (TienTrinh).
 *  - Hang ve nhieu dot: thanh tien do SL ve / SL dat, moi dot 1 moc (ngay CT AMIS + SL), con thieu -> giao bu.
 *  - Van de theo buoc: moi giai doan co loi / tre han -> ai mac (nguoi vi pham / phu trach), loai loi, so lan, cho giai trinh.
 * ==================================================================================================================== */
const QT_TEN: Record<string, string> = { R1: "Không có ngày DK đúng hạn", R3: "Không push đối tác (thứ 2/4)", R4: "Quá ngày DK không cập nhật", TAY: "Lỗi ghi khi giải trình" };
const AI_TEN: Record<string, string> = { NGUOI_DAT: "Người đặt", DOI_TAC: "Đối tác / NCC", KHO: "Kho", KE_TOAN: "Kế toán", NGUOI_DUYET: "Người duyệt", KHAC: "Khác" };
const ngan = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

/** Dot hang ve: gom phieu AMIS theo ngay chung tu. */
export function gomDotVe(phieu: Row[]): { d: string; sl: number; so: number }[] {
  const m = new Map<string, { d: string; sl: number; so: number }>();
  for (const p of phieu) {
    const d = String(p.doc_date ?? "").slice(0, 10);
    if (!d || !(p.qty_in > 0)) continue;
    const x = m.get(d) ?? { d, sl: 0, so: 0 };
    x.sl += p.qty_in; x.so += 1; m.set(d, x);
  }
  return [...m.values()].sort((a, b) => a.d.localeCompare(b.d));
}

function ThanhHangVe({ dot, slDat }: { dot: { d: string; sl: number; so: number }[]; slDat: number }) {
  const ve = dot.reduce((s, x) => s + x.sl, 0);
  const thieu = Math.max(0, slDat - ve);
  const pct = (v: number) => (slDat > 0 ? Math.min(100, (v / slDat) * 100) : 0);
  let luy = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 11.5 }}>
      <b style={{ whiteSpace: "nowrap" }}>Hàng về</b>
      <div style={{ position: "relative", flex: 1, minWidth: 160, height: 26 }}>
        <div style={{ position: "absolute", top: 4, left: 0, right: 0, height: 6, borderRadius: 3, background: "#E2E8F0" }} />
        <div style={{ position: "absolute", top: 4, left: 0, width: `${pct(ve)}%`, height: 6, borderRadius: 3, background: thieu ? "#86EFAC" : "#22C55E" }} />
        {dot.map((x, i) => {
          luy += x.sl;
          const left = pct(luy);
          return (
            <div key={x.d} title={`Đợt ${i + 1}: ngày chứng từ ${ngay(x.d)} · nhập ${soLuong(x.sl)} (${x.so} phiếu AMIS) · lũy kế ${soLuong(luy)}/${soLuong(slDat)}`}
              style={{ position: "absolute", left: `calc(${left}% - 5px)`, top: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#16A34A", border: "2px solid #fff", boxShadow: "0 0 0 1px #16A34A" }} />
              <span style={{ fontSize: 10, whiteSpace: "nowrap", color: "var(--text-muted)", transform: i === dot.length - 1 && left > 85 ? "translateX(-40%)" : undefined }}>
                {ngan(x.d)} +{soLuong(x.sl)}</span>
            </div>
          );
        })}
      </div>
      <span style={{ whiteSpace: "nowrap" }}>
        {dot.length ? <>{dot.length} đợt · <b>{soLuong(ve)}</b>/{soLuong(slDat)}</> : <span className="muted">Chưa có hàng về</span>}
        {dot.length > 0 && (thieu ? <b style={{ color: "var(--warn-ink)" }}> · thiếu {soLuong(thieu)} → giao bù</b> : <b style={{ color: "var(--ok-ink)" }}> · ✓ đủ</b>)}
      </span>
    </div>
  );
}

/** Tieu de 1 moc (tooltip) - dung chung ban gon. */
function tieuDeMoc(n: NutGd, mot: Row | null, rowsN: number) {
  const m = mot?.gd_moc?.[n.g.k];
  return [
    `${n.g.k} ${n.g.l} — ${n.g.vai_tro}${PHU[n.g.k] ? ` (${PHU[n.g.k]})` : ""}`,
    m?.bd ? `Bắt đầu ${ngayGio(m.bd)}` : "", m?.kt ? `Kết thúc ${ngayGio(m.kt)}` : "", m?.han ? `Hạn ${ngayGio(m.han)}` : "",
    !mot && n.gioTb != null ? `Trung bình ${gioTxt(n.gioTb)} · chậm nhất ${gioTxt(n.gioMax)}` : "",
    !mot ? `${n.xong.length}/${rowsN} dòng xong · ${n.dang.length} đang ở · ${n.tre.length} trễ hạn` : "",
    n.loi.length ? `${n.loi.length} lỗi theo dõi (${n.loiCho} chờ giải trình)` : "",
  ].filter(Boolean).join("\n");
}

/** Van de theo tung buoc: loi theo doi (gan giai doan theo quy tac) + tre han, kem AI mac. */
function VanDeTheoBuoc({ nut, rows, loiKhac, phuTrach }: { nut: NutGd[]; rows: Row[]; loiKhac: Row[]; phuTrach?: Record<string, string> }) {
  const ma = new Map(rows.map((r) => [r.item_id, r.part_code as string]));
  const buoc = nut.filter((n) => n.loi.length || n.tre.length);
  if (!buoc.length && !loiKhac.length) return <div style={{ marginTop: 8, fontSize: 12, color: "var(--ok-ink)" }}>✓ Không có lỗi / trễ hạn ở bước nào</div>;
  const dongLoi = (loi: Row[]) => {
    // gom theo nguoi -> quy tac
    const theoNguoi = new Map<string, Row[]>();
    // ai mac loi: ten nguoi (ten ETX) + vai (ai_ma) neu khong phai nguoi dat
    const nhanAi = (l: Row): string => l.ai_email
      ? `${ten(l.ai_email)}${l.ai_ma && l.ai_ma !== "NGUOI_DAT" ? ` (${AI_TEN[l.ai_ma] ?? l.ai_ma})` : ""}`
      : AI_TEN[l.ai_ma] ?? l.ai_ma ?? "?";
    for (const l of loi) { const k = nhanAi(l); theoNguoi.set(k, [...(theoNguoi.get(k) ?? []), l]); }
    return [...theoNguoi.entries()].map(([ai, ds]) => {
      const qt = new Map<string, Row[]>();
      for (const l of ds) qt.set(l.quy_tac, [...(qt.get(l.quy_tac) ?? []), l]);
      const cho = ds.filter((l) => l.trang_thai === "CHO_GIAI_TRINH").length;
      const lk = [...new Set(ds.map((l) => ma.get(l.eo_item_id)).filter(Boolean))];
      return (
        <div key={ai} title={lk.join(", ")} style={{ display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "baseline", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}>
          <b>{ai}</b>
          <span>{[...qt.entries()].map(([q, x]) => `${QT_TEN[q] ?? q}${x.length > 1 ? ` ×${x.length}` : ""}`).join(" · ")}</span>
          {cho > 0 ? <span className="badge reject" style={{ fontSize: 10 }}>{cho} chờ giải trình</span> : <span className="badge issued" style={{ fontSize: 10 }}>đã giải trình</span>}
          
        </div>
      );
    });
  };
  return (
    <div style={{ marginTop: 8, borderTop: "1px dashed var(--border)", paddingTop: 6, fontSize: 12 }}>
      <b style={{ fontSize: 12 }}>Vấn đề theo bước</b>
      <div className="ttq-vd">
      {buoc.map((n) => (
        <div key={n.g.k} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, alignItems: "start" }}>
          <span style={{ fontWeight: 700, color: n.loiCho || n.tre.length ? "var(--danger-ink)" : undefined }}>{n.g.k} · {n.g.l}</span>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            {n.tre.length > 0 && (
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={n.tre.map((r) => r.part_code).join(", ")}>⏱ Trễ hạn {rows.length > 1 ? `${n.tre.length} dòng` : ""}{" "}
                <span className="muted">— phụ trách: <b style={{ color: "var(--text)" }}>{phuTrach?.[n.g.k] || n.g.vai_tro}</b>
                  {rows.length > 1 ? ` · ${n.tre.slice(0, 4).map((r) => r.part_code).join(", ")}${n.tre.length > 4 ? ` +${n.tre.length - 4}` : ""}` : ""}</span></div>
            )}
            {dongLoi(n.loi)}
          </div>
        </div>
      ))}
      {loiKhac.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>Khác (ghi khi giải trình)</span>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>{dongLoi(loiKhac)}</div>
        </div>
      )}
      </div>
    </div>
  );
}

export function QuyTrinh({ defs, sla, rows, loi = [], phieuNhap, slDat, phuTrach, onChonNut }: {
  defs: GdDef[]; sla: Record<string, number>; rows: Row[]; loi?: Row[];
  /** phieu nhap AMIS khop (doc_date, qty_in) -> dot hang ve; undefined = khong hien */
  phieuNhap?: Row[]; slDat?: number;
  /** ten nguoi phu trach tung giai doan (G1 nguoi tao, G3 nguoi duyet mua, G4/G5 nguoi dat...) */
  phuTrach?: Record<string, string>;
  onChonNut?: (k: string) => void;
}) {
  const [mo, setMo] = useState(false);
  if (!defs.length || !rows.length) return null;
  const nut = tinhNut(defs, rows, loi);
  const mot = rows.length === 1 ? rows[0] : null;
  const dangO = nut.filter((n) => n.dang.length && n.g.k !== "G4");
  const ketThuc = mot && ["XONG", "HUY"].includes(mot.gd_hien_tai);
  const ids = new Set(rows.map((r) => r.item_id));
  const loiKhac = loi.filter((l) => !LOI_GD[l.quy_tac] && ids.has(l.eo_item_id));
  const dot = phieuNhap ? gomDotVe(phieuNhap) : [];
  let truoc: string | null = null;
  const moc: ReactNode[] = nut.map((n, i) => {
    const c = MAU[n.tt];
    const m = mot?.gd_moc?.[n.g.k];
    const kt = mot ? m?.kt : n.xong.length === rows.length ? n.xong.map((r) => r.gd_moc?.[n.g.k]?.kt).filter(Boolean).sort().pop() : null;
    const gio = mot ? mot.gd_gio_tung?.[n.g.k] : n.gioMax;
    const dang = n.dang.length > 0;
    const phu = kt ? `${ngan(kt)}${gio != null ? ` · ${gioTxt(gio)}` : ""}` : dang ? (gio != null ? `${gioTxt(gio)}${n.tre.length ? " · trễ" : ""}` : "đang") : n.tt === "mot_phan" ? `${n.xong.length}/${rows.length}` : "";
    truoc = kt ?? truoc;
    return (
      <div key={n.g.k} className="ttq-nut" title={tieuDeMoc(n, mot, rows.length)} onClick={onChonNut ? () => onChonNut(n.g.k) : undefined} style={{ cursor: onChonNut ? "pointer" : undefined }}>
        {i > 0 && <div className="ttq-noi" style={{ background: nut[i - 1].tt === "xong" ? "#22C55E" : nut[i - 1].tt === "mot_phan" ? "#86EFAC" : "#E2E8F0" }} />}
        <div className={`ttq-cham${dang ? " on" : ""}`} style={{ background: c.nen, borderColor: c.vien, color: c.chu, borderStyle: PHU[n.g.k] ? "dashed" : "solid" }}>
          {n.tt === "xong" ? "✓" : n.g.k.slice(1)}
          {n.loi.length > 0 && <span className="ttq-loi" style={{ background: n.loiCho ? "#DC2626" : "#94A3B8" }}>{n.loi.length}</span>}
        </div>
        <div className="ttq-ten" style={{ fontWeight: dang ? 800 : 600, color: n.tt === "chua" ? "var(--text-muted)" : undefined }}>{n.g.l}</div>
        <div className="ttq-phu" style={{ color: n.tre.length && dang ? "var(--danger-ink)" : undefined }}>{phu || " "}</div>
      </div>
    );
  });
  return (
    <div className="tt-wrap" style={{ padding: "8px 12px" }}>
      <div style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 12.5 }}>Tiến trình {mot ? "đơn hàng" : `PO (${rows.length} dòng)`}</b>
        {ketThuc ? <span className={`badge ${mot!.gd_hien_tai === "XONG" ? "issued" : "nhap"}`}>{mot!.gd_hien_tai_ten}</span>
          : dangO.length ? dangO.map((n) => <span key={n.g.k} className={`badge ${n.tt === "tre" ? "reject" : "review"}`}>
            {n.g.k} · {n.g.l}{mot ? "" : ` · ${n.dang.length} dòng`}{n.tt === "tre" ? " · trễ hạn" : ""}</span>)
          : <span className="muted">Chưa bắt đầu</span>}
        <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setMo((x) => !x)}>{mo ? "▴ Thu gọn" : "▾ Xem chi tiết"}</button>
      </div>
      {mo ? <TienTrinh defs={defs} sla={sla} rows={rows} loi={loi} onChonNut={onChonNut} nhung /> : <div className="ttq-line">{moc}</div>}
      {phieuNhap && slDat != null && slDat > 0 && <ThanhHangVe dot={dot} slDat={slDat} />}
      <VanDeTheoBuoc nut={nut} rows={rows} loiKhac={loiKhac} phuTrach={phuTrach} />
    </div>
  );
}
