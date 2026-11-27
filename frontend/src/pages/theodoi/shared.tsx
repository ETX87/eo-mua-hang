import { gopTrung, khoaMail, lietKe } from "../../lib/gopTrung";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal, Spinner } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { bookBase64, normKey, writeBook } from "../../lib/excel";
import { NGAY, NhanNgay } from "../../lib/ngay";
import { krfMoiNhat } from "./KrfGoiY";
import { Kho } from "../../lib/kho";
import { KENH_LIEN_HE } from "../../lib/eventLabels";
import { gioTxt } from "../../lib/giaiDoan";
import { ChonDoAi, aiGoiY, GIO_HAN_GT, NHAN_GT, demGt, ketLuanGt, mocLoi, nowVN, trangThaiGt, viSaoLoi, type TrangThaiGt } from "../../lib/giaiTrinh";

// Dung chung cho man "Theo dõi linh kiện đặt" + "Cảnh báo CEO" (backend lib/theoDoi.ts).
export interface Dong {
  item_id: number; eo_id: number; eo_code: string; ma_phe_duyet: string | null; id_dat_lk: string;
  part_code: string; part_name: string; kho: string; doi_tac: string | null; loai_hinh: string | null;
  id_crm: string | null; ghi_chu: string | null; nguoi_dat: string | null;
  so_luong_dat: number; sl_nhap_amis: number; so_luong_con_thieu: number;
  trang_thai_don_hang: string; canh_bao: string; toc_do_hang_ve: string;
  ngay_ban_hanh: string | null; ngay_du_kien_gan_nhat: string | null;
  ap_dung: boolean; bat_dau: string | null; han_ngay_du_kien: string | null; co_ngay_du_kien: boolean;
  han_cap_nhat_lai: string | null; so_lan_lui: number; so_loi: number; so_loi_cho_gt: number;
  tinh_trang: "CHO_NDK" | "TRE_NDK" | "QUA_HAN_NDK" | "CHO_HANG" | "DONG";
  ngay_ve_du: string | null;
  ngay_hang_ve: string | null; ngay_nm_cam_ket: string | null;
  sau_ban_hanh: boolean;
  // giai doan (lib/giaiDoan) - gan o GET /theo-doi/danh-sach
  gd_hien_tai?: string | null; gd_hien_tai_ten?: string | null; gd_gio?: number | null; gd_tre?: boolean | null; gd_bat_dau?: string | null;
  ceo_ly_do: string[];
}

export const TINH_TRANG: Record<Dong["tinh_trang"], { l: string; c: string }> = {
  CHO_NDK: { l: "Chờ ngày dự kiến", c: "final" },
  TRE_NDK: { l: "Trễ hạn chưa có ngày DK", c: "reject" },
  QUA_HAN_NDK: { l: "Quá ngày dự kiến", c: "reject" },
  CHO_HANG: { l: "Chờ hàng", c: "review" },
  DONG: { l: "Đã đóng", c: "issued" },
};
export const QUY_TAC: Record<string, string> = {
  R5: "Chậm duyệt (người duyệt)", R1: "Không có ngày dự kiến trong 8h/16h LV", R3: "Không push đối tác (thứ 2/4)", R4: "Quá hạn không cập nhật ngày dự kiến", TAY: "Ghi khi giải trình",
};

