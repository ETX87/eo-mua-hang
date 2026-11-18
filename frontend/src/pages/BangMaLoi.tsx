import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Card, PageHeader, Spinner } from "../components/ui";
import { DataTable, type Col } from "../components/DataTable";
import { soLuong } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { I } from "../lib/icons";

/**
 * BANG MA LOI (v0.092, yeu cau lanh dao "1 bang ma loi chi tiet: ten, loi gi, giai trinh, dien giai va so luong loi dang dem").
 * GET /api/vi-pham/ma-loi: danh muc ER.MH (backend lib/maLoi: ten, mo ta = loi gi, yeu cau giai trinh, tu dong khi nao) + so dang dem:
 *  0xx / 1xx: theo pham vi nguoi xem (cho giai trinh · da giai trinh that · tu dong do da khac phuc · tu dong do qua 7 ngay = vi pham khong giai trinh)
 *  2xx: so dong dang mo cap CEO · 3xx: so dong dang tre buoc / tre trong 30 ngay (toan he thong).
 * Bam "Xem lỗi" -> man Vi pham loc dung ma.
 */
interface Def { ma: string; ten: string; nhom: string; buoc: string | null; giai_trinh: boolean; mo_ta: string; yeu_cau_gt?: string; tu_dong?: string }
interface Th { ma: string; so_loi: number; so_ban_ghi?: number; cho: number; da_gt: number; tu_khac_phuc: number; tu_qua_han: number; so_po: number; so_dong: number; ty_le_gt: number | null }
interface Data { bang: Def[]; tong_hop: Th[]; dem_ceo: Record<string, number>; dem_gd: Record<string, { dang: number; dang_tre: number; xong30: number; tre30: number }>; so_ngay_tu_dong: number }
type Dong = Def & { th?: Th; dem: number | null; phu: string };
const NHOM: Record<string, { l: string; mau: string }> = {
  HE_THONG: { l: "Hệ thống ghi · phải GT", mau: "#DC2626" }, TAY: { l: "Ghi khi giải trình", mau: "#2563EB" },
  CEO: { l: "Cấp CEO", mau: "#7F1D1D" }, GIAI_DOAN: { l: "Trễ hạn bước · chỉ đo", mau: "#B45309" },
};
const TEN_GD: Record<string, string> = { G1: "Lập & trình", G2: "Thẩm định", G3: "Duyệt mua", G4: "Gửi đơn NCC", G5: "Có ngày DK", G6: "Chờ SX & giao", G7: "Nhập kho", G8: "Giao bù" };

