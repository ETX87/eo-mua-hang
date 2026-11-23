import { useMemo } from "react";
import { DataTable, type Col } from "./DataTable";
import { useDanhMuc } from "../pages/theodoi/shared";
import { GD_CHINH } from "../lib/giaiDoan";
import { ngay, ngayGio, ten } from "../lib/format";
import { gioTxt } from "../lib/giaiDoan";
import { GIO_HAN_GT, NHAN_GT, congGioLV, demGioLV, gioHanGt, mocLoi, nowVN, viSaoLoi } from "../lib/giaiTrinh";

/**
 * BANG MA LOI TUNG BUOC + GIAI TRINH (v0.091, yeu cau lanh dao "trong tung don hang phai co bang ma loi tung buoc - giai trinh").
 * Gop 3 nguon cua 1 don hang (1 dong) hoac 1 PO (nhieu dong):
 *  - loi phai giai trinh (tl_loi, backend gan ma_loi ER.MH-001..004 / 1xx + buoc),
 *  - canh bao cap CEO (ceo_chi_tiet cua dong -> ER.MH-201..203),
 *  - tre han giai doan (gd_tre_tung -> ER.MH-301..308, chi do).
 * Moi dong: Buoc · Ma loi · Ten · (Ma LK) · Han · Trang thai · Giai trinh (Ai · Loi gi · noi dung · ai ghi · luc) · nut Giai trinh.
 * Bang du lieu dung chung DataTable (loc + sap xep tren tieu de kieu Excel).
 */
const TEN_GD: Record<string, string> = { G1: "Lập & trình EO", G2: "Thẩm định", G3: "Duyệt mua & BH", G4: "Gửi đơn NCC", G5: "Chờ ngày DK", G6: "Chờ giao hàng", G7: "Nhập kho", G8: "Giao bù đến đủ" };
const THU_TU = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];
const CEO: Record<string, [string, string | null]> = { LUI: ["ER.MH-201", "G6"], XA: ["ER.MH-202", "G6"], LOI: ["ER.MH-203", null] };
type TT = "CHO" | "DA_GT" | "TU_KP" | "TU_QH" | "TU_CU" | "CEO" | "TRE_DANG" | "TRE_XONG";
const NHAN_TT: Record<TT, { l: string; cls: string }> = {
  // v0.109: "can giai trinh" (trong han) khac "vi pham" (het han khong giai trinh) - lib/giaiTrinh; cap CEO tu tinh, khong co han giai trinh
  CHO: { l: NHAN_GT.CAN_GT.l, cls: NHAN_GT.CAN_GT.cls }, DA_GT: { l: NHAN_GT.DA_GT.l, cls: NHAN_GT.DA_GT.cls }, CEO: { l: "Cấp CEO · tự tính", cls: "reject" },
  TU_KP: { l: NHAN_GT.KHAC_PHUC.l, cls: NHAN_GT.KHAC_PHUC.cls }, TU_CU: { l: NHAN_GT.BO_QUA.l, cls: NHAN_GT.BO_QUA.cls }, TU_QH: { l: `VI PHẠM · hết hạn GT`, cls: "reject" },
  TRE_DANG: { l: "Đang trễ hạn (chỉ đo)", cls: "final" }, TRE_XONG: { l: "Xong · trễ hạn (chỉ đo)", cls: "nhap" },
};
interface Muc { k: string; buoc: string; ma: string; ten: string; ma_lk: string; so_dong: number; ds_lk: string[]; item_id: number | null; han: string | null; han_gt: string | null; vi_sao: string; tt: TT; chi_tiet: string;
  gt_ai: string; gt_loi: string; gt_nd: string; gt_boi: string | null; gt_luc: string | null }