export const timKhongDau = (r: Dong, q: string) => {
  const w = normKey(q) ? q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0111\u0110]/g, "d").toLowerCase().split(/\s+/).filter(Boolean) : [];
  if (!w.length) return true;
  const hay = `${r.eo_code} ${r.ma_phe_duyet ?? ""} ${r.id_dat_lk} ${r.part_code} ${r.part_name} ${r.kho} ${r.doi_tac ?? ""} ${r.id_crm ?? ""} ${r.ghi_chu ?? ""} ${r.nguoi_dat ?? ""}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0111\u0110]/g, "d").toLowerCase();
  return w.every((x) => hay.includes(x));
};

export function useDanhMuc() {
  return useQuery({ queryKey: ["tl-danh-muc"], queryFn: () => api.get<{ loai: string; ma: string; ten: string; thu_tu: number; active: number }[]>("/theo-doi/danh-muc") });
}

/**
 * MOT man cho ca 3 loai ngay cua 1 dong linh kien: ngay hang ve (AMIS, chi xem), ngay du kien + ngay nha may cam ket
 * (cac dot ke hoach item_plan: them / sua / xoa ngay tai cho). Modal giu mo sau khi luu de thay ket qua; "Xong" moi dong.
 * Quy uoc: ngay du kien thuong = ngay NM cam ket -> nhap NM thi DK tu dien theo (van sua tay duoc).
 */
export function NgayHangVeModal({ dong, onClose, onSaved }: { dong: Pick<Dong, "item_id"> & Partial<Dong>; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tl-dong", dong.item_id], queryFn: () => api.get<any>(`/theo-doi/dong/${dong.item_id}`) });
  const [daDoi, setDaDoi] = useState(false);
  const [sua, setSua] = useState<any | null>(null); // dot dang sua (null = them dot moi)
  const [nm, setNm] = useState("");
  const [dk, setDk] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const it = d?.item;
  const kh: any[] = d?.ke_hoach ?? [];
  const nhap: any[] = d?.phieu_nhap ?? [];
  const daVe = nhap.reduce((s, r) => s + (r.qty_in || 0), 0);
  const tongKh = kh.reduce((s, p) => s + (p.planned_qty || 0), 0);
  const slDat = it?.current_qty ?? dong.so_luong_dat ?? 0;
  const conDuocLen = slDat - tongKh + (sua ? sua.planned_qty : 0);
  const ngayVe = nhap.length ? nhap[nhap.length - 1].doc_date : null;
  const dkGanNhat = dong.ngay_du_kien_gan_nhat ?? (kh.filter((p) => p.loai !== "TUAN").map((p) => p.planned_date).sort().pop() ?? null);
  const nmGanNhat = [...kh].filter((p) => p.factory_committed_date).sort((a, b) => String(a.updated_at ?? a.created_at).localeCompare(String(b.updated_at ?? b.created_at))).pop()?.factory_committed_date ?? null;
  const lech = dkGanNhat && nmGanNhat ? Math.round((Date.parse(dkGanNhat) - Date.parse(nmGanNhat)) / 86400_000) : null;
  // Mail KRF moi nhat co ngay "KRF đáp ứng" (app theodoimuahang) -> goi y dien vao form (khong tu luu).
  const krf = krfMoiNhat(d?.mail ?? []);
  const dienKrf = () => {
    if (!krf) return;
    const ghi = `Theo mail KRF ${ngay(krf.thoi_gian)}${krf.note ? `: ${krf.note}` : ""}`.slice(0, 200);
    const mot = kh.length === 1 && kh[0].loai !== "TUAN" ? kh[0] : null;
    setErr("");
    if (mot) {
      setSua(mot);
      setQty(String(mot.planned_qty));
      // giong backend lib/krfGoiY.ts apDungKrf
      setDk(!mot.factory_committed_date || mot.planned_date === mot.factory_committed_date || mot.planned_date < krf.ngay ? krf.ngay : mot.planned_date);
    } else if (!dk || dk === nm) setDk(krf.ngay);
    setNm(krf.ngay);
    setNote(ghi);
  };

  const moForm = (p: any | null) => {
    setErr(""); setSua(p);
    setNm(p?.factory_committed_date ?? ""); setDk(p?.planned_date ?? "");
    setQty(p ? String(p.planned_qty) : String(Math.max(0, slDat - Math.max(tongKh, daVe)) || ""));
    setNote(p?.ghi_chu ?? "");
  };
  // lan dau co du lieu -> mo san form "them dot"
  useEffect(() => { if (d && sua === null && !qty && !dk) moForm(null); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  // nhap NM -> DK theo NM neu DK dang trong hoac dang bang NM cu
  const doiNm = (v: string) => { if (!dk || dk === nm) setDk(v); setNm(v); };

  const luu = async () => {
    setErr("");
    if (!dk) return setErr(`Nhập ${NGAY.DK.l.toLowerCase()} (hoặc ${NGAY.NM.l.toLowerCase()} để tự điền).`);
    if (!(Number(qty) > 0)) return setErr("Nhập số lượng > 0.");
    setBusy(true);
    const body = { planned_date: dk, planned_qty: Number(qty), factory_committed_date: nm || null, ghi_chu: note.trim() || null };
    try {
      if (sua) await api.patch(`/plans/${sua.id}`, body);
      else await api.post("/plans", { eo_item_id: dong.item_id, ...body });
      setDaDoi(true);
      await q.refetch();
      qc.invalidateQueries({ queryKey: ["theo-doi"] });
      setSua(null); setQty(""); setDk(""); setNm(""); setNote("");
    } catch (e: any) {
      setErr(e?.body?.error === "PLAN_EXCEEDS_QTY" ? `Vượt SL đặt — đã lên kế hoạch ${soLuong(e.body.planned_sum ?? tongKh)} / ${soLuong(e.body.current_qty ?? slDat)}. Sửa hoặc xóa đợt cũ.` :
        e?.body?.error === "READ_ONLY" ? "Bạn không có quyền cập nhật kế hoạch dòng này." : "Lỗi lưu.");
    } finally { setBusy(false); }
  };
  const xoa = async (p: any) => {
    if (!confirm(`Xóa đợt ${NGAY.DK.l.toLowerCase()} ${ngay(p.planned_date)} — SL ${soLuong(p.planned_qty)}?`)) return;
    try { await api.del(`/plans/${p.id}`); setDaDoi(true); await q.refetch(); if (sua?.id === p.id) moForm(null); }
    catch (e: any) { setErr(e?.body?.error === "READ_ONLY" ? "Bạn không có quyền xóa đợt này." : "Lỗi xóa."); }
  };
  const xong = () => (daDoi ? onSaved() : onClose());

  const The = ({ k, v, sub }: { k: "VE" | "DK" | "NM"; v: string; sub: ReactNode }) => (
    <div style={{ background: NGAY[k].nen, borderLeft: `3px solid ${NGAY[k].mau}`, borderRadius: 10, padding: "8px 12px" }} title={NGAY[k].mo_ta}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: NGAY[k].mau }}>{NGAY[k].l}</div>
      <div style={{ fontSize: 20, fontWeight: 700, margin: "2px 0" }}>{v}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>{NGAY[k].mo_ta}</div>
    </div>
  );
  const th = { padding: "6px 8px", fontSize: 12 } as const;
  return (
    <Modal title={`Ngày hàng về · dự kiến · nhà máy cam kết — ${it?.part_code ?? dong.part_code ?? ""}`} onClose={xong} width={1000}
      footer={<button className="btn primary" onClick={xong}>Xong</button>}>
      {q.isLoading || !d ? <Spinner /> : (
        <div style={{ fontSize: 13 }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            <b style={{ color: "var(--text)" }}>{it?.approval_code || it?.eo_code}</b> · {it?.part_name} · <Kho t={it?.warehouse} /> · {it?.supplier || "—"} · SL đặt <b>{soLuong(slDat)}</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
            <The k="VE" v={ngayVe ? ngay(ngayVe) : "Chưa về"} sub={<>Đã về <b>{soLuong(daVe)}</b> / {soLuong(slDat)}{daVe >= slDat && slDat > 0 ? " — đủ hàng" : daVe > 0 ? ` — còn thiếu ${soLuong(slDat - daVe)}` : ""}</>} />
            <The k="DK" v={dkGanNhat ? ngay(dkGanNhat) : "Chưa có"} sub={<>{kh.length} đợt · lên KH {soLuong(tongKh)} / {soLuong(slDat)}{dong.so_lan_lui ? ` · lùi ${dong.so_lan_lui} lần` : ""}</>} />
            <The k="NM" v={nmGanNhat ? ngay(nmGanNhat) : "Chưa có"} sub={lech == null ? "—" : lech === 0 ? "Trùng ngày dự kiến" : `Ngày dự kiến ${lech > 0 ? "sau" : "trước"} ${Math.abs(lech)} ngày`} />
          </div>

          {krf && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", background: NGAY.NM.nen, borderRadius: 12, padding: "8px 12px", marginBottom: 12, fontSize: 12.5 }}>
              <div style={{ flex: 1 }}>
                <b>Mail KRF</b> {ngayGio(krf.thoi_gian)} ({krf.tu}): đáp ứng <b style={{ color: NGAY.NM.mau, fontSize: 14 }}>{ngay(krf.ngay)}</b>
                {krf.note && <span className="muted"> · {krf.note}</span>}
                {krf.ngay === nmGanNhat && <span className="badge issued" style={{ marginLeft: 6 }}>Đã khớp {NGAY.NM.l.toLowerCase()}</span>}
              </div>
              {krf.ngay !== nmGanNhat && <button className="btn sm" onClick={dienKrf} title={kh.length > 1 ? "Nhiều đợt: điền vào form thêm đợt — chọn Sửa ở đợt cần đổi nếu muốn sửa đợt cũ" : "Điền ngày KRF vào form bên dưới (chưa lưu)"}>Điền vào form</button>}
            </div>
          )}
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Các đợt hàng về (kế hoạch)</div>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th className="qv-act" style={th}>Thao tác</th><th style={th}>Đợt</th><th style={th}><NhanNgay k="NM" /></th><th style={th}><NhanNgay k="DK" /></th><th style={{ ...th, textAlign: "right" }}>SL</th><th style={th}>Ghi chú / nguồn</th><th style={th}>Cập nhật</th></tr></thead>
              <tbody>
                {kh.length === 0 && <tr><td colSpan={7} className="muted">Chưa có đợt nào — nhập ở khung bên dưới.</td></tr>}
                {kh.map((p, i) => (
                  <tr key={p.id} style={{ background: sua?.id === p.id ? "#fff6e8" : undefined }}><td className="qv-act">
                      {p.loai !== "TUAN" && <button className="btn ghost sm" title="Sửa đợt này" onClick={() => moForm(p)}><I.edit width={14} height={14} /></button>}
                      <button className="btn ghost sm danger" title="Xóa đợt" onClick={() => xoa(p)}><I.trash width={14} height={14} /></button>
                    </td>
                    <td>{i + 1}{p.loai === "TUAN" && <span className="badge final" style={{ marginLeft: 4 }}>Tuần {p.tuan}</span>}</td>
                    <td style={{ color: NGAY.NM.mau, fontWeight: 600 }}>{ngay(p.factory_committed_date) || "—"}</td>
                    <td style={{ color: NGAY.DK.mau, fontWeight: 700 }}>{ngay(p.planned_date)}</td>
                    <td style={{ textAlign: "right" }}>{soLuong(p.planned_qty)}</td>
                    <td>{p.ghi_chu || ""}</td>
                    <td className="muted" style={{ fontSize: 11.5 }}>{ten(p.updated_by || p.created_by)} · {ngayGio(p.updated_at || p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ borderRadius: 14, padding: 12, marginTop: 10, background: "var(--panel-2)" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{sua ? `Sửa đợt ${kh.findIndex((p) => p.id === sua.id) + 1}` : "Thêm đợt hàng về"} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— còn được lên kế hoạch {soLuong(Math.max(0, conDuocLen))}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 160px 110px 1fr auto", gap: 10, alignItems: "end" }}>
              <div><label className="field-label"><NhanNgay k="NM" /></label><input className="input" type="date" value={nm} onChange={(e) => doiNm(e.target.value)} /></div>
              <div><label className="field-label"><NhanNgay k="DK" req /></label><input className="input" type="date" value={dk} onChange={(e) => setDk(e.target.value)} /></div>
              <div><label className="field-label">Số lượng <span className="req">*</span></label><input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              <div><label className="field-label">Ghi chú / nguồn</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: KRF xác nhận qua mail 21/10" /></div>
              <div style={{ display: "flex", gap: 6 }}>
                {sua && <button className="btn" onClick={() => moForm(null)}>Bỏ sửa</button>}
                <button className="btn primary" disabled={busy} onClick={luu}>{busy ? "Đang lưu..." : sua ? "Lưu đợt" : "Thêm đợt"}</button>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              Nhập {NGAY.NM.l.toLowerCase()} → {NGAY.DK.l.toLowerCase()} tự điền bằng ngày đó (thường 2 ngày trùng nhau). Chỉ sửa {NGAY.DK.l.toLowerCase()} khi có lý do ước tính khác.
            </div>
            {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
          </div>

          <div style={{ fontWeight: 700, margin: "14px 0 6px" }}><NhanNgay k="VE" /> <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— phiếu nhập AMIS khớp dòng này (tự động, không nhập tay)</span></div>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th style={th}>{NGAY.VE.l}</th><th style={th}>Số chứng từ</th><th style={th}>Kho</th><th style={{ ...th, textAlign: "right" }}>SL nhập</th></tr></thead>
              <tbody>
                {nhap.length === 0 && <tr><td colSpan={4} className="muted">Chưa có phiếu nhập.</td></tr>}
                {nhap.map((r) => <tr key={r.id}><td style={{ color: NGAY.VE.mau, fontWeight: 700 }}>{ngay(r.doc_date)}</td><td>{r.doc_no}</td><td>{r.warehouse_name}</td><td style={{ textAlign: "right" }}>{soLuong(r.qty_in)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Giai trinh: chon loi dang cho (hoac ghi loi moi) + Do ai (goi y theo giai doan, v0.121) + Loi gi + noi dung + anh bang chung (tuy chon). */
export function GiaiTrinhModal({ dong, onClose, onSaved }: { dong: Dong; onClose: () => void; onSaved: () => void }) {
  const dm = useDanhMuc();
  const ls = useQuery({ queryKey: ["tl-dong", dong.item_id], queryFn: () => api.get<any>(`/theo-doi/dong/${dong.item_id}`) });
  const users = useQuery({ queryKey: ["users-min"], queryFn: () => api.get<any[]>("/users/directory") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/users/me") });
  // v0.136: loi R5 cham duyet chi NGUOI DUYET bi ghi loi (hoac Admin) giai trinh - an voi nguoi khac (khop backend duocGiaiTrinh)
  const toi = String(me.data?.email ?? "").toLowerCase();
  const mo = (ls.data?.loi ?? []).filter((l: any) => l.trang_thai === "CHO_GIAI_TRINH"
    && (l.quy_tac !== "R5" || me.data?.vai_tro === "Admin" || String(l.ai_email ?? "").toLowerCase() === toi));
  const [loiId, setLoiId] = useState<string>("");
  const [aiMa, setAiMa] = useState(""); // v0.113: khong mac dinh "Nguoi dat" - phai chon
  const [aiEmail, setAiEmail] = useState(dong.nguoi_dat ?? "");
  const [dungMail, setDungMail] = useState(false);
  const [loiMa, setLoiMa] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [anh, setAnh] = useState<{ name: string; drive_file_id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const loiChon = mo.find((l: any) => String(l.id) === loiId);
  // mac dinh chon loi dang cho dau tien (chua co loi nao -> "Ghi loi moi")
  useEffect(() => {
    if (loiId || ls.isLoading || me.isLoading) return;
    if (mo.length) { setLoiId(String(mo[0].id)); setLoiMa(mo[0].loi_ma ?? ""); } else setLoiId("moi");
  }, [ls.isLoading, me.isLoading, mo.length, loiId]); // eslint-disable-line react-hooks/exhaustive-deps
  // v0.121: "Do ai" goi y theo giai doan cua loi dang chon (R1/R4 NCC, R3 noi bo); bang chung tuy chon
  const laR5 = loiChon?.quy_tac === "R5";
  const aiDung = laR5 ? "NGUOI_DUYET" : aiMa || aiGoiY(loiChon ? [loiChon.quy_tac] : []);
  const aiEmailDung = laR5 ? (loiChon.ai_email ?? "") : aiEmail;
  // v0.113: thu NCC da luu cua dong (dung lam bang chung thay anh) + goi y "Doi tac / NCC" khi NCC tra loi ma KHONG co ngay
  const thuDong = (ls.data?.mail ?? []).filter((m: any) => m.eo_item_id === dong.item_id);
  const thuNhan = thuDong.filter((m: any) => m.huong === "NHAN").sort((a: any, b: any) => String(b.thoi_gian).localeCompare(String(a.thoi_gian)));
  const nccKhongNgay = thuNhan.find((m: any) => { try { const p = JSON.parse(m.payload || "null")?.dong; return p && !p.ngay_dap_ung; } catch { return false; } });
  const traLoi = (() => { try { const p = JSON.parse(nccKhongNgay?.payload || "null")?.dong; return [p?.dap_ung, p?.note].filter(Boolean).join(" · "); } catch { return ""; } })();
  const goiYNcc = () => {
    setAiMa("DOI_TAC"); if (aiEmail === dong.nguoi_dat) setAiEmail("");
    setLoiMa("NCC_KHONG_PHAN_HOI");
    if (!noiDung.trim()) setNoiDung(`NCC trả lời ngày ${ngay(nccKhongNgay?.thoi_gian)} nhưng chưa có ngày dự kiến${traLoi ? `: "${traLoi}"` : ""}. Đã hỏi lại, chờ NCC báo ngày.`);
    if (thuDong.length) setDungMail(true);
  };

  const upload = async (list: FileList | null) => {
    setErr("");
    for (const f of [...(list ?? [])]) {
      if (!/\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(f.name)) { setErr(`${f.name}: chỉ nhận ảnh`); continue; }
      try {
        const r = await api.postBinary<any>(`/theo-doi/upload?filename=${encodeURIComponent(f.name)}`, await f.arrayBuffer(), f.type || "image/jpeg");
        setAnh((a) => [...a, r]);
      } catch (e: any) {
        setErr(e?.body?.error === "GOOGLE_DRIVE_NOT_CONNECTED" ? "Chưa kết nối Google Drive (Admin › Cấu hình hệ thống)." : `Không tải được ${f.name}.`);
      }
    }
  };
  const save = async () => {
    setErr("");
    if (!aiDung) return setErr("Chọn Do ai: nhà cung cấp hay nội bộ.");
    if (!loiMa) return setErr("Chọn Lỗi gì.");
    if (!noiDung.trim()) return setErr("Nhập nội dung giải trình.");
    setBusy(true);
    try {
      await api.post("/theo-doi/giai-trinh", {
        eo_item_id: dong.item_id, loi_id: loiId && loiId !== "moi" ? Number(loiId) : undefined, cung_loai: true,
        ai_ma: aiDung, ai_email: aiEmailDung || undefined, loi_ma: loiMa, noi_dung: noiDung.trim() + (dungMail ? `\n[Bằng chứng: ${thuDong.length} thư với NCC đã lưu ở hộp theo dõi — xem tab Trao đổi NCC]` : ""), hinh_anh: anh, dung_mail: dungMail,
      });
      onSaved();
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "THIEU_THU" ? "Có dòng chưa có thư / ghi nhận liên hệ nào với NCC trong hệ thống — không dùng thư làm bằng chứng được, hãy thêm ảnh." : c === "CAN_HINH_ANH" ? "Bắt buộc có ảnh bằng chứng." : c === "DA_GIAI_TRINH" ? "Lỗi này đã được giải trình." : c === "READ_ONLY" ? "Bạn không có quyền giải trình dòng này." : "Lỗi lưu giải trình.");
      setBusy(false);
    }
  };
  const ai = (dm.data ?? []).filter((x) => x.loai === "AI" && x.active);
  const loi = (dm.data ?? []).filter((x) => x.loai === "LOI" && x.active);
  return (
    <Modal title={`Giải trình — ${dong.part_code} (${dong.ma_phe_duyet || dong.eo_code})`} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Đang lưu..." : "Gửi giải trình"}</button></>}>
      {ls.isLoading ? <Spinner /> : (
        <>
          <label className="field-label">Giải trình cho lỗi</label>
          <select className="select" value={loiId} onChange={(e) => { setLoiId(e.target.value); const l = mo.find((x: any) => String(x.id) === e.target.value); if (l) setLoiMa(l.loi_ma ?? ""); }}>
            {/* 1 lua chon / loai loi: giai trinh 1 lan dong ca n loi cung loai dang cho (backend cung_loai) */}
            {gopTrung(mo, (l: any) => l.quy_tac).map(({ x: l, ds }: any) => <option key={l.id} value={l.id}>{QUY_TAC[l.quy_tac]}{ds.length > 1
              ? ` × ${ds.length} lần (${lietKe(ds.map((y: any) => ngay(y.ngay_tham_chieu ?? y.han)), 3)})` : `${l.ngay_tham_chieu ? ` (${ngay(l.ngay_tham_chieu)})` : ""} — hạn ${ngayGio(l.han)}`}</option>)}
            <option value="moi">Ghi lỗi mới (vd NCC báo trễ, hết hàng…)</option>
          </select>
          {!mo.length && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Dòng này không có lỗi chờ giải trình — giải trình sẽ ghi thành 1 lỗi mới.</div>}
          {nccKhongNgay && (
            <div style={{ background: "#e8f1fc", borderRadius: 12, padding: "8px 10px", fontSize: 12.5, marginTop: 10 }}>
              💡 NCC đã trả lời ngày <b>{ngay(nccKhongNgay.thoi_gian)}</b> nhưng <b>không có ngày dự kiến</b>{traLoi ? <> ("{traLoi}")</> : null}. Nguyên nhân có thể do NCC, không phải do bạn.
              <button className="btn sm" style={{ marginLeft: 8 }} onClick={goiYNcc}>Điền: Ai = Đối tác / NCC</button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              {laR5 ? <>
                <label className="field-label">Do ai</label>
                <div className="badge review" title="Lỗi chậm duyệt luôn tính cho người được yêu cầu phê duyệt">Người duyệt — lỗi chậm duyệt tính cho người duyệt</div>
              </> : <ChonDoAi value={aiDung} ai={ai} quyTac={loiChon ? [loiChon.quy_tac] : []}
                onChange={(v) => { setAiMa(v); if (v !== "NGUOI_DAT" && aiEmail === dong.nguoi_dat) setAiEmail(""); }} />}
            </div>
            <div>
              <label className="field-label">Người cụ thể</label>
              <select className="select" value={aiEmailDung} disabled={laR5} onChange={(e) => setAiEmail(e.target.value)}>
                <option value="">— Không chọn —</option>
                {(users.data ?? []).map((u: any) => <option key={u.email} value={u.email}>{u.ho_ten ? `${u.ho_ten} (${u.email})` : u.email}</option>)}
              </select>
            </div>
          </div>
          <label className="field-label" style={{ marginTop: 12 }}>Lỗi gì <span className="req">*</span></label>
          <select className="select" value={loiMa} onChange={(e) => setLoiMa(e.target.value)}>
            <option value="">Chọn lỗi</option>
            {loi.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}
          </select>
          <label className="field-label" style={{ marginTop: 12 }}>Nội dung giải trình <span className="req">*</span></label>
          <textarea className="textarea" value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="Nguyên nhân, đã làm gì, khi nào có ngày dự kiến…" />
          <label className="field-label" style={{ marginTop: 12 }}>Ảnh bằng chứng <span className="muted">(tuỳ chọn)</span></label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {anh.map((a, i) => (
              <span key={a.drive_file_id} className="badge issued" style={{ gap: 6 }}>
                <a href={a.url} target="_blank" rel="noopener" style={{ color: "inherit" }}>{a.name}</a>
                <span role="button" style={{ cursor: "pointer", fontWeight: 700, color: "var(--danger)" }} onClick={() => setAnh((x) => x.filter((_, j) => j !== i))}>×</span>
              </span>
            ))}
            <button className="btn sm" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Thêm ảnh</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>
          {thuDong.length > 0 && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, marginTop: 6 }}>
              <input type="checkbox" checked={dungMail} onChange={(e) => setDungMail(e.target.checked)} />
              Kèm bằng chứng: <b>{thuDong.length} thư với NCC</b> đã lưu ở hộp theo dõi
            </label>
          )}
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </>
      )}
    </Modal>
  );
}

/**
 * Ghi nhan NHAC DOI TAC khong qua mail (2026-11-13) - POST /theo-doi/lien-he: goi dien / Zalo / tin nhan cho 1 hoac nhieu dong.
 * R3 (push thu 2 / thu 4) tinh nhu da push trong ky; ghi muon (<= 7 ngay) tu bo loi R3 dang cho cua ky do.
 */
export function LienHeDoiTacModal({ ids, nhan, onClose, onSaved, choNcc: choNccMacDinh }: { ids: number[]; nhan: string; onClose: () => void; onSaved: (kq: { so_dong: number; bo_loi_r3: number }) => void; choNcc?: boolean }) {
  const homNay = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const tuNgay = new Date(Date.now() + 7 * 3600_000 - 7 * 86400_000).toISOString().slice(0, 10);
  const [kenh, setKenh] = useState(choNccMacDinh ? "MAIL" : "DIEN_THOAI");
  // v0.113 "Cho NCC bao ngay": NCC chua co ngay -> hen hoi lai (<= 7 ngay), trong khoang nay khong bi ghi loi lap
  const toiDaHen = new Date(Date.now() + 7 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10);
  const [choNcc, setChoNcc] = useState(!!choNccMacDinh);
  const [henLai, setHenLai] = useState(new Date(Date.now() + 7 * 3600_000 + 2 * 86400_000).toISOString().slice(0, 10));
  const [ngayLh, setNgayLh] = useState(homNay);
  const [gio, setGio] = useState("");
  const [nguoi, setNguoi] = useState("");
  const [ketQua, setKetQua] = useState("");
  const [anh, setAnh] = useState<{ name: string; drive_file_id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (list: FileList | null) => {
    setErr("");
    for (const f of [...(list ?? [])]) {
      if (!/\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(f.name)) { setErr(`${f.name}: chỉ nhận ảnh`); continue; }
      try { const r = await api.postBinary<any>(`/theo-doi/upload?filename=${encodeURIComponent(f.name)}`, await f.arrayBuffer(), f.type || "image/jpeg"); setAnh((a) => [...a, r]); }
      catch (e: any) { setErr(e?.body?.error === "GOOGLE_DRIVE_NOT_CONNECTED" ? "Chưa kết nối Google Drive (Admin › Cấu hình hệ thống)." : `Không tải được ${f.name}.`); }
    }
  };
  const save = async () => {
    setErr("");
    if (!ketQua.trim()) return setErr("Nhập kết quả: đối tác trả lời gì (hẹn ngày nào, chưa có ngày vì sao…).");
    if (!ngayLh || ngayLh > homNay || ngayLh < tuNgay) return setErr(`Ngày liên hệ phải từ ${ngay(tuNgay)} đến hôm nay.`);
    if (choNcc && (!henLai || henLai <= homNay || henLai > toiDaHen)) return setErr(`Ngày hẹn hỏi lại NCC phải sau hôm nay và không quá ${ngay(toiDaHen)}.`);
    setBusy(true);
    try {
      onSaved(await api.post<any>("/theo-doi/lien-he", { eo_item_ids: ids, kenh, ngay: ngayLh, gio: gio || undefined, nguoi_lien_he: nguoi.trim() || undefined, ket_qua: ketQua.trim(), hinh_anh: anh, hen_lai: choNcc ? henLai : undefined }));
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "READ_ONLY" ? "Bạn không có quyền trên một số dòng đã chọn." : c === "BAD_NGAY" ? "Ngày / giờ liên hệ không hợp lệ (không sau hiện tại, không quá 7 ngày trước)." : c === "BAD_HEN_LAI" ? "Ngày hẹn hỏi lại không hợp lệ (sau hôm nay, tối đa 7 ngày)." : "Lỗi lưu ghi nhận.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Ghi nhận nhắc đối tác — ${nhan}`} onClose={onClose} width={640}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Đang lưu..." : `Ghi nhận ${ids.length} dòng`}</button></>}>
      <div style={{ background: "var(--panel-2)", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
        Dùng khi đã nhắc đối tác bằng <b>gọi điện / Zalo / tin nhắn / mail</b>. Kiểm tra push thứ 2 / thứ 4 (lỗi R3) tính như <b>đã push</b> trong kỳ của ngày liên hệ;
        ghi muộn mà R3 kỳ đó đã bị ghi lỗi (chưa giải trình) thì lỗi tự bỏ. Đối tác đã báo ngày → nhập luôn <b>ngày dự kiến</b> (nút 📅) để hết theo dõi R1 / R3.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: 10 }}>
        <div><label className="field-label">Kênh <span className="req">*</span></label>
          <select className="select" value={kenh} onChange={(e) => setKenh(e.target.value)}>{Object.entries(KENH_LIEN_HE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="field-label">Ngày liên hệ <span className="req">*</span></label>
          <input className="input" type="date" value={ngayLh} min={tuNgay} max={homNay} onChange={(e) => setNgayLh(e.target.value)} /></div>
        <div><label className="field-label">Giờ</label><input className="input" type="time" value={gio} onChange={(e) => setGio(e.target.value)} /></div>
      </div>
      <div style={{ marginTop: 12, background: choNcc ? "#e8f1fc" : "var(--panel-2)", borderRadius: 12, padding: "8px 10px" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 700, fontSize: 13 }}>
          <input type="checkbox" checked={choNcc} onChange={(e) => setChoNcc(e.target.checked)} /> ⏳ NCC chưa có ngày dự kiến — chờ NCC báo ngày
        </label>
        <div className="muted" style={{ fontSize: 12, margin: "2px 0 0 22px" }}>
          Dòng chuyển sang mục "Đang chờ NCC báo ngày" ở Việc của tôi; tới ngày hẹn hệ thống <b>không ghi thêm lỗi lặp</b> (chưa có ngày DK thứ 3/6, push thứ 2/4).
          Tới ngày hẹn mà vẫn chưa có ngày → dòng quay lại mục cần làm. Lỗi đầu tiên (không có ngày DK đúng hạn) vẫn phải giải trình.
        </div>
        {choNcc && <div style={{ margin: "6px 0 0 22px", display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
          Hẹn hỏi lại NCC ngày <input className="input" type="date" style={{ width: 160 }} value={henLai} min={homNay} max={toiDaHen} onChange={(e) => setHenLai(e.target.value)} /> <span className="muted">(tối đa 7 ngày)</span>
        </div>}
      </div>
      <label className="field-label" style={{ marginTop: 10 }}>Người liên hệ bên đối tác</label>
      <input className="input" value={nguoi} onChange={(e) => setNguoi(e.target.value)} placeholder="vd: chị Lan — KRF, 09xx…" />
      <label className="field-label" style={{ marginTop: 10 }}>Kết quả <span className="req">*</span></label>
      <textarea className="textarea" value={ketQua} onChange={(e) => setKetQua(e.target.value)} placeholder="Đối tác trả lời gì: hẹn giao ngày…, đang chờ NM xác nhận, hết hàng…" />
      <label className="field-label" style={{ marginTop: 10 }}>Ảnh bằng chứng <span className="muted">(nên có: ảnh chụp tin nhắn / nhật ký cuộc gọi)</span></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {anh.map((a, i) => (
          <span key={a.drive_file_id} className="badge issued" style={{ gap: 6 }}>
            <a href={a.url} target="_blank" rel="noopener" style={{ color: "inherit" }}>{a.name}</a>
            <span role="button" style={{ cursor: "pointer", fontWeight: 700, color: "var(--danger)" }} onClick={() => setAnh((x) => x.filter((_, j) => j !== i))}>×</span>
          </span>
        ))}
        <button className="btn sm" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Thêm ảnh</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/** Du lieu dong linh kien trong 1 mail (payload.dong tu app theodoimuahang): ngay 3T can, KRF dap ung, note. */
function dongMailTxt(payload: string | null): string {
  let d: any = null;
  try { d = payload ? JSON.parse(payload)?.dong : null; } catch { /* bo qua */ }
  if (!d) return "";
  return [
    d.ngay_can && `3T cần ${ngay(d.ngay_can)}`,
    (d.ngay_dap_ung || d.dap_ung) && `KRF đáp ứng ${d.ngay_dap_ung ? ngay(d.ngay_dap_ung) : d.dap_ung}`,
    d.con_no != null && `còn nợ ${soLuong(d.con_no)}`,
    d.ton_kho ? `tồn KRF ${soLuong(d.ton_kho)}` : null,
    d.note,
  ].filter(Boolean).join(" · ");
}

/** Lich su theo doi 1 dong: loi, giai trinh, push, mail, thay doi ngay du kien. */
export function LichSuModal({ dong, onClose }: { dong: Dong; onClose: () => void }) {
  return (
    <Modal title={`Lịch sử theo dõi — ${dong.part_code} (${dong.ma_phe_duyet || dong.eo_code})`} onClose={onClose} width={900}>
      <LichSuDong dong={dong} />
    </Modal>
  );
}

const ngan = (v: string | null | undefined) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}${v.length > 10 ? ` ${v.slice(11, 16)}` : ""}` : "—");
/** ten hien thi ngan cua dia chi mail: "Ten" <a@b> -> Ten; a@b -> a@b; nhieu nguoi -> them " +" */
const tenMail = (v: string | null | undefined) => {
  const all = String(v ?? "");
  const x = all.split(",")[0].trim();
  const m = x.match(/^"?([^"<]+?)"?\s*</);
  return (m ? m[1] : x.replace(/[<>"]/g, "")).trim() + (all.includes(",") ? " +" : "");
};
type LoaiHd = "mail_gui" | "mail_nhan" | "gt" | "lien_he" | "push" | "ndk";
const LOAI_HD: Record<LoaiHd, string> = { mail_gui: "Mail gửi", mail_nhan: "Mail nhận", gt: "Giải trình", lien_he: "Gọi / Zalo", push: "Push", ndk: "Ngày DK" };
/** gop = khoa "cung buoc" - cac muc LIEN TIEP cung khoa gop 1 nhom (giong app DVBH GiaiTrinhLichSu gopLienTiep, 2026-11-23). */
interface MucHd { k: string; loai: LoaiHd; luc: string; icon: string; chinh: ReactNode; phu?: string; chiTiet?: ReactNode; gop: string }
/** Gop cac muc LIEN TIEP (da sap moi -> cu) cung khoa gop: 1 giai trinh chung / 1 lan tu dong ghi nhieu ban ghi -> 1 dong "×n". */
function gopLienTiepHd(ds: MucHd[]): MucHd[][] {
  const out: MucHd[][] = [];
  for (const x of ds) {
    const cuoi = out[out.length - 1];
    if (cuoi && cuoi[0].gop === x.gop) cuoi.push(x); else out.push([x]);
  }
  return out;
}

/** 1 dong gon + bam de mo chi tiet (nguyen tac UI chi tiet: chi thong tin chinh, xo khi can). */
function DongGon({ luc, icon, chinh, phu, chiTiet, mo, onMo }: { luc?: string; icon?: ReactNode; chinh: ReactNode; phu?: ReactNode; chiTiet?: ReactNode; mo: boolean; onMo: () => void }) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "5px 0" }}>
      <div onClick={chiTiet ? onMo : undefined} title={chiTiet ? (mo ? "Bấm để thu gọn" : "Bấm để xem chi tiết") : undefined}
        style={{ display: "flex", gap: 6, alignItems: "baseline", cursor: chiTiet ? "pointer" : undefined, minWidth: 0 }}>
        {luc !== undefined && <span className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", width: 70, flexShrink: 0 }}>{luc}</span>}
        {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: mo ? undefined : "ellipsis", whiteSpace: mo ? "normal" : "nowrap" }}>{chinh}</span>
        {chiTiet && <span className="muted" style={{ flexShrink: 0, fontSize: 11 }}>{mo ? "▴" : "›"}</span>}
      </div>
      {phu && <div style={{ fontSize: 11.5, color: NGAY.NM.mau, marginLeft: luc !== undefined ? 76 : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: mo ? "normal" : "nowrap" }}>{phu}</div>}
      {mo && chiTiet && <div style={{ margin: "4px 0 2px", padding: "6px 8px", background: "#f5f5f7", borderRadius: 10, fontSize: 12 }}>{chiTiet}</div>}
    </div>
  );
}

const anhGt = (json: string | null) => { try { return (JSON.parse(json || "[]") as any[]).map((a) => <a key={a.drive_file_id} href={a.url} target="_blank" rel="noopener" style={{ marginRight: 8 }}>📷 {a.name}</a>); } catch { return null; } };
const THU_TU_TT: TrangThaiGt[] = ["VI_PHAM", "CAN_GT", "DA_GT", "KHAC_PHUC", "BO_QUA", "TAY"];

/**
 * Noi dung lich su theo doi 1 dong (dung trong LichSuModal + popup don hang). v0.109 (chu he thong 2026-11-23: "rut gon lai chi lay thong tin chinh
 * + nut mo rong"; "phan biet ro giai doan can giai trinh (co han) - het han khong giai trinh moi tinh la vi pham"):
 *  1. "Giải trình & vi phạm": 1 dong / nhom loi (quy tac + trang thai lib/giaiTrinh) - nhan trang thai + han giai trinh; mo ra = vi sao + ket luan + giai trinh.
 *  2. "Hoạt động": dong thoi gian gop mail / giai trinh / goi-Zalo / push / ngay DK, moi muc 1 dong, loc theo loai (chon nhieu), 8 muc moi nhat + "Xem thêm".
 */
/** boLoi (v0.131): bo muc "Giai trinh & vi pham" - popup don hang da co tab "Lỗi & giải trình" (tranh trung). */
export function LichSuDong({ dong, boLoi }: { dong: Pick<Dong, "item_id" | "part_name" | "kho" | "doi_tac" | "so_luong_dat" | "sl_nhap_amis" | "bat_dau" | "han_ngay_du_kien">; boLoi?: boolean }) {
  const ls = useQuery({ queryKey: ["tl-dong", dong.item_id], queryFn: () => api.get<any>(`/theo-doi/dong/${dong.item_id}`) });
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  const [mo, setMo] = useState<Set<string>>(new Set());
  const [moHet, setMoHet] = useState(false);
  const [loc, setLoc] = useState<Set<LoaiHd>>(new Set());
  const [soHien, setSoHien] = useState(8);
  const [tungMuc, setTungMuc] = useState(false);
  const d = ls.data;
  if (ls.isLoading || !d) return <Spinner />;
  const laMo = (k: string) => moHet || mo.has(k);
  const doiMo = (k: string) => setMo((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const H = ({ children, phai }: { children: ReactNode; phai?: ReactNode }) => (
    // v0.132: tieu de muc nhat (khong to dam) - chu he thong "tieu de dung to dam len"
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500, fontSize: 12.5, color: "var(--text-muted)", margin: "12px 0 4px" }}>{children}<span style={{ marginLeft: "auto", fontWeight: 400 }}>{phai}</span></div>
  );
  const now = nowVN();
  const gtBy = new Map<number, any>((d.giai_trinh ?? []).map((g: any) => [g.id, g]));

  // ---- 1. giai trinh & vi pham: gom theo quy tac + trang thai
  const loiKq = (d.loi ?? []).map((l: any) => ({ l, k: trangThaiGt(l, gtBy, now) }));
  const nhomLoi = gopTrung(loiKq, (x: any) => `${x.l.quy_tac}|${x.k.tt}`)
    .sort((a: any, b: any) => THU_TU_TT.indexOf(a.x.k.tt) - THU_TU_TT.indexOf(b.x.k.tt) || String(mocLoi(b.x.l)).localeCompare(String(mocLoi(a.x.l))));
  const dem = demGt(d.loi ?? [], gtBy, now);

  // ---- 2. hoat dong (dong thoi gian)
  const mailGop = gopTrung([...(d.mail ?? [])].sort((a: any, b: any) => (b.eo_item_id === dong.item_id ? 1 : 0) - (a.eo_item_id === dong.item_id ? 1 : 0)), khoaMail);
  const ndkGop = gopTrung(d.ngay_du_kien ?? [], (e: any) => `${e.created_at}|${e.event_type}|${e.after_json ?? ""}|${e.user_email ?? ""}`);
  const hd: MucHd[] = [
    ...mailGop.map(({ x: m, ds }: any): MucHd => ({
      k: `m${m.id}`, gop: `mail|${m.huong}|${m.tieu_de ?? ""}`, loai: m.huong === "GUI" ? "mail_gui" : "mail_nhan", luc: m.thoi_gian, icon: m.huong === "GUI" ? "→" : "←",
      chinh: <><span className="muted">{m.huong === "GUI" ? `Gửi ${tenMail(m.den)}` : `Nhận từ ${tenMail(m.tu)}`}</span> · <b>{m.tieu_de || "(không tiêu đề)"}</b></>,
      phu: m.eo_item_id === dong.item_id ? dongMailTxt(m.payload) || undefined : undefined,
      chiTiet: <><div><b>Từ:</b> {m.tu}</div><div><b>Đến:</b> {m.den}</div>{m.tom_tat && <div style={{ marginTop: 4 }}>{m.tom_tat}</div>}
        {ds.length > 1 && <div className="muted" style={{ marginTop: 4 }}>Thư chung cho {ds.length} dòng.</div>}</>,
    })),
    ...(d.giai_trinh ?? []).map((g: any): MucHd => {
      const auto = g.pham_vi === "AUTO";
      const qh = g.nhom === "AUTO:QUA_HAN";
      return {
        k: `g${g.id}`, gop: auto ? `gt|auto|${g.nhom}` : `gt|${g.created_by}|${g.ai_ma}|${g.loi_ma}|${g.noi_dung ?? ""}`, loai: "gt", luc: g.created_at, icon: auto ? "⚙" : "✍",
        chinh: auto ? <><b>Hệ thống</b> · {qh ? <b style={{ color: NHAN_GT.VI_PHAM.mau }}>hết hạn giải trình → ghi vi phạm</b> : "tự đóng lỗi (đã khắc phục)"}</>
          : <><b>{ten(g.created_by)}</b> giải trình · <span className="muted">Ai: {tenDm("AI", g.ai_ma)}{g.ai_email ? ` (${ten(g.ai_email)})` : ""} · Lỗi: {tenDm("LOI", g.loi_ma)}</span></>,
        chiTiet: <><div>{g.noi_dung}</div>{anhGt(g.hinh_anh)}</>,
      };
    }),
    ...(d.lien_he ?? []).map((x: any): MucHd => ({
      k: `l${x.id}`, gop: `lh|${x.kenh}|${x.ket_qua ?? ""}`, loai: "lien_he", luc: x.ngay_lien_he, icon: "📞",
      chinh: <><b>{KENH_LIEN_HE[x.kenh] ?? x.kenh}</b>{x.nguoi_lien_he ? ` với ${x.nguoi_lien_he}` : ""}{x.hen_lai ? <b style={{ color: "#0062c4" }}> · ⏳ chờ NCC, hẹn hỏi lại {ngay(x.hen_lai)}</b> : null} · <span className="muted">{x.ket_qua}</span></>,
      chiTiet: <><div>{x.ket_qua}</div><div className="muted">Ghi bởi {ten(x.created_by)} lúc {ngayGio(x.created_at)}</div>{anhGt(x.hinh_anh)}</>,
    })),
    ...(d.push ?? []).map((p: any): MucHd => ({
      k: `p${p.ma_push}`, gop: `push|${p.doi_tac}|${p.trang_thai}|${p.created_by}`, loai: "push", luc: p.created_at, icon: "📤",
      chinh: <><b>{p.ma_push}</b> · {p.doi_tac} · <span className="muted">{p.trang_thai === "DA_TAO" ? "chưa gửi" : p.trang_thai === "DA_GUI" ? "đã gửi mail" : "đối tác đã phản hồi"} · {ten(p.created_by)}</span></>,
    })),
    ...ndkGop.map(({ x: e, ds }: any, i: number): MucHd => {
      let txt = "";
      try {
        const a = e.after_json ? JSON.parse(e.after_json) : null;
        txt = Array.isArray(a) ? a.map((x: any) => `${x.tuan ?? ngay(x.planned_date)}: ${soLuong(x.planned_qty)}`).join(", ") : a?.planned_date ? `${ngay(a.planned_date)}${a.planned_qty ? `: ${soLuong(a.planned_qty)}` : ""}` : e.event_type === "DELETE_PLAN" ? "xóa mốc" : "";
      } catch { /* bo qua */ }
      // user_email NULL = He thong (vd tu dong dien ngay KRF tu mail - lib/krfGoiY.ts tuDongDienKrf)
      return { k: `n${i}`, gop: `ndk|${e.user_email ?? ""}`, loai: "ndk", luc: e.created_at, icon: "📅",
        chinh: <>Ngày DK → <b>{txt || "—"}</b> · <span className="muted">{e.user_email ? ten(e.user_email) : "Hệ thống"}{ds.length > 1 ? ` (×${ds.length})` : ""}</span></> };
    }),
  ].sort((a, b) => String(b.luc).localeCompare(String(a.luc)) || a.gop.localeCompare(b.gop)); // cung thoi diem -> xep theo khoa gop de cac muc giong nhau lien tiep
  const demLoai = new Map<LoaiHd, number>();
  for (const x of hd) demLoai.set(x.loai, (demLoai.get(x.loai) ?? 0) + 1);
  const hdLoc = loc.size ? hd.filter((x) => loc.has(x.loai)) : hd;
  const nhomHd = tungMuc ? hdLoc.map((x) => [x]) : gopLienTiepHd(hdLoc);
  const daGop = !tungMuc && nhomHd.length < hdLoc.length;

  return (
    <div style={{ fontSize: 12.5 }}>
      <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        title={`${dong.part_name} · ${dong.kho} · ${dong.doi_tac ?? "—"} · đặt ${soLuong(dong.so_luong_dat)}, về ${soLuong(dong.sl_nhap_amis)}`}>
        Bắt đầu theo dõi {ngan(dong.bat_dau)} · hạn có ngày DK {ngan(dong.han_ngay_du_kien)}
      </div>

      {!boLoi && <>
      <H phai={<button className="btn ghost sm" onClick={() => { setMoHet(!moHet); setMo(new Set()); }}>{moHet ? "▴ Thu gọn" : "▾ Xem chi tiết"}</button>}>
        Giải trình & vi phạm
      </H>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}
        title={`Mỗi lần chạm quy tắc theo dõi (R1/R3/R4) hệ thống ghi 1 lỗi CẦN GIẢI TRÌNH. Người phụ trách có ${GIO_HAN_GT} giờ làm việc để giải trình (hoặc khắc phục). Quá hạn mà không giải trình → hệ thống ghi nhận VI PHẠM, không giải trình được nữa.\nCảnh báo cấp CEO (lùi ngày DK ≥ 3 lần, ngày DK cách ngày đặt ≥ 30 ngày, ≥ 3 lỗi) hệ thống TỰ TÍNH theo số liệu, không có hạn giải trình.`}>
        Chạm quy tắc → <b style={{ color: NHAN_GT.CAN_GT.mau }}>cần giải trình</b> trong {GIO_HAN_GT} giờ LV · quá hạn không giải trình → <b style={{ color: NHAN_GT.VI_PHAM.mau }}>vi phạm</b> ⓘ
      </div>
      {(d.loi ?? []).length === 0 ? <div className="muted">Không có lỗi nào.</div> : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "2px 0 4px" }}>
            {THU_TU_TT.filter((t) => dem[t]).map((t) => <span key={t} className={`badge ${NHAN_GT[t].cls}`} title={NHAN_GT[t].mo}>{NHAN_GT[t].l} {dem[t]}</span>)}
          </div>
          {nhomLoi.map(({ x, ds }: any) => {
            const { l, k } = x;
            const key = `L${l.id}`;
            const n = NHAN_GT[k.tt as TrangThaiGt];
            const ngayCua = (y: any) => ngay(y.l.ngay_tham_chieu ?? y.l.han);
            return (
              <DongGon key={key} mo={laMo(key)} onMo={() => doiMo(key)}
                chinh={<><span className={`badge ${n.cls}`} title={n.mo}>{n.l}</span> <b>{QUY_TAC[l.quy_tac] ?? l.quy_tac}</b>
                  {ds.length > 1 && <span className="muted"> × {ds.length} lần</span>}
                  <span className="muted"> · {ds.length > 1 ? lietKe(ds.map(ngayCua), 4) : ngayCua(x)}</span>
                  {k.tt === "CAN_GT" && <span style={{ color: n.mau, fontWeight: 700 }}> · hạn GT {ngan(k.hanGt)} (còn {gioTxt(k.conGio ?? 0)})</span>}
                  {k.tt === "VI_PHAM" && k.hanGt && <span style={{ color: n.mau }}> · hết hạn GT {ngan(k.hanGt)}</span>}</>}
                chiTiet={<>
                  <div><b>Vì sao có lỗi:</b> {viSaoLoi(l)}{ds.length > 1 && <span className="muted"> (lặp {ds.length} lần: {lietKe(ds.map(ngayCua), 12)})</span>}</div>
                  <div style={{ marginTop: 3, color: n.mau }}><b>Kết luận:</b> {ketLuanGt(k)}</div>
                  <div className="muted" style={{ marginTop: 3 }}>Người chịu: {tenDm("AI", l.ai_ma)}{l.ai_email ? ` (${ten(l.ai_email)})` : ""} · Mã lỗi: {l.ma_loi ?? tenDm("LOI", l.loi_ma)}</div>
                  {k.gt && k.gt.pham_vi !== "AUTO" && <div style={{ marginTop: 4 }}><b>Giải trình</b> ({ten(k.gt.created_by)}, {ngayGio(k.gt.created_at)}): {k.gt.noi_dung} {anhGt(k.gt.hinh_anh)}</div>}
                </>} />
            );
          })}
        </>
      )}

      </>}

      <H phai={<span className="muted" style={{ fontSize: 11.5 }}>{hdLoc.length}{loc.size ? ` / ${hd.length}` : ""} mục{daGop ? `, gộp còn ${nhomHd.length} nhóm` : ""}
        {(daGop || tungMuc) && <button type="button" className="btn ghost sm" style={{ marginLeft: 6, padding: "0 6px", fontSize: 11.5 }} onClick={() => setTungMuc(!tungMuc)}>{tungMuc ? "Gộp bước giống nhau" : "Hiện từng mục"}</button>}</span>}>Hoạt động</H>
      {hd.length === 0 ? <div className="muted">Chưa có mail, push, liên hệ hay thay đổi ngày dự kiến.</div> : (
        <>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
            {(Object.keys(LOAI_HD) as LoaiHd[]).filter((t) => demLoai.get(t)).map((t) => (
              <button key={t} type="button" className={`btn sm ${loc.has(t) ? "primary" : "ghost"}`} style={{ padding: "1px 8px", fontSize: 11.5 }}
                title="Bấm để lọc (chọn được nhiều loại)" onClick={() => { setLoc((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; }); setSoHien(8); }}>
                {loc.has(t) ? "☑" : "☐"} {LOAI_HD[t]} {demLoai.get(t)}
              </button>
            ))}
            {loc.size > 0 && <button type="button" className="btn sm ghost" style={{ padding: "1px 8px", fontSize: 11.5 }} onClick={() => setLoc(new Set())}>× Bỏ lọc</button>}
          </div>
          {nhomHd.slice(0, soHien).map((ds) => {
            const x = ds[0];
            if (ds.length === 1) return <DongGon key={x.k} luc={ngan(x.luc)} icon={x.icon} chinh={x.chinh} phu={x.phu} chiTiet={x.chiTiet} mo={laMo(x.k)} onMo={() => doiMo(x.k)} />;
            // nhom: moi nhat day du + "×n" + khoang thoi gian; mo ra = cac lan truoc (giong DVBH "Xem n giai trinh truoc")
            const cu = ds[ds.length - 1];
            return <DongGon key={x.k} luc={ngan(x.luc)} icon={x.icon} mo={laMo(x.k)} onMo={() => doiMo(x.k)} phu={x.phu}
              chinh={<>{x.chinh} <span className="badge final" style={{ marginLeft: 4 }} title={`${ds.length} mục giống nhau liên tiếp · ${ngan(cu.luc)} → ${ngan(x.luc)}`}>×{ds.length}</span></>}
              chiTiet={<>
                <div className="muted" style={{ marginBottom: 3 }}>{ds.length} mục giống nhau liên tiếp · từ {ngayGio(cu.luc)} đến {ngayGio(x.luc)}</div>
                {x.chiTiet}
                <div style={{ marginTop: 4, borderLeft: "2px dashed var(--border)", paddingLeft: 8 }}>
                  {ds.slice(1).map((y) => <div key={y.k} style={{ fontSize: 11.5, padding: "1px 0" }}><span className="muted">{ngan(y.luc)}</span> · {y.chinh}</div>)}
                </div>
              </>} />;
          })}
          {nhomHd.length > soHien && <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setSoHien(soHien + 20)}>▾ Xem thêm (còn {nhomHd.length - soHien} {tungMuc ? "mục" : "nhóm"})</button>}
        </>
      )}
    </div>
  );
}

export interface MailNhac {
  ma_push: string;
  tieu_de: string;
  ten_file: string;
  rows: Dong[];
  tai_khoan: string;
  nguoi_nhan: { doi_tac: string; den: string | null }[];
}

// Tạm tắt nút "Tạo mail nhắc" (18/11/2026): người dùng tự soạn mail, CC hộp theo dõi + ghi mã 3TDO / mã LK. Bật lại = true.
export const BAT_TAO_MAIL_NHAC = false;

export async function taoPushDoiTac(ids: number[]): Promise<MailNhac> {
  const r = await api.post<{ dot: MailNhac }>("/theo-doi/push", { eo_item_ids: ids });
  return r.dot;
}

const CC_THEO_DOI = "theodoimuahang@gmail.com";
const EMAIL = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g;

function emailList(value: string) {
  return [...new Set((value.match(EMAIL) ?? []).map((email) => email.toLowerCase()))];
}

function utf8Base64(value: string) {
  return btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(""));
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

type NguoiNhanNhac = { to: string; cc: string };
type NguoiNhanTheoDoiTac = NguoiNhanNhac & { doiTac: string; ten: string };

function khoaNguoiNhan(taiKhoan: string, doiTac: string) {
  return `eomua:mail-nhac:v1:${encodeURIComponent(taiKhoan.toLowerCase())}:${encodeURIComponent(doiTac)}`;
}

function docNguoiNhan(key: string): NguoiNhanNhac | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    return typeof saved?.to === "string" && typeof saved?.cc === "string" ? saved : null;
  } catch {
    return null;
  }
}

function tachDiaChi(value: string) {
  return value.split(/[\s,;]+/).filter(Boolean);
}

export function PushKetQua({ dot, onClose }: { dot: MailNhac; onClose: () => void }) {
  const [nguoiNhan, setNguoiNhan] = useState<NguoiNhanTheoDoiTac[]>(() => {
    const doiTac = new Map<string, string>();
    for (const row of dot.rows) {
      const ten = row.doi_tac?.trim() || "";
      doiTac.set(ten.toLowerCase(), ten);
    }
    return Array.from(doiTac, ([key, ten]) => {
      const lichSu = dot.nguoi_nhan.find((r) => r.doi_tac === key)?.den ?? "";
      const saved = key ? docNguoiNhan(khoaNguoiNhan(dot.tai_khoan, key)) : null;
      return { doiTac: key, ten, ...(saved ?? {
        to: emailList(lichSu).filter((e) => e !== CC_THEO_DOI).join(", "), cc: "",
      }) };
    });
  });
  const [loi, setLoi] = useState("");
  const suaNguoiNhan = (doiTac: string, field: keyof NguoiNhanNhac, value: string) => {
    setNguoiNhan((ds) => ds.map((r) => r.doiTac === doiTac ? { ...r, [field]: value } : r));
    setLoi("");
  };
  const [body, setBody] = useState(
    "Kính gửi anh/chị,\n\nEm gửi danh sách linh kiện 3T đang thiếu hàng trong file đính kèm. Nhờ anh/chị hỗ trợ kiểm tra và phản hồi ngày dự kiến giao, số lượng có thể giao và ghi chú (nếu có) trong file.\n\nKhi phản hồi, vui lòng giữ nguyên mã nhắc trong tiêu đề và CC hộp thư theo dõi.\n\nEm cảm ơn anh/chị.",
  );
  const sheets = [{
    name: "PUSH",
    rows: [
      ["Mã push", dot.ma_push],
      [],
      ["ID dòng", "Mã phê duyệt", "Mã EO", "Mã linh kiện", "Tên linh kiện", "Đối tác", "Kho nhận", "SL đặt", "SL còn thiếu", "Ngày đặt",
        "Ngày nhà máy cam kết giao (NCC điền)", "SL giao (NCC điền)", "Ghi chú NCC"],
      ...dot.rows.map((x) => [x.id_dat_lk, x.ma_phe_duyet ?? "", x.eo_code, x.part_code, x.part_name, x.doi_tac, x.kho, x.so_luong_dat, x.so_luong_con_thieu, ngay(x.bat_dau), "", "", ""]),
    ],
    widths: [16, 14, 14, 16, 36, 24, 24, 9, 11, 11, 22, 16, 30],
  }];
  const downloadDraft = () => {
    const allAddresses = nguoiNhan.flatMap((r) => [...tachDiaChi(r.to), ...tachDiaChi(r.cc)]);
    if (allAddresses.some((email) => emailList(email)[0] !== email.toLowerCase())) {
      setLoi("Kiểm tra địa chỉ email. Dùng dấu phẩy hoặc chấm phẩy để phân tách.");
      return;
    }
    const recipients = emailList(nguoiNhan.map((r) => r.to).join(", ")).filter((e) => e !== CC_THEO_DOI);
    if (!recipients.length) {
      setLoi("Nhập ít nhất một địa chỉ To.");
      return;
    }
    const cc = nguoiNhan.map((r) => r.cc).join(", ");
    try {
      for (const r of nguoiNhan) {
        if (!r.doiTac) continue;
        localStorage.setItem(khoaNguoiNhan(dot.tai_khoan, r.doiTac), JSON.stringify({
          to: emailList(r.to).filter((e) => e !== CC_THEO_DOI).join(", "),
          cc: emailList(r.cc).filter((e) => e !== CC_THEO_DOI).join(", "),
        }));
      }
      setLoi("");
    } catch {
      setLoi("Trình duyệt không lưu được To/CC cho lần sau. Vẫn có thể mở bản nháp lần này.");
    }
    const boundary = `mh-${dot.ma_push}`;
    const eml = [
      "X-Unsent: 1",
      "MIME-Version: 1.0",
      `To: ${recipients.join(",\r\n ")}`,
      `Cc: ${[CC_THEO_DOI, ...emailList(cc).filter((e) => e !== CC_THEO_DOI && !recipients.includes(e))].join(",\r\n ")}`,
      `Subject: ${(dot.tieu_de.match(/.{1,14}/gu) ?? []).map((part) => `=?UTF-8?B?${utf8Base64(part)}?=`).join("\r\n ")}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(utf8Base64(body.replace(/\r?\n/g, "\r\n"))),
      `--${boundary}`,
      "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${dot.ten_file}"`,
      "",
      wrapBase64(bookBase64(sheets)),
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `MH-PUSH_${dot.ma_push}.eml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Modal title="Mail nhắc giao hàng" onClose={onClose} wide footer={<>
      <button className="btn" onClick={() => writeBook(dot.ten_file, sheets)}>Tải Excel</button>
      <button className="btn primary" onClick={downloadDraft}>Xác nhận và mở Outlook</button>
    </>}>
      <div className="muted" style={{ marginBottom: 10 }}>
        Bản nháp đính kèm {dot.ten_file} ({dot.rows.length} dòng). Nếu Outlook chưa tự mở, mở tệp .eml vừa tải.
      </div>
      {nguoiNhan.length > 1 && <p>Mọi người nhận sẽ thấy toàn bộ danh sách Excel. Kiểm tra To/CC trước khi xác nhận.</p>}
      {nguoiNhan.map((r) => <fieldset key={r.doiTac} className="card card-pad" style={{ marginBottom: 8 }}>
        <legend>{r.ten || "Dòng chưa có đối tác"}</legend>
        <label>To <input className="input" value={r.to} onChange={(e) => suaNguoiNhan(r.doiTac, "to", e.target.value)} /></label>
        <label>CC <input className="input" value={r.cc} onChange={(e) => suaNguoiNhan(r.doiTac, "cc", e.target.value)} /></label>
      </fieldset>)}
      <p className="muted">Luôn CC {CC_THEO_DOI} để xác nhận qua hộp thư theo dõi.</p>
      {loi && <p role="alert">{loi}</p>}
      <label>Tiêu đề <input className="input" readOnly value={dot.tieu_de} /></label>
      <label>Nội dung <textarea className="input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></label>
    </Modal>
  );
}
