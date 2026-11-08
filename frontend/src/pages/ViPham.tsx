import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader, Card, Spinner, Modal } from "../components/ui";
import { DataTable, type Col } from "../components/DataTable";
import { EoLink, PartLink, useQuickView } from "../components/quickview/QuickView";
import { I } from "../lib/icons";
import { soLuong, ngay, ngayGio, ten } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { gopTrung, lietKe } from "../lib/gopTrung";
import { boDau } from "../lib/tonDong";
import { GiaiTrinhModal, LichSuDong, NgayHangVeModal, QUY_TAC, TINH_TRANG, useDanhMuc, type Dong } from "./theodoi/shared";
import { GiaiTrinhNhieuModal, GiaiTrinhPoModal } from "./theodoi/GiaiTrinhPo";

/**
 * "Vi phạm & giải trình" (/vi-pham) - theo doi rieng mang loi (backend routes/viPham.ts, migrations/0016).
 * Muc tieu 3-5 giay: dai bao "viec cua ban" theo vai tro -> the so (bam = loc) -> bang. 3 cach xem: theo loi (gom loi lap
 * cung loai tren 1 dong thanh 1 dong "x n lan"), theo PO (giai trinh chung ca PO), theo nguoi (xep hang nguoi vi pham).
 * Bam 1 dong -> chi tiet: vi sao muc nay, phai lam gi, cac lan vi pham, giai trinh, nhac nho, lich su day du.
 */
type L = Record<string, any>;
interface Data { rows: L[]; tat_ca: boolean; quan_ly: boolean; co_the_gt: boolean; me: string; vai_tro: string | null; qua_lau_ngay: number; rat_lau_ngay: number; danh_gia_luc: string | null }
type Nhom = { x: L; ds: L[] };

export const MUC: Record<string, { l: string; c: string; mau: string; thu: number; gt: string }> = {
  CEO: { l: "Cấp CEO", c: "reject", mau: "#7F1D1D", thu: 4, gt: "Dòng đang ở cấp CEO: lùi ngày dự kiến ≥ 3 lần, hoặc ngày dự kiến cách ngày đặt ≥ 30 ngày, hoặc ≥ 3 lỗi." },
  CAO: { l: "Cao", c: "reject", mau: "#DC2626", thu: 3, gt: "Cùng loại lỗi lặp ≥ 3 lần trên dòng, hoặc chờ giải trình ≥ 7 ngày." },
  TB: { l: "Trung bình", c: "final", mau: "#EA580C", thu: 2, gt: "Cùng loại lỗi lặp 2 lần, hoặc chờ giải trình ≥ 3 ngày (quá lâu)." },
  THAP: { l: "Thấp", c: "review", mau: "#CA8A04", thu: 1, gt: "Lỗi lần đầu, mới phát sinh." },
};
/** Lam gi de het loi / khong bi lap lai - theo quy tac. */
const CACH_XU_LY: Record<string, string> = {
  R1: "Nhập ngày dự kiến cho dòng (nút “Ngày DK”), rồi giải trình kèm ảnh bằng chứng (mail / tin nhắn với NCC).",
  R3: "Thứ 2 / thứ 4: tạo push đối tác cho dòng chưa có ngày dự kiến (LK đặt › tick › Push). Có ngày dự kiến là hết lỗi lặp lại.",
  R4: "Đã quá ngày dự kiến mà chưa đủ hàng: nhập ngày dự kiến MỚI (nút “Ngày DK”), rồi giải trình kèm ảnh. Không nhập → mỗi mốc quá hạn ghi thêm 1 lỗi.",
  TAY: "Lỗi ghi tay lúc giải trình (NCC trễ, hết hàng…) — đã có giải trình, chỉ để thống kê.",
};
const QT_DAI: Record<string, string> = {
  R1: "Sau khi EO ban hành (hoặc dòng thêm sau ban hành được duyệt) phải có ngày dự kiến trong 24 giờ làm việc với đối tác Karofi / Livotec / Korihome (dòng bắt đầu từ 08/11/2026), 48 giờ với hãng khác (bỏ Chủ nhật).",
  R3: "Mỗi thứ 2 / thứ 4, dòng chưa từng có ngày dự kiến phải được push đối tác trong ngày (có mail với đối tác qua theodoimuahang@gmail.com trong kỳ cũng tính là đã push).",
  R4: "Quá ngày dự kiến mà hàng chưa về đủ → phải nhập ngày dự kiến mới trong 24 giờ làm việc.",
  TAY: "Lỗi do người giải trình tự xác định.",
};
const MucBadge = ({ m }: { m: string }) => <span className={`badge ${MUC[m]?.c ?? "nhap"}`} title={MUC[m]?.gt} style={m === "CEO" ? { background: "#7F1D1D", color: "#fff" } : undefined}>{MUC[m]?.l ?? m}</span>;
const TrangThai = ({ l }: { l: L }) => l.trang_thai === "CHO_GIAI_TRINH"
  ? <span className="badge reject">Chờ giải trình</span>
  : <span className="badge issued" title={l.gt_pham_vi === "PO" ? "Giải trình chung cả PO" : l.gt_pham_vi === "NHIEU" ? "Giải trình chung nhiều lỗi cùng loại" : undefined}>Đã giải trình{l.gt_pham_vi === "PO" ? " (PO)" : l.gt_pham_vi === "NHIEU" ? " (chung)" : ""}</span>;
const maPo = (l: L) => l.approval_code || l.eo_code;
const mucCao = (ds: L[]) => ds.reduce((m, l) => (MUC[l.muc]?.thu ?? 0) > (MUC[m]?.thu ?? 0) ? l.muc : m, "THAP");
const cho = (l: L) => l.trang_thai === "CHO_GIAI_TRINH";

