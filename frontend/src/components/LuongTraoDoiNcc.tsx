import { khopTim } from "../lib/tonDong";
import { useState } from "react";
import { ngay, ngayGio, ten, tuBayGio } from "../lib/format";

/**
 * LUONG TRAO DOI VOI NCC cua 1 dong (v0.091, yeu cau lanh dao "chua ro luong trao doi va push doi tac"). Du lieu GET /theo-doi/dong/:id:
 *  3T thuc NCC  = mail GUI gan dong (hop theo doi) · dot push · ghi nhan goi / Zalo (tl_lien_he)
 *  NCC tra loi  = mail NHAN gan dong
 *  Cap nhat ngay = them / sua / xoa dot ke hoach (event_log *_PLAN)
 * Mac dinh: 1 duong ngang (moc theo thoi gian) + tom tat "thuc n lan · NCC tra loi m lan · NCC chua tra loi x ngay"; "▾ Xem chi tiet" = danh sach day du.
 */
type Loai = "THUC" | "NCC" | "NGAY";
interface Ev { luc: string; loai: Loai; tieu_de: string; chi_tiet: string; ai: string }
const MAU: Record<Loai, string> = { THUC: "#0071e3", NCC: "#1d8a3c", NGAY: "#ff9500" };
const NHAN: Record<Loai, string> = { THUC: "3T thúc NCC", NCC: "NCC trả lời", NGAY: "Cập nhật ngày DK" };
const KENH: Record<string, string> = { DIEN_THOAI: "Gọi điện", ZALO: "Zalo", TIN_NHAN: "Tin nhắn", GAP: "Gặp trực tiếp", KHAC: "Khác" };
const soNgayTu = (t: string) => Math.max(0, Math.floor((Date.now() + 7 * 3600_000 - Date.parse(t.slice(0, 19).replace(" ", "T") + "Z")) / 86400_000));
const docJson = (s: unknown) => { try { return typeof s === "string" ? JSON.parse(s) : (s ?? {}); } catch { return {}; } };
const NGAY_EV: Record<string, string> = { ADD_PLAN: "Thêm đợt", UPDATE_PLAN: "Sửa đợt", DELETE_PLAN: "Xoá đợt", BULK_PLAN: "Cập nhật hàng loạt" };

export function luongSuKien(d: any): Ev[] {
  const ev: Ev[] = [];
  const daCo = new Set<string>();
  for (const m of d?.mail ?? []) {
    const k = `${m.huong}|${m.thoi_gian}|${m.tieu_de}`;
    if (!m.thoi_gian || daCo.has(k)) continue;
    daCo.add(k);
    ev.push({ luc: m.thoi_gian, loai: m.huong === "GUI" ? "THUC" : "NCC", tieu_de: m.huong === "GUI" ? "Mail gửi NCC" : "Mail NCC trả lời",
      chi_tiet: [m.tieu_de, m.tom_tat].filter(Boolean).join(" — "), ai: m.tu ?? "" });
  }
  for (const p of d?.push ?? []) ev.push({ luc: p.created_at, loai: "THUC", tieu_de: `Đợt push ${p.ma_push}`, chi_tiet: p.tieu_de ?? "", ai: p.created_by ?? "" });
  for (const l of d?.lien_he ?? []) ev.push({ luc: l.ngay_lien_he, loai: "THUC", tieu_de: `📞 ${KENH[l.kenh] ?? l.kenh}${l.nguoi_lien_he ? ` · ${l.nguoi_lien_he}` : ""}`, chi_tiet: `NCC trả lời: ${l.ket_qua}`, ai: l.created_by ?? "" });
  for (const e of d?.ngay_du_kien ?? []) {
    const a = docJson(e.after_json), b = docJson(e.before_json);
    const moi = a?.planned_date ?? a?.ngay_du_kien ?? null, cu = b?.planned_date ?? null;
    ev.push({ luc: e.created_at, loai: "NGAY", tieu_de: NGAY_EV[e.event_type] ?? e.event_type,
      chi_tiet: moi ? `${cu ? `${ngay(cu)} → ` : ""}${ngay(moi)}${a?.factory_committed_date ? ` (NM ${ngay(a.factory_committed_date)})` : ""}` : "", ai: e.user_email ?? "Hệ thống" });
  }
  return ev.sort((x, y) => String(x.luc).localeCompare(String(y.luc)));
}

