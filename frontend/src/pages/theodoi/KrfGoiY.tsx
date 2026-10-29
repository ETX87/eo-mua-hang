import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { EoLink, PartLink } from "../../components/quickview/QuickView";
import { Modal, Spinner } from "../../components/ui";
import { soLuong, ngay, ngayGio } from "../../lib/format";
import { NGAY, NhanNgay } from "../../lib/ngay";
import type { Dong } from "./shared";

/**
 * Goi y "Ngày nhà máy cam kết" tu mail KRF (app theodoimuahang doc cot "KRF đáp ứng" trong file / bang KRF tra loi, day ve
 * tl_mail). Backend lib/krfGoiY.ts. Khong tu ghi - nguoi dung chon dong roi bam ap dung.
 */
type CachApDung = "THEM_DOT" | "SUA_DOT" | "SUA_TAY";
interface GoiY extends Dong {
  cach: CachApDung;
  so_dot: number;
  krf: { tl_mail_id: number; ngay: string; dap_ung: string; note: string; ton_kho: number | null; thoi_gian: string | null; tu: string | null; tieu_de: string | null; gmail_link: string | null };
}
const CACH: Record<CachApDung, { l: string; c: string; t: string }> = {
  THEM_DOT: { l: "Thêm đợt", c: "review", t: "Dòng chưa có đợt kế hoạch → thêm 1 đợt: ngày NM cam kết = ngày dự kiến = ngày KRF, SL = còn thiếu" },
  SUA_DOT: { l: "Sửa đợt", c: "final", t: "Dòng có 1 đợt → đổi ngày NM cam kết; ngày dự kiến đổi theo nếu đang trùng ngày NM cũ hoặc sớm hơn ngày KRF" },
  SUA_TAY: { l: "Sửa tay", c: "reject", t: "Nhiều đợt / kế hoạch tuần → mở ô lịch của dòng để chọn đợt cần sửa" },
};
const LY_DO: Record<string, string> = {
  READ_ONLY: "không có quyền", NHIEU_DOT: "nhiều đợt — sửa tay", DA_VE_DU: "đã về đủ", DA_KHOP: "đã khớp", KHONG_CO_NGAY_KRF: "mail KRF không có ngày",
  ITEM_NOT_FOUND: "không thấy dòng",
};

export function useGoiYKrf() {
  return useQuery({ queryKey: ["theo-doi", "goi-y-krf"], queryFn: () => api.get<{ goi_y: GoiY[]; khop: number; chi_ghi_chu: number }>("/theo-doi/goi-y-krf") });
}