/** Gom loi lap: cung dong + cung quy tac + cung trang thai -> 1 dong bang (dai dien = lan moi nhat). */
function gomLoi(rows: L[]): Nhom[] {
  return gopTrung(rows, (l) => `${l.eo_item_id}|${l.quy_tac}|${l.trang_thai}`).map(({ ds }) => {
    const s = [...ds].sort((a, b) => String(b.han ?? b.created_at).localeCompare(String(a.han ?? a.created_at)));
    return { x: { ...s[0], muc: mucCao(s), tuoi_ngay: Math.max(...s.map((y) => y.tuoi_ngay)), qua_lau: s.some((y) => y.qua_lau) }, ds: s };
  });
}

const KPI_DEF: { k: string; l: string; sub: string; mau: string; loc: (l: L, d: Data) => boolean }[] = [
  { k: "cho", l: "Chờ giải trình", sub: "lỗi chưa giải trình", mau: "#DC2626", loc: cho },
  { k: "qua_lau", l: "Quá lâu", sub: "chờ ≥ 3 ngày", mau: "#B45309", loc: (l) => l.qua_lau },
  { k: "lap", l: "Lặp liên tiếp", sub: "cùng lỗi ≥ 2 lần, chưa xử lý", mau: "#EA580C", loc: (l) => cho(l) && l.so_lan >= 2 },
  { k: "ceo", l: "Cấp CEO", sub: "lỗi trên linh kiện cấp CEO", mau: "#7F1D1D", loc: (l) => l.ceo && l.tinh_trang !== "DONG" },
  { k: "cao", l: "Mức cao trở lên", sub: "Cao + CEO, chưa giải trình", mau: "#991B1B", loc: (l) => cho(l) && (l.muc === "CAO" || l.muc === "CEO") },
  { k: "da_7", l: "Đã giải trình 7 ngày", sub: "kết quả xử lý gần đây", mau: "#15803D", loc: (l) => !cho(l) && !!l.gt_luc && Date.now() - Date.parse(String(l.gt_luc).replace(" ", "T") + "+07:00") < 7 * 86400_000 },
];

