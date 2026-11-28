import { useMemo } from "react";
import { DataTable, type Col } from "./DataTable";
import { useDanhMuc } from "../pages/theodoi/shared";
import { ngayGio, ten } from "../lib/format";
import { AI_MAC_DINH, NHAN_GT, ketLuanGt, trangThaiGt, viSaoLoi, mocLoi, nowVN, type TrangThaiGt } from "../lib/giaiTrinh";

/**
 * v0.149 (chu he thong 2026-11-28): DANH SACH VI PHAM cua 1 don hang (1 dong LK) dang bang, thay tab "Lỗi & giải trình".
 * Cot: giai doan loi · loai loi · so lan loi · nguoi vi pham · ngay ghi nhan · ngay giai trinh · trang thai GT · chot vi pham · thong tin GT.
 * Gop cac loi GIONG NHAU (cung giai doan + cung ma loi + cung nguoi chiu) vao 1 dong; "so lan" = so ky loi (vp_khoa);
 * trang thai GT hien so dem tung loai (vd "Vi phạm 1 · Đã giải trình 1"); chot vi pham = nang nhat (vi pham > chua chot > khong).
 * Loi BO_QUA (moc truoc 20/11/2026 / loi cu - luat LOI_TINH_TU) khong hien, chi ghi 1 dong chu nho.
 * Khong co loi -> component tra ve null (khong hien gi).
 */