export function KrfGoiYModal({ onClose, onSaved, onMoDong }: { onClose: () => void; onSaved: () => void; onMoDong: (d: Dong) => void }) {
  const q = useGoiYKrf();
  const ds = q.data?.goi_y ?? [];
  const tuDong = useMemo(() => ds.filter((r) => r.cach !== "SUA_TAY"), [ds]);
  const [chon, setChon] = useState<Set<number> | null>(null);
  const daChon = chon ?? new Set(tuDong.map((r) => r.item_id)); // mac dinh chon moi dong ap dung tu dong duoc
  const [busy, setBusy] = useState(false);
  const [kq, setKq] = useState<{ them: number; sua: number; bo_qua: { eo_item_id: number; ly_do: string }[] } | null>(null);
  const [err, setErr] = useState("");

  const bat = (id: number) => setChon(() => { const n = new Set(daChon); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const apDung = async () => {
    if (!daChon.size) return;
    if (!confirm(`Áp dụng ngày KRF làm ${NGAY.NM.l.toLowerCase()} cho ${daChon.size} dòng?`)) return;
    setBusy(true); setErr("");
    try {
      const r = await api.post<any>("/theo-doi/ap-dung-krf", { eo_item_ids: [...daChon] });
      setKq(r); setChon(null);
      await q.refetch();
      onSaved();
    } catch { setErr("Lỗi áp dụng."); } finally { setBusy(false); }
  };
  const th = { padding: "6px 8px", fontSize: 12 } as const;
  const td = { padding: "6px 8px", verticalAlign: "top" as const, fontSize: 12.5 };
  return (
    <Modal title="Ngày KRF đáp ứng từ mail → ngày nhà máy cam kết" onClose={onClose} width={1150}
      footer={<>
        <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>{daChon.size} / {ds.length} dòng được chọn</span>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn primary" disabled={busy || !daChon.size} onClick={apDung}>{busy ? "Đang áp dụng..." : `Áp dụng (${daChon.size})`}</button>
      </>}>
      {q.isLoading ? <Spinner /> : (
        <div style={{ fontSize: 13 }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            Ngày đọc từ cột <b>"KRF đáp ứng"</b> trong mail Karofi trả lời (hộp thư theodoimuahang@gmail.com — đơn đặt LK, danh sách LK quá hạn đáp ứng),
            lấy mail <b>mới nhất</b> của từng dòng. Chỉ hiện dòng đang mở có ngày KRF <b>khác</b> {NGAY.NM.l.toLowerCase()} hiện tại.
            {q.data && ` ${q.data.khop} dòng đã khớp · ${q.data.chi_ghi_chu} dòng KRF chỉ ghi chú (CCTT…), không có ngày.`}
          </div>
          {kq && (
            <div className="card card-pad" style={{ marginBottom: 8, background: "var(--panel-2)" }}>
              Đã thêm <b>{kq.them}</b> đợt · sửa <b>{kq.sua}</b> đợt{kq.bo_qua.length > 0 && <> · bỏ qua {kq.bo_qua.length}: {Object.entries(kq.bo_qua.reduce((m: Record<string, number>, x) => ({ ...m, [x.ly_do]: (m[x.ly_do] ?? 0) + 1 }), {})).map(([k, n]) => `${LY_DO[k] ?? k} (${n})`).join(", ")}</>}
            </div>
          )}
          {ds.length === 0 ? <div className="muted" style={{ padding: 20, textAlign: "center" }}>Không có gợi ý mới.</div> : (
            <div className="tbl-wrap" style={{ maxHeight: "62vh", overflow: "auto" }}>
              <table className="tbl tbl-dense">
                <thead><tr>
                  <th style={{ ...th, width: 30 }}><input type="checkbox" checked={tuDong.length > 0 && tuDong.every((r) => daChon.has(r.item_id))}
                    onChange={(e) => setChon(e.target.checked ? new Set(tuDong.map((r) => r.item_id)) : new Set())} /></th>
                  <th style={th}>EO / 3TDO</th><th style={th}>Linh kiện</th><th style={{ ...th, textAlign: "right" }}>Đặt / Về / Thiếu</th>
                  <th style={th}><NhanNgay k="NM" ngan /> hiện tại</th><th style={th}><NhanNgay k="DK" ngan /></th>
                  <th style={th}>KRF đáp ứng</th><th style={th}>Note KRF</th><th style={th}>Mail KRF</th><th style={th}>Cách áp dụng</th>
                </tr></thead>
                <tbody>
                  {ds.map((r) => (
                    <tr key={r.item_id} style={{ opacity: r.cach === "SUA_TAY" ? 0.75 : 1 }}>
                      <td style={td}><input type="checkbox" disabled={r.cach === "SUA_TAY"} checked={daChon.has(r.item_id)} onChange={() => bat(r.item_id)} /></td>
                      <td style={td}><EoLink id={r.eo_id}>{r.ma_phe_duyet || r.eo_code}</EoLink><div className="muted" style={{ fontSize: 11 }}>{r.kho}</div></td>
                      <td style={{ ...td, maxWidth: 240 }}><b><PartLink ma={r.part_code} /></b><div className="muted" style={{ fontSize: 11.5 }}>{r.part_name}</div></td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{soLuong(r.so_luong_dat)} / {soLuong(r.sl_nhap_amis)} / <b>{soLuong(r.so_luong_con_thieu)}</b></td>
                      <td style={{ ...td, color: NGAY.NM.mau }}>{ngay(r.ngay_nm_cam_ket) || "—"}</td>
                      <td style={{ ...td, color: NGAY.DK.mau }}>{ngay(r.ngay_du_kien_gan_nhat) || "—"}{r.so_lan_lui ? <div className="muted" style={{ fontSize: 11 }}>lùi {r.so_lan_lui} lần</div> : null}</td>
                      <td style={{ ...td, fontWeight: 800, color: NGAY.NM.mau }}>{ngay(r.krf.ngay)}
                        {r.ngay_nm_cam_ket && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{r.krf.ngay > r.ngay_nm_cam_ket ? "trễ hơn" : "sớm hơn"} {Math.abs(Math.round((Date.parse(r.krf.ngay) - Date.parse(r.ngay_nm_cam_ket)) / 86400_000))} ngày</div>}</td>
                      <td style={{ ...td, maxWidth: 200 }}>{r.krf.note}{r.krf.ton_kho ? <div className="muted" style={{ fontSize: 11 }}>tồn KRF {soLuong(r.krf.ton_kho)}</div> : null}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontSize: 11.5 }}>{ngayGio(r.krf.thoi_gian)}<div className="muted">{r.krf.tu}</div>
                        {r.krf.gmail_link && <a href={r.krf.gmail_link} target="_blank" rel="noopener noreferrer">Mở Gmail</a>}</td>
                      <td style={td}><span className={`badge ${CACH[r.cach].c}`} title={CACH[r.cach].t}>{CACH[r.cach].l}</span>
                        {r.cach === "SUA_TAY" && <div><button className="btn ghost sm" onClick={() => onMoDong(r)}>Mở ô lịch</button></div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Áp dụng = ghi như sửa kế hoạch tay (nhật ký ADD_PLAN / UPDATE_PLAN, nguồn "mail_krf"); ngày dự kiến đổi → tính vào số lần lùi / quy tắc như thường.
            Ghi chú đợt: "Theo mail KRF dd/mm: đáp ứng dd/mm (note)".
          </div>
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </Modal>
  );
}

/** Mail KRF moi nhat (co ngay dap ung) trong lich su mail 1 dong (GET /theo-doi/dong/:id -> mail[]). */
export function krfMoiNhat(mail: any[]): { ngay: string; note: string; thoi_gian: string; tu: string } | null {
  let best: any = null;
  for (const m of mail ?? []) {
    if (m.huong !== "NHAN" || !m.payload) continue;
    let p: any;
    try { p = JSON.parse(m.payload); } catch { continue; }
    if (p?.nguon !== "theodoimuahang" || !p?.dong) continue;
    if (!best || String(m.thoi_gian) > String(best.thoi_gian)) best = { ...m, d: p.dong };
  }
  if (!best || !/^\d{4}-\d{2}-\d{2}$/.test(String(best.d.ngay_dap_ung ?? ""))) return null;
  return { ngay: best.d.ngay_dap_ung, note: String(best.d.note ?? ""), thoi_gian: best.thoi_gian, tu: best.tu };
}
