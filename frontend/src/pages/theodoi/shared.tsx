import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal, Spinner } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { normKey, writeBook } from "../../lib/excel";
import { NGAY, NhanNgay } from "../../lib/ngay";

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
  ceo_ly_do: string[];
}

export const TINH_TRANG: Record<Dong["tinh_trang"], { l: string; c: string }> = {
  CHO_NDK: { l: "Chờ ngày dự kiến", c: "final" },
  TRE_NDK: { l: "Trễ 24h chưa có ngày DK", c: "reject" },
  QUA_HAN_NDK: { l: "Quá ngày dự kiến", c: "reject" },
  CHO_HANG: { l: "Chờ hàng", c: "review" },
  DONG: { l: "Đã đóng", c: "issued" },
};
export const QUY_TAC: Record<string, string> = {
  R1: "Không có ngày dự kiến trong 24h", R3: "Không push đối tác (thứ 2/4)", R4: "Quá hạn không cập nhật ngày dự kiến", TAY: "Ghi khi giải trình",
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
    <div style={{ background: NGAY[k].nen, borderLeft: `4px solid ${NGAY[k].mau}`, borderRadius: 8, padding: "8px 12px" }} title={NGAY[k].mo_ta}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: NGAY[k].mau }}>{NGAY[k].l}</div>
      <div style={{ fontSize: 20, fontWeight: 900, margin: "2px 0" }}>{v}</div>
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
            <b style={{ color: "var(--text)" }}>{it?.approval_code || it?.eo_code}</b> · {it?.part_name} · {it?.warehouse} · {it?.supplier || "—"} · SL đặt <b>{soLuong(slDat)}</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
            <The k="VE" v={ngayVe ? ngay(ngayVe) : "Chưa về"} sub={<>Đã về <b>{soLuong(daVe)}</b> / {soLuong(slDat)}{daVe >= slDat && slDat > 0 ? " — đủ hàng" : daVe > 0 ? ` — còn thiếu ${soLuong(slDat - daVe)}` : ""}</>} />
            <The k="DK" v={dkGanNhat ? ngay(dkGanNhat) : "Chưa có"} sub={<>{kh.length} đợt · lên KH {soLuong(tongKh)} / {soLuong(slDat)}{dong.so_lan_lui ? ` · lùi ${dong.so_lan_lui} lần` : ""}</>} />
            <The k="NM" v={nmGanNhat ? ngay(nmGanNhat) : "Chưa có"} sub={lech == null ? "—" : lech === 0 ? "Trùng ngày dự kiến" : `Ngày dự kiến ${lech > 0 ? "sau" : "trước"} ${Math.abs(lech)} ngày`} />
          </div>

          <div style={{ fontWeight: 800, marginBottom: 6 }}>Các đợt hàng về (kế hoạch)</div>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th style={th}>Đợt</th><th style={th}><NhanNgay k="NM" /></th><th style={th}><NhanNgay k="DK" /></th><th style={{ ...th, textAlign: "right" }}>SL</th><th style={th}>Ghi chú / nguồn</th><th style={th}>Cập nhật</th><th style={th}></th></tr></thead>
              <tbody>
                {kh.length === 0 && <tr><td colSpan={7} className="muted">Chưa có đợt nào — nhập ở khung bên dưới.</td></tr>}
                {kh.map((p, i) => (
                  <tr key={p.id} style={{ background: sua?.id === p.id ? "#FFFBEB" : undefined }}>
                    <td>{i + 1}{p.loai === "TUAN" && <span className="badge final" style={{ marginLeft: 4 }}>Tuần {p.tuan}</span>}</td>
                    <td style={{ color: NGAY.NM.mau, fontWeight: 600 }}>{ngay(p.factory_committed_date) || "—"}</td>
                    <td style={{ color: NGAY.DK.mau, fontWeight: 700 }}>{ngay(p.planned_date)}</td>
                    <td style={{ textAlign: "right" }}>{soLuong(p.planned_qty)}</td>
                    <td>{p.ghi_chu || ""}</td>
                    <td className="muted" style={{ fontSize: 11.5 }}>{ten(p.updated_by || p.created_by)} · {ngayGio(p.updated_at || p.created_at)}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      {p.loai !== "TUAN" && <button className="btn ghost sm" title="Sửa đợt này" onClick={() => moForm(p)}><I.edit width={14} height={14} /></button>}
                      <button className="btn ghost sm danger" title="Xóa đợt" onClick={() => xoa(p)}><I.trash width={14} height={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: 12, marginTop: 10, background: "var(--panel-2)" }}>
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

          <div style={{ fontWeight: 800, margin: "14px 0 6px" }}><NhanNgay k="VE" /> <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— phiếu nhập AMIS khớp dòng này (tự động, không nhập tay)</span></div>
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

/** Giai trinh: chon loi dang cho (hoac ghi loi moi) + Ai + Loi gi + noi dung + anh bang chung (bat buoc voi R1/R4). */
export function GiaiTrinhModal({ dong, onClose, onSaved }: { dong: Dong; onClose: () => void; onSaved: () => void }) {
  const dm = useDanhMuc();
  const ls = useQuery({ queryKey: ["tl-dong", dong.item_id], queryFn: () => api.get<any>(`/theo-doi/dong/${dong.item_id}`) });
  const users = useQuery({ queryKey: ["users-min"], queryFn: () => api.get<any[]>("/users/directory") });
  const mo = (ls.data?.loi ?? []).filter((l: any) => l.trang_thai === "CHO_GIAI_TRINH");
  const [loiId, setLoiId] = useState<string>("");
  const [aiMa, setAiMa] = useState("NGUOI_DAT");
  const [aiEmail, setAiEmail] = useState(dong.nguoi_dat ?? "");
  const [loiMa, setLoiMa] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [anh, setAnh] = useState<{ name: string; drive_file_id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const loiChon = mo.find((l: any) => String(l.id) === loiId);
  // mac dinh chon loi dang cho dau tien (chua co loi nao -> "Ghi loi moi")
  useEffect(() => {
    if (loiId || ls.isLoading) return;
    if (mo.length) { setLoiId(String(mo[0].id)); setLoiMa(mo[0].loi_ma ?? ""); } else setLoiId("moi");
  }, [ls.isLoading, mo.length, loiId]); // eslint-disable-line react-hooks/exhaustive-deps
  const canAnh = loiChon && (loiChon.quy_tac === "R1" || loiChon.quy_tac === "R4");

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
    if (!aiMa) return setErr("Chọn Ai chịu trách nhiệm.");
    if (!loiMa) return setErr("Chọn Lỗi gì.");
    if (!noiDung.trim()) return setErr("Nhập nội dung giải trình.");
    if (canAnh && !anh.length) return setErr("Lỗi này bắt buộc có ảnh bằng chứng.");
    setBusy(true);
    try {
      await api.post("/theo-doi/giai-trinh", {
        eo_item_id: dong.item_id, loi_id: loiId && loiId !== "moi" ? Number(loiId) : undefined,
        ai_ma: aiMa, ai_email: aiEmail || undefined, loi_ma: loiMa, noi_dung: noiDung.trim(), hinh_anh: anh,
      });
      onSaved();
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "CAN_HINH_ANH" ? "Bắt buộc có ảnh bằng chứng." : c === "DA_GIAI_TRINH" ? "Lỗi này đã được giải trình." : c === "READ_ONLY" ? "Bạn không có quyền giải trình dòng này." : "Lỗi lưu giải trình.");
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
            {mo.map((l: any) => <option key={l.id} value={l.id}>{QUY_TAC[l.quy_tac]}{l.ngay_tham_chieu ? ` (${ngay(l.ngay_tham_chieu)})` : ""} — hạn {ngayGio(l.han)}</option>)}
            <option value="moi">Ghi lỗi mới (vd NCC báo trễ, hết hàng…)</option>
          </select>
          {!mo.length && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Dòng này không có lỗi chờ giải trình — giải trình sẽ ghi thành 1 lỗi mới.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label className="field-label">Ai <span className="req">*</span></label>
              <select className="select" value={aiMa} onChange={(e) => setAiMa(e.target.value)}>
                {ai.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Người cụ thể</label>
              <select className="select" value={aiEmail} onChange={(e) => setAiEmail(e.target.value)}>
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
          <label className="field-label" style={{ marginTop: 12 }}>Ảnh bằng chứng {canAnh ? <span className="req">* (bắt buộc)</span> : <span className="muted">(tuỳ chọn)</span>}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {anh.map((a, i) => (
              <span key={a.drive_file_id} className="badge issued" style={{ gap: 6 }}>
                <a href={a.url} target="_blank" rel="noopener" style={{ color: "inherit" }}>{a.name}</a>
                <span role="button" style={{ cursor: "pointer", fontWeight: 800, color: "var(--danger)" }} onClick={() => setAnh((x) => x.filter((_, j) => j !== i))}>×</span>
              </span>
            ))}
            <button className="btn sm" onClick={() => fileRef.current?.click()}><I.upload width={14} height={14} /> Thêm ảnh</button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </>
      )}
    </Modal>
  );
}

/** Lich su theo doi 1 dong: loi, giai trinh, push, mail, thay doi ngay du kien. */
export function LichSuModal({ dong, onClose }: { dong: Dong; onClose: () => void }) {
  const ls = useQuery({ queryKey: ["tl-dong", dong.item_id], queryFn: () => api.get<any>(`/theo-doi/dong/${dong.item_id}`) });
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  const d = ls.data;
  const H = ({ children }: any) => <div style={{ fontWeight: 700, fontSize: 13.5, margin: "14px 0 6px" }}>{children}</div>;
  return (
    <Modal title={`Lịch sử theo dõi — ${dong.part_code} (${dong.ma_phe_duyet || dong.eo_code})`} onClose={onClose} width={900}>
      {ls.isLoading || !d ? <Spinner /> : (
        <div style={{ fontSize: 12.5 }}>
          <div className="muted">{dong.part_name} · {dong.kho} · {dong.doi_tac ?? "—"} · đặt {soLuong(dong.so_luong_dat)}, về {soLuong(dong.sl_nhap_amis)} · bắt đầu theo dõi {ngayGio(dong.bat_dau)} · hạn có ngày DK {ngayGio(dong.han_ngay_du_kien)}</div>
          <H>Lỗi ({d.loi.length})</H>
          {d.loi.length === 0 ? <div className="muted">Không có lỗi.</div> : d.loi.map((l: any) => (
            <div key={l.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span className={`badge ${l.trang_thai === "CHO_GIAI_TRINH" ? "reject" : "nhap"}`}>{l.trang_thai === "CHO_GIAI_TRINH" ? "Chờ giải trình" : "Đã giải trình"}</span>{" "}
              <b>{QUY_TAC[l.quy_tac]}</b>{l.ngay_tham_chieu ? ` (${ngay(l.ngay_tham_chieu)})` : ""} · hạn {ngayGio(l.han)} · Ai: {tenDm("AI", l.ai_ma)}{l.ai_email ? ` (${ten(l.ai_email)})` : ""} · Lỗi: {tenDm("LOI", l.loi_ma)}
            </div>
          ))}
          <H>Giải trình ({d.giai_trinh.length})</H>
          {d.giai_trinh.length === 0 ? <div className="muted">Chưa có.</div> : d.giai_trinh.map((g: any) => (
            <div key={g.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <b>{ten(g.created_by)}</b> · {ngayGio(g.created_at)} · Ai: {tenDm("AI", g.ai_ma)}{g.ai_email ? ` (${ten(g.ai_email)})` : ""} · Lỗi: {tenDm("LOI", g.loi_ma)}
              <div>{g.noi_dung}</div>
              {(() => { try { return (JSON.parse(g.hinh_anh || "[]") as any[]).map((a) => <a key={a.drive_file_id} href={a.url} target="_blank" rel="noopener" style={{ marginRight: 8 }}>📷 {a.name}</a>); } catch { return null; } })()}
            </div>
          ))}
          <H>Push đối tác ({d.push.length})</H>
          {d.push.length === 0 ? <div className="muted">Chưa push.</div> : d.push.map((p: any) => (
            <div key={p.ma_push} style={{ padding: "4px 0" }}><b>{p.ma_push}</b> · {p.doi_tac} · {ngayGio(p.created_at)} · {ten(p.created_by)} · <span className="badge nhap">{p.trang_thai === "DA_TAO" ? "Đã tạo file" : p.trang_thai === "DA_GUI" ? "Đã gửi mail" : "Đối tác đã phản hồi"}</span></div>
          ))}
          <H>Mail ({d.mail.length})</H>
          {d.mail.length === 0 ? <div className="muted">Chưa có mail đồng bộ (app theo-doi-mua-hang).</div> : d.mail.map((m: any) => (
            <div key={m.id} style={{ padding: "4px 0" }}>{m.huong === "GUI" ? "→ Gửi" : "← Nhận"} · {ngayGio(m.thoi_gian)} · {m.tu} → {m.den} · <b>{m.tieu_de}</b>{m.tom_tat ? <div className="muted">{m.tom_tat}</div> : null}</div>
          ))}
          <H>Thay đổi ngày dự kiến ({d.ngay_du_kien.length})</H>
          {d.ngay_du_kien.map((e: any, i: number) => {
            let txt = "";
            try {
              const a = e.after_json ? JSON.parse(e.after_json) : null;
              txt = Array.isArray(a) ? a.map((x: any) => `${x.tuan ?? ngay(x.planned_date)}: ${soLuong(x.planned_qty)}`).join(", ") : a?.planned_date ? `${ngay(a.planned_date)}${a.planned_qty ? `: ${soLuong(a.planned_qty)}` : ""}` : e.event_type === "DELETE_PLAN" ? "Xóa mốc" : "";
            } catch { /* bo qua */ }
            return <div key={i} style={{ padding: "3px 0" }}>{ngayGio(e.created_at)} · {ten(e.user_email)} · {txt}</div>;
          })}
        </div>
      )}
    </Modal>
  );
}

/** Tao dot push doi tac cho cac dong (moi doi tac 1 file Excel chuan tai ve may) -> tra danh sach dot de hien PushKetQua. */
export async function taoPushDoiTac(ids: number[]): Promise<any[]> {
  const r = await api.post<any>("/theo-doi/push", { eo_item_ids: ids });
  for (const d of r.dot) {
    writeBook(d.ten_file, [{
      name: "PUSH",
      rows: [
        ["Mã push", d.ma_push, "", "Đối tác", d.doi_tac, "", "Vui lòng điền 3 cột vàng và giữ nguyên tên file + mã push khi trả lời"],
        [],
        ["ID dòng", "Mã phê duyệt", "Mã EO", "Mã linh kiện", "Tên linh kiện", "Kho nhận", "SL đặt", "SL còn thiếu", "Ngày đặt",
          "Ngày nhà máy cam kết giao (NCC điền)", "SL giao (NCC điền)", "Ghi chú NCC"],
        ...d.rows.map((x: Dong) => [x.id_dat_lk, x.ma_phe_duyet ?? "", x.eo_code, x.part_code, x.part_name, x.kho, x.so_luong_dat, x.so_luong_con_thieu, ngay(x.bat_dau), "", "", ""]),
      ],
      widths: [16, 14, 14, 16, 36, 24, 9, 11, 11, 22, 16, 30],
    }]);
  }
  return r.dot;
}

export function PushKetQua({ dot, onClose }: { dot: any[]; onClose: () => void }) {
  const copy = (t: string) => navigator.clipboard?.writeText(t);
  return (
    <Modal title="Đã tạo file push đối tác" onClose={onClose} wide footer={<button className="btn primary" onClick={onClose}>Xong</button>}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        File Excel đã tải về máy. Gửi mail cho đối tác từ <b>theodoimuahang@gmail.com</b> (hoặc CC địa chỉ này), giữ <b>nguyên tiêu đề</b> và
        <b> tên file</b> — hệ thống nhận diện luồng mail theo mã push.
      </div>
      {dot.map((d) => (
        <div key={d.ma_push} className="card card-pad" style={{ marginBottom: 8, fontSize: 13 }}>
          <b>{d.doi_tac}</b> · {d.rows.length} dòng · file <code>{d.ten_file}</code>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <input className="input" readOnly value={d.tieu_de} onFocus={(e) => e.target.select()} />
            <button className="btn sm" onClick={() => copy(d.tieu_de)}>Copy tiêu đề</button>
          </div>
        </div>
      ))}
    </Modal>
  );
}
