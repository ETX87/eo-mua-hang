import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Spinner } from "../../components/ui";
import { soLuong } from "../../lib/format";

type Loai = "DOI_TAC" | "LY_DO";
interface Chua { gia_tri: string; so_dong: number; goi_y: string | null }
interface Data {
  danh_muc: { loai: Loai; ten: string; active: number }[];
  bi_danh: { loai: Loai; khoa: string; ten_chuan: string }[];
  DOI_TAC: { dung: Record<string, number>; chua: Chua[] };
  LY_DO: { dung: Record<string, number>; chua: Chua[] };
}

/**
 * Danh muc chuan Doi tac / Ly do PS (2026-11-08, backend routes/danhMuc /chuan, lib/chuanHoa). Moi duong nhap dong linh kien
 * tu quy doi bi danh (KRF / KAROFI -> Karofi); gia tri la bi chan. Tab nay: danh sach chuan + bi danh + so dong dang dung,
 * va "Giá trị chưa chuẩn" con trong du lieu -> chon gia tri chuan -> Chuyển (giu ban goc o *_goc, them bi danh).
 */
export default function DoiTacLyDo() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dm-chuan"], queryFn: () => api.get<Data>("/danh-muc/chuan") });
  const [loai, setLoai] = useState<Loai>("DOI_TAC");
  const [moi, setMoi] = useState("");
  const [chon, setChon] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lamMoi = () => { qc.invalidateQueries({ queryKey: ["dm-chuan"] }); qc.invalidateQueries({ queryKey: ["goi-y-dong"] }); };
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  const ds = d.danh_muc.filter((x) => x.loai === loai);
  const bd = d.bi_danh.filter((x) => x.loai === loai);
  const chua = d[loai].chua;
  const ten = loai === "DOI_TAC" ? "đối tác" : "lý do";

  const put = async (body: any, loi = "Lỗi lưu.") => {
    setBusy(true);
    try { await api.put("/danh-muc/chuan", { loai, ...body }); lamMoi(); }
    catch (e: any) { alert(e?.body?.error === "DA_CO" ? `Đã có "${e.body.ten_chuan}" (trùng tên hoặc bí danh).` : e?.body?.error === "LY_DO_CO_DINH" ? "Lý do phát sinh cố định 4 giá trị." : loi); }
    finally { setBusy(false); }
  };
  const chuyen = async (gt: string[], tenChuan: string) => {
    if (!tenChuan) return alert("Chọn giá trị chuẩn.");
    const n = chua.filter((x) => gt.includes(x.gia_tri)).reduce((s, x) => s + x.so_dong, 0);
    if (!confirm(`Chuyển ${gt.length} giá trị (${soLuong(n)} dòng) thành "${tenChuan}"? Bản gốc vẫn được lưu; lần sau nhập giá trị này sẽ tự quy đổi.`)) return;
    setBusy(true);
    try { await api.post("/danh-muc/chuan/chuyen", { loai, gia_tri: gt, ten_chuan: tenChuan, ghi_chu: loai === "LY_DO" }); lamMoi(); }
    catch { alert("Lỗi chuyển dữ liệu."); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["DOI_TAC", "LY_DO"] as Loai[]).map((k) => (
          <button key={k} className={`qv-chip ${loai === k ? "on" : ""}`} onClick={() => setLoai(k)}>
            {k === "DOI_TAC" ? "Đối tác (NCC)" : "Lý do phát sinh"}{d[k].chua.length ? <b style={{ color: "var(--danger-ink)", marginLeft: 4 }}>· {d[k].chua.length} chưa chuẩn</b> : null}
          </button>
        ))}
      </div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Người dùng chỉ chọn được giá trị chuẩn. Gõ bí danh (vd <b>KRF</b>, <b>KAROFI</b>) hệ thống tự lưu thành tên chuẩn (<b>Karofi</b>); giá trị lạ bị chặn.
        {loai === "LY_DO" && " Lý do phát sinh cố định 4 giá trị."}
      </div>

      {chua.length > 0 && (
        <div style={{ border: "1px solid #FECACA", background: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 14 }}>
          <b>Giá trị chưa chuẩn còn trong dữ liệu ({chua.length})</b>
          <table className="tbl tbl-dense" style={{ marginTop: 6 }}>
            <thead><tr><th>Giá trị đang lưu</th><th style={{ textAlign: "right" }}>Số dòng</th><th>Chuyển thành</th><th /></tr></thead>
            <tbody>{chua.map((x) => (
              <tr key={x.gia_tri}>
                <td>{x.gia_tri}</td><td style={{ textAlign: "right" }}>{soLuong(x.so_dong)}</td>
                <td><select className="select" style={{ height: 30, padding: "2px 8px", width: 230 }} value={chon[x.gia_tri] ?? x.goi_y ?? ""} onChange={(e) => setChon((c) => ({ ...c, [x.gia_tri]: e.target.value }))}>
                  <option value="">Chọn {ten} chuẩn…</option>{ds.filter((y) => y.active).map((y) => <option key={y.ten} value={y.ten}>{y.ten}</option>)}</select></td>
                <td><button className="btn sm primary" disabled={busy} onClick={() => chuyen([x.gia_tri], chon[x.gia_tri] ?? x.goi_y ?? "")}>Chuyển</button></td>
              </tr>
            ))}</tbody>
          </table>
          {loai === "LY_DO" && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Lý do cũ được chép vào Ghi chú của dòng ("Lý do cũ: …") để không mất thông tin.</div>}
        </div>
      )}

      <table className="tbl tbl-dense">
        <thead><tr><th>{loai === "DOI_TAC" ? "Đối tác chuẩn" : "Lý do chuẩn"}</th><th style={{ textAlign: "right" }}>Số dòng</th><th>Bí danh (tự quy đổi)</th><th>Đang dùng</th><th /></tr></thead>
        <tbody>{ds.map((x) => (
          <tr key={x.ten} style={{ opacity: x.active ? 1 : 0.5 }}>
            <td><b>{x.ten}</b></td>
            <td style={{ textAlign: "right" }}>{soLuong(d[loai].dung[x.ten] ?? 0)}</td>
            <td style={{ fontSize: 12 }} className="muted">{bd.filter((b) => b.ten_chuan === x.ten).map((b) => b.khoa).join(", ")}</td>
            <td><input type="checkbox" checked={!!x.active} disabled={busy} onChange={(e) => put({ ten: x.ten, active: e.target.checked ? 1 : 0 })} /></td>
            <td><button className="btn ghost sm" disabled={busy} onClick={() => { const t = prompt(`Đổi tên "${x.ten}" thành (đổi luôn mọi dòng đang dùng):`, x.ten); if (t?.trim() && t.trim() !== x.ten) put({ ten: x.ten, ten_moi: t.trim() }); }}>Đổi tên</button></td>
          </tr>
        ))}</tbody>
      </table>
      {loai === "DOI_TAC" && (
        <div style={{ display: "flex", gap: 6, marginTop: 12, maxWidth: 420 }}>
          <input className="input" placeholder="Thêm đối tác mới (tên chuẩn)…" value={moi} onChange={(e) => setMoi(e.target.value)} />
          <button className="btn primary" disabled={busy || !moi.trim()} onClick={async () => { await put({ ten: moi.trim() }); setMoi(""); }}>Thêm</button>
        </div>
      )}
    </div>
  );
}
