import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card, PageHeader, Spinner } from "../components/ui";
import { DataTable, type Col } from "../components/DataTable";
import { useQuickView } from "../components/quickview/QuickView";
import { I } from "../lib/icons";
import { soLuong, ngay, ngayGio, ten, tuBayGio } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { useDanhMuc } from "./theodoi/shared";

/**
 * MENU "CA TON CEO" (v0.091, yeu cau lanh dao tach rieng menu) - GET /api/ca-ceo (backend routes/caCeo.ts):
 * dong dang mo cap CEO kem ma ER.MH-201 (lui >= 3 lan) / 202 (ngay DK cach ngay dat >= 30 ngay) / 203 (>= 3 loi) + dien giai tung ly do,
 * va hanh dong: da thuc NCC bao nhieu lan, NCC tra loi gi, giai trinh gan nhat, im lang bao lau. Bam dong -> popup don hang.
 * v0.100 (yeu cau 2026-11-19): GOP CA = 1 PO + 1 ma CEO (nhu gop vi pham) - khop backend lib/caCeo gomCaCeo; dong co 2-3 ma nam trong 2-3 ca.
 * Do hot ca: moi dong da xong -> DA_XONG · co dong RAT_HOT -> RAT_HOT · con lai GIAM_HOT. Tab "Dang theo doi" (rat hot + giam hot) / tab nho "Da xong".
 */
interface Ma { ma: string; ten: string; nguong: string; gia_tri: string; chi_tiet: string[] }
interface R {
  item_id: number; eo_id: number; po: string; ma_lk: string; ten_lk: string; kho: string; doi_tac: string | null; nguoi_dat: string | null;
  so_luong_dat: number; sl_ve: number; con_thieu: number; bat_dau: string | null; ngay_du_kien: string | null; ngay_nm_cam_ket: string | null; tinh_trang: string;
  so_lan_lui: number; so_loi: number; so_loi_cho_gt: number; ma_ceo: Ma[];
  ton: number | null; gd: string | null; qua_dk: number; thuc: number; thuc7: number; thuc_luc: string | null; phan_hoi: number; phan_hoi_luc: string | null; phan_hoi_tt: string | null;
  gt_nd: string | null; gt_luc: string | null; gt_ai_ma: string | null; gt_loi_ma: string | null; td_luc: string | null; td_loai: string | null; td_ai: string | null; im_lang: number | null; nhac: number;
  /** v0.098 do hot (backend lib/caCeo): RAT_HOT con thieu + loi <= 7 ngay chua giai trinh · GIAM_HOT con thieu + loi > 7 ngay / da giai trinh bu · DA_XONG hang ve du / phuc */
  muc_xu_ly: Muc; ly_do_xu_ly: string[]; so_gt_that: number; so_tu_dong_qua_han: number;
}
type Muc = "RAT_HOT" | "GIAM_HOT" | "DA_XONG";
const MUC: Record<Muc, { l: string; ngan: string; mau: string; nen: string; icon: string; mo_ta: string }> = {
  RAT_HOT: { l: "Rất hot — chưa xử lý", ngan: "Rất hot", mau: "#B91C1C", nen: "#FEE2E2", icon: "🔴", mo_ta: "còn thiếu hàng + có lỗi ghi nhận ≤ 7 ngày chưa giải trình" },
  GIAM_HOT: { l: "Đang giảm hot", ngan: "Giảm hot", mau: "#C2410C", nen: "#FFEDD5", icon: "🟠", mo_ta: "còn thiếu hàng + lỗi đã > 7 ngày (hệ thống tự đóng) hoặc đã giải trình bù" },
  DA_XONG: { l: "Đã xong — không còn hot", ngan: "Đã xong", mau: "#64748B", nen: "#F1F5F9", icon: "⚪", mo_ta: "hàng đã về đủ / kết thúc sớm — từng chạm ngưỡng CEO" },
};
/** gia tri muc la (du lieu ban cu / API doi) -> khong vo man */
const mucCua = (k: string) => MUC[k as Muc] ?? { l: k, ngan: k, mau: "#64748B", nen: "#F1F5F9", icon: "•", mo_ta: "" };
const MA_CEO: { ma: string; l: string; mau: string }[] = [
  { ma: "ER.MH-201", l: "Lùi ngày dự kiến ≥ 3 lần", mau: "#B91C1C" },
  { ma: "ER.MH-202", l: "Ngày dự kiến cách ngày đặt ≥ 30 ngày", mau: "#C2410C" },
  { ma: "ER.MH-203", l: "≥ 3 lỗi trên dòng", mau: "#7F1D1D" },
];

