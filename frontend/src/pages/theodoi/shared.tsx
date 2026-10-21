import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal, Spinner } from "../../components/ui";
import { I } from "../../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../../lib/format";
import { normKey } from "../../lib/excel";

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

/** Cap nhat nhanh 1 moc ngay du kien (them item_plan) - so luong mac dinh = con thieu. */
export function NgayDuKienModal({ dong, onClose, onSaved }: { dong: Dong; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState("");
  const [qty, setQty] = useState(String(dong.so_luong_con_thieu || ""));
  const [nm, setNm] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr("");
    if (!date) return setErr("Chọn ngày dự kiến.");
    if (!(Number(qty) > 0)) return setErr("Nhập số lượng > 0.");
    setBusy(true);
    try {
      await api.post("/plans", { eo_item_id: dong.item_id, planned_date: date, planned_qty: Number(qty), factory_committed_date: nm || null, ghi_chu: note.trim() || null });
      onSaved();
    } catch (e: any) {
      setErr(e?.body?.error === "PLAN_EXCEEDS_QTY" ? `Vượt SL đặt — đã lên kế hoạch ${soLuong(e.body.planned_sum)} / ${soLuong(e.body.current_qty)}. Sửa / xóa mốc cũ ở Chi tiết EO.` :
        e?.body?.error === "READ_ONLY" ? "Bạn không có quyền cập nhật kế hoạch dòng này." : "Lỗi lưu ngày dự kiến.");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Cập nhật ngày dự kiến — ${dong.part_code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>Lưu</button></>}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        {dong.ma_phe_duyet || dong.eo_code} · {dong.part_name} · {dong.kho} · còn thiếu <b>{soLuong(dong.so_luong_con_thieu)}</b>
        {dong.ngay_du_kien_gan_nhat && <> · ngày DK hiện tại <b>{ngay(dong.ngay_du_kien_gan_nhat)}</b></>}
      </div>
      <label className="field-label">Ngày dự kiến hàng về <span className="req">*</span></label>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Số lượng <span className="req">*</span></label>
      <input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Ngày NCC cam kết</label>
      <input className="input" type="date" value={nm} onChange={(e) => setNm(e.target.value)} />
      <label className="field-label" style={{ marginTop: 12 }}>Ghi chú</label>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: KRF báo giao đợt 1" />
      {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
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
