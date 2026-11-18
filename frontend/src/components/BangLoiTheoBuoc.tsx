import { useMemo } from "react";
import { DataTable, type Col } from "./DataTable";
import { useDanhMuc } from "../pages/theodoi/shared";
import { GD_CHINH } from "../lib/giaiDoan";
import { ngay, ngayGio, ten } from "../lib/format";

/**
 * BANG MA LOI TUNG BUOC + GIAI TRINH (v0.091, yeu cau lanh dao "trong tung don hang phai co bang ma loi tung buoc - giai trinh").
 * Gop 3 nguon cua 1 don hang (1 dong) hoac 1 PO (nhieu dong):
 *  - loi phai giai trinh (tl_loi, backend gan ma_loi ER.MH-001..004 / 1xx + buoc),
 *  - canh bao cap CEO (ceo_chi_tiet cua dong -> ER.MH-201..203),
 *  - tre han giai doan (gd_tre_tung -> ER.MH-301..308, chi do).
 * Moi dong: Buoc · Ma loi · Ten · (Ma LK) · Han · Trang thai · Giai trinh (Ai · Loi gi · noi dung · ai ghi · luc) · nut Giai trinh.
 * Bang du lieu dung chung DataTable (loc + sap xep tren tieu de kieu Excel).
 */
const TEN_GD: Record<string, string> = { G1: "Lập & trình EO", G2: "Thẩm định", G3: "Duyệt mua & BH", G4: "Gửi đơn NCC", G5: "Có ngày dự kiến", G6: "Chờ SX & giao", G7: "Nhập kho", G8: "Giao bù đến đủ" };
const THU_TU = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];
const CEO: Record<string, [string, string | null]> = { LUI: ["ER.MH-201", "G6"], XA: ["ER.MH-202", "G6"], LOI: ["ER.MH-203", null] };
type TT = "CHO" | "DA_GT" | "CEO" | "TRE_DANG" | "TRE_XONG";
const NHAN_TT: Record<TT, { l: string; cls: string }> = {
  CHO: { l: "Chờ giải trình", cls: "reject" }, DA_GT: { l: "Đã giải trình", cls: "issued" }, CEO: { l: "Cấp CEO", cls: "reject" },
  TRE_DANG: { l: "Đang trễ hạn (chỉ đo)", cls: "final" }, TRE_XONG: { l: "Xong · trễ hạn (chỉ đo)", cls: "nhap" },
};
interface Muc { k: string; buoc: string; ma: string; ten: string; ma_lk: string; item_id: number | null; han: string | null; tt: TT; chi_tiet: string;
  gt_ai: string; gt_loi: string; gt_nd: string; gt_boi: string | null; gt_luc: string | null }