/** 1 dong bang = 1 dong LK trong 1 ca (PO + ma CEO) */
interface C extends R { _ma: Ma; _khoa: string; _muc_ca: Muc }
const THU: Record<Muc, number> = { RAT_HOT: 3, GIAM_HOT: 2, DA_XONG: 1 };
interface Ca { khoa: string; eo_id: number; po: string; ma: string; muc: Muc; dong: C[] }
function gomCa(rows: R[]): Ca[] {
  const m = new Map<string, Ca>();
  for (const r of rows) for (const x of r.ma_ceo ?? []) {
    const k = `${r.eo_id}|${x.ma}`;
    const c = m.get(k) ?? { khoa: k, eo_id: r.eo_id, po: r.po, ma: x.ma, muc: "GIAM_HOT" as Muc, dong: [] };
    c.dong.push({ ...r, _ma: x, _khoa: k, _muc_ca: "GIAM_HOT" }); m.set(k, c);
  }
  const out = [...m.values()];
  for (const c of out) {
    c.muc = c.dong.every((r) => r.muc_xu_ly === "DA_XONG") ? "DA_XONG" : c.dong.some((r) => r.muc_xu_ly === "RAT_HOT") ? "RAT_HOT" : "GIAM_HOT";
    for (const r of c.dong) r._muc_ca = c.muc;
    c.dong.sort((a, b) => (THU[b.muc_xu_ly] ?? 0) - (THU[a.muc_xu_ly] ?? 0) || (b.ton ?? 0) - (a.ton ?? 0));
  }
  // ca nong nhat len dau, cung muc -> ton lau nhat truoc
  const tonMax = (c: Ca) => Math.max(0, ...c.dong.map((r) => r.ton ?? 0));
  return out.sort((a, b) => THU[b.muc] - THU[a.muc] || tonMax(b) - tonMax(a));
}