export function LuongTraoDoiNcc({ d, tim = "" }: { d: any; tim?: string }) {
  const [mo, setMo] = useState(false);
  const ev = luongSuKien(d);
  // o tim chung cua popup: co chu -> mo bang chi tiet, chi giu dong khop (khong dau)
  const k = khopTim(tim);
  const evLoc = tim ? ev.filter((e) => k(`${NHAN[e.loai]} ${ngayGio(e.luc)} ${e.tieu_de} ${e.chi_tiet} ${e.ai ? ten(e.ai) : ""}`)) : ev;
  const thuc = ev.filter((e) => e.loai === "THUC"), ncc = ev.filter((e) => e.loai === "NCC");
  const thucCuoi = thuc.at(-1)?.luc ?? null, nccCuoi = ncc.at(-1)?.luc ?? null;
  const choNcc = thucCuoi && (!nccCuoi || nccCuoi < thucCuoi) ? soNgayTu(thucCuoi) : null;
  const gan = ev.slice(-14);
  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", fontSize: 13, marginBottom: 10 }}>
        <span><b style={{ color: MAU.THUC }}>{thuc.length}</b> lần 3T thúc NCC{thucCuoi ? <span className="muted"> · cuối {tuBayGio(thucCuoi)}</span> : ""}</span>
        <span><b style={{ color: MAU.NCC }}>{ncc.length}</b> lần NCC trả lời{nccCuoi ? <span className="muted"> · cuối {tuBayGio(nccCuoi)}</span> : ""}</span>
        <span><b style={{ color: MAU.NGAY }}>{ev.filter((e) => e.loai === "NGAY").length}</b> lần cập nhật ngày DK</span>
        {choNcc != null && (choNcc > 0
          ? <span className={`badge ${choNcc >= 2 ? "reject" : "final"}`}>NCC chưa trả lời {choNcc} ngày kể từ lần thúc cuối</span>
          : <span className="badge review">Đang chờ NCC trả lời (vừa thúc hôm nay)</span>)}
        {!thuc.length && <span className="badge reject">Chưa có lần thúc NCC nào được ghi nhận</span>}
      </div>
      {ev.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Chưa có trao đổi nào. Mail với NCC phải CC hộp theo dõi và ghi mã 3TDO / mã LK; gọi / Zalo thì bấm "📞 Đã nhắc đối tác".</div> : (
        <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
          {gan.map((e, i) => (
            <div key={i} title={`${NHAN[e.loai]} · ${ngayGio(e.luc)}\n${e.tieu_de}\n${e.chi_tiet}\n${e.ai ? ten(e.ai) : ""}`}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 92, flex: 1, position: "relative" }}>
              {i > 0 && <div style={{ position: "absolute", top: 7, right: "50%", width: "100%", height: 2, background: "#e8e8ed" }} />}
              <div style={{ width: 16, height: 16, borderRadius: 99, background: MAU[e.loai], position: "relative", zIndex: 1, border: "2px solid #fff", boxShadow: `0 0 0 1px ${MAU[e.loai]}` }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: MAU[e.loai], marginTop: 3, textAlign: "center" }}>{e.loai === "THUC" ? "3T thúc" : e.loai === "NCC" ? "NCC trả lời" : "Ngày DK"}</div>
              <div className="muted" style={{ fontSize: 10.5 }}>{ngayGio(e.luc).slice(0, 10)}</div>
            </div>
          ))}
        </div>
      )}
      {ev.length > 0 && <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setMo(!mo)}>{mo ? "▴ Thu gọn" : `▾ Xem chi tiết (${ev.length})`}</button>}
      {tim && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Tìm “{tim}”: {evLoc.length} / {ev.length} mục</div>}
      {(mo || !!tim) && (
        <table className="tbl tbl-dense" style={{ marginTop: 6 }}>
          <thead><tr><th>Lúc</th><th>Loại</th><th>Nội dung</th><th>Chi tiết</th><th>Người</th></tr></thead>
          <tbody>
            {[...evLoc].reverse().map((e, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>{ngayGio(e.luc)}</td>
                <td><span style={{ color: MAU[e.loai], fontWeight: 700, whiteSpace: "nowrap" }}>● {NHAN[e.loai]}</span></td>
                <td>{e.tieu_de}</td>
                <td style={{ fontSize: 12, maxWidth: 420 }}>{e.chi_tiet}</td>
                <td style={{ whiteSpace: "nowrap" }}>{e.ai.includes("@") ? ten(e.ai) : e.ai}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