export default function ViPham() {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const qv = useQuickView();
  const dm = useDanhMuc();
  const q = useQuery({ queryKey: ["vi-pham"], queryFn: () => api.get<Data>("/vi-pham") });
  const d = q.data;
  const set = (k: string, v: string) => setSp((s) => { const n = new URLSearchParams(s); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const xem = sp.get("xem") || (d && !d.quan_ly && !d.tat_ca ? "cua_toi" : d?.quan_ly ? "tat_ca" : "cua_toi");
  const kieu = sp.get("kieu") || "loi";
  const tt = sp.get("tt") ?? "cho";
  const kpi = sp.get("kpi") || "";
  const [tim, setTim] = useState("");
  const [muc, setMuc] = useState(""); const [qt, setQt] = useState(""); const [nguoi, setNguoi] = useState(sp.get("nguoi") || "");
  const [kho, setKho] = useState(""); const [doiTac, setDoiTac] = useState(""); const [tu, setTu] = useState(""); const [den, setDen] = useState("");
  const [chiTiet, setChiTiet] = useState<Nhom | null>(null);
  const [md, setMd] = useState<{ k: "gt"; x: L } | { k: "po"; eo: number } | { k: "nhac"; ids: number[]; ten: string } | { k: "ndk"; x: L } | { k: "nhieu"; nhom: Nhom[] } | null>(null);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [thongBao, setThongBao] = useState("");
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";

  // tap goc theo "Cua toi / Toan bo" - the so dem tren tap nay, bo loc + trang thai ap sau
  const goc = useMemo(() => (d?.rows ?? []).filter((l) => xem !== "cua_toi" || l.cua_toi), [d, xem]);
  const loc = useMemo(() => {
    const kd = KPI_DEF.find((x) => x.k === kpi);
    const w = boDau(tim).split(/\s+/).filter(Boolean);
    return goc.filter((l) => {
      if (kd) { if (!kd.loc(l, d!)) return false; }
      else if (tt === "cho" && !cho(l)) return false;
      else if (tt === "da" && cho(l)) return false;
      if (muc && l.muc !== muc) return false;
      if (qt && l.quy_tac !== qt) return false;
      if (nguoi && l.nguoi_vp !== nguoi) return false;
      if (kho && l.kho !== kho) return false;
      if (doiTac && (l.doi_tac ?? "") !== doiTac) return false;
      const moc = String(l.han ?? l.created_at).slice(0, 10);
      if (tu && moc < tu) return false;
      if (den && moc > den) return false;
      if (w.length) {
        const h = boDau(`${l.eo_code} ${l.approval_code ?? ""} ${l.part_code} ${l.part_name ?? ""} ${l.kho} ${l.doi_tac ?? ""} ${l.nguoi_vp ?? ""} ${l.nguoi_dat} ${QUY_TAC[l.quy_tac] ?? ""} ${l.gt_noi_dung ?? ""}`);
        if (!w.every((x) => h.includes(x))) return false;
      }
      return true;
    });
  }, [goc, kpi, tt, muc, qt, nguoi, kho, doiTac, tu, den, tim, d]);
  const nhom = useMemo(() => gomLoi(loc).sort((a, b) => (Number(cho(b.x)) - Number(cho(a.x))) || (MUC[b.x.muc].thu - MUC[a.x.muc].thu) || b.x.tuoi_ngay - a.x.tuoi_ngay), [loc]);

  if (q.isLoading || !d) return <><PageHeader title="Vi phạm & giải trình" /><Spinner /></>;
  const dem = (k: string) => { const f = KPI_DEF.find((x) => x.k === k)!; return goc.filter((l) => f.loc(l, d)).length; };
  const choCua = goc.filter(cho);
  const poCho = new Set(choCua.map((l) => l.eo_id)).size;
  const ds = (k: "nguoi_vp" | "kho" | "doi_tac") => [...new Set(goc.map((l) => l[k]).filter(Boolean))].sort() as string[];
  const coLoc = !!(muc || qt || nguoi || kho || doiTac || tu || den || tim || kpi);
  const xoaLoc = () => { setMuc(""); setQt(""); setNguoi(""); setKho(""); setDoiTac(""); setTu(""); setDen(""); setTim(""); set("kpi", ""); };
  const xong = (msg?: string) => { setMd(null); if (msg) setThongBao(msg); qc.invalidateQueries({ queryKey: ["vi-pham"] }); qc.invalidateQueries({ queryKey: ["inbox-count"] }); qc.invalidateQueries({ queryKey: ["tl-dong"] }); qc.invalidateQueries({ queryKey: ["theo-doi"] }); };
  const khoaNhom = (n: Nhom) => `${n.x.eo_item_id}|${n.x.quy_tac}|${n.x.trang_thai}`;
  const nhomChon = nhom.filter((n) => chon.has(khoaNhom(n)) && cho(n.x));
  const idsChon = nhomChon.flatMap((n) => n.ds.map((l) => l.id));
  const loaiChon = [...new Set(nhomChon.map((n) => n.x.quy_tac))];
  const coChon = d.quan_ly || d.co_the_gt;
  // "chon tat ca": cac loi CHO cung loai - loai dang loc, khong loc thi loai cua dong dau tien (giai trinh chung chi cho loi cung loai)
  const loaiTatCa = qt || nhom.find((n) => cho(n.x))?.x.quy_tac;
  const tatCaCungLoai = nhom.filter((n) => cho(n.x) && n.x.quy_tac === loaiTatCa);
  const choDong = (x: L): Dong => ({ ...x, item_id: x.eo_item_id, ma_phe_duyet: x.approval_code, nguoi_dat: x.nguoi_dat } as any);

  // ------ dai bao "viec cua ban" (3-5 giay)
  const banner: ReactNode = xem === "cua_toi"
    ? choCua.length
      ? <>Bạn có <b>{choCua.length} lỗi chờ giải trình</b> trên <b>{poCho} PO</b>{dem("qua_lau") ? <> — <b style={{ color: "var(--danger-ink)" }}>{dem("qua_lau")} lỗi đã quá {d.qua_lau_ngay} ngày</b></> : null}.
          {" "}Việc cần làm: bấm <b>Giải trình</b> ở từng lỗi, hoặc <b>Giải trình cả PO</b> khi các linh kiện cùng nguyên nhân. Lỗi để lâu / lặp lại sẽ bị nâng mức.</>
      : <>✓ Bạn không có lỗi nào chờ giải trình. Giữ ngày dự kiến cập nhật để không phát sinh lỗi mới.</>
    : <>Toàn bộ{d.tat_ca ? "" : " (phạm vi của bạn)"}: <b>{choCua.length} lỗi chờ</b> · <b>{dem("qua_lau")} quá lâu</b> · <b>{dem("lap")} lặp liên tiếp</b> · <b>{dem("ceo")} lỗi trên dòng cấp CEO</b>.
        {d.quan_ly ? <> Việc cần làm: xem mức <b>Cao / CEO</b> trước, tick lỗi → <b>Nhắc nhở</b> người vi phạm; xem tab <b>Theo người</b> để biết ai vi phạm nhiều.</> : null}</>;

  const colsLoi: Col<Nhom>[] = [
    { key: "act", header: coChon ? <input type="checkbox" title={`Chọn tất cả lỗi chờ loại “${QUY_TAC[loaiTatCa ?? ""] ?? ""}” đang hiển thị (lọc “Loại lỗi” để chọn loại khác)`} checked={chon.size > 0} onChange={(e) => setChon(e.target.checked ? new Set(tatCaCungLoai.map(khoaNhom)) : new Set())} /> : "",
      render: (n) => <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        {coChon && <input type="checkbox" disabled={!cho(n.x)} title={cho(n.x) ? "Chọn để giải trình chung / nhắc nhở" : undefined} checked={chon.has(khoaNhom(n))} onChange={() => setChon((s) => { const m = new Set(s); const k = khoaNhom(n); if (m.has(k)) m.delete(k); else m.add(k); return m; })} />}
        {cho(n.x) && d.co_the_gt && <button className="btn sm primary" onClick={() => setMd({ k: "gt", x: n.x })}>Giải trình</button>}
        <button className="btn sm ghost" title="Chi tiết" onClick={() => setChiTiet(n)}><I.eye width={14} height={14} /></button>
      </div> },
    { key: "muc", header: "Mức độ", render: (n) => <MucBadge m={n.x.muc} /> },
    { key: "tt", header: "Trạng thái", render: (n) => <TrangThai l={n.x} /> },
    { key: "loi", header: "Lỗi", maxW: 230, render: (n) => <span title={QT_DAI[n.x.quy_tac]}><b>{QUY_TAC[n.x.quy_tac] ?? n.x.quy_tac}</b>{n.x.loi_ma && n.x.quy_tac === "TAY" ? ` · ${tenDm("LOI", n.x.loi_ma)}` : ""}</span> },
    { key: "lan", header: "Số lần", align: "center", render: (n) => n.ds.length > 1 || n.x.so_lan > 1
      ? <span className="badge final" title={`Lỗi này lặp ${n.x.so_lan} lần trên dòng (mỗi lần vi phạm ghi 1 lỗi): ${lietKe(n.ds.map((y) => ngay(y.ngay_tham_chieu ?? y.han)), 8)}`}>× {n.ds.length}{n.x.so_lan > n.ds.length ? ` / ${n.x.so_lan}` : ""}</span> : <span className="muted">1</span> },
    { key: "po", header: "PO (mã phê duyệt)", render: (n) => <EoLink id={n.x.eo_id}>{maPo(n.x)}</EoLink> },
    { key: "lk", header: "Linh kiện", maxW: 220, render: (n) => <><PartLink ma={n.x.part_code} /> <span className="muted" style={{ fontSize: 11.5 }}>{n.x.part_name}</span></> },
    { key: "nguoi", header: "Người vi phạm", render: (n) => <span title={n.x.nguoi_vp ?? ""}><b>{ten(n.x.nguoi_vp)}</b>{n.x.ai_ma && n.x.ai_ma !== "NGUOI_DAT" ? <div className="muted" style={{ fontSize: 11 }}>{tenDm("AI", n.x.ai_ma)}</div> : null}</span> },
    { key: "han", header: "Vi phạm lúc", render: (n) => <span title={`Hạn: ${ngayGio(n.x.han)}`}>{ngay(n.x.ngay_tham_chieu ?? n.x.han)}</span> },
    { key: "cho", header: "Chờ / phản hồi", align: "right", render: (n) => cho(n.x)
      ? <b style={{ color: n.x.tuoi_ngay >= d.rat_lau_ngay ? "var(--danger-ink)" : n.x.tuoi_ngay >= d.qua_lau_ngay ? "#B45309" : undefined }}>{n.x.tuoi_ngay} ngày</b>
      : <span className="muted" title="Số ngày từ hạn đến lúc giải trình">sau {n.x.tuoi_ngay} ngày</span> },
    { key: "nhac", header: "Nhắc", align: "center", render: (n) => n.x.so_nhac ? <span title={`${n.x.so_nhac} lần nhắc trên dòng (${n.x.so_nhac_tay} nhắc tay) · gần nhất ${ngayGio(n.x.nhac_gan_nhat)}`}>{n.x.so_nhac}</span> : <span className="muted">0</span> },
    { key: "gt", header: "Giải trình / lý do", maxW: 260, render: (n) => n.x.gt_noi_dung ? <span title={`${ten(n.x.gt_boi)} · ${ngayGio(n.x.gt_luc)}\n${n.x.gt_noi_dung}`}>{n.x.gt_noi_dung}</span> : <span className="muted">—</span> },
    { key: "ceo", header: "Cấp CEO vì", maxW: 220, render: (n) => n.x.ceo ? <span style={{ color: "#7F1D1D", fontSize: 12 }} title={n.x.ceo_ly_do.join("\n")}>{n.x.ceo_ly_do.join(" · ")}</span> : <span className="muted">—</span> },
  ];

  // ------ theo PO
  const theoPo = gopTrung(loc, (l) => String(l.eo_id)).map(({ x, ds }) => ({
    x, ds, cho: ds.filter(cho).length, dong: new Set(ds.map((l) => l.eo_item_id)).size, muc: mucCao(ds.filter(cho).length ? ds.filter(cho) : ds),
    qua_lau: ds.filter((l) => l.qua_lau).length, cho_lau: Math.max(0, ...ds.filter(cho).map((l) => l.tuoi_ngay)),
  })).sort((a, b) => b.cho - a.cho || MUC[b.muc].thu - MUC[a.muc].thu);
  const colsPo: Col<(typeof theoPo)[number]>[] = [
    { key: "act", header: "", render: (p) => <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      {p.cho > 0 && d.co_the_gt && <button className="btn sm primary" onClick={() => setMd({ k: "po", eo: p.x.eo_id })}>Giải trình cả PO</button>}
      {p.cho > 0 && d.quan_ly && <button className="btn sm" onClick={() => setMd({ k: "nhac", ids: p.ds.filter(cho).map((l) => l.id), ten: maPo(p.x) })}>Nhắc</button>}
    </div> },
    { key: "po", header: "PO (mã phê duyệt)", render: (p) => <EoLink id={p.x.eo_id}>{maPo(p.x)}</EoLink> },
    { key: "muc", header: "Mức cao nhất", render: (p) => <MucBadge m={p.muc} /> },
    { key: "cho", header: "Lỗi chờ", align: "right", render: (p) => p.cho ? <b style={{ color: "var(--danger-ink)" }}>{p.cho}</b> : <span className="muted">0</span> },
    { key: "tong", header: "Tổng lỗi", align: "right", render: (p) => p.ds.length },
    { key: "dong", header: "Số linh kiện có lỗi", align: "right", render: (p) => p.dong },
    { key: "lk", header: "Linh kiện", maxW: 240, render: (p) => lietKe(p.ds.map((l) => l.part_code), 4) },
    { key: "lau", header: "Chờ lâu nhất", align: "right", render: (p) => p.cho ? `${p.cho_lau} ngày` : "—" },
    { key: "nguoi", header: "Người đặt", render: (p) => ten(p.x.nguoi_dat) },
  ];

  // ------ theo nguoi
  const theoNguoi = gopTrung(loc, (l) => l.nguoi_vp ?? "").map(({ x, ds }) => {
    const da = ds.filter((l) => !cho(l));
    return { x, ds, cho: ds.filter(cho).length, qua_lau: ds.filter((l) => l.qua_lau).length, lap: ds.filter((l) => cho(l) && l.so_lan >= 2).length,
      ceo: new Set(ds.filter((l) => l.ceo).map((l) => l.eo_item_id)).size, da: da.length, po: new Set(ds.map((l) => l.eo_id)).size,
      tb: da.length ? Math.round(da.reduce((s, l) => s + l.tuoi_ngay, 0) / da.length * 10) / 10 : null };
  }).sort((a, b) => b.cho - a.cho || b.ds.length - a.ds.length);
  const colsNguoi: Col<(typeof theoNguoi)[number]>[] = [
    { key: "act", header: "", render: (p) => <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <button className="btn sm" onClick={() => { setNguoi(p.x.nguoi_vp ?? ""); set("kieu", "loi"); }}>Xem lỗi</button>
      {p.cho > 0 && d.quan_ly && <button className="btn sm" onClick={() => setMd({ k: "nhac", ids: p.ds.filter(cho).map((l) => l.id), ten: ten(p.x.nguoi_vp) })}>Nhắc</button>}
    </div> },
    { key: "nguoi", header: "Người vi phạm", render: (p) => <b title={p.x.nguoi_vp}>{ten(p.x.nguoi_vp) || "—"}</b> },
    { key: "cho", header: "Chờ giải trình", align: "right", render: (p) => p.cho ? <b style={{ color: "var(--danger-ink)" }}>{p.cho}</b> : <span className="muted">0</span> },
    { key: "lau", header: `Quá lâu (≥ ${d.qua_lau_ngay} ngày)`, align: "right", render: (p) => p.qua_lau || <span className="muted">0</span> },
    { key: "lap", header: "Lặp liên tiếp", align: "right", render: (p) => p.lap || <span className="muted">0</span> },
    { key: "ceo", header: "Dòng cấp CEO", align: "right", render: (p) => p.ceo || <span className="muted">0</span> },
    { key: "tong", header: "Tổng lỗi", align: "right", render: (p) => p.ds.length },
    { key: "po", header: "Số PO", align: "right", render: (p) => p.po },
    { key: "da", header: "Đã giải trình", align: "right", render: (p) => p.da },
    { key: "tb", header: "TB ngày đến khi giải trình", align: "right", render: (p) => p.tb ?? "—" },
  ];

  const xuat = () => exportRowsToXlsx(loc, [
    { header: "Mức độ", get: (l) => MUC[l.muc]?.l }, { header: "Trạng thái", get: (l) => cho(l) ? "Chờ giải trình" : "Đã giải trình" },
    { header: "Lỗi", get: (l) => QUY_TAC[l.quy_tac] ?? l.quy_tac }, { header: "Lần thứ", get: (l) => `${l.lan_thu}/${l.so_lan}` },
    { header: "Mã phê duyệt", get: (l) => l.approval_code }, { header: "Mã EO", get: (l) => l.eo_code },
    { header: "Mã linh kiện", get: (l) => l.part_code }, { header: "Tên linh kiện", get: (l) => l.part_name }, { header: "Kho", get: (l) => l.kho }, { header: "Đối tác", get: (l) => l.doi_tac },
    { header: "Người vi phạm", get: (l) => l.nguoi_vp }, { header: "Ai (loại)", get: (l) => tenDm("AI", l.ai_ma) }, { header: "Lỗi gì", get: (l) => tenDm("LOI", l.loi_ma) },
    { header: "Ngày vi phạm", get: (l) => ngay(l.ngay_tham_chieu ?? l.han) }, { header: "Hạn", get: (l) => ngayGio(l.han) },
    { header: "Số ngày chờ / đến khi giải trình", get: (l) => l.tuoi_ngay }, { header: "Số lần nhắc (dòng)", get: (l) => l.so_nhac },
    { header: "Giải trình", get: (l) => l.gt_noi_dung }, { header: "Giải trình bởi", get: (l) => l.gt_boi }, { header: "Giải trình lúc", get: (l) => ngayGio(l.gt_luc) },
    { header: "Cấp CEO vì", get: (l) => (l.ceo_ly_do ?? []).join("; ") },
  ], `vi-pham_${new Date().toISOString().slice(0, 10)}.xlsx`, "Vi pham");

  const Sel = ({ v, on, l, opts }: { v: string; on: (x: string) => void; l: string; opts: [string, string][] }) => (
    <select className="select" style={{ width: "auto", minWidth: 120, maxWidth: 190 }} value={v} onChange={(e) => on(e.target.value)} title={l}>
      <option value="">{l}: tất cả</option>{opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader title="Vi phạm & giải trình" />
      {/* 1. Ban dang xem gi + viec can lam */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          {[["cua_toi", `Của tôi (${(d.rows ?? []).filter((l) => l.cua_toi && cho(l)).length})`], ["tat_ca", d.tat_ca ? "Toàn bộ" : "Phạm vi của tôi"]].map(([k, t]) => (
            <button key={k} className="btn sm" style={{ borderRadius: 0, border: 0, background: xem === k ? "var(--brand-yellow-btn)" : "#fff", fontWeight: xem === k ? 800 : 500 }}
              onClick={() => { set("xem", k); setChon(new Set()); }}>{t}</button>
          ))}
        </div>
        <div className={`qv-alert ${choCua.length && xem === "cua_toi" ? "danger" : choCua.length ? "warn" : "ok"}`} style={{ flex: 1, minWidth: 320, fontSize: 13, display: "block" }}>
          {banner}
          {xem === "cua_toi" && choCua.length > 0 && d.co_the_gt && <button className="btn sm primary" style={{ marginLeft: 10 }} onClick={() => { const n = gomLoi(choCua).sort((a, b) => MUC[b.x.muc].thu - MUC[a.x.muc].thu)[0]; if (n) setMd({ k: "gt", x: n.x }); }}>Giải trình lỗi nặng nhất</button>}
        </div>
      </div>

      {/* 2. The so - bam de loc */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
        {KPI_DEF.map((k) => {
          const n = dem(k.k); const on = kpi === k.k;
          return (
            <button key={k.k} onClick={() => set("kpi", on ? "" : k.k)} title={on ? "Bấm lần nữa để bỏ lọc" : "Bấm để lọc"}
              style={{ textAlign: "left", cursor: "pointer", border: `2px solid ${on ? k.mau : "var(--border)"}`, borderLeft: `6px solid ${k.mau}`, borderRadius: 12, background: on ? "#FFFBEB" : "#fff", padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: k.mau }}>{k.l}</div>
              <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.15, color: n ? "var(--text)" : "#94A3B8" }} className="mono-num">{soLuong(n)}</div>
              <div className="muted" style={{ fontSize: 11 }}>{k.sub}</div>
            </button>
          );
        })}
      </div>

      {/* 3. Bo loc */}
      <Card style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
            <input className="input" placeholder="Tìm mã PO, mã / tên LK, người, nội dung giải trình…" value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
          <select className="select" style={{ width: "auto" }} value={kpi ? "" : tt} disabled={!!kpi} onChange={(e) => set("tt", e.target.value)} title="Trạng thái">
            <option value="cho">Chờ giải trình</option><option value="da">Đã giải trình</option><option value="">Mọi trạng thái</option>
          </select>
          <Sel v={muc} on={setMuc} l="Mức độ" opts={Object.entries(MUC).sort((a, b) => b[1].thu - a[1].thu).map(([k, m]) => [k, m.l])} />
          <Sel v={qt} on={setQt} l="Loại lỗi" opts={Object.entries(QUY_TAC).map(([k, t]) => [k, t])} />
          <Sel v={nguoi} on={setNguoi} l="Người vi phạm" opts={ds("nguoi_vp").map((x) => [x, ten(x)])} />
          <Sel v={kho} on={setKho} l="Kho" opts={ds("kho").map((x) => [x, x])} />
          <Sel v={doiTac} on={setDoiTac} l="Đối tác" opts={ds("doi_tac").map((x) => [x, x])} />
          <span className="muted" style={{ fontSize: 12 }}>Vi phạm từ</span>
          <input className="input" type="date" style={{ width: 140 }} value={tu} onChange={(e) => setTu(e.target.value)} />
          <span className="muted" style={{ fontSize: 12 }}>đến</span>
          <input className="input" type="date" style={{ width: 140 }} value={den} onChange={(e) => setDen(e.target.value)} />
          {coLoc && <button className="btn sm ghost" onClick={xoaLoc}><I.x width={13} height={13} /> Bỏ lọc</button>}
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={xuat} title="Xuất các lỗi đang lọc ra Excel"><I.download width={14} height={14} /> Excel</button>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 11.5 }} className="muted">
          <span><b>Mức độ:</b></span>
          {Object.entries(MUC).sort((a, b) => b[1].thu - a[1].thu).map(([k, m]) => <span key={k}><MucBadge m={k} /> {m.gt}</span>)}
        </div>
      </Card>

      {/* 4. Cach xem */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        {[["loi", `Theo lỗi (${nhom.length})`], ["po", `Theo PO (${theoPo.length})`], ["nguoi", `Theo người (${theoNguoi.length})`]].map(([k, t]) => (
          <button key={k} className={`qv-chip ${kieu === k ? "on" : ""}`} style={{ fontSize: 13, padding: "5px 14px" }} onClick={() => set("kieu", k === "loi" ? "" : k)}>{t}</button>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>
          {kieu === "loi" ? "Lỗi lặp cùng loại trên 1 linh kiện gộp 1 dòng (× n lần) — tick nhiều lỗi cùng loại để giải trình chung 1 lần." : kieu === "po" ? "Giải trình cả PO: 1 nội dung cho mọi linh kiện trong PO." : "Xếp theo số lỗi chờ — bấm “Xem lỗi” để lọc theo người."}
        </span>
        <div style={{ flex: 1 }} />
        {kieu === "loi" && idsChon.length > 0 && <>
          <span className="muted" style={{ fontSize: 12 }}>Đã chọn {nhomChon.length} linh kiện · {idsChon.length} lỗi{loaiChon.length > 1 ? ` · ${loaiChon.length} loại khác nhau` : ""}</span>
          {d.co_the_gt && <button className="btn sm primary" disabled={loaiChon.length > 1} title={loaiChon.length > 1 ? "Chỉ giải trình chung được các lỗi cùng loại — bỏ chọn bớt hoặc lọc theo Loại lỗi" : "1 nội dung giải trình cho mọi lỗi đã chọn"}
            onClick={() => setMd({ k: "nhieu", nhom: nhomChon })}>Giải trình chung ({idsChon.length} lỗi)</button>}
          <button className="btn sm ghost" onClick={() => setChon(new Set())}>Bỏ chọn</button>
        </>}
        {d.quan_ly && kieu === "loi" && idsChon.length > 0 && <button className="btn sm primary" onClick={() => setMd({ k: "nhac", ids: idsChon, ten: `${chon.size} nhóm lỗi đã chọn` })}><I.bell width={14} height={14} /> Nhắc nhở ({idsChon.length} lỗi)</button>}
        {d.danh_gia_luc && <span className="muted" style={{ fontSize: 11 }} title="Hệ thống kiểm tra quy tắc và ghi lỗi tối đa 10 phút / lần">Kiểm tra lỗi lúc {ngayGio(d.danh_gia_luc)}</span>}
      </div>
      {thongBao && <div className="qv-alert ok" style={{ display: "block", marginBottom: 8 }}>{thongBao} <span role="button" style={{ cursor: "pointer", marginLeft: 8 }} onClick={() => setThongBao("")}>×</span></div>}

      <Card pad={false}>
        {kieu === "po" ? <DataTable cols={colsPo} rows={theoPo} keyOf={(p) => p.x.eo_id} pageSize={15} timKiem={false} onRowClick={(p) => qv.openEo(p.x.eo_id)} empty="Không có lỗi theo bộ lọc." />
          : kieu === "nguoi" ? <DataTable cols={colsNguoi} rows={theoNguoi} keyOf={(p) => p.x.nguoi_vp ?? "-"} pageSize={15} timKiem={false} empty="Không có lỗi theo bộ lọc." />
          : <DataTable cols={colsLoi} rows={nhom} keyOf={khoaNhom} pageSize={15} timKiem={false} onRowClick={(n) => setChiTiet(n)}
              empty={xem === "cua_toi" && tt === "cho" && !coLoc ? "✓ Bạn không có lỗi chờ giải trình." : "Không có lỗi theo bộ lọc."} />}
      </Card>

      {chiTiet && <ChiTietViPham n={chiTiet} d={d} tenDm={tenDm} onClose={() => setChiTiet(null)}
        onGt={() => setMd({ k: "gt", x: chiTiet.x })} onPo={() => setMd({ k: "po", eo: chiTiet.x.eo_id })} onNdk={() => setMd({ k: "ndk", x: chiTiet.x })}
        onNhac={() => setMd({ k: "nhac", ids: chiTiet.ds.filter(cho).map((l) => l.id), ten: `${chiTiet.x.part_code} (${maPo(chiTiet.x)})` })}
        onDong={() => qv.openDong(chiTiet.x.eo_item_id)} />}
      {md?.k === "gt" && <GiaiTrinhModal dong={choDong(md.x)} onClose={() => setMd(null)} onSaved={() => { setChiTiet(null); xong("Đã gửi giải trình."); }} />}
      {md?.k === "po" && <GiaiTrinhPoModal eoId={md.eo} onClose={() => setMd(null)} onSaved={(kq) => { setChiTiet(null); xong(`Đã giải trình chung cả PO: ${kq.so_loi} lỗi trên ${kq.so_dong} linh kiện.`); }} />}
      {md?.k === "ndk" && <NgayHangVeModal dong={choDong(md.x)} onClose={() => setMd(null)} onSaved={() => xong()} />}
      {md?.k === "nhieu" && <GiaiTrinhNhieuModal nhom={md.nhom} onClose={() => setMd(null)} onSaved={(kq) => { setChon(new Set()); xong(`Đã giải trình chung ${kq.so_loi} lỗi trên ${kq.so_dong} linh kiện (${kq.so_po} PO).`); }} />}
      {md?.k === "nhac" && <NhacNhoModal ids={md.ids} ten={md.ten} onClose={() => setMd(null)} onSaved={(m) => { setChon(new Set()); xong(m); }} />}
    </>
  );
}

function NhacNhoModal({ ids, ten: tenNhom, onClose, onSaved }: { ids: number[]; ten: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [noiDung, setNoiDung] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const gui = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ so_loi: number; so_nguoi: number }>("/vi-pham/nhac-nho", { loi_ids: ids, noi_dung: noiDung.trim() || undefined });
      onSaved(`Đã nhắc ${r.so_loi} lỗi (${r.so_nguoi} thông báo gửi tới người vi phạm).`);
    } catch (e: any) { setErr(e?.body?.error === "FORBIDDEN" ? "Chỉ quản lý (Admin / KH cung ứng / Theo dõi tiến độ) được nhắc nhở." : "Lỗi gửi nhắc nhở."); setBusy(false); }
  };
  return (
    <Modal title={`Nhắc giải trình — ${tenNhom}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={gui}>{busy ? "Đang gửi..." : `Gửi nhắc (${ids.length} lỗi)`}</button></>}>
      <div style={{ fontSize: 13 }}>
        <div className="muted" style={{ marginBottom: 8 }}>Người vi phạm nhận thông báo (chuông trên thanh trên cùng). Lần nhắc được lưu vào lịch sử từng lỗi.</div>
        <label className="field-label">Lời nhắn (tuỳ chọn)</label>
        <textarea className="textarea" value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="vd: Giải trình trước 17h hôm nay" />
        {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>
    </Modal>
  );
}

/** Chi tiet 1 nhom loi (1 linh kien x 1 loai loi): vi sao, muc do, phai lam gi, tung lan, giai trinh, nhac nho, lich su day du. */
function ChiTietViPham({ n, d, tenDm, onClose, onGt, onPo, onNdk, onNhac, onDong }: {
  n: Nhom; d: Data; tenDm: (loai: string, ma: string | null) => string; onClose: () => void;
  onGt: () => void; onPo: () => void; onNdk: () => void; onNhac: () => void; onDong: () => void;
}) {
  const x = n.x;
  const nn = useQuery({ queryKey: ["vi-pham-nhac", x.eo_item_id], queryFn: () => api.get<any[]>(`/vi-pham/dong/${x.eo_item_id}/nhac-nho`) });
  // moi loi cua cung dong (moi loai) - de thay tong the dong
  const cungDong = d.rows.filter((l) => l.eo_item_id === x.eo_item_id);
  const choN = n.ds.filter(cho).length;
  const lyDoMuc = x.muc === "CEO" ? `Dòng đang cấp CEO: ${x.ceo_ly_do.join("; ")}.`
    : x.muc === "CAO" ? (x.so_lan >= 3 ? `Lỗi này đã lặp ${x.so_lan} lần trên linh kiện.` : `Chờ giải trình ${x.tuoi_ngay} ngày (≥ ${d.rat_lau_ngay}).`)
    : x.muc === "TB" ? (x.so_lan >= 2 ? `Lỗi này đã lặp ${x.so_lan} lần.` : `Chờ giải trình ${x.tuoi_ngay} ngày (≥ ${d.qua_lau_ngay}).`)
    : "Lỗi lần đầu.";
  const H = ({ children }: { children: ReactNode }) => <div style={{ fontWeight: 800, fontSize: 13.5, margin: "14px 0 6px" }}>{children}</div>;
  const Tt = ({ k, v }: { k: string; v: ReactNode }) => <div><div className="muted" style={{ fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600 }}>{v || "—"}</div></div>;
  return (
    <Modal title={`Vi phạm — ${x.part_code} · ${maPo(x)}`} onClose={onClose} width={1000}
      footer={<>
        <button className="btn" onClick={onDong}>Mở đơn hàng</button>
        {choN > 0 && (x.quy_tac === "R1" || x.quy_tac === "R4") && d.co_the_gt && <button className="btn" onClick={onNdk}>Cập nhật ngày DK</button>}
        {choN > 0 && d.quan_ly && <button className="btn" onClick={onNhac}><I.bell width={13} height={13} /> Nhắc nhở</button>}
        {choN > 0 && d.co_the_gt && <button className="btn" onClick={onPo}>Giải trình cả PO</button>}
        {choN > 0 && d.co_the_gt && <button className="btn primary" onClick={onGt}>Giải trình{choN > 1 ? ` (${choN} lần)` : ""}</button>}
      </>}>
      <div style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <MucBadge m={x.muc} /><TrangThai l={x} />
          <b style={{ fontSize: 16 }}>{QUY_TAC[x.quy_tac] ?? x.quy_tac}</b>
          {x.so_lan > 1 && <span className="badge final">Lặp {x.so_lan} lần trên linh kiện này</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="qv-alert danger" style={{ display: "block" }}><b>Vì sao bị lỗi:</b> {QT_DAI[x.quy_tac]}<br /><b>Vì sao mức {MUC[x.muc].l}:</b> {lyDoMuc}</div>
          <div className="qv-alert ok" style={{ display: "block" }}><b>Phải làm gì:</b> {CACH_XU_LY[x.quy_tac]}<br /><span style={{ fontSize: 12 }}>Giải trình ở nút <b>Giải trình</b> bên dưới (1 lần đóng mọi lần cùng loại); cả PO cùng nguyên nhân → <b>Giải trình cả PO</b>.</span></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginTop: 12, padding: 10, background: "var(--panel-2)", borderRadius: 10 }}>
          <Tt k="PO (mã phê duyệt / EO)" v={<EoLink id={x.eo_id}>{maPo(x)}</EoLink>} />
          <Tt k="Linh kiện" v={<><PartLink ma={x.part_code} /> <span className="muted" style={{ fontWeight: 400 }}>{x.part_name}</span></>} />
          <Tt k="Kho · Đối tác" v={`${x.kho} · ${x.doi_tac || "—"}`} />
          <Tt k="Tình trạng dòng" v={x.tinh_trang ? TINH_TRANG[x.tinh_trang as Dong["tinh_trang"]]?.l : ""} />
          <Tt k="Người vi phạm" v={`${ten(x.nguoi_vp)}${x.ai_ma ? ` (${tenDm("AI", x.ai_ma)})` : ""}`} />
          <Tt k="Người đặt" v={ten(x.nguoi_dat)} />
          <Tt k="Ngày dự kiến hiện tại · lùi" v={`${ngay(x.ngay_du_kien) || "Chưa có"} · ${x.so_lan_lui} lần`} />
          <Tt k="Đã về / đặt" v={x.so_luong_dat != null ? `${soLuong(x.sl_ve)} / ${soLuong(x.so_luong_dat)}` : ""} />
        </div>
        {x.ceo && <div className="qv-alert danger" style={{ display: "block", marginTop: 10 }}><b>Cấp CEO vì:</b> {x.ceo_ly_do.join(" · ")}</div>}

        <H>Các lần vi phạm ({n.ds.length}{x.so_lan > n.ds.length ? ` · tổng ${x.so_lan} lần gồm cả đã giải trình` : ""})</H>
        <div className="tbl-wrap"><table className="tbl tbl-dense">
          <thead><tr><th>Lần</th><th>Ngày vi phạm</th><th>Hạn</th><th>Trạng thái</th><th>Chờ / phản hồi</th><th>Giải trình</th></tr></thead>
          <tbody>{[...n.ds].reverse().map((l) => (
            <tr key={l.id}><td>{l.lan_thu}/{l.so_lan}</td><td>{ngay(l.ngay_tham_chieu ?? l.han)}</td><td>{ngayGio(l.han)}</td><td><TrangThai l={l} /></td>
              <td>{cho(l) ? `${l.tuoi_ngay} ngày` : `sau ${l.tuoi_ngay} ngày`}</td>
              <td style={{ fontSize: 12 }}>{l.gt_noi_dung ? <>{l.gt_noi_dung} <span className="muted">— {ten(l.gt_boi)} {ngayGio(l.gt_luc)}{l.gt_co_anh ? " · 📷" : ""}</span></> : "—"}</td></tr>
          ))}</tbody>
        </table></div>

        {cungDong.length > n.ds.length && <>
          <H>Lỗi khác trên linh kiện này</H>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {gopTrung(cungDong.filter((l) => !n.ds.includes(l)), (l) => `${l.quy_tac}|${l.trang_thai}`).map(({ x: l, ds }) => (
              <span key={l.id} className={`badge ${cho(l) ? "reject" : "nhap"}`}>{QUY_TAC[l.quy_tac]}{ds.length > 1 ? ` × ${ds.length}` : ""} · {cho(l) ? "chờ" : "đã GT"}</span>
            ))}
          </div>
        </>}

        <H>Nhắc nhở ({nn.data?.length ?? 0})</H>
        {nn.isLoading ? <span className="muted">Đang tải…</span> : !(nn.data ?? []).length ? <div className="muted">Chưa có lần nhắc nào.</div> : (
          <div>{(nn.data ?? []).map((r) => (
            <div key={r.id} style={{ padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
              {ngayGio(r.created_at)} · <span className={`badge ${r.kenh === "TAY" ? "final" : "nhap"}`}>{r.kenh === "TAY" ? `${ten(r.created_by)} nhắc` : "Hệ thống tự nhắc"}</span> → <b>{ten(r.den_email)}</b>{r.noi_dung ? ` · ${r.noi_dung}` : ""}
            </div>
          ))}</div>
        )}

        <H>Toàn bộ lịch sử linh kiện (lỗi, giải trình, push, mail, ngày dự kiến)</H>
        <LichSuDong dong={{ item_id: x.eo_item_id, part_name: x.part_name, kho: x.kho, doi_tac: x.doi_tac, so_luong_dat: x.so_luong_dat ?? 0, sl_nhap_amis: x.sl_ve ?? 0, bat_dau: null, han_ngay_du_kien: null }} />
      </div>
    </Modal>
  );
}
