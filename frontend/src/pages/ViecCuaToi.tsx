import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card, PageHeader, Spinner } from "../components/ui";
import { EoLink, DongLink } from "../components/quickview/QuickView";
import { soLuong, ten } from "../lib/format";
import { gioTxt } from "../lib/giaiDoan";
import { Kho } from "../lib/kho";
import { exportRowsToXlsx, type ExportCol } from "../lib/exportXlsx";
import { NgayHangVeModal, GiaiTrinhModal, LienHeDoiTacModal, type Dong } from "./theodoi/shared";
import { GiaiTrinhDongModal } from "./theodoi/GiaiTrinhPo";

/**
 * MAN "VIỆC CỦA TÔI" (v0.104, yeu cau 2026-11-19): nhan vien nhin 1 lan biet phai lam gi, o dau, truoc han nao.
 * Du lieu GET /api/viec-cua-toi (backend routes/viecCuaToi.ts). 4 viec, moi dong co HAN (gio lam viec con lai) + 1 nut lam ngay:
 *  ① Nhap ngay du kien (R1)  ② Push NCC thu 2/4 (R3, soan mail Gmail co san / ghi nhan goi-Zalo)  ③ Qua ngay DK -> ngay moi (R4)  ④ Giai trinh loi.
 */
type V = Dong & { han: string | null; con_gio: number | null; loi_qt_cho?: string };
interface Data {
  ndk: V[]; push: V[]; ngay_moi: V[]; giai_trinh: V[]; cho_ncc?: (V & { cho_ncc_ket_qua?: string; cho_ncc_tu?: string })[]; ngay_push: boolean; ngay_push_ke: string; hom_nay: string; luc: string;
  toan_bo: boolean; pham_vi: string; gio_tu_dong: number;
}
const THU = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const thuNgay = (d: string) => `${THU[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hanTxt = (h: string | null) => (h ? `${thuNgay(h.slice(0, 10))} ${h.slice(11, 16)}` : "");
const CC = "theodoimuahang@gmail.com";
const QT: Record<string, string> = { R1: "chưa có ngày DK", R3: "không push NCC", R4: "quá ngày DK", TAY: "lỗi ghi tay" };
const dm = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

/** Xuat Excel 1 muc (v0.107, yeu cau 2026-11-20 "xuat file excel cua moi 1 phan loai"). */
function xuatMuc(rows: V[], ten: string, chu = "Hạn") {
  const cols: ExportCol<V>[] = [
    { header: chu, get: (v) => (v.han ? `${dm(v.han)} ${v.han.slice(11, 16)}` : "") },
    { header: "Còn / trễ (giờ LV)", get: (v) => v.con_gio == null ? "" : Math.round(v.con_gio * 10) / 10 },
    { header: "PO", get: (v) => v.ma_phe_duyet || v.eo_code },
    { header: "Mã EO", get: (v) => v.eo_code },
    { header: "Người đặt", get: (v) => v.nguoi_dat ?? "" },
    { header: "Mã linh kiện", get: (v) => v.part_code },
    { header: "Tên linh kiện", get: (v) => v.part_name },
    { header: "Kho", get: (v) => v.kho },
    { header: "Nhà cung cấp", get: (v) => v.doi_tac ?? "" },
    { header: "Ngày ban hành PO", get: (v) => dm(v.ngay_ban_hanh) },
    { header: "Ngày dự kiến", get: (v) => dm(v.ngay_du_kien_gan_nhat) },
    { header: "Ngày NCC cam kết", get: (v) => dm(v.ngay_nm_cam_ket) },
    { header: "SL đặt", get: (v) => v.so_luong_dat },
    { header: "SL đã về (AMIS)", get: (v) => v.sl_nhap_amis },
    { header: "Còn thiếu", get: (v) => v.so_luong_con_thieu },
    { header: "Lỗi chờ giải trình", get: (v) => v.so_loi_cho_gt || "" },
    { header: "Loại lỗi chờ", get: (v) => (v.loi_qt_cho ? v.loi_qt_cho.split(",").map((k) => QT[k] ?? k).join(", ") : "") },
  ];
  exportRowsToXlsx(rows, cols, `viec-cua-toi_${ten}_${new Date().toISOString().slice(0, 10)}.xlsx`, ten.slice(0, 31));
}

/** O han: con bao nhieu gio lam viec - mau theo muc gap. */
function Han({ v, chu }: { v: V; chu?: string }) {
  if (v.con_gio == null) return <span className="muted">—</span>;
  const tre = v.con_gio < 0;
  const g = Math.abs(v.con_gio);
  const [nen, mau] = tre ? ["#FEE2E2", "#B91C1C"] : g <= 4 ? ["#FFEDD5", "#C2410C"] : g <= 8 ? ["#FEF9C3", "#A16207"] : ["#ECFDF5", "#047857"];
  return (
    <div style={{ minWidth: 118 }}>
      <span style={{ background: nen, color: mau, fontWeight: 800, fontSize: 12, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>
        {tre ? `Trễ ${gioTxt(g)}` : `Còn ${gioTxt(g)}`}</span>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{chu ?? "hạn"} {hanTxt(v.han)}</div>
    </div>
  );
}

function Bang({ rows, nut, chu, phu }: { rows: V[]; nut: (v: V) => ReactNode; chu?: string; phu?: (v: V) => ReactNode }) {
  return (
    <table className="tbl tbl-dense" style={{ width: "100%" }}>
      <thead><tr><th style={{ width: 130 }}>Hạn</th><th>PO</th><th>Linh kiện</th><th>Kho</th><th>Nhà cung cấp</th><th>Ngày dự kiến</th><th style={{ textAlign: "right" }}>SL đặt</th><th style={{ textAlign: "right" }}>Còn thiếu</th><th style={{ width: 170 }}></th></tr></thead>
      <tbody>
        {rows.map((v) => (
          <tr key={v.item_id}>
            <td><Han v={v} chu={chu} /></td>
            <td><EoLink id={v.eo_id}>{v.ma_phe_duyet || v.eo_code}</EoLink>{v.nguoi_dat && <div className="muted" style={{ fontSize: 11 }}>{ten(v.nguoi_dat)}</div>}</td>
            <td><DongLink id={v.item_id} ma={v.part_code} /><div className="muted" style={{ fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.part_name}</div>{phu?.(v)}</td>
            <td>{v.kho ? <Kho t={v.kho} /> : <span className="muted">—</span>}</td>
            <td>{v.doi_tac || <span className="muted">—</span>}</td>
            <td style={{ whiteSpace: "nowrap" }}>{v.ngay_du_kien_gan_nhat
              ? <span title={v.ngay_nm_cam_ket ? `NCC cam kết ${dm(v.ngay_nm_cam_ket)}` : undefined}>{dm(v.ngay_du_kien_gan_nhat)}</span>
              : <span className="muted">chưa có</span>}
              {v.ngay_nm_cam_ket && v.ngay_nm_cam_ket !== v.ngay_du_kien_gan_nhat && <div className="muted" style={{ fontSize: 11 }}>NCC {dm(v.ngay_nm_cam_ket)}</div>}</td>
            <td style={{ textAlign: "right" }}>{soLuong(v.so_luong_dat)}</td>
            <td style={{ textAlign: "right" }}><b>{soLuong(v.so_luong_con_thieu)}</b></td>
            <td style={{ textAlign: "right" }}>{nut(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Muc({ id, so, tieuDe, lamGi, n, mau, xuat, children }: { id: string; so: string; tieuDe: string; lamGi: ReactNode; n: number; mau: string; xuat?: () => void; children: ReactNode }) {
  return (
    <Card>
      <div id={id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 30, height: 30, borderRadius: 99, background: n ? mau : "#E5E7EB", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>{so}</span>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{tieuDe} <span style={{ color: n ? mau : "var(--text-muted)" }}>({soLuong(n)})</span></div>
        {xuat && n > 0 && <button className="btn sm" style={{ marginLeft: "auto" }} onClick={xuat}>⬇ Xuất Excel</button>}
      </div>
      <div style={{ fontSize: 13, background: "var(--panel-2, #F8FAFC)", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{lamGi}</div>
      {n ? children : <div style={{ color: "var(--ok-ink)", fontSize: 13 }}>✓ Không có việc ở mục này.</div>}
    </Card>
  );
}

/**
 * Muc 4 GIAI TRINH (v0.114, chu he thong 2026-11-23: "nhom cac van de can giai trinh theo PO hoac ma linh kien, vi chung ta co chuc nang giai trinh
 * hang loat => tan dung toi da"). Xem: tung dong | theo PO | theo ma LK (localStorage). Tick dong / ca nhom -> "Giai trinh chung" = GiaiTrinhDongModal
 * (POST /vi-pham/giai-trinh-dong: 1 noi dung dong MOI loi cho cua cac dong, nhieu PO / nhieu loai). Tieu de nhom: so dong, so loi, han som nhat + nut ca nhom.
 */
type XemGt = "dong" | "po" | "lk";
const KHOA_XEM_GT = "vct-gt-xem";
function BangGiaiTrinh({ rows, onMot, onNhieu }: { rows: V[]; onMot: (v: V) => void; onNhieu: (ds: V[]) => void }) {
  const [xem, setXemS] = useState<XemGt>(() => (localStorage.getItem(KHOA_XEM_GT) as XemGt) || "po");
  const setXem = (x: XemGt) => { setXemS(x); localStorage.setItem(KHOA_XEM_GT, x); };
  const [chon, setChon] = useState<Set<number>>(new Set());
  const doi = (ids: number[], bat: boolean) => setChon((s) => { const n = new Set(s); ids.forEach((id) => (bat ? n.add(id) : n.delete(id))); return n; });
  const khoa = (v: V) => (xem === "po" ? String(v.eo_id) : xem === "lk" ? v.part_code : String(v.item_id));
  const nhom = useMemo(() => {
    const m = new Map<string, V[]>();
    for (const v of rows) { const k = khoa(v); m.set(k, [...(m.get(k) ?? []), v]); }
    // nhom co han som nhat len dau (rows da sap theo han)
    return [...m.entries()];
  }, [rows, xem]); // eslint-disable-line react-hooks/exhaustive-deps
  const daChon = rows.filter((v) => chon.has(v.item_id));
  const soLoi = (ds: V[]) => ds.reduce((t, v) => t + (v.so_loi_cho_gt || 0), 0);
  const tatCa = rows.length > 0 && daChon.length === rows.length;
  const NutXem = ({ k, l }: { k: XemGt; l: string }) => <button className={`btn sm ${xem === k ? "primary" : ""}`} onClick={() => setXem(k)}>{l}</button>;
  const dong = (v: V, thut = false) => (
    <tr key={v.item_id} style={{ background: chon.has(v.item_id) ? "#F5F3FF" : undefined }}>
      <td style={{ width: 28, paddingLeft: thut ? 22 : undefined }}><input type="checkbox" checked={chon.has(v.item_id)} onChange={(e) => doi([v.item_id], e.target.checked)} /></td>
      <td><Han v={v} chu="tự đóng" /></td>
      <td>{xem === "po" ? <span className="muted">↳</span> : <EoLink id={v.eo_id}>{v.ma_phe_duyet || v.eo_code}</EoLink>}</td>
      <td>{xem === "lk" ? <span className="muted">↳</span> : <DongLink id={v.item_id} ma={v.part_code} />}
        <div className="muted" style={{ fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{xem === "lk" ? <EoLink id={v.eo_id}>{v.ma_phe_duyet || v.eo_code}</EoLink> : v.part_name}</div></td>
      <td>{v.kho ? <Kho t={v.kho} /> : <span className="muted">—</span>}</td>
      <td>{v.doi_tac || <span className="muted">—</span>}</td>
      <td><b style={{ color: "#7C3AED" }}>{v.so_loi_cho_gt}</b>{v.loi_qt_cho ? <div style={{ fontSize: 11, color: "#7C3AED" }}>{v.loi_qt_cho.split(",").map((k) => QT[k] ?? k).join(" · ")}</div> : null}</td>
      <td style={{ textAlign: "right" }}><button className="btn sm" style={{ borderColor: "#7C3AED", color: "#7C3AED", fontWeight: 700 }} onClick={() => onMot(v)}>✍ Giải trình ({v.so_loi_cho_gt})</button></td>
    </tr>
  );
  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>Xem:</span>
        <NutXem k="po" l="Theo PO" /><NutXem k="lk" l="Theo mã linh kiện" /><NutXem k="dong" l="Từng dòng" />
        <span className="muted" style={{ fontSize: 12 }}>· {nhom.length} {xem === "po" ? "PO" : xem === "lk" ? "mã LK" : "dòng"}, {rows.length} dòng, {soLoi(rows)} lỗi</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {daChon.length > 0 && <button className="btn sm ghost" onClick={() => setChon(new Set())}>Bỏ chọn</button>}
          <button className="btn sm primary" disabled={!daChon.length} title="1 nội dung giải trình cho mọi lỗi chờ của các dòng đã chọn (nhiều PO, nhiều loại lỗi)" onClick={() => onNhieu(daChon)}>
            ✍ Giải trình chung{daChon.length ? ` (${daChon.length} dòng · ${soLoi(daChon)} lỗi)` : " — tick dòng / nhóm"}</button>
        </span>
      </div>
      <table className="tbl tbl-dense" style={{ width: "100%" }}>
        <thead><tr><th style={{ width: 28 }}><input type="checkbox" title="Chọn tất cả" checked={tatCa} onChange={(e) => doi(rows.map((v) => v.item_id), e.target.checked)} /></th>
          <th style={{ width: 130 }}>Hạn tự đóng</th><th>PO</th><th>Linh kiện</th><th>Kho</th><th>Nhà cung cấp</th><th>Lỗi chờ</th><th style={{ width: 150 }}></th></tr></thead>
        <tbody>
          {xem === "dong" ? rows.map((v) => dong(v)) : nhom.map(([k, ds]) => {
            const ids = ds.map((v) => v.item_id);
            const het = ids.every((id) => chon.has(id));
            const v0 = ds[0];
            return [
              <tr key={`n-${k}`} style={{ background: "#F5F3FF" }}>
                <td><input type="checkbox" title="Chọn cả nhóm" checked={het} onChange={(e) => doi(ids, e.target.checked)} /></td>
                <td><Han v={v0} chu="sớm nhất" /></td>
                <td colSpan={4}>
                  {xem === "po" ? <><b><EoLink id={v0.eo_id}>{v0.ma_phe_duyet || v0.eo_code}</EoLink></b> <span className="muted">· {v0.doi_tac || "—"} · {v0.nguoi_dat ? ten(v0.nguoi_dat) : ""}</span></>
                    : <><b><DongLink id={v0.item_id} ma={v0.part_code} /></b> <span className="muted">· {v0.part_name} · {new Set(ds.map((v) => v.eo_id)).size} PO</span></>}
                  <span className="badge final" style={{ marginLeft: 8 }}>{ds.length} dòng</span>
                </td>
                <td><b style={{ color: "#7C3AED" }}>{soLoi(ds)}</b></td>
                <td style={{ textAlign: "right" }}><button className="btn sm primary" style={{ background: "#7C3AED", borderColor: "#7C3AED" }}
                  title="1 nội dung giải trình đóng mọi lỗi chờ của cả nhóm" onClick={() => (ds.length === 1 ? onMot(v0) : onNhieu(ds))}>✍ Giải trình cả nhóm ({ds.length})</button></td>
              </tr>,
              ...ds.map((v) => dong(v, true)),
            ];
          })}
        </tbody>
      </table>
    </>
  );
}

/** Noi dung mail push 1 NCC (dung cho Gmail + chep). Giu ma 3TDO + ma LK de hop thu theo doi nhan dien. */
function mailNcc(ncc: string, ds: V[]) {
  const po = [...new Set(ds.map((v) => v.ma_phe_duyet || v.eo_code))];
  const tieuDe = `[${po.join(", ")}] Đề nghị xác nhận ngày giao hàng - ${ncc}`;
  const dong = ds.map((v, i) => `${i + 1}. ${v.ma_phe_duyet || v.eo_code} | ${v.part_code} | ${v.part_name} | còn thiếu ${v.so_luong_con_thieu}`);
  const noiDung = [`Kính gửi ${ncc},`, "", "Bên em đề nghị anh/chị xác nhận NGÀY GIAO HÀNG dự kiến cho các mã sau:", "",
    "STT. Mã PO (3TDO) | Mã linh kiện | Tên | SL còn thiếu", ...dong, "", "Anh/chị vui lòng trả lời mail này (giữ nguyên tiêu đề) kèm ngày giao cho từng mã.", "", "Trân trọng."].join("\n");
  return { tieuDe, noiDung };
}

export default function ViecCuaToi() {
  const qc = useQueryClient();
  const [phamVi, setPhamVi] = useState<"toi" | "tat_ca">("toi");
  const q = useQuery({ queryKey: ["viec-cua-toi", phamVi], queryFn: () => api.get<Data>(`/viec-cua-toi?pham_vi=${phamVi}`) });
  const [ngay, setNgay] = useState<V | null>(null);
  const [gt, setGt] = useState<V | null>(null);
  const [gtNhieu, setGtNhieu] = useState<V[] | null>(null);
  const [lh, setLh] = useState<{ ids: number[]; nhan: string; choNcc?: boolean } | null>(null);
  const [daChep, setDaChep] = useState("");
  const xong = () => { qc.invalidateQueries({ queryKey: ["viec-cua-toi"] }); qc.invalidateQueries({ queryKey: ["inbox-count"] }); };
  const d = q.data;
  const theoNcc = useMemo(() => {
    const m = new Map<string, V[]>();
    for (const v of d?.push ?? []) { const k = v.doi_tac || "(chưa có NCC)"; m.set(k, [...(m.get(k) ?? []), v]); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [d]);
  if (q.isLoading || !d) return <Spinner />;

  const tong = d.ndk.length + d.push.length + d.ngay_moi.length + d.giai_trinh.length;
  const tre = [...d.ndk, ...d.ngay_moi].filter((v) => (v.con_gio ?? 0) < 0).length;
  const O = ({ so, l, n, mau, toi }: { so: string; l: string; n: number; mau: string; toi: string }) => (
    <button className="card" onClick={() => document.getElementById(toi)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      style={{ flex: "1 1 180px", textAlign: "left", padding: 14, border: `2px solid ${n ? mau : "var(--border)"}`, borderRadius: 12, background: "#fff", cursor: "pointer" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>{so} {l}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: n ? mau : "var(--text-muted)" }}>{soLuong(n)}</div>
    </button>
  );
  const nutNgay = (v: V, l = "📅 Nhập ngày dự kiến") => <button className="btn sm primary" onClick={() => setNgay(v)}>{l}</button>;
  // v0.113: NCC chua cho ngay -> ghi nhan da hoi + hen hoi lai: dong sang muc "Dang cho NCC", khong bi ghi loi lap toi ngay hen
  const nutChoNcc = (v: V) => <button className="btn sm" title="Đã hỏi NCC nhưng NCC chưa có ngày dự kiến — ghi nhận + hẹn ngày hỏi lại, tạm dừng lỗi lặp"
    onClick={() => setLh({ ids: [v.item_id], nhan: `${v.part_code} (${v.ma_phe_duyet || v.eo_code})`, choNcc: true })}>⏳ NCC chưa có ngày</button>;
  const haiNut = (v: V, l?: string) => <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>{nutNgay(v, l)}{nutChoNcc(v)}</span>;
  const choNcc = d.cho_ncc ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHeader title="Việc của tôi" />
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15 }}>
            {tong ? <>Hôm nay <b>{thuNgay(d.hom_nay)}</b> bạn có <b style={{ color: "#B91C1C" }}>{soLuong(tong)} việc</b>{tre ? <> — <b style={{ color: "#B91C1C" }}>{tre} việc đã trễ hạn</b>, làm ngay để không bị ghi thêm lỗi</> : ""}. Làm từ trên xuống, việc gấp nhất đứng đầu mỗi mục.</>
              : <>✓ Hôm nay <b>{thuNgay(d.hom_nay)}</b> bạn không có việc gấp.</>}
          </div>
          {d.toan_bo && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button className={`btn sm ${phamVi === "toi" ? "primary" : ""}`} onClick={() => setPhamVi("toi")}>Của tôi</button>
              <button className={`btn sm ${phamVi === "tat_ca" ? "primary" : ""}`} onClick={() => setPhamVi("tat_ca")}>Toàn bộ</button>
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Hạn tính theo giờ làm việc: T2–T6 8:00–12:00, 13:00–17:00 · T7 8:00–12:00 · Chủ nhật nghỉ. Làm xong trước hạn = không bị tính lỗi.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <O so="①" l="Nhập ngày dự kiến" n={d.ndk.length} mau="#DC2626" toi="m-ndk" />
          <O so="②" l={d.ngay_push ? "Push NCC hôm nay" : "Push NCC (thứ 2 / thứ 4)"} n={d.push.length} mau="#EA580C" toi="m-push" />
          <O so="③" l="Quá ngày DK — ngày mới" n={d.ngay_moi.length} mau="#B91C1C" toi="m-ngay-moi" />
          <O so="④" l="Giải trình lỗi" n={d.giai_trinh.length} mau="#7C3AED" toi="m-gt" />
          <O so="⏳" l="Đang chờ NCC báo ngày" n={choNcc.length} mau="#2563EB" toi="m-cho-ncc" />
        </div>
      </Card>

      <Muc id="m-ndk" so="1" n={d.ndk.length} mau="#DC2626" tieuDe="Nhập ngày dự kiến — trước khi bị tính lỗi" xuat={() => xuatMuc(d.ndk, "1-nhap-ngay-du-kien")}
        lamGi={<>Hỏi nhà cung cấp ngày giao → bấm <b>📅 Nhập ngày dự kiến</b> ở dòng đó → điền <b>ngày NCC cam kết</b> + ngày dự kiến → Lưu. Hạn: <b>8 giờ làm việc</b> (Karofi / Livotec / Korihome) hoặc <b>16 giờ làm việc</b> (hãng khác) kể từ khi PO ban hành.
          {" "}NCC trả lời mà <b>chưa có ngày</b> → bấm <b>⏳ NCC chưa có ngày</b>, hẹn ngày hỏi lại: dòng chuyển xuống mục "Đang chờ NCC", không bị ghi thêm lỗi lặp tới ngày hẹn.</>}>
        <Bang rows={d.ndk} nut={(v) => haiNut(v)} />
      </Muc>

      <Muc id="m-push" so="2" n={d.push.length} mau="#EA580C" tieuDe={d.ngay_push ? "Push NCC hôm nay — trước 23:59" : "Push nhà cung cấp"} xuat={() => xuatMuc(theoNcc.flatMap(([, ds]) => ds), "2-push-ncc", "Push trước")}
        lamGi={d.ngay_push
          ? <>Mỗi thứ 2 và thứ 4, dòng chưa có ngày dự kiến phải được nhắc NCC trong ngày. Bấm <b>✉ Soạn mail Gmail</b> (đã điền sẵn CC <b>{CC}</b>, tiêu đề có mã PO, bảng mã LK) → điền email NCC → <b>Gửi</b>.
            Hệ thống tự ghi nhận khi mail về hộp theo dõi. Nhắc bằng gọi điện / Zalo thì bấm <b>📞 Đã nhắc</b>.</>
          : <>Hôm nay không phải ngày push. Ngày push tiếp theo: <b>{thuNgay(d.ngay_push_ke)}</b> — dòng ở mục ① chưa có ngày dự kiến tới ngày đó sẽ phải push. Nhập ngày dự kiến trước thì không cần push.</>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {theoNcc.map(([ncc, ds]) => {
            const m = mailNcc(ncc, ds);
            const gmail = `https://mail.google.com/mail/?view=cm&fs=1&cc=${encodeURIComponent(CC)}&su=${encodeURIComponent(m.tieuDe)}&body=${encodeURIComponent(m.noiDung)}`;
            return (
              <div key={ncc} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <b style={{ fontSize: 14 }}>{ncc}</b><span className="muted">· {ds.length} dòng</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <a className="btn sm primary" href={gmail} target="_blank" rel="noreferrer">✉ Soạn mail Gmail</a>
                    <button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(`${m.tieuDe}\n\n${m.noiDung}`); setDaChep(ncc); setTimeout(() => setDaChep(""), 2500); }}>
                      {daChep === ncc ? "✓ Đã chép" : "📋 Chép nội dung (Outlook)"}</button>
                    <button className="btn sm" onClick={() => setLh({ ids: ds.map((v) => v.item_id), nhan: `${ncc} · ${ds.length} dòng` })}>📞 Đã nhắc (gọi / Zalo)</button>
                  </span>
                </div>
                <Bang rows={ds} chu="push trước" nut={(v) => nutNgay(v, "📅 Đã có ngày DK")} />
              </div>
            );
          })}
        </div>
      </Muc>

      <Muc id="m-ngay-moi" so="3" n={d.ngay_moi.length} mau="#B91C1C" tieuDe="Quá ngày dự kiến mà hàng chưa về đủ — nhập ngày mới" xuat={() => xuatMuc(d.ngay_moi, "3-qua-ngay-du-kien")}
        lamGi={<>Hỏi lại NCC ngày giao mới → bấm <b>📅 Nhập ngày mới</b> → sửa đợt kế hoạch sang ngày mới → Lưu. Hạn: <b>8 giờ làm việc</b> từ đầu ngày sau ngày dự kiến cũ.</>}>
        <Bang rows={d.ngay_moi} nut={(v) => haiNut(v, "📅 Nhập ngày mới")} />
      </Muc>

      <Muc id="m-gt" so="4" n={d.giai_trinh.length} mau="#7C3AED" tieuDe="Giải trình lỗi" xuat={() => xuatMuc(d.giai_trinh, "4-giai-trinh-loi", "Hạn tự đóng")}
        lamGi={<>Bấm <b>✍ Giải trình</b> → chọn <b>Ai chịu</b> + <b>Lỗi gì</b> + ghi nội dung (lỗi chưa có ngày DK / quá ngày DK cần ảnh bằng chứng: mail, tin nhắn với NCC). Giải trình trong <b>{d.gio_tu_dong} giờ làm việc</b> thì không bị tính vi phạm; quá hạn không giải trình → <b>ghi nhận vi phạm</b>. Nếu do NCC, chọn Ai = <b>Đối tác / NCC</b>; có thư với NCC thì tick dùng thư làm bằng chứng (không cần chụp ảnh). Nhiều lỗi cùng nguyên nhân: xem <b>Theo PO</b> / <b>Theo mã linh kiện</b> → bấm <b>✍ Giải trình cả nhóm</b>, hoặc tick nhiều dòng → <b>✍ Giải trình chung</b> (1 nội dung cho mọi lỗi).</>}>
        <BangGiaiTrinh rows={d.giai_trinh} onMot={setGt} onNhieu={setGtNhieu} />
      </Muc>

      <Muc id="m-cho-ncc" so="⏳" n={choNcc.length} mau="#2563EB" tieuDe="Đang chờ NCC báo ngày — hỏi lại đúng ngày hẹn" xuat={() => xuatMuc(choNcc, "5-cho-ncc-bao-ngay", "Hẹn hỏi lại")}
        lamGi={<>Các dòng bạn đã ghi nhận <b>NCC chưa có ngày dự kiến</b>. Không bị ghi lỗi lặp tới ngày hẹn. Tới ngày hẹn: hỏi lại NCC → có ngày thì <b>📅 Nhập ngày dự kiến</b>; vẫn chưa có thì <b>⏳ NCC chưa có ngày</b> hẹn lần nữa (tối đa 7 ngày / lần — Điều hành vẫn thấy dòng chờ lâu).</>}>
        <Bang rows={choNcc} chu="hẹn hỏi lại" nut={(v) => haiNut(v)} phu={(v: any) => v.cho_ncc_ket_qua ? <div style={{ fontSize: 11, color: "#1D4ED8" }}>NCC: {v.cho_ncc_ket_qua}</div> : null} />
      </Muc>

      {ngay && <NgayHangVeModal dong={ngay} onClose={() => setNgay(null)} onSaved={() => { setNgay(null); xong(); }} />}
      {gtNhieu && <GiaiTrinhDongModal dongs={gtNhieu.map((v) => ({ item_id: v.item_id, eo_id: v.eo_id, ma_po: v.ma_phe_duyet || v.eo_code, part_code: v.part_code, part_name: v.part_name }))}
        onClose={() => setGtNhieu(null)} onSaved={() => { setGtNhieu(null); xong(); }} />}
      {gt && <GiaiTrinhModal dong={gt} onClose={() => setGt(null)} onSaved={() => { setGt(null); xong(); }} />}
      {lh && <LienHeDoiTacModal ids={lh.ids} nhan={lh.nhan} choNcc={lh.choNcc} onClose={() => setLh(null)} onSaved={() => { setLh(null); xong(); }} />}
    </div>
  );
}