export function BangLoiTheoBuoc({ loi, giaiTrinh, rows, nhieuDong, onGiaiTrinh }: {
  loi: any[]; giaiTrinh: any[]; rows: any[]; nhieuDong?: boolean; onGiaiTrinh?: (itemId: number) => void;
}) {
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  const ds = useMemo<Muc[]>(() => {
    const gtBy = new Map(giaiTrinh.map((g) => [g.id, g]));
    const lkBy = new Map(rows.map((r) => [r.item_id, r.part_code]));
    const out: Muc[] = [];
    for (const l of loi) {
      const g = l.giai_trinh_id ? gtBy.get(l.giai_trinh_id) : null;
      out.push({ k: `l${l.id}`, buoc: l.buoc ?? "", ma: l.ma_loi ?? l.quy_tac, ten: l.ten_ma ?? l.quy_tac, ma_lk: l.part_code ?? lkBy.get(l.eo_item_id) ?? "", item_id: l.eo_item_id,
        han: l.han ?? null, tt: l.trang_thai === "CHO_GIAI_TRINH" ? "CHO" : "DA_GT", chi_tiet: l.ngay_tham_chieu ? `ngày kiểm tra / mốc ${ngay(l.ngay_tham_chieu)}` : "",
        gt_ai: g ? tenDm("AI", g.ai_ma) : "", gt_loi: g ? tenDm("LOI", g.loi_ma) : "", gt_nd: g?.noi_dung ?? "", gt_boi: g?.created_by ?? null, gt_luc: g?.created_at ?? null });
    }
    for (const r of rows) {
      for (const c of r.ceo_chi_tiet ?? []) {
        const [ma, buoc] = CEO[c.ma] ?? [c.ma, null];
        out.push({ k: `c${r.item_id}${c.ma}`, buoc: buoc ?? "", ma, ten: `${c.tieu_de} (${c.gia_tri}, ngưỡng ${c.nguong})`, ma_lk: r.part_code ?? "", item_id: r.item_id, han: null, tt: "CEO",
          chi_tiet: (c.dong ?? []).join("\n"), gt_ai: "", gt_loi: "", gt_nd: "", gt_boi: null, gt_luc: null });
      }
      for (const k of THU_TU) {
        if (!r.gd_tre_tung?.[k] || !r.gd_moc?.[k]?.bd) continue;
        const m = r.gd_moc[k];
        out.push({ k: `g${r.item_id}${k}`, buoc: k, ma: `ER.MH-30${k.slice(1)}`, ten: `Trễ hạn ${k} ${TEN_GD[k]}`, ma_lk: r.part_code ?? "", item_id: r.item_id, han: m.han ?? null,
          tt: m.kt ? "TRE_XONG" : "TRE_DANG", chi_tiet: `bắt đầu ${ngayGio(m.bd)}${m.kt ? ` · xong ${ngayGio(m.kt)}` : " · đang chạy"}`, gt_ai: "", gt_loi: "", gt_nd: "", gt_boi: null, gt_luc: null });
      }
    }
    const idx = (b: string) => (b ? THU_TU.indexOf(b) : 99);
    return out.sort((a, b) => idx(a.buoc) - idx(b.buoc) || String(a.han ?? "").localeCompare(String(b.han ?? "")));
  }, [loi, giaiTrinh, rows, dm.data]);

  // tom tat theo buoc (1 dong chip): so loi phai giai trinh / cho / tre han
  const tomTat = THU_TU.concat("").map((b) => {
    const x = ds.filter((m) => m.buoc === b);
    return { b, n: x.filter((m) => m.tt === "CHO" || m.tt === "DA_GT").length, cho: x.filter((m) => m.tt === "CHO").length, tre: x.filter((m) => m.tt.startsWith("TRE")).length, ceo: x.filter((m) => m.tt === "CEO").length };
  }).filter((x) => x.n || x.tre || x.ceo);

  const cols: Col<Muc>[] = [
    { key: "buoc", header: "Bước", loc: "chon", gt: (m) => m.buoc, nhanChon: (v) => (v ? `${v} ${TEN_GD[v]}` : "Không gắn bước"), gtSap: (m) => (m.buoc ? THU_TU.indexOf(m.buoc) : 99),
      render: (m) => (m.buoc ? <span style={{ whiteSpace: "nowrap" }}><b>{m.buoc}</b> <span className="muted" style={{ fontSize: 11.5 }}>{TEN_GD[m.buoc]}</span></span> : <span className="muted">—</span>) },
    { key: "ma", header: "Mã lỗi", loc: "chon", gt: (m) => m.ma, render: (m) => <b style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, whiteSpace: "nowrap" }}>{m.ma}</b> },
    { key: "ten", header: "Lỗi", loc: "chu", gt: (m) => m.ten, maxW: 260, render: (m) => <span title={m.chi_tiet || m.ten}>{m.ten}{m.chi_tiet && !m.chi_tiet.includes("\n") && <div className="muted" style={{ fontSize: 11 }}>{m.chi_tiet}</div>}</span> },
    ...(nhieuDong ? [{ key: "ma_lk", header: "Mã LK", loc: "chu" as const, gt: (m: Muc) => m.ma_lk, render: (m: Muc) => <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{m.ma_lk}</span> }] : []),
    { key: "han", header: "Hạn", loc: "ngay", gt: (m) => m.han, render: (m) => (m.han ? <span style={{ whiteSpace: "nowrap" }}>{ngayGio(m.han)}</span> : <span className="muted">—</span>) },
    { key: "tt", header: "Trạng thái", loc: "chon", gt: (m) => m.tt, nhanChon: (v) => NHAN_TT[v as TT]?.l ?? v, render: (m) => <span className={`badge ${NHAN_TT[m.tt].cls}`}>{NHAN_TT[m.tt].l}</span> },
    { key: "gt", header: "Giải trình (Ai · Lỗi gì · nội dung)", loc: "chu", gt: (m) => `${m.gt_ai} ${m.gt_loi} ${m.gt_nd}`, maxW: 340,
      render: (m) => m.gt_nd ? <span title={m.gt_nd}><span style={{ fontSize: 11.5, fontWeight: 700 }}>{m.gt_ai} · {m.gt_loi}</span><div style={{ fontSize: 12 }}>{m.gt_nd}</div>
        <div className="muted" style={{ fontSize: 11 }}>{ten(m.gt_boi)} · {ngayGio(m.gt_luc)}</div></span>
        : m.tt === "CHO" ? <span style={{ color: "var(--danger-ink)", fontSize: 12 }}>Chưa giải trình</span> : <span className="muted">—</span> },
    ...(onGiaiTrinh ? [{ key: "act", header: "", render: (m: Muc) => (m.tt === "CHO" && m.item_id ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); onGiaiTrinh(m.item_id!); }}>Giải trình</button> : null) }] : []),
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12 }}>
        <b>Theo bước:</b>
        {tomTat.length === 0 && <span className="muted">không có lỗi / trễ hạn nào</span>}
        {tomTat.map((x) => (
          <span key={x.b} className={`badge ${x.cho || x.ceo ? "reject" : x.n || x.tre ? "final" : "nhap"}`}>
            {x.b || "Khác"}{x.n ? ` · ${x.n} lỗi` : ""}{x.cho ? ` (${x.cho} chờ GT)` : ""}{x.tre ? ` · trễ hạn ${x.tre}` : ""}{x.ceo ? ` · CEO ${x.ceo}` : ""}
          </span>
        ))}
        <span className="muted" style={{ marginLeft: "auto" }}>ER.MH-0xx / 1xx: phải giải trình · 2xx: cấp CEO · 3xx: trễ hạn bước (chỉ đo)</span>
      </div>
      <DataTable cols={cols} rows={ds} keyOf={(m) => m.k} pageSize={15} empty="Chưa có lỗi / cảnh báo nào." />
    </div>
  );
}