const TEN_GD: Record<string, string> = { G1: "Lập & trình EO", G2: "Thẩm định", G3: "Duyệt mua & BH", G4: "Gửi đơn NCC", G5: "Chờ ngày DK", G6: "Chờ giao hàng", G7: "Nhập kho", G8: "Giao bù đến đủ" };
const THU_TU = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];
type Chot = "VI_PHAM" | "CHUA" | "KHONG";
const NHAN_CHOT: Record<Chot, { l: string; n: string; cls: string }> = {
  VI_PHAM: { l: "Vi phạm", n: "Vi phạm", cls: "reject" }, CHUA: { l: "Chưa chốt · còn hạn GT", n: "Chưa chốt", cls: "final" }, KHONG: { l: "Không vi phạm", n: "Không VP", cls: "issued" },
};
const MUC_TT: TrangThaiGt[] = ["VI_PHAM", "CAN_GT", "DA_GT", "KHAC_PHUC", "TAY", "BO_QUA"]; // nang -> nhe
const TT_NGAN: Record<TrangThaiGt, string> = { CAN_GT: "Cần GT", DA_GT: "Đã GT", KHAC_PHUC: "Đã khắc phục", VI_PHAM: "Vi phạm", BO_QUA: "Bỏ qua", TAY: "Ghi khi GT" };
/** dd/mm HH:mm (nam hien o title) */
const ngan = (v: string | null | undefined) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}${v.length > 10 ? ` ${v.slice(11, 16)}` : ""}` : "—");
const chotCua = (tt: TrangThaiGt): Chot => (tt === "VI_PHAM" ? "VI_PHAM" : tt === "CAN_GT" ? "CHUA" : "KHONG");

interface Muc {
  k: string; buoc: string; ma: string; ten: string; so_lan: number; nguoi: string; ghi_nhan: string | null; ghi_nhan_cuoi: string | null;
  ngay_gt: string | null; tt: TrangThaiGt; dem_tt: [TrangThaiGt, number][]; so_vp: number; chot: Chot; gt_txt: string; gt_boi: string | null; vi_sao: string; ket_luan: string;
}

export function BangViPhamDong({ loi, giaiTrinh, doiTac, nguoiDat, onGiaiTrinh, nhac }: {
  loi: any[]; giaiTrinh: any[]; doiTac?: string | null; nguoiDat?: string | null; onGiaiTrinh?: () => void;
  /** v0.154: nguoi dang mo co loi cho giai trinh -> nut Giai trinh sang len */
  nhac?: boolean;
}) {
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  const { ds, boQua } = useMemo(() => {
    const gtBy = new Map<number, any>(giaiTrinh.map((g) => [g.id, g]));
    const now = nowVN();
    const nhom = new Map<string, { l: any; k: ReturnType<typeof trangThaiGt>; nguoi: string }[]>();
    let boQua = 0;
    for (const l of loi) {
      const k = trangThaiGt(l, gtBy, now);
      if (k.tt === "BO_QUA") { boQua += 1; continue; }
      const gtThat = k.gt && k.gt.pham_vi !== "AUTO" ? k.gt : null;
      const aiMa = l.ai_ma ?? gtThat?.ai_ma ?? AI_MAC_DINH[l.quy_tac] ?? null;
      const aiEmail = l.ai_email ?? gtThat?.ai_email ?? null;
      const kem = aiEmail ? ten(aiEmail) : aiMa === "DOI_TAC" ? doiTac : aiMa === "NGUOI_DAT" ? (nguoiDat ? ten(nguoiDat) : null) : null;
      const nguoi = aiMa ? `${tenDm("AI", aiMa)}${kem ? ` (${kem})` : ""}` : kem ?? "—";
      const key = `${l.buoc ?? ""}|${l.ma_loi ?? l.quy_tac}|${nguoi}`;
      nhom.set(key, [...(nhom.get(key) ?? []), { l, k, nguoi }]);
    }
    const out: Muc[] = [];
    for (const [key, xs] of nhom) {
      // dem theo trang thai tren tung KY loi (vp_khoa), trang thai dai dien = nang nhat
      const ttKy = new Map<string, TrangThaiGt>();
      for (const x of xs) { const kk = x.l.vp_khoa ?? `l${x.l.id}`; const cu = ttKy.get(kk); if (!cu || MUC_TT.indexOf(x.k.tt) < MUC_TT.indexOf(cu)) ttKy.set(kk, x.k.tt); }
      const demTt = MUC_TT.map((t): [TrangThaiGt, number] => [t, [...ttKy.values()].filter((v) => v === t).length]).filter(([, n]) => n > 0);
      const x0 = xs.find((x) => x.k.tt === demTt[0][0]) ?? xs[0];
      const moc = xs.map((x) => mocLoi(x.l) ?? x.l.created_at).filter(Boolean).sort();
      // giai trinh moi nhat cua nhom (that truoc, AUTO sau)
      const gts = xs.map((x) => x.k.gt).filter(Boolean).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
      const g = gts.find((y: any) => y.pham_vi !== "AUTO") ?? gts[0] ?? null;
      const gtTxt = !g ? "" : g.pham_vi === "AUTO" ? `Hệ thống: ${g.nhom === "AUTO:QUA_HAN" ? "hết hạn giải trình → ghi vi phạm" : g.noi_dung || "tự đóng (đã khắc phục)"}`
        : `${tenDm("AI", g.ai_ma)} · ${tenDm("LOI", g.loi_ma)} — ${g.noi_dung ?? ""}`;
      out.push({
        k: key, buoc: x0.l.buoc ?? "", ma: x0.l.ma_loi ?? x0.l.quy_tac, ten: x0.l.ten_ma ?? x0.l.quy_tac,
        so_lan: new Set(xs.map((x) => x.l.vp_khoa ?? `l${x.l.id}`)).size, nguoi: x0.nguoi,
        ghi_nhan: moc[0] ?? null, ghi_nhan_cuoi: moc.length > 1 ? moc[moc.length - 1] : null,
        ngay_gt: g?.created_at ?? null, tt: x0.k.tt, dem_tt: demTt, so_vp: demTt.find(([t]) => t === "VI_PHAM")?.[1] ?? 0, chot: chotCua(x0.k.tt), gt_txt: gtTxt, gt_boi: g && g.pham_vi !== "AUTO" ? g.created_by : null,
        vi_sao: viSaoLoi(x0.l), ket_luan: ketLuanGt(x0.k),
      });
    }
    const idx = (b: string) => (b ? THU_TU.indexOf(b) : 99);
    out.sort((a, b) => idx(a.buoc) - idx(b.buoc) || String(b.ghi_nhan ?? "").localeCompare(String(a.ghi_nhan ?? "")));
    return { ds: out, boQua };
  }, [loi, giaiTrinh, dm.data, doiTac, nguoiDat]);

  if (ds.length === 0) return boQua ? <div className="muted" style={{ fontSize: 11.5, padding: "6px 14px" }}>{boQua} lỗi cũ (mốc trước 20/11/2026) đã bỏ qua, không tính vi phạm.</div> : null;

  const coCho = ds.some((m) => m.tt === "CAN_GT");
  const cols: Col<Muc>[] = [
    // v0.150: cot co dinh theo % (bang luon vua khung, khong keo ngang), chu dai cat "…" - re chuot xem du (title)
    { key: "buoc", header: "Giai đoạn lỗi", width: "11%", loc: "chon", gt: (m) => m.buoc, nhanChon: (v) => (v ? `${v} ${TEN_GD[v]}` : "Không gắn giai đoạn"), gtSap: (m) => (m.buoc ? THU_TU.indexOf(m.buoc) : 99),
      render: (m) => (m.buoc ? <span title={`${m.buoc} ${TEN_GD[m.buoc]}`}><b>{m.buoc}</b> <span className="muted" style={{ fontSize: 11.5 }}>{TEN_GD[m.buoc]}</span></span> : <span className="muted">—</span>) },
    { key: "ten", header: "Loại lỗi", width: "17%", loc: "chon", gt: (m) => m.ten,
      render: (m) => <span title={`${m.ten} (${m.ma})