export default function BangMaLoi() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["vi-pham-ma-loi"], queryFn: () => api.get<Data>("/vi-pham/ma-loi") });
  if (q.isLoading || !q.data) return <><PageHeader title="Bảng mã lỗi" /><Spinner /></>;
  const d = q.data;
  const thBy = new Map(d.tong_hop.map((t) => [t.ma, t]));
  const rows: Dong[] = d.bang.map((b) => {
    const th = thBy.get(b.ma);
    if (b.nhom === "CEO") return { ...b, dem: d.dem_ceo[b.ma] ?? 0, phu: "dòng đang ở cấp CEO" };
    if (b.nhom === "GIAI_DOAN") { const g = b.buoc ? d.dem_gd[b.buoc] : undefined; return { ...b, dem: g?.dang_tre ?? 0, phu: g ? `đang trễ · ${soLuong(g.tre30)} trễ / ${soLuong(g.xong30)} qua bước 30 ngày` : "" }; }
    return { ...b, th, dem: th?.so_loi ?? 0, phu: th?.so_loi ? `vi phạm · ${th.so_po} PO · ${th.so_dong} dòng` : "" };
  });
  const xemLoi = (ma: string) => nav(`/vi-pham?xem=tat_ca&tt=&ma=${encodeURIComponent(ma)}`);
  const so = (v: number | undefined, mau?: string) => (v ? <b style={{ color: mau }}>{soLuong(v)}</b> : <span className="muted">0</span>);
  const cols: Col<Dong>[] = [
    { key: "ma", header: "Mã lỗi", loc: "chu", gt: (r) => r.ma, render: (r) => <b style={{ fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>{r.ma}</b> },
    { key: "nhom", header: "Nhóm", loc: "chon", gt: (r) => r.nhom, nhanChon: (v) => NHOM[v]?.l ?? v, render: (r) => <span style={{ color: NHOM[r.nhom]?.mau, fontSize: 12, fontWeight: 700 }}>{NHOM[r.nhom]?.l}</span> },
    { key: "buoc", header: "Bước", loc: "chon", gt: (r) => r.buoc ?? "", nhanChon: (v) => (v ? `${v} ${TEN_GD[v]}` : "Không gắn bước"), render: (r) => (r.buoc ? <span style={{ whiteSpace: "nowrap" }}><b>{r.buoc}</b> <span className="muted" style={{ fontSize: 11 }}>{TEN_GD[r.buoc]}</span></span> : <span className="muted">—</span>) },
    { key: "ten", header: "Tên lỗi · lỗi gì (diễn giải)", loc: "chu", gt: (r) => `${r.ten} ${r.mo_ta}`, wrap: true, width: 220, render: (r) => <div style={{ minWidth: 340 }}><b>{r.ten}</b><div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{r.mo_ta}</div></div> },
    { key: "gt", header: "Yêu cầu giải trình", loc: "chu", gt: (r) => r.yeu_cau_gt, wrap: true, width: 230, render: (r) => <div style={{ minWidth: 220, fontSize: 12.5 }}>{r.yeu_cau_gt}</div> },
    { key: "td", header: "Tự giải trình khi", loc: "chu", gt: (r) => r.tu_dong, wrap: true, width: 230, render: (r) => <div style={{ minWidth: 220, fontSize: 12.5 }}>{r.tu_dong}</div> },
    { key: "dem", header: "Đang đếm", loc: "so", gt: (r) => r.dem, align: "right",
      render: (r) => <span title={r.nhom === "HE_THONG" || r.nhom === "TAY" ? "Tổng lỗi đã ghi nhận (mọi trạng thái)" : undefined}><b style={{ fontSize: 15 }}>{soLuong(r.dem ?? 0)}</b><div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{r.phu}</div></span> },
    { key: "cho", header: "Chờ giải trình", loc: "so", gt: (r) => r.th?.cho ?? null, align: "right", render: (r) => (r.th ? so(r.th.cho, "var(--danger-ink)") : <span className="muted">—</span>) },
    { key: "da", header: "Đã giải trình", loc: "so", gt: (r) => r.th?.da_gt ?? null, align: "right",
      render: (r) => (r.th ? <>{so(r.th.da_gt, "var(--ok-ink)")}{r.th.so_loi > 0 && <div className="muted" style={{ fontSize: 11 }}>{r.th.ty_le_gt ?? 0}%</div>}</> : <span className="muted">—</span>) },
    { key: "kp", header: "Tự đóng · đã khắc phục", loc: "so", gt: (r) => r.th?.tu_khac_phuc ?? null, align: "right", render: (r) => (r.th ? so(r.th.tu_khac_phuc) : <span className="muted">—</span>) },
    { key: "qh", header: `Tự đóng · quá ${d.so_ngay_tu_dong} ngày (vi phạm)`, loc: "so", gt: (r) => r.th?.tu_qua_han ?? null, align: "right", render: (r) => (r.th ? so(r.th.tu_qua_han, "#B45309") : <span className="muted">—</span>) },
    { key: "act", header: "", render: (r) => (r.nhom === "HE_THONG" || r.nhom === "TAY") && r.dem
      ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); xemLoi(r.ma); }}>Xem lỗi</button>
      : r.nhom === "CEO" && r.dem ? <button className="btn sm" onClick={() => nav("/ca-ceo")}>Ca tồn CEO</button> : null },
  ];
  const THU_TU = ["act", "ma", "nhom", "buoc", "ten", "dem", "cho", "da", "kp", "qh", "gt", "td"];
  cols.sort((x, y) => THU_TU.indexOf(x.key) - THU_TU.indexOf(y.key));
  const tong = d.tong_hop.reduce((s, t) => ({ loi: s.loi + t.so_loi, cho: s.cho + t.cho, da: s.da + t.da_gt, kp: s.kp + t.tu_khac_phuc, qh: s.qh + t.tu_qua_han }), { loi: 0, cho: 0, da: 0, kp: 0, qh: 0 });
  const xuat = () => exportRowsToXlsx(rows, [
    { header: "Mã lỗi", get: (r) => r.ma }, { header: "Nhóm", get: (r) => NHOM[r.nhom]?.l }, { header: "Bước", get: (r) => r.buoc }, { header: "Tên lỗi", get: (r) => r.ten },
    { header: "Lỗi gì (diễn giải)", get: (r) => r.mo_ta }, { header: "Yêu cầu giải trình", get: (r) => r.yeu_cau_gt }, { header: "Tự giải trình khi", get: (r) => r.tu_dong },
    { header: "Đang đếm", get: (r) => r.dem }, { header: "Chờ giải trình", get: (r) => r.th?.cho }, { header: "Đã giải trình", get: (r) => r.th?.da_gt },
    { header: "Tự đóng - đã khắc phục", get: (r) => r.th?.tu_khac_phuc }, { header: "Tự đóng - quá hạn (vi phạm)", get: (r) => r.th?.tu_qua_han },
  ], "bang_ma_loi.xlsx", "Ma loi");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHeader title="Bảng mã lỗi" />
      <Card>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline", fontSize: 13.5 }}>
          <span>Vi phạm đã ghi nhận <b>{soLuong(tong.loi)}</b></span>
          <span>Chờ giải trình <b style={{ color: "var(--danger-ink)" }}>{soLuong(tong.cho)}</b></span>
          <span>Đã giải trình <b style={{ color: "var(--ok-ink)" }}>{soLuong(tong.da)}</b></span>
          <span>Tự đóng do đã khắc phục <b>{soLuong(tong.kp)}</b></span>
          <span>Tự đóng do quá {d.so_ngay_tu_dong} ngày (tính vi phạm) <b style={{ color: "#B45309" }}>{soLuong(tong.qh)}</b></span>
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={xuat} title="Xuất Excel bảng mã"><I.download width={14} height={14} /></button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          1 vi phạm = cùng lỗi, cùng PO, cùng kỳ (R1: cả PO · R3: mỗi ngày kiểm tra thứ 2/4 · R4: mỗi mốc ngày DK bị quá), dù nhiều dòng. Số 0xx / 1xx theo phạm vi bạn được xem; 2xx = dòng đang ở cấp CEO; 3xx = dòng đang trễ hạn ở bước đó (toàn hệ thống). Lỗi tự đóng vẫn tính là vi phạm.
        </div>
      </Card>
      <Card pad={false}><DataTable cols={cols} rows={rows} keyOf={(r) => r.ma} pageSize={30} timKiem={false} /></Card>
    </div>
  );
}