export default function CaCeo() {
  const qv = useQuickView();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ca-ceo"], queryFn: () => api.get<{ rows: R[]; quan_ly: boolean }>("/ca-ceo") });
  const [muc, setMuc] = useState<Muc | "">("");
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  const [ma, setMa] = useState("");
  const [tab, setTab] = useState<"dang" | "xong">("dang");
  const rows = q.data?.rows ?? [];
  const caAll = useMemo(() => gomCa(rows), [rows]);
  const caTab = useMemo(() => caAll.filter((c) => (tab === "xong") === (c.muc === "DA_XONG")), [caAll, tab]);
  const ds = useMemo(() => caTab.filter((c) => (!ma || c.ma === ma) && (!muc || c.muc === muc)).flatMap((c) => c.dong), [caTab, ma, muc]);
  const soXong = caAll.filter((c) => c.muc === "DA_XONG").length;
  const caDang = caAll.length - soXong;
  const doiTab = (t: "dang" | "xong") => { setTab(t); setMuc(""); };
  if (q.isLoading) return <><PageHeader title="Ca tồn CEO" /><Spinner /></>;

  const cols: Col<C>[] = [
    { key: "muc", header: "Mức xử lý", loc: "chon", gt: (r) => r.muc_xu_ly, nhanChon: (v) => MUC[v as Muc]?.ngan ?? v, gtSap: (r) => ({ RAT_HOT: 3, GIAM_HOT: 2, DA_XONG: 1 })[r.muc_xu_ly], maxW: 230,
      render: (r) => <div title={r.ly_do_xu_ly.join("\n")}>
        <span style={{ background: mucCua(r.muc_xu_ly).nen, color: mucCua(r.muc_xu_ly).mau, fontWeight: 800, fontSize: 11.5, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{mucCua(r.muc_xu_ly).icon} {mucCua(r.muc_xu_ly).ngan}</span>
        <div style={{ fontSize: 11.5, color: mucCua(r.muc_xu_ly).mau, marginTop: 2 }}>{r.ly_do_xu_ly.slice(0, 2).join(" · ")}{r.ly_do_xu_ly.length > 2 ? " …" : ""}</div></div> },
    { key: "ma", header: "Mã CEO · lý do", loc: "chon", gt: (r) => r._ma.ma, maxW: 280,
      render: (r) => <span title={`${r._ma.ten}: ${r._ma.gia_tri} (ngưỡng ${r._ma.nguong})\n${r._ma.chi_tiet.join("\n")}`} style={{ fontSize: 12 }}>
        <b style={{ fontFamily: "ui-monospace, monospace", color: "#7F1D1D" }}>{r._ma.ma}</b> {r._ma.ten} · <b>{r._ma.gia_tri}</b>
        {r.ma_ceo.length > 1 && <div className="muted" style={{ fontSize: 11 }}>dòng này còn ở ca {r.ma_ceo.filter((x) => x.ma !== r._ma.ma).map((x) => x.ma.replace("ER.MH-", "")).join(", ")}</div>}</span> },
    { key: "po", header: "PO", loc: "chu", gt: (r) => r.po, render: (r) => <span className="cell-link" onClick={(e) => { e.stopPropagation(); qv.openEo(r.eo_id); }}>{r.po}</span> },
    { key: "lk", header: "Mã LK", loc: "chu", gt: (r) => `${r.ma_lk} ${r.ten_lk}`, gtSap: (r) => r.ma_lk, maxW: 170, render: (r) => <><b style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.ma_lk}</b><div className="muted" style={{ fontSize: 11 }}>{r.ten_lk}</div></> },
    { key: "ncc", header: "NCC", loc: "chon", gt: (r) => r.doi_tac ?? "", render: (r) => r.doi_tac ?? "—" },
    { key: "kho", header: "Kho", loc: "chon", gt: (r) => r.kho, render: (r) => r.kho },
    { key: "nguoi", header: "Người đặt", loc: "chon", gt: (r) => r.nguoi_dat ?? "", nhanChon: (v) => ten(v), render: (r) => ten(r.nguoi_dat) },
    { key: "ton", header: "Tồn", loc: "so", gt: (r) => r.ton, align: "right", render: (r) => <b style={{ color: (r.ton ?? 0) > 30 ? "var(--danger-ink)" : undefined }}>{r.ton ?? "—"} ng</b> },
    { key: "thieu", header: "Thiếu / đặt", loc: "so", gt: (r) => r.con_thieu, align: "right", render: (r) => <>{soLuong(r.con_thieu)}<div className="muted" style={{ fontSize: 11 }}>/ {soLuong(r.so_luong_dat)}</div></> },
    { key: "ndk", header: "Ngày DK", loc: "ngay", gt: (r) => r.ngay_du_kien, render: (r) => r.ngay_du_kien ? <>{ngay(r.ngay_du_kien)}<div style={{ fontSize: 11, color: r.qua_dk ? "var(--danger-ink)" : "var(--text-muted)" }}>{r.qua_dk ? `quá ${r.qua_dk} ng` : ""}{r.so_lan_lui ? ` · lùi ${r.so_lan_lui}` : ""}</div></> : <span className="muted">chưa có</span> },
    { key: "loi", header: "Lỗi chờ / tổng", loc: "so", gt: (r) => r.so_loi_cho_gt, align: "right", render: (r) => <><b style={{ color: r.so_loi_cho_gt ? "var(--danger-ink)" : undefined }}>{r.so_loi_cho_gt}</b><span className="muted">/{r.so_loi}</span></> },
    { key: "thuc", header: "Thúc NCC", loc: "so", gt: (r) => r.thuc7, align: "right", render: (r) => <span title="Push + mail gửi NCC + gọi/Zalo"><b style={{ color: r.thuc7 ? "var(--ok-ink)" : "var(--danger-ink)" }}>{r.thuc7}</b><span className="muted"> /7ng · {r.thuc}</span><div className="muted" style={{ fontSize: 11 }}>{r.thuc_luc ? tuBayGio(r.thuc_luc) : "chưa thúc"}</div></span> },
    { key: "ph", header: "NCC trả lời gần nhất", loc: "chu", gt: (r) => r.phan_hoi_tt ?? "", maxW: 220, render: (r) => r.phan_hoi_tt ? <span title={r.phan_hoi_tt} style={{ fontSize: 12 }}>{r.phan_hoi_tt}<div className="muted" style={{ fontSize: 11 }}>{tuBayGio(r.phan_hoi_luc)}</div></span> : <span className="muted" style={{ fontSize: 12 }}>chưa trả lời</span> },
    { key: "gt", header: "Giải trình gần nhất", loc: "chu", gt: (r) => r.gt_nd ?? "", maxW: 220, render: (r) => r.gt_nd ? <span title={r.gt_nd}><span style={{ fontSize: 11.5, fontWeight: 700 }}>{tenDm("AI", r.gt_ai_ma)} · {tenDm("LOI", r.gt_loi_ma)}</span><div style={{ fontSize: 12 }}>{r.gt_nd}</div></span> : <span className="muted" style={{ fontSize: 12 }}>chưa giải trình</span> },
    { key: "im", header: "Hoạt động cuối", loc: "so", gt: (r) => r.im_lang, render: (r) => <span title={r.td_luc ? `${r.td_loai} · ${ten(r.td_ai)} · ${ngayGio(r.td_luc)}` : ""}><b style={{ color: (r.im_lang ?? 0) >= 7 ? "var(--danger-ink)" : undefined }}>Im lặng {r.im_lang ?? "—"} ng</b><div className="muted" style={{ fontSize: 11 }}>{r.td_loai ?? "chưa tác động"}</div></span> },
    { key: "nhac", header: "Bị nhắc", loc: "so", gt: (r) => r.nhac, align: "right", render: (r) => r.nhac || <span className="muted">0</span> },
  ];
  const xuat = () => exportRowsToXlsx(ds, [
    { header: "Ca (PO · mã CEO)", get: (r) => `${r.po} · ${r._ma.ma}` }, { header: "Mức của ca", get: (r) => mucCua(r._muc_ca).l },
    { header: "Mức của dòng", get: (r) => mucCua(r.muc_xu_ly).l }, { header: "Lý do mức", get: (r) => r.ly_do_xu_ly.join("; ") },
    { header: "Mã CEO", get: (r) => r._ma.ma }, { header: "Lý do", get: (r) => `${r._ma.ten}: ${r._ma.gia_tri}` },
    { header: "PO", get: (r) => r.po }, { header: "Mã LK", get: (r) => r.ma_lk }, { header: "Tên LK", get: (r) => r.ten_lk }, { header: "NCC", get: (r) => r.doi_tac },
    { header: "Kho", get: (r) => r.kho }, { header: "Người đặt", get: (r) => ten(r.nguoi_dat) }, { header: "Tồn (ngày)", get: (r) => r.ton },
    { header: "SL đặt", get: (r) => r.so_luong_dat }, { header: "Còn thiếu", get: (r) => r.con_thieu }, { header: "Ngày DK", get: (r) => ngay(r.ngay_du_kien) },
    { header: "Số lần lùi", get: (r) => r.so_lan_lui }, { header: "Lỗi chờ GT", get: (r) => r.so_loi_cho_gt }, { header: "Tổng lỗi", get: (r) => r.so_loi },
    { header: "Thúc NCC 7 ngày", get: (r) => r.thuc7 }, { header: "NCC trả lời gần nhất", get: (r) => r.phan_hoi_tt }, { header: "Giải trình gần nhất", get: (r) => r.gt_nd },
    { header: "Im lặng (ngày)", get: (r) => r.im_lang },
  ], tab === "xong" ? "ca_ceo_da_xong.xlsx" : "ca_ton_ceo.xlsx", "Ca ton CEO");

  const tenMa = (m: string) => MA_CEO.find((x) => x.ma === m)?.l ?? m;
  const nhomCfg = {
    khoa: (r: C) => r._khoa,
    dau: (_k: string, d: C[]) => {
      const r0 = d[0]; const mc = mucCua(r0._muc_ca);
      const xong = d.filter((r) => r.muc_xu_ly === "DA_XONG").length;
      const cho = d.reduce((s, r) => s + r.so_loi_cho_gt, 0);
      const mo = d.filter((r) => r.muc_xu_ly !== "DA_XONG"); // ton / thuc chi tinh dong con thieu
      const tonMax = Math.max(0, ...mo.map((r) => r.ton ?? 0));
      const thuc = Math.max(0, ...mo.map((r) => r.thuc7));
      return <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
        <span style={{ background: mc.nen, color: mc.mau, fontWeight: 800, fontSize: 11.5, borderRadius: 6, padding: "2px 8px" }}>{mc.icon} {mc.ngan}</span>
        <b style={{ fontFamily: "ui-monospace, monospace", color: "#7F1D1D" }}>{r0._ma.ma}</b><span>{tenMa(r0._ma.ma)}</span>
        <span className="cell-link" onClick={(e) => { e.stopPropagation(); qv.openEo(r0.eo_id); }}><b>{r0.po}</b></span>
        <span className="muted">{r0.doi_tac ?? "—"} · {ten(r0.nguoi_dat)}</span>
        <span><b>{d.length}</b> dòng LK{xong && tab === "dang" ? ` · ${xong} đã xong` : ""}</span>
        {tab === "dang" && <span>tồn <b style={{ color: tonMax > 30 ? "var(--danger-ink)" : undefined }}>{tonMax} ng</b></span>}
        {cho > 0 && <span style={{ color: "var(--danger-ink)" }}>lỗi chờ GT <b>{cho}</b></span>}
        {tab === "dang" && <span style={{ color: thuc ? "var(--ok-ink)" : "var(--danger-ink)" }}>thúc NCC 7 ng: <b>{thuc}</b></span>}
      </span>;
    },
  };
  const nutTab = (t: "dang" | "xong", nhan: string, n: number, lon: boolean) => (
    <button key={t} onClick={() => doiTab(t)} className={`btn${lon ? "" : " sm"}`}
      style={{ fontWeight: tab === t ? 800 : 500, background: tab === t ? (t === "dang" ? "#FEE2E2" : "#F1F5F9") : "#fff",
        borderColor: tab === t ? (t === "dang" ? "#B91C1C" : "#64748B") : "var(--border)", color: t === "dang" ? "#7F1D1D" : "#475569" }}>
      {nhan} <span style={{ fontWeight: 800 }}>({soLuong(n)} ca)</span></button>);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHeader title="Ca tồn CEO" />
      {/* v0.100: 2 tab - Dang theo doi (rat hot + giam hot) / tab nho Da xong (tranh loang) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {nutTab("dang", "🔥 Đang theo dõi", caDang, true)}
        {nutTab("xong", "⚪ Đã xong", soXong, false)}
        <span className="muted" style={{ fontSize: 12 }}>1 ca = 1 PO + 1 mã CEO (gộp các dòng LK cùng lý do trên PO đó, như gộp vi phạm) · tổng {soLuong(caAll.length)} ca / {soLuong(rows.length)} dòng LK</span>
      </div>
      {tab === "dang" && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {(["RAT_HOT", "GIAM_HOT"] as Muc[]).map((k) => {
          const x = caTab.filter((c) => c.muc === k); const on = muc === k;
          return (
            <div key={k} onClick={() => setMuc(on ? "" : k)} title={on ? "Bấm lần nữa để bỏ lọc" : "Bấm để lọc"}
              style={{ cursor: "pointer", background: on ? MUC[k].nen : "#fff", border: `2px solid ${on ? MUC[k].mau : "var(--border)"}`, borderLeft: `8px solid ${MUC[k].mau}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontWeight: 800, color: MUC[k].mau, fontSize: 14 }}>{MUC[k].icon} {MUC[k].l}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: x.length ? MUC[k].mau : "#94A3B8" }}>{soLuong(x.length)}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>ca · {new Set(x.map((c) => c.eo_id)).size} PO · {new Set(x.flatMap((c) => c.dong.map((r) => r.item_id))).size} dòng LK</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>{k === "RAT_HOT" ? "Ca có ít nhất 1 dòng " : "Ca có dòng "}{MUC[k].mo_ta}</div>
            </div>
          );
        })}
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <O l={tab === "dang" ? "Ca đang theo dõi" : "Ca đã xong"} v={caTab.length} sub={`${new Set(caTab.map((c) => c.eo_id)).size} PO · ${new Set(caTab.flatMap((c) => c.dong.map((r) => r.item_id))).size} dòng LK`} on={!ma && !muc} onClick={() => { setMa(""); setMuc(""); }} />
        {MA_CEO.map((m) => (
          <O key={m.ma} l={`${m.ma} · ${m.l}`} v={caTab.filter((c) => c.ma === m.ma).length} sub="ca" mau={m.mau} on={ma === m.ma} onClick={() => setMa(ma === m.ma ? "" : m.ma)} />
        ))}
        {tab === "dang" && <O l="Ca không thúc NCC 7 ngày" v={caTab.filter((c) => c.dong.every((r) => r.muc_xu_ly === "DA_XONG" || !r.thuc7)).length} mau="#B91C1C" sub="mọi dòng còn thiếu đều chưa được thúc" />}
      </div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>{tab === "dang" ? "Ca còn thiếu hàng, nóng nhất lên đầu." : "Ca mà mọi dòng đã về đủ / kết thúc — để tra cứu."} Bấm tiêu đề ca để thu gọn / mở. Mốc 7 ngày = mốc hệ thống tự đóng lỗi chưa giải trình. Rê chuột lên mã CEO xem diễn giải (từng lần lùi, mốc ngày, lỗi theo quy tắc). Bấm dòng → popup đơn hàng (tab "Mã lỗi & giải trình", "Trao đổi NCC").</span>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => qc.invalidateQueries({ queryKey: ["ca-ceo"] })} title="Tải lại"><I.refresh width={13} height={13} /></button>
          <button className="btn sm" onClick={xuat} title="Xuất Excel"><I.download width={14} height={14} /></button>
        </div>
        <DataTable key={tab} cols={cols} rows={ds} keyOf={(r) => r.item_id} pageSize={30} nhom={nhomCfg} onRowClick={(r) => qv.openDong(r.item_id)}
          empty={tab === "dang" ? "Không có ca CEO đang theo dõi." : "Chưa có ca CEO nào đã xong."} />
      </Card>
    </div>
  );
}

function O({ l, v, sub, mau, on, onClick }: { l: string; v: number; sub?: string; mau?: string; on?: boolean; onClick?: () => void }) {
  return (
    <div className="ql-o" onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined, outline: on ? "2px solid var(--brand-yellow-btn)" : undefined, borderTop: `3px solid ${mau ?? "var(--border)"}` }}>
      <div className="ql-l">{l}</div>
      <div className="ql-v" style={{ color: v ? mau : undefined }}>{soLuong(v)}</div>
      {sub && <div className="ql-s">{sub}</div>}
    </div>
  );
}