${m.vi_sao}`}>{m.ten} <span className="muted" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{m.ma}</span></span> },
    { key: "so_lan", header: "Số lần lỗi", width: "6%", loc: "so", align: "right", gt: (m) => m.so_lan, render: (m) => <b style={{ color: m.so_lan > 1 ? "var(--danger-ink)" : undefined }}>{m.so_lan}</b> },
    { key: "nguoi", header: "Người vi phạm", width: "13%", loc: "chon", gt: (m) => m.nguoi, render: (m) => <span title={m.nguoi}>{m.nguoi}</span> },
    { key: "ghi_nhan", header: "Ngày ghi nhận", width: "9%", loc: "ngay", gt: (m) => m.ghi_nhan,
      render: (m) => <span title={m.ghi_nhan_cuoi ? `Lần đầu ${ngayGio(m.ghi_nhan)} · lần gần nhất ${ngayGio(m.ghi_nhan_cuoi)}` : ngayGio(m.ghi_nhan)}>
        {ngan(m.ghi_nhan_cuoi ?? m.ghi_nhan)}{m.ghi_nhan_cuoi && <span className="muted" style={{ fontSize: 11 }}> (từ {ngan(m.ghi_nhan).slice(0, 5)})</span>}</span> },
    { key: "ngay_gt", header: "Ngày giải trình", width: "9%", loc: "ngay", gt: (m) => m.ngay_gt, render: (m) => (m.ngay_gt ? <span title={ngayGio(m.ngay_gt)}>{ngan(m.ngay_gt)}</span> : <span className="muted">—</span>) },
    { key: "tt", header: "Trạng thái giải trình", width: "12%", loc: "chon", gt: (m) => m.tt, nhanChon: (v) => NHAN_GT[v as TrangThaiGt]?.l ?? v,
      render: (m) => <span title={`${m.dem_tt.map(([t, n]) => `${NHAN_GT[t].l}: ${n}`).join(" · ")}
${m.ket_luan}`}>{m.dem_tt.map(([t, n]) => (
        <span key={t} className={`badge ${NHAN_GT[t].cls}`} style={{ marginRight: 3 }}>{TT_NGAN[t]}{m.dem_tt.length > 1 || n > 1 ? ` ${n}` : ""}</span>))}</span> },
    { key: "chot", header: "Chốt vi phạm", width: "9%", loc: "chon", gt: (m) => m.chot, nhanChon: (v) => NHAN_CHOT[v as Chot]?.l ?? v,
      render: (m) => <span className={`badge ${NHAN_CHOT[m.chot].cls}`} title={`${NHAN_CHOT[m.chot].l}
${m.ket_luan}`}>{NHAN_CHOT[m.chot].n}{m.so_vp > 1 ? ` ${m.so_vp}` : ""}</span> },
    { key: "gt", header: "Thông tin giải trình", width: "14%", loc: "chu", gt: (m) => m.gt_txt,
      render: (m) => m.gt_txt ? <span title={`${m.gt_txt}${m.gt_boi ? `
— ${ten(m.gt_boi)}` : ""}`} style={{ fontSize: 12 }}>{m.gt_boi && <b>{ten(m.gt_boi)}: </b>}{m.gt_txt}</span>
        : m.tt === "CAN_GT" ? <span style={{ color: NHAN_GT.CAN_GT.mau, fontSize: 12 }} title="Chưa giải trình — còn trong hạn">Chưa GT — còn hạn</span> : <span className="muted">—</span> },
  ];
  return (
    <div className="qv-don-vp">
      <div className="qv-sec" style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 6px 6px", flex: "none" }}>
        Danh sách vi phạm ({ds.length} loại · {ds.reduce((s, m) => s + m.so_lan, 0)} lần)
        {boQua > 0 && <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }} title="Lỗi có mốc trước 20/11/2026 — hệ thống tự bỏ, không tính vi phạm">· bỏ qua {boQua} lỗi cũ trước 20/11</span>}
        {coCho && onGiaiTrinh && <button className={`btn sm${nhac ? " nhac-gt" : ""}`} title={nhac ? "Bạn là người cần giải trình" : undefined} style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0 }} onClick={onGiaiTrinh}>Giải trình</button>}
      </div>
      {/* qv-lk: bang cuon trong khung, thanh phan trang (10 dong / trang) ghim day - giong tab Linh kien popup PO */}
      <div className="qv-lk qv-gon">
        <DataTable cols={cols} rows={ds} keyOf={(m) => m.k} pageSize={10} timKiem={false} empty="Không có vi phạm." />
      </div>
    </div>
  );
}
