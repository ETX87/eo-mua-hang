import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Modal, Spinner } from "../../components/ui";
import { I } from "../../lib/icons";
import { ngay } from "../../lib/format";
import { gopTrung, lietKe } from "../../lib/gopTrung";
import { QUY_TAC, useDanhMuc } from "./shared";

type Anh = { name: string; drive_file_id: string; url: string };

/** Anh bang chung giai trinh (Google Drive, POST /theo-doi/upload). */
export function AnhBangChung({ anh, setAnh, batBuoc, setErr }: { anh: Anh[]; setAnh: (f: (a: Anh[]) => Anh[]) => void; batBuoc: boolean; setErr: (s: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (list: FileList | null) => {
    setErr("");
    for (const f of [...(list ?? [])]) {
      if (!/\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(f.name)) { setErr(`${f.name}: chỉ nhận ảnh`); continue; }
      try {
        const r = await api.postBinary<Anh>(`/theo-doi/upload?filename=${encodeURIComponent(f.name)}`, await f.arrayBuffer(), f.type || "image/jpeg");
        setAnh((a) => [...a, r]);
      } catch (e: any) {
        setErr(e?.body?.error === "GOOGLE_DRIVE_NOT_CONNECTED" ? "Chưa kết nối Google Drive (Admin › Cấu hình hệ thống)." : `Không tải được ${f.name}.`);
      }
    }
  };
  return (
    <>
      <label className="field-label" style={{ marginTop: 12 }}>Ảnh bằng chứng {batBuoc ? <span className="req">* (bắt buộc — có lỗi R1/R4)</span> : <span className="muted">(tuỳ chọn)</span>}</label>
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
    </>
  );
}

/**
 * Giai trinh CHUNG cho ca PO (1 EO / ma 3TDO) - POST /vi-pham/giai-trinh-po. 1 noi dung dong loi cua moi dong linh kien
 * duoc chon trong PO (moi dong van luu 1 giai trinh rieng, danh dau "chung PO"). Khong con loi cho -> ghi loi moi cho ca PO.
 */
export function GiaiTrinhPoModal({ eoId, onClose, onSaved }: { eoId: number; onClose: () => void; onSaved: (kq: { so_dong: number; so_loi: number }) => void }) {
  const q = useQuery({ queryKey: ["vi-pham-po", eoId], queryFn: () => api.get<any>(`/vi-pham/po/${eoId}`) });
  const dm = useDanhMuc();
  const users = useQuery({ queryKey: ["users-min"], queryFn: () => api.get<any[]>("/users/directory") });
  const loi: any[] = q.data?.loi ?? [];
  const dongMo: any[] = q.data?.dong_mo ?? [];
  const coLoi = loi.length > 0;
  const [cheDo, setCheDo] = useState<"cho" | "moi" | null>(null);
  const moi = cheDo ? cheDo === "moi" : !coLoi;
  const quyTacCo = [...new Set(loi.map((l) => l.quy_tac))];
  const [qt, setQt] = useState<Set<string> | null>(null); // null = tat ca
  const [boDong, setBoDong] = useState<Set<number>>(new Set());
  const [aiMa, setAiMa] = useState("NGUOI_DAT");
  const [aiEmail, setAiEmail] = useState("");
  const [loiMa, setLoiMa] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [anh, setAnh] = useState<Anh[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // dong linh kien se duoc giai trinh (gom loi theo dong)
  const dongs = useMemo(() => {
    if (moi) return dongMo.map((d) => ({ item_id: d.item_id, part_code: d.part_code, part_name: d.part_name, loi: [] as any[] }));
    const loc = loi.filter((l) => !qt || qt.has(l.quy_tac));
    return gopTrung(loc, (l) => String(l.eo_item_id)).map(({ x, ds }) => ({ item_id: x.eo_item_id, part_code: x.part_code, part_name: x.part_name, loi: ds }));
  }, [moi, loi, dongMo, qt]);
  const chon = dongs.filter((d) => !boDong.has(d.item_id));
  const canAnh = !moi && chon.some((d) => d.loi.some((l: any) => l.quy_tac === "R1" || l.quy_tac === "R4"));
  const soLoi = moi ? chon.length : chon.reduce((s, d) => s + d.loi.length, 0);

  const save = async () => {
    setErr("");
    if (!chon.length) return setErr("Chưa chọn dòng nào.");
    if (!loiMa) return setErr("Chọn Lỗi gì.");
    if (!noiDung.trim()) return setErr("Nhập nội dung giải trình.");
    if (canAnh && !anh.length) return setErr("Có lỗi R1/R4 — bắt buộc ảnh bằng chứng.");
    if (!confirm(`Giải trình chung ${soLoi} lỗi trên ${chon.length} dòng linh kiện của PO này bằng 1 nội dung?`)) return;
    setBusy(true);
    try {
      const kq = await api.post<{ so_dong: number; so_loi: number }>("/vi-pham/giai-trinh-po", {
        eo_id: eoId, moi, quy_tac: !moi && qt ? [...qt] : [], eo_item_ids: boDong.size ? chon.map((d) => d.item_id) : [],
        ai_ma: aiMa, ai_email: aiEmail || undefined, loi_ma: loiMa, noi_dung: noiDung.trim(), hinh_anh: anh,
      });
      onSaved(kq);
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "CAN_HINH_ANH" ? "Bắt buộc có ảnh bằng chứng." : c === "KHONG_CO_LOI" ? "PO không còn lỗi chờ giải trình (có thể vừa được giải trình)." : c === "KHONG_CO_DONG" ? "PO không còn dòng đang theo dõi." : c === "READ_ONLY" ? "Bạn không có quyền giải trình PO này." : "Lỗi lưu giải trình.");
      setBusy(false);
    }
  };
  const ai = (dm.data ?? []).filter((x) => x.loai === "AI" && x.active);
  const dmLoi = (dm.data ?? []).filter((x) => x.loai === "LOI" && x.active);
  const eo = q.data?.eo;
  return (
    <Modal title={`Giải trình chung cả PO — ${eo?.approval_code || eo?.eo_code || ""}`} onClose={onClose} width={860}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy || !chon.length} onClick={save}>{busy ? "Đang lưu..." : `Gửi giải trình (${chon.length} dòng · ${soLoi} lỗi)`}</button></>}>
      {q.isLoading ? <Spinner /> : (
        <div style={{ fontSize: 13 }}>
          <div className="qv-alert warn" style={{ display: "block", marginBottom: 10 }}>
            1 nội dung giải trình áp dụng cho <b>mọi dòng linh kiện được chọn</b> trong PO — dùng khi các dòng có <b>cùng nguyên nhân</b>
            (vd NCC báo trễ cả đơn). Dòng có nguyên nhân khác: bỏ tick, giải trình riêng.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <button className={`qv-chip ${!moi ? "on" : ""}`} disabled={!coLoi} onClick={() => { setCheDo("cho"); setBoDong(new Set()); }}>Lỗi đang chờ ({loi.length})</button>
            <button className={`qv-chip ${moi ? "on" : ""}`} onClick={() => { setCheDo("moi"); setBoDong(new Set()); }}>Ghi lỗi mới cho cả PO ({dongMo.length} dòng đang theo dõi)</button>
            {!moi && quyTacCo.length > 1 && <span className="muted" style={{ fontSize: 12, alignSelf: "center", marginLeft: 8 }}>Loại lỗi:</span>}
            {!moi && quyTacCo.length > 1 && quyTacCo.map((k) => (
              <button key={k} className={`qv-chip ${!qt || qt.has(k) ? "on" : ""}`}
                onClick={() => setQt((s) => { const n = new Set(s ?? quyTacCo); if (n.has(k)) n.delete(k); else n.add(k); return n.size === quyTacCo.length ? null : n; })}>{QUY_TAC[k] ?? k}</button>
            ))}
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 220, overflow: "auto" }}>
            <table className="tbl tbl-dense">
              <thead><tr><th style={{ width: 34 }}><input type="checkbox" checked={boDong.size === 0} onChange={() => setBoDong(boDong.size ? new Set() : new Set(dongs.map((d) => d.item_id)))} /></th><th>Mã linh kiện</th><th>Tên</th><th>Lỗi sẽ đóng</th></tr></thead>
              <tbody>
                {dongs.length === 0 && <tr><td colSpan={4} className="muted">Không có dòng nào.</td></tr>}
                {dongs.map((d) => (
                  <tr key={d.item_id} style={{ opacity: boDong.has(d.item_id) ? 0.45 : 1 }}>
                    <td><input type="checkbox" checked={!boDong.has(d.item_id)} onChange={() => setBoDong((s) => { const n = new Set(s); if (n.has(d.item_id)) n.delete(d.item_id); else n.add(d.item_id); return n; })} /></td>
                    <td><b>{d.part_code}</b></td>
                    <td>{d.part_name}</td>
                    <td style={{ fontSize: 12 }}>{moi ? <span className="muted">Ghi 1 lỗi mới (đã giải trình)</span>
                      : gopTrung(d.loi, (l: any) => l.quy_tac).map(({ x, ds }) => `${QUY_TAC[x.quy_tac] ?? x.quy_tac}${ds.length > 1 ? ` × ${ds.length} (${lietKe(ds.map((y: any) => ngay(y.ngay_tham_chieu ?? y.han)), 3)})` : ""}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label className="field-label">Ai chịu trách nhiệm <span className="req">*</span></label>
              <select className="select" value={aiMa} onChange={(e) => setAiMa(e.target.value)}>{ai.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}</select>
            </div>
            <div>
              <label className="field-label">Người cụ thể</label>
              <select className="select" value={aiEmail} onChange={(e) => setAiEmail(e.target.value)}>
                <option value="">— Không chọn —</option>
                {(users.data ?? []).map((u: any) => <option key={u.email} value={u.email}>{u.ho_ten ? `${u.ho_ten} (${u.email})` : u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Lỗi gì <span className="req">*</span></label>
              <select className="select" value={loiMa} onChange={(e) => setLoiMa(e.target.value)}>
                <option value="">Chọn lỗi</option>
                {dmLoi.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}
              </select>
            </div>
          </div>
          <label className="field-label" style={{ marginTop: 12 }}>Nội dung giải trình chung <span className="req">*</span></label>
          <textarea className="textarea" value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="Nguyên nhân chung của cả PO, đã làm gì, khi nào có ngày dự kiến…" />
          <AnhBangChung anh={anh} setAnh={setAnh} batBuoc={canAnh} setErr={setErr} />
          {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </Modal>
  );
}

/**
 * Giai trinh 1 lan cho NHIEU loi CUNG LOAI duoc chon o man Vi pham (co the nhieu linh kien / nhieu PO) - POST /vi-pham/giai-trinh-nhieu.
 * nhom = cac nhom loi da chon (1 nhom = 1 linh kien x 1 loai loi, ds = cac lan loi dang cho).
 */
export function GiaiTrinhNhieuModal({ nhom, onClose, onSaved }: {
  nhom: { x: any; ds: any[] }[]; onClose: () => void; onSaved: (kq: { so_dong: number; so_loi: number; so_po: number }) => void;
}) {
  const dm = useDanhMuc();
  const users = useQuery({ queryKey: ["users-min"], queryFn: () => api.get<any[]>("/users/directory") });
  const quyTac = nhom[0]?.x.quy_tac as string;
  const ids = nhom.flatMap((n) => n.ds.filter((l) => l.trang_thai === "CHO_GIAI_TRINH").map((l) => l.id));
  const soPo = new Set(nhom.map((n) => n.x.eo_id)).size;
  const [aiMa, setAiMa] = useState("NGUOI_DAT");
  const [aiEmail, setAiEmail] = useState("");
  const [loiMa, setLoiMa] = useState(quyTac === "R1" ? "KHONG_NDK_24H" : quyTac === "R3" ? "KHONG_PUSH" : quyTac === "R4" ? "KHONG_NDK_QUA_HAN" : "");
  const [noiDung, setNoiDung] = useState("");
  const [anh, setAnh] = useState<Anh[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canAnh = quyTac === "R1" || quyTac === "R4";
  const save = async () => {
    setErr("");
    if (!loiMa) return setErr("Chọn Lỗi gì.");
    if (!noiDung.trim()) return setErr("Nhập nội dung giải trình.");
    if (canAnh && !anh.length) return setErr("Loại lỗi này bắt buộc ảnh bằng chứng.");
    setBusy(true);
    try {
      onSaved(await api.post("/vi-pham/giai-trinh-nhieu", { loi_ids: ids, ai_ma: aiMa, ai_email: aiEmail || undefined, loi_ma: loiMa, noi_dung: noiDung.trim(), hinh_anh: anh }));
    } catch (e: any) {
      const c = e?.body?.error;
      setErr(c === "KHAC_LOAI" ? "Chỉ giải trình chung được các lỗi cùng loại." : c === "CAN_HINH_ANH" ? "Bắt buộc có ảnh bằng chứng." : c === "KHONG_CO_LOI" ? "Các lỗi đã chọn đã được giải trình." : c === "READ_ONLY" ? "Bạn không có quyền giải trình một số PO đã chọn." : "Lỗi lưu giải trình.");
      setBusy(false);
    }
  };
  const ai = (dm.data ?? []).filter((x) => x.loai === "AI" && x.active);
  const dmLoi = (dm.data ?? []).filter((x) => x.loai === "LOI" && x.active);
  return (
    <Modal title={`Giải trình chung ${ids.length} lỗi “${QUY_TAC[quyTac] ?? quyTac}”`} onClose={onClose} width={860}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Đang lưu..." : `Gửi giải trình (${nhom.length} linh kiện · ${soPo} PO)`}</button></>}>
      <div style={{ fontSize: 13 }}>
        <div className="qv-alert warn" style={{ display: "block", marginBottom: 10 }}>
          1 nội dung giải trình cho <b>{ids.length} lỗi cùng loại</b> trên <b>{nhom.length} linh kiện</b> thuộc <b>{soPo} PO</b> — dùng khi các lỗi có cùng nguyên nhân.
        </div>
        <div className="tbl-wrap" style={{ maxHeight: 220, overflow: "auto" }}>
          <table className="tbl tbl-dense">
            <thead><tr><th>PO</th><th>Mã linh kiện</th><th>Tên</th><th>Số lần</th><th>Ngày vi phạm</th></tr></thead>
            <tbody>{nhom.map((n) => (
              <tr key={`${n.x.eo_item_id}|${n.x.quy_tac}`}><td>{n.x.approval_code || n.x.eo_code}</td><td><b>{n.x.part_code}</b></td><td>{n.x.part_name}</td>
                <td>{n.ds.length}</td><td style={{ fontSize: 12 }}>{lietKe(n.ds.map((y: any) => ngay(y.ngay_tham_chieu ?? y.han)), 4)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
          <div>
            <label className="field-label">Ai chịu trách nhiệm <span className="req">*</span></label>
            <select className="select" value={aiMa} onChange={(e) => setAiMa(e.target.value)}>{ai.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}</select>
          </div>
          <div>
            <label className="field-label">Người cụ thể</label>
            <select className="select" value={aiEmail} onChange={(e) => setAiEmail(e.target.value)}>
              <option value="">— Không chọn —</option>
              {(users.data ?? []).map((u: any) => <option key={u.email} value={u.email}>{u.ho_ten ? `${u.ho_ten} (${u.email})` : u.email}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Lỗi gì <span className="req">*</span></label>
            <select className="select" value={loiMa} onChange={(e) => setLoiMa(e.target.value)}>
              <option value="">Chọn lỗi</option>
              {dmLoi.map((x) => <option key={x.ma} value={x.ma}>{x.ten}</option>)}
            </select>
          </div>
        </div>
        <label className="field-label" style={{ marginTop: 12 }}>Nội dung giải trình chung <span className="req">*</span></label>
        <textarea className="textarea" value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="Nguyên nhân chung, đã làm gì, khi nào có ngày dự kiến…" />
        <AnhBangChung anh={anh} setAnh={setAnh} batBuoc={canAnh} setErr={setErr} />
        {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>
    </Modal>
  );
}
