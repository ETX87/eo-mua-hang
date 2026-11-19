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

export default function CaCeo() {
  const qv = useQuickView();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ca-ceo"], queryFn: () => api.get<{ rows: R[]; quan_ly: boolean }>("/ca-ceo") });
  const [muc, setMuc] = useState<Muc | "">("");
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  const [ma, setMa] = useState("");
  const rows = q.data?.rows ?? [];
  const ds = useMemo(() => rows.filter((r) => (!ma || r.ma_ceo.some((m) => m.ma === ma)) && (!muc || r.muc_xu_ly === muc)), [rows, ma, muc]);
  if (q.isLoading) return <><PageHeader title="Ca tồn CEO" /><Spinner /></>;

  const cols: Col<R>[] = [
    { key: "muc", header: "Mức xử lý", loc: "chon", gt: (r) => r.muc_xu_ly, nhanChon: (v) => MUC[v as Muc]?.ngan ?? v, gtSap: (r) => ({ RAT_HOT: 3, GIAM_HOT: 2, DA_XONG: 1 })[r.muc_xu_ly], maxW: 230,
      render: (r) => <div title={r.ly_do_xu_ly.join("\n")}>
        <span style={{ background: mucCua(r.muc_xu_ly).nen, color: mucCua(r.muc_xu_ly).mau, fontWeight: 800, fontSize: 11.5, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{mucCua(r.muc_xu_ly).icon} {mucCua(r.muc_xu_ly).ngan}</span>
        <div style={{ fontSize: 11.5, color: mucCua(r.muc_xu_ly).mau, marginTop: 2 }}>{r.ly_do_xu_ly.slice(0, 2).join(" · ")}{r.ly_do_xu_ly.length > 2 ? " …" : ""}</div></div> },
    { key: "ma", header: "Mã CEO · lý do", loc: "chon", gt: (r) => r.ma_ceo.map((m) => m.ma), gtSap: (r) => r.ma_ceo.length, maxW: 280,
      render: (r) => <div style={{ display: "grid", gap: 3 }}>{r.ma_ceo.map((m) => (
        <span key={m.ma} title={`${m.ten}: ${m.gia_tri} (ngưỡng ${m.nguong})\n${m.chi_tiet.join("\n")}`} style={{ fontSize: 12 }}>
          <b style={{ fontFamily: "ui-monospace, monospace", color: "#7F1D1D" }}>{m.ma}</b> {m.ten} · <b>{m.gia_tri}</b></span>))}</div> },
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
    { header: "Mức xử lý", get: (r) => mucCua(r.muc_xu_ly).l }, { header: "Lý do mức", get: (r) => r.ly_do_xu_ly.join("; ") },
    { header: "Mã CEO", get: (r) => r.ma_ceo.map((m) => m.ma).join(", ") }, { header: "Lý do", get: (r) => r.ma_ceo.map((m) => `${m.ten}: ${m.gia_tri}`).join("; ") },
    { header: "PO", get: (r) => r.po }, { header: "Mã LK", get: (r) => r.ma_lk }, { header: "Tên LK", get: (r) => r.ten_lk }, { header: "NCC", get: (r) => r.doi_tac },
    { header: "Kho", get: (r) => r.kho }, { header: "Người đặt", get: (r) => ten(r.nguoi_dat) }, { header: "Tồn (ngày)", get: (r) => r.ton },
    { header: "SL đặt", get: (r) => r.so_luong_dat }, { header: "Còn thiếu", get: (r) => r.con_thieu }, { header: "Ngày DK", get: (r) => ngay(r.ngay_du_kien) },
    { header: "Số lần lùi", get: (r) => r.so_lan_lui }, { header: "Lỗi chờ GT", get: (r) => r.so_loi_cho_gt }, { header: "Tổng lỗi", get: (r) => r.so_loi },
    { header: "Thúc NCC 7 ngày", get: (r) => r.thuc7 }, { header: "NCC trả lời gần nhất", get: (r) => r.phan_hoi_tt }, { header: "Giải trình gần nhất", get: (r) => r.gt_nd },
    { header: "Im lặng (ngày)", get: (r) => r.im_lang },
  ], "ca_ton_ceo.xlsx", "Ca ton CEO");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHeader title="Ca tồn CEO" />
      {/* v0.097: 3 muc xu ly - bam = loc; tong = 100% ca CEO dang mo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {(Object.keys(MUC) as Muc[]).map((k) => {
          const x = rows.filter((r) => r.muc_xu_ly === k); const on = muc === k;
          return (
            <div key={k} onClick={() => setMuc(on ? "" : k)} title={on ? "Bấm lần nữa để bỏ lọc" : "Bấm để lọc"}
              style={{ cursor: "pointer", background: on ? MUC[k].nen : "#fff", border: `2px solid ${on ? MUC[k].mau : "var(--border)"}`, borderLeft: `8px solid ${MUC[k].mau}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontWeight: 800, color: MUC[k].mau, fontSize: 14 }}>{MUC[k].icon} {MUC[k].l}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: x.length ? MUC[k].mau : "#94A3B8" }}>{soLuong(x.length)}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>ca · {new Set(x.map((r) => r.po)).size} PO · {rows.length ? Math.round((x.length / rows.length) * 100) : 0}%</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>{MUC[k].mo_ta}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <O l="Tổng ca từng chạm cấp CEO" v={rows.length} sub={`${new Set(rows.map((r) => r.eo_id)).size} PO · ${new Set(rows.map((r) => r.nguoi_dat)).size} người đặt`} on={!ma && !muc} onClick={() => { setMa(""); setMuc(""); }} />
        {MA_CEO.map((m) => (
          <O key={m.ma} l={`${m.ma} · ${m.l}`} v={rows.filter((r) => r.ma_ceo.some((x) => x.ma === m.ma)).length} mau={m.mau} on={ma === m.ma} onClick={() => setMa(ma === m.ma ? "" : m.ma)} />
        ))}
        <O l="Không thúc NCC 7 ngày" v={rows.filter((r) => r.muc_xu_ly !== "DA_XONG" && !r.thuc7).length} mau="#B91C1C" sub="trong số ca còn thiếu hàng" />
      </div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Mọi dòng từng chạm ngưỡng cấp CEO (gồm cả dòng đã về đủ). Mốc 7 ngày = mốc hệ thống tự đóng lỗi chưa giải trình. Rê chuột lên mã CEO xem diễn giải (từng lần lùi, mốc ngày, lỗi theo quy tắc). Bấm dòng → popup đơn hàng (tab "Mã lỗi & giải trình", "Trao đổi NCC").</span>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => qc.invalidateQueries({ queryKey: ["ca-ceo"] })} title="Tải lại"><I.refresh width={13} height={13} /></button>
          <button className="btn sm" onClick={xuat} title="Xuất Excel"><I.download width={14} height={14} /></button>
        </div>
        <DataTable cols={cols} rows={ds} keyOf={(r) => r.item_id} pageSize={20} onRowClick={(r) => qv.openDong(r.item_id)} empty="Không có ca tồn cấp CEO." />
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