export function BangLoiTheoBuoc({ loi, giaiTrinh, rows, nhieuDong, onGiaiTrinh, tim }: {
  loi: any[]; giaiTrinh: any[]; rows: any[]; nhieuDong?: boolean; onGiaiTrinh?: (itemId: number, soDong: number) => void;
  /** o tim chung cua popup (thanh tab) - khong truyen thi bang tu co o tim */
  tim?: string;
}) {
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  const ds = useMemo<Muc[]>(() => {
    const gtBy = new Map(giaiTrinh.map((g) => [g.id, g]));
    const lkBy = new Map(rows.map((r) => [r.item_id, r.part_code]));
    const lk = (ids: number[], codes: string[]) => { const u = [...new Set(codes.filter(Boolean))]; return { ma_lk: u.length <= 1 ? u[0] ?? "" : `${u.length} dòng`, so_dong: new Set(ids).size, ds_lk: u }; };
    const out: Muc[] = [];
    const now = nowVN();
    // v0.093: 1 hang = 1 VI PHAM GOP (cung PO + cung loi + cung ky - backend lib/maLoi khoaViPham); so dong bi anh huong ghi kem
    const nhomLoi = new Map<string, any[]>();
    for (const l of loi) { const k = l.vp_khoa ?? `l${l.id}`; nhomLoi.set(k, [...(nhomLoi.get(k) ?? []), l]); }
    for (const [k, dsl] of nhomLoi) {
      const gts = dsl.map((l) => (l.giai_trinh_id ? gtBy.get(l.giai_trinh_id) : null)).filter(Boolean);
      const that = gts.find((g: any) => g.pham_vi !== "AUTO"), auto = gts.find((g: any) => g.pham_vi === "AUTO");
      const choDs = dsl.filter((l) => l.trang_thai === "CHO_GIAI_TRINH");
      // con cho nhung da qua han giai trinh (cron chua chot) -> da la vi pham
      const hanGtCho = choDs.length ? choDs.map((l) => { const m = mocLoi(l) ?? now; return congGioLV(m, gioHanGt(m)); }).sort()[0] : null;
      const tt: TT = choDs.length ? (hanGtCho && hanGtCho <= now && choDs[0].quy_tac !== "TAY" ? "TU_QH" : "CHO") : that ? "DA_GT" : gts.some((g: any) => g.nhom === "AUTO:QUA_HAN") ? "TU_QH" : gts.length && gts.every((g: any) => g.nhom === "AUTO:CU") ? "TU_CU" : "TU_KP";
      const g = that ?? auto ?? null;
      const l0 = choDs[0] ?? dsl[0];
      const x = lk(dsl.map((l) => l.eo_item_id), dsl.map((l) => l.part_code ?? lkBy.get(l.eo_item_id) ?? ""));
      out.push({ k, buoc: l0.buoc ?? "", ma: l0.ma_loi ?? l0.quy_tac, ten: l0.ten_ma ?? l0.quy_tac, ...x, item_id: l0.eo_item_id,
        han: l0.han ?? null, han_gt: l0.quy_tac === "TAY" || !mocLoi(l0) ? null : (hanGtCho ?? congGioLV(mocLoi(l0)!, gioHanGt(mocLoi(l0)!))), vi_sao: viSaoLoi(l0), tt, chi_tiet: `${l0.ngay_tham_chieu ? `ngày kiểm tra / mốc ${ngay(l0.ngay_tham_chieu)}` : ""}${x.so_dong > 1 ? ` · ${x.so_dong} dòng${choDs.length && choDs.length < dsl.length ? ` (${new Set(choDs.map((l) => l.eo_item_id)).size} còn chờ)` : ""}` : ""}`,
        gt_ai: g ? (g.pham_vi !== "AUTO" ? tenDm("AI", g.ai_ma) : "Hệ thống") : "", gt_loi: g ? (g.pham_vi !== "AUTO" ? tenDm("LOI", g.loi_ma) : "Tự giải trình") : "",
        gt_nd: g?.noi_dung ?? "", gt_boi: g && g.pham_vi !== "AUTO" ? g.created_by : null, gt_luc: g?.created_at ?? null });
    }
    // canh bao CEO (2xx) gop theo ma, tre han buoc (3xx) gop theo buoc - kem so dong
    const ceo = new Map<string, any[]>(), tre = new Map<string, any[]>();
    for (const r of rows) {
      for (const c of r.ceo_chi_tiet ?? []) ceo.set(c.ma, [...(ceo.get(c.ma) ?? []), { r, c }]);
      for (const k of THU_TU) if (r.gd_tre_tung?.[k] && r.gd_moc?.[k]?.bd) tre.set(k, [...(tre.get(k) ?? []), r]);
    }
    for (const [maC, xs] of ceo) {
      const [ma, buoc] = CEO[maC] ?? [maC, null];
      const x = lk(xs.map((y) => y.r.item_id), xs.map((y) => y.r.part_code ?? ""));
      const c0 = xs[0].c;
      out.push({ k: `c${maC}`, buoc: buoc ?? "", ma, ten: xs.length > 1 ? `${c0.tieu_de} (ngưỡng ${c0.nguong})` : `${c0.tieu_de} (${c0.gia_tri}, ngưỡng ${c0.nguong})`, ...x, item_id: xs[0].r.item_id, han: null, han_gt: null, vi_sao: "Cấp CEO do hệ thống tự tính theo số liệu (lùi ngày DK ≥ 3 lần · ngày DK cách ngày đặt ≥ 30 ngày · ≥ 3 lỗi) — không có hạn giải trình.", tt: "CEO",
        chi_tiet: xs.length > 1 ? xs.map((y) => `${y.r.part_code}: ${y.c.gia_tri}`).join("\n") : (c0.dong ?? []).join("\n"), gt_ai: "", gt_loi: "", gt_nd: "", gt_boi: null, gt_luc: null });
    }
    for (const [k, rs] of tre) {
      const dang = rs.filter((r) => !r.gd_moc[k].kt);
      const x = lk(rs.map((r) => r.item_id), rs.map((r) => r.part_code ?? ""));
      const m = rs[0].gd_moc[k];
      out.push({ k: `g${k}`, buoc: k, ma: `ER.MH-30${k.slice(1)}`, ten: `Trễ hạn ${k} ${TEN_GD[k]}`, ...x, item_id: rs[0].item_id, han: m.han ?? null, han_gt: null, vi_sao: "Chỉ đo thời gian giai đoạn, chưa sinh lỗi giải trình.",
        tt: dang.length ? "TRE_DANG" : "TRE_XONG",
        chi_tiet: rs.length > 1 ? `${rs.length} dòng trễ · ${dang.length} đang chạy` : `bắt đầu ${ngayGio(m.bd)}${m.kt ? ` · xong ${ngayGio(m.kt)}` : " · đang chạy"}`,
        gt_ai: "", gt_loi: "", gt_nd: "", gt_boi: null, gt_luc: null });
    }
    const idx = (b: string) => (b ? THU_TU.indexOf(b) : 99);
    return out.sort((a, b) => idx(a.buoc) - idx(b.buoc) || String(a.han ?? "").localeCompare(String(b.han ?? "")));
  }, [loi, giaiTrinh, rows, dm.data]);

  // tom tat theo buoc (1 dong chip): so loi phai giai trinh / cho / tre han
  const tomTat = THU_TU.concat("").map((b) => {
    const x = ds.filter((m) => m.buoc === b);
    return { b, n: x.filter((m) => ["CHO", "DA_GT", "TU_KP", "TU_QH", "TU_CU"].includes(m.tt)).length, cho: x.filter((m) => m.tt === "CHO").length, tre: x.filter((m) => m.tt.startsWith("TRE")).length, ceo: x.filter((m) => m.tt === "CEO").length };
  }).filter((x) => x.n || x.tre || x.ceo);

  const cols: Col<Muc>[] = [
    { key: "buoc", header: "Bước", loc: "chon", gt: (m) => m.buoc, nhanChon: (v) => (v ? `${v} ${TEN_GD[v]}` : "Không gắn bước"), gtSap: (m) => (m.buoc ? THU_TU.indexOf(m.buoc) : 99),
      render: (m) => (m.buoc ? <span style={{ whiteSpace: "nowrap" }}><b>{m.buoc}</b> <span className="muted" style={{ fontSize: 11.5 }}>{TEN_GD[m.buoc]}</span></span> : <span className="muted">—</span>) },
    { key: "ma", header: "Mã lỗi", loc: "chon", gt: (m) => m.ma, render: (m) => <b style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, whiteSpace: "nowrap" }}>{m.ma}</b> },
    { key: "ten", header: "Lỗi", loc: "chu", gt: (m) => m.ten, maxW: 260, render: (m) => <span title={m.chi_tiet ? `${m.vi_sao}\n${m.chi_tiet}` : m.vi_sao}>{m.ten}{m.chi_tiet && !m.chi_tiet.includes("\n") && <div className="muted" style={{ fontSize: 11 }}>{m.chi_tiet}</div>}</span> },
    ...(nhieuDong ? [{ key: "ma_lk", header: "Mã LK", loc: "chu" as const, gt: (m: Muc) => m.ma_lk, render: (m: Muc) => <span title={m.ds_lk.join(", ")} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{m.so_dong > 1 ? <span className="badge final">{m.ma_lk}</span> : m.ma_lk}</span> }] : []),
    { key: "han", header: "Mốc lỗi", loc: "ngay", gt: (m) => m.han, render: (m) => (m.han ? <span style={{ whiteSpace: "nowrap" }}>{ngayGio(m.han)}</span> : <span className="muted">—</span>) },
    { key: "han_gt", header: "Hạn giải trình", loc: "ngay", gt: (m) => m.han_gt,
      render: (m) => m.tt === "CEO" ? <span className="muted" style={{ fontSize: 11.5 }}>Không cần — tự tính</span> : !m.han_gt ? <span className="muted">—</span>
        : <span style={{ whiteSpace: "nowrap", fontWeight: m.tt === "CHO" ? 700 : undefined, color: m.tt === "CHO" ? NHAN_GT.CAN_GT.mau : m.tt === "TU_QH" ? NHAN_GT.VI_PHAM.mau : undefined }}>
          {ngayGio(m.han_gt)}{m.tt === "CHO" && <div style={{ fontSize: 11 }}>còn {gioTxt(demGioLV(nowVN(), m.han_gt))}</div>}</span> },
    { key: "tt", header: "Trạng thái", loc: "chon", gt: (m) => m.tt, nhanChon: (v) => NHAN_TT[v as TT]?.l ?? v, render: (m) => <span className={`badge ${NHAN_TT[m.tt].cls}`} title={m.vi_sao}>{NHAN_TT[m.tt].l}</span> },
    { key: "gt", header: "Giải trình (Ai · Lỗi gì · nội dung)", loc: "chu", gt: (m) => `${m.gt_ai} ${m.gt_loi} ${m.gt_nd}`, maxW: 340,
      render: (m) => m.gt_nd ? <span title={m.gt_nd}><span style={{ fontSize: 11.5, fontWeight: 700 }}>{m.gt_ai} · {m.gt_loi}</span><div style={{ fontSize: 12 }}>{m.gt_nd}</div>
        <div className="muted" style={{ fontSize: 11 }}>{ten(m.gt_boi)} · {ngayGio(m.gt_luc)}</div></span>
        : m.tt === "CHO" ? <span style={{ color: NHAN_GT.CAN_GT.mau, fontSize: 12 }}>Chưa giải trình — còn trong hạn</span> : <span className="muted">—</span> },
    ...(onGiaiTrinh ? [{ key: "act", header: "", render: (m: Muc) => (m.tt === "CHO" && m.item_id ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); onGiaiTrinh(m.item_id!, m.so_dong); }}>{m.so_dong > 1 ? "Giải trình chung" : "Giải trình"}</button> : null) }] : []),
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12 }}>
        <b>Theo bước:</b>
        {tomTat.length === 0 && <span className="muted">không có lỗi / trễ hạn nào</span>}
        {tomTat.map((x) => (
          <span key={x.b} className={`badge ${x.cho || x.ceo ? "reject" : x.n || x.tre ? "final" : "nhap"}`}>
            {x.b || "Khác"}{x.n ? ` · ${x.n} lỗi` : ""}{x.cho ? ` (${x.cho} cần GT)` : ""}{x.tre ? ` · trễ hạn ${x.tre}` : ""}{x.ceo ? ` · CEO ${x.ceo}` : ""}
          </span>
        ))}
        <span className="muted" style={{ marginLeft: "auto" }} title={`ER.MH-0xx / 1xx: chạm quy tắc → cần giải trình trong ${GIO_HAN_GT} giờ làm việc; hết hạn không giải trình → vi phạm.\nER.MH-2xx: cấp CEO, hệ thống tự tính theo số liệu, không có hạn giải trình.\nER.MH-3xx: trễ hạn bước, chỉ đo.`}>
          0xx/1xx: cần giải trình trong {GIO_HAN_GT}h LV, quá hạn → vi phạm · 2xx: cấp CEO tự tính · 3xx: chỉ đo ⓘ</span>
      </div>
      <DataTable cols={cols} rows={ds} keyOf={(m) => m.k} pageSize={15} empty="Chưa có lỗi / cảnh báo nào." q={tim} />
    </div>
  );
}
