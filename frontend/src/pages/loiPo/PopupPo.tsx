import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Col } from "../../components/DataTable";
import { useLop, laTrenCung } from "../../lib/lop";
import { soLuong } from "../../lib/format";
import { BEN, ChipMa, GD, GD_TEN, SO, THU_TU_GD, TT, dem, gdSomNhat, pt, soMa, topTxt, type Dong, type Loi } from "../../lib/loiPo";

/*
 * v0.139 (chu he thong 2026-11-27 duyet demo demo-loi-theo-po.html: "Giữ như demo"):
 *  - useHep / DsThe: man hep (< 980px, chuan giao-dien-apple) -> bang thanh THE (nhan nho viet hoa tren gia tri).
 *  - PopupPo: bam 1 PO o man "Lỗi theo PO" -> popup luong ngang G1-G8 + 6 o so + bang linh kien + "▾ Xem chi tiết" nhat ky; dien thoai = bottom-sheet.
 */

/** Man hep (< 980px): bang -> the, popup -> bottom-sheet. */
export function useHep() {
  const q = "(max-width: 979px)";
  const [h, setH] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setH(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return h;
}

const NHAN: CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#86868b" };

/** Danh sach THE thay bang tren dien thoai: cot 1 = dau the, cac cot con lai = nhan tren gia tri. 30 the / lan + "Xem thêm". */
export function DsThe<T>({ cols, rows, keyOf, onClick, empty }: { cols: Col<T>[]; rows: T[]; keyOf: (r: T) => string | number; onClick: (r: T) => void; empty: string }) {
  const [n, setN] = useState(30);
  if (!rows.length) return <div style={{ color: "#86868b", fontSize: 13, padding: 12 }}>{empty}</div>;
  const [dau, ...con] = cols;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.slice(0, n).map((r) => (
        <div key={keyOf(r)} role="button" tabIndex={0} onClick={() => onClick(r)} onKeyDown={(e) => e.key === "Enter" && onClick(r)}
          style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 0 0 1px #e8e8ed", cursor: "pointer" }}>
          <div>{dau.render(r)}</div>
          {/* flex 2 cot (khong dung grid: CSS chung cua app ep moi luoi inline ve 1 cot tren dien thoai) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 12px", marginTop: 10 }}>
            {con.map((c) => (
              <div key={c.key} style={{ flex: "1 1 calc(50% - 12px)", minWidth: 0, overflowWrap: "anywhere" }}>
                <div style={NHAN}>{c.header}</div>
                <div style={{ fontSize: 14 }}>{c.render(r)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length > n && <button className="btn" style={{ borderRadius: 980, minHeight: 44 }} onClick={() => setN(n + 30)}>Xem thêm ({soLuong(rows.length - n)})</button>}
    </div>
  );
}

const CSS_POPUP = `
@keyframes lp-pulse{0%{box-shadow:0 0 0 0 rgba(255,149,0,.45)}70%{box-shadow:0 0 0 10px rgba(255,149,0,0)}100%{box-shadow:0 0 0 0 rgba(255,149,0,0)}}
@keyframes lp-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
@keyframes lp-sheet{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.lp-dlg,.lp-cur{animation:none!important}}`;
const ngayVN = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

/**
 * POPUP CHI TIET 1 PO: luong ngang G1-G8 (da qua xanh la ✓ · dang o cam nhap nhay · chua toi vien xam · giai doan co loi cham do "!"),
 * 6 o so (dat / ve / thieu / dap ung / loi doi tac / loi noi bo), bang tung linh kien (loi gi, ai loi), "▾ Xem chi tiết" = nhat ky tung lan loi.
 * Nut: "Mở PO đầy đủ" (popup PO cu) · "✍ Giải trình lỗi của PO" (giai trinh chung - khong dong R5 cham duyet; chi hien khi con loi cho / vi pham).
 * dong / loi = TOAN BO cua PO trong payload /api/loi-po (khong theo bo loc dang chon).
 */
export function PopupPo({ e, dong, loi, tenMa, hep, onClose, onDayDu, onGiaiTrinh }: {
  e: number; dong: Dong[]; loi: Loi[]; tenMa: Map<string, Loi>; hep: boolean; onClose: () => void; onDayDu: () => void; onGiaiTrinh: (ds: Dong[]) => void;
}) {
  const { z, id } = useLop();
  const [ct, setCt] = useState(false);
  useEffect(() => {
    const h = (ev: KeyboardEvent) => { if (ev.key === "Escape" && laTrenCung(id.current)) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, id]);
  const ds = dong.filter((x) => x.e === e);
  const ls = loi.filter((l) => l.e === e);
  if (!ds.length) return null;
  const gd = gdSomNhat(ds);
  const cur = gd === "XONG" ? GD.length : THU_TU_GD.indexOf(gd);
  const datT = ds.reduce((t, x) => t + x.dat, 0), veT = ds.reduce((t, x) => t + Math.min(x.ve, x.dat), 0);
  const ncc = ls.filter((l) => l.ben === "NCC").length, nb = ls.length - ncc;
  const coLoiCho = ls.some((l) => l.tt === "CHO" || l.tt === "VI_PHAM");
  const lkCua = new Map(ds.map((x) => [x.i, x.lk]));
  const o = (lab: string, v: ReactNode, mau?: string) => (
    <div style={{ background: "#f5f5f7", borderRadius: 14, padding: "10px 12px", flex: hep ? "1 1 calc(50% - 10px)" : "1 1 0", minWidth: 0 }}>
      <div style={NHAN}>{lab}</div>
      <div style={{ ...SO, fontSize: 17, fontWeight: 650, color: mau ?? "#1d1d1f" }}>{v}</div>
    </div>
  );
  const th: CSSProperties = { position: "sticky", top: 0, background: "rgba(250,250,252,.95)", borderBottom: "1px solid #d2d2d7", padding: "8px 12px", fontSize: 12, color: "#6e6e73", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" };
  const td: CSSProperties = { borderBottom: "1px solid #f0f0f3", padding: "9px 12px", verticalAlign: "middle", fontSize: 13 };
  const vien: CSSProperties = { borderRadius: 980, border: 0 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: z, background: "rgba(0,0,0,.28)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)",
      display: "grid", placeItems: hep ? "end stretch" : "center", padding: hep ? 0 : 20 }}>
      <style>{CSS_POPUP}</style>
      <div className="lp-dlg" role="dialog" aria-modal="true" aria-label={`Chi tiết ${ds[0].po}`} onClick={(ev) => ev.stopPropagation()}
        style={{ background: "#fff", width: hep ? "100%" : "min(1100px, 100%)", maxHeight: hep ? "94vh" : "92vh", overflow: "auto", borderRadius: hep ? "22px 22px 0 0" : 22,
          boxShadow: "0 2px 6px rgba(0,0,0,.05), 0 18px 44px rgba(0,0,0,.10)", animation: `${hep ? "lp-sheet .26s" : "lp-in .22s"} cubic-bezier(.2,.8,.2,1)`,
          paddingBottom: hep ? "env(safe-area-inset-bottom)" : 0 }}>
        {/* tieu de kinh mo */}
        <div style={{ position: "sticky", top: 0, zIndex: 3, background: "rgba(251,251,253,.8)", WebkitBackdropFilter: "saturate(180%) blur(20px)", backdropFilter: "saturate(180%) blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,.06)", padding: hep ? "16px 16px 12px" : "14px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: hep ? "wrap" : "nowrap" }}>
          {hep && <div style={{ position: "absolute", top: 6, left: "50%", marginLeft: -18, width: 36, height: 5, borderRadius: 9, background: "#d1d1d6" }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em" }}>{ds[0].po}</div>
            <div style={{ fontSize: 12.5, color: "#6e6e73" }}>{[...new Set(ds.map((x) => x.ncc).filter(Boolean))].join(", ") || "—"} · đặt bởi {ds[0].nguoi_dat}{ds[0].ngay_bh ? ` · ban hành ${ngayVN(ds[0].ngay_bh)}` : ""}</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "2px 10px", background: "#fff1dc", color: "#9c4f00", whiteSpace: "nowrap" }}>{gd} · {GD_TEN[gd] ?? gd}</span>
          <button onClick={onClose} aria-label="Đóng" style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: "50%", border: 0, background: "rgba(0,0,0,.06)", cursor: "pointer", fontSize: 15, flex: "none" }}>✕</button>
        </div>
        <div style={{ padding: hep ? "14px 16px 20px" : "16px 20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* luong ngang G1-G8 */}
          <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingTop: 6 }}>
            {GD.map(([k, l], i) => {
              const n = ls.filter((x) => x.gd === k).length;
              const tt = i < cur ? "qua" : i === cur ? "dang" : "chua";
              return (
                <div key={k} title={`${k} ${l}${n ? ` — ${n} lần lỗi` : ""}`} style={{ flex: "1 0 84px", textAlign: "center", position: "relative" }}>
                  {i > 0 && <div style={{ position: "absolute", top: 13, left: "-50%", right: "50%", height: 3, background: tt === "chua" ? "#e3e3e8" : "#2fb350" }} />}
                  <div className={tt === "dang" ? "lp-cur" : undefined} style={{ position: "relative", zIndex: 1, margin: tt === "dang" ? "-3px auto 0" : "0 auto",
                    width: tt === "dang" ? 34 : 28, height: tt === "dang" ? 34 : 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
                    background: tt === "qua" ? "#2fb350" : tt === "dang" ? "#ff9500" : "#fff", color: tt === "chua" ? "#86868b" : "#fff",
                    boxShadow: tt === "chua" ? "inset 0 0 0 2px #d1d1d6" : "none", animation: tt === "dang" ? "lp-pulse 2s infinite" : undefined }}>{tt === "qua" ? "✓" : k.slice(1)}</div>
                  {n > 0 && <span style={{ position: "absolute", top: -4, left: "calc(50% + 8px)", zIndex: 2, width: 16, height: 16, borderRadius: "50%", background: "#ff3b30", color: "#fff",
                    fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center" }}>!</span>}
                  <div style={{ fontSize: 12, marginTop: 6, fontWeight: tt === "dang" ? 650 : 500, color: tt === "dang" ? "#c26400" : "#515154" }}>{l}</div>
                  <div style={{ ...SO, fontSize: 11.5, color: n ? "#d70015" : "#6e6e73", minHeight: 16 }}>{n ? `${n} lỗi` : tt === "dang" ? "đang ở" : ""}</div>
                </div>
              );
            })}
          </div>
          {/* 6 o so */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {o("SL đặt", soLuong(datT))}{o("SL về", soLuong(veT))}{o("Thiếu", soLuong(datT - veT))}
            {o("Đáp ứng", pt(veT, datT) == null ? "—" : `${pt(veT, datT)}%`)}{o("Lỗi đối tác", ncc, BEN.NCC.mau)}{o("Lỗi nội bộ", nb, BEN.NOI_BO.mau)}
          </div>
          {/* tung linh kien */}
          {hep ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ds.map((x) => {
                const lx = ls.filter((l) => l.i === x.i);
                return (
                  <div key={x.i} style={{ borderRadius: 14, boxShadow: "0 0 0 1px #e8e8ed", padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{x.lk}</b><span style={{ fontSize: 12, color: "#6e6e73", whiteSpace: "nowrap" }}>{x.gd} · {GD_TEN[x.gd] ?? x.gd}</span></div>
                    <div style={{ fontSize: 12, color: "#6e6e73" }}>{x.ten_lk}</div>
                    <div style={{ ...SO, fontSize: 13, marginTop: 4 }}>Đặt {soLuong(x.dat)} · về {soLuong(x.ve)} · <b>thiếu {soLuong(x.thieu)}</b></div>
                    {lx.length > 0 && <div style={{ marginTop: 6 }}><ChipMa xs={dem(lx, (l) => l.ma)} tenMa={tenMa} n={4} /><div style={{ fontSize: 12.5, marginTop: 4 }}>{topTxt(dem(lx, (l) => l.ai), 3)}</div></div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: 14, boxShadow: "0 0 0 1px #e8e8ed" }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
                <thead><tr><th style={th}>Linh kiện</th><th style={th}>Giai đoạn</th><th style={{ ...th, textAlign: "right" }}>Đặt</th><th style={{ ...th, textAlign: "right" }}>Về</th>
                  <th style={{ ...th, textAlign: "right" }}>Thiếu</th><th style={th}>Lỗi gì</th><th style={th}>Ai lỗi</th></tr></thead>
                <tbody>
                  {ds.map((x) => {
                    const lx = ls.filter((l) => l.i === x.i);
                    return (
                      <tr key={x.i}>
                        <td style={td}><b>{x.lk}</b><div style={{ fontSize: 11.5, color: "#6e6e73" }}>{x.ten_lk}</div></td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{x.gd} · {GD_TEN[x.gd] ?? x.gd}</td>
                        <td style={{ ...td, ...SO, textAlign: "right" }}>{soLuong(x.dat)}</td><td style={{ ...td, ...SO, textAlign: "right" }}>{soLuong(x.ve)}</td>
                        <td style={{ ...td, ...SO, textAlign: "right" }}><b>{soLuong(x.thieu)}</b></td>
                        <td style={td}><ChipMa xs={dem(lx, (l) => l.ma)} tenMa={tenMa} n={4} /></td>
                        <td style={{ ...td, fontSize: 12.5 }}>{lx.length ? topTxt(dem(lx, (l) => l.ai), 3) : <span style={{ color: "#86868b" }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* nhat ky - xo xuong */}
          <button className="btn" style={{ ...vien, alignSelf: "flex-start", background: "rgba(0,0,0,.05)" }} onClick={() => setCt(!ct)}>{ct ? "▴ Thu gọn" : "▾ Xem chi tiết"} (nhật ký {ls.length} lần lỗi)</button>
          {ct && (
            <div>
              {[...ls].sort((a, b) => b.ngay.localeCompare(a.ngay)).map((l) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: hep ? "46px minmax(0,1fr)" : "90px minmax(0,1fr) auto", gap: 10, padding: "9px 0", borderBottom: "1px solid #f0f0f3", fontSize: 13, alignItems: "center" }}>
                  <span style={{ ...SO, fontSize: 11.5, color: "#6e6e73" }}>{l.ngay.slice(8, 10)}/{l.ngay.slice(5, 7)}</span>
                  <span><span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "2px 8px", background: BEN[l.ben].nen, color: BEN[l.ben].mau }}>{soMa(l.ma)} {l.ten}</span>
                    {" · "}{lkCua.get(l.i) ?? ""} · <b>{l.ai}</b>{hep && <> · <span style={{ color: TT[l.tt].mau, fontWeight: 600 }}>{TT[l.tt].l}</span></>}</span>
                  {!hep && <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap", color: TT[l.tt].mau, background: TT[l.tt].nen }}>{TT[l.tt].l}</span>}
                </div>
              ))}
              {!ls.length && <div style={{ color: "#86868b", fontSize: 13 }}>PO này không có lỗi.</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btn" style={{ ...vien, background: "rgba(0,0,0,.05)", minHeight: hep ? 44 : undefined }} onClick={onDayDu}>Mở PO đầy đủ</button>
            {coLoiCho && <button className="btn" style={{ ...vien, background: "#0071e3", color: "#fff", fontWeight: 600, minHeight: hep ? 44 : undefined }}
              title="1 nội dung giải trình cho các lỗi đang chờ của PO (lỗi chậm duyệt do người duyệt tự giải trình)"
              onClick={() => onGiaiTrinh(ds.filter((x) => ls.some((l) => l.i === x.i && (l.tt === "CHO" || l.tt === "VI_PHAM"))))}>✍ Giải trình lỗi của PO</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
