import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Modal } from "../../components/ui";
import { DataTable, type Col } from "../../components/DataTable";
import { useQuickView } from "../../components/quickview/QuickView";
import { soLuong, ngay, ten, tuBayGio } from "../../lib/format";
import { exportRowsToXlsx } from "../../lib/exportXlsx";

/**
 * BANG TRACH NHIEM CHO CEO (v0.122, chu he thong 2026-11-26): 1 bang nhin nhanh - moi hang = 1 nhom chiu tre:
 *  Nha cung cap (tung NCC) - dong da sang giai doan cho NCC (G5 / G6 / G8) VA da ghi nhan gui don cho NCC;
 *  Noi bo (tung khau) - dong con o lap / tham dinh / duyet, hoac CHUA ghi nhan gui don cho NCC (G4).
 * Cot: so PO, so don dat (dong), SL ton, ton > 7 / 14 / 21 / 30 ngay, qua / chua co ngay DK, khong thuc NCC 7 ngay, cap CEO,
 * ca loi (vi pham gop) - da giai trinh %, chua giai trinh, khong giai trinh (vi pham). Bam moi o so -> danh sach dong chi tiet.
 * Du lieu: GET /api/dieu-hanh (backend lib/dieuHanh.ts DongDh.ben / g4 / vb).
 */
export interface DongTn {
  id: number; eo: number; po: string; ma: string; ten: string; kho: string; ncc: string | null; nguoi: string | null;
  dat: number; thieu: number; ton: number; gd: string | null; g4?: string | null; ben?: "NCC" | "NOI_BO"; tt: string; ndk: string | null; qua_dk: number;
  ceo: string[]; loi_cho: number; thuc7: number; td_luc: string | null; vb?: [string, string, string][];
}

const GD_TEN: Record<string, string> = {
  G1: "G1 Lập & trình EO — người tạo", G2: "G2 Thẩm định — người thẩm định", G3: "G3 Duyệt mua — người duyệt",
  G4: "G4 Chưa ghi nhận gửi đơn cho NCC — NV đặt hàng", KHAC: "Khác",
};
const GD_NGAN: Record<string, string> = { G1: "Lập & trình", G2: "Thẩm định", G3: "Duyệt mua", G5: "Chờ ngày DK", G6: "Chờ giao hàng", G8: "Giao bù" };
const TT_TEN: Record<string, string> = { CHO_NDK: "Chờ ngày DK", TRE_NDK: "Trễ hạn chưa có ngày DK", QUA_HAN_NDK: "Quá ngày DK", CHO_HANG: "Có ngày DK, chờ hàng" };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const benCua = (d: DongTn): "NCC" | "NOI_BO" => d.ben ?? (["G5", "G6", "G8"].includes(d.gd ?? "") && d.g4 === "DA_GUI" ? "NCC" : "NOI_BO");
const khauNoiBo = (d: DongTn) => (["G1", "G2", "G3"].includes(d.gd ?? "") ? d.gd! : ["G5", "G6", "G8"].includes(d.gd ?? "") ? "G4" : "KHAC");
/** trang thai 1 ca loi gop tu nhieu dong: uu tien C (chua GT) > V (khong GT) > G (da GT) > T (tu dong) */
const UU_TIEN: Record<string, number> = { C: 4, V: 3, G: 2, T: 1 };

interface TieuChi { k: string; l: string; f: (d: DongTn) => boolean }
const TC: Record<string, TieuChi> = {
  tat_ca: { k: "tat_ca", l: "Mọi dòng tồn", f: () => true },
  t7: { k: "t7", l: "Tồn > 7 ngày", f: (d) => d.ton > 7 },
  t14: { k: "t14", l: "Tồn > 14 ngày", f: (d) => d.ton > 14 },
  t21: { k: "t21", l: "Tồn > 21 ngày", f: (d) => d.ton > 21 },
  t30: { k: "t30", l: "Tồn > 30 ngày", f: (d) => d.ton > 30 },
  qua_dk: { k: "qua_dk", l: "Quá ngày DK", f: (d) => d.tt === "QUA_HAN_NDK" },
  chua_dk: { k: "chua_dk", l: "Chưa có ngày DK", f: (d) => d.tt === "CHO_NDK" || d.tt === "TRE_NDK" },
  khong_thuc: { k: "khong_thuc", l: "Không thúc NCC 7 ngày", f: (d) => d.thuc7 === 0 },
  ceo: { k: "ceo", l: "Cấp CEO", f: (d) => d.ceo.length > 0 },
  co_loi: { k: "co_loi", l: "Có lỗi", f: (d) => (d.vb?.length ?? 0) > 0 },
  chua_gt: { k: "chua_gt", l: "Còn lỗi chưa giải trình", f: (d) => !!d.vb?.some((x) => x[2] === "C") },
  khong_gt: { k: "khong_gt", l: "Có lỗi không giải trình (vi phạm)", f: (d) => !!d.vb?.some((x) => x[2] === "V") },
};

interface Hang {
  key: string; cap: 0 | 1 | 2; nhom: ReactNode; nhomTxt: string; ben: "NCC" | "NOI_BO" | "TONG"; ds: DongTn[];
  po: number; dong: number; dat: number; thieu: number; t7: number; t14: number; t21: number; t30: number; tonMax: number;
  qua_dk: number; chua_dk: number; khong_thuc: number; ceo: number;
  ca: number; caNcc: number; caNb: number; g: number; c: number; v: number; giu: { ai: string; n: number }[];
}

function tinhHang(key: string, cap: 0 | 1 | 2, nhom: ReactNode, nhomTxt: string, ben: Hang["ben"], ds: DongTn[]): Hang {
  const ca = new Map<string, { tt: string; b: string }>();
  for (const d of ds) for (const [k, b, tt] of d.vb ?? []) {
    const x = ca.get(k);
    if (!x || (UU_TIEN[tt] ?? 0) > (UU_TIEN[x.tt] ?? 0)) ca.set(k, { tt, b: x?.b ?? b });
  }
  const dsCa = [...ca.values()];
  const giu = new Map<string, number>();
  for (const d of ds) giu.set(d.nguoi ?? "", (giu.get(d.nguoi ?? "") ?? 0) + 1);
  const n = (f: (d: DongTn) => boolean) => ds.filter(f).length;
  return {
    key, cap, nhom, nhomTxt, ben, ds, po: new Set(ds.map((d) => d.eo)).size, dong: ds.length,
    dat: ds.reduce((s, d) => s + (d.dat || 0), 0), thieu: ds.reduce((s, d) => s + (d.thieu || 0), 0),
    t7: n(TC.t7.f), t14: n(TC.t14.f), t21: n(TC.t21.f), t30: n(TC.t30.f), tonMax: Math.max(0, ...ds.map((d) => d.ton)),
    qua_dk: n(TC.qua_dk.f), chua_dk: n(TC.chua_dk.f), khong_thuc: n(TC.khong_thuc.f), ceo: n(TC.ceo.f),
    ca: dsCa.length, caNcc: dsCa.filter((x) => x.b === "N").length, caNb: dsCa.filter((x) => x.b !== "N").length,
    g: dsCa.filter((x) => x.tt === "G").length, c: dsCa.filter((x) => x.tt === "C").length, v: dsCa.filter((x) => x.tt === "V").length,
    giu: [...giu.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ai, n]) => ({ ai, n })),
  };
}

export interface DuyetTn { eo_id: number; po: string; tieu_de: string | null; buoc: string; ai: string | null; gio: number; so_dong: number; nguoi_tao: string }
const BUOC_TEN: Record<string, string> = { REVIEW: "Thẩm định", FINAL: "Duyệt mua", SAU_BH: "Dòng thêm sau BH" };

export function BangTrachNhiem({ dong, duyet, gon }: { dong: DongTn[]; duyet?: DuyetTn[]; gon?: boolean }) {
  const [mo, setMo] = useState<Record<string, boolean>>({ NCC: true, NOI_BO: true });
  const [xem, setXem] = useState<{ hang: Hang; tc: TieuChi } | null>(null);
  const [xemDuyet, setXemDuyet] = useState<{ l: string; ds: DuyetTn[] } | null>(null);
  // PO chua ban hanh dang cho tham dinh / duyet (chua vao ton) - loi noi bo cua nguoi duyet; ngay cho tinh theo lich
  const dd = duyet ?? [];
  const ngCho = (x: DuyetTn) => Math.floor(x.gio / 24);
  const dDem = (n: number) => dd.filter((x) => ngCho(x) > n);

  const hangs = useMemo(() => {
    const ncc = dong.filter((d) => benCua(d) === "NCC"), nb = dong.filter((d) => benCua(d) === "NOI_BO");
    const theoNcc = new Map<string, DongTn[]>();
    for (const d of ncc) theoNcc.set(d.ncc || "(trống)", [...(theoNcc.get(d.ncc || "(trống)") ?? []), d]);
    const theoKhau = new Map<string, DongTn[]>();
    for (const d of nb) theoKhau.set(khauNoiBo(d), [...(theoKhau.get(khauNoiBo(d)) ?? []), d]);
    const out: Hang[] = [];
    out.push(tinhHang("NCC", 1, <>🏭 Lỗi nhà cung cấp</>, "Lỗi nhà cung cấp", "NCC", ncc));
    if (mo.NCC) for (const [k, ds] of [...theoNcc.entries()].sort((a, b) => b[1].length - a[1].length))
      out.push(tinhHang(`NCC|${k}`, 2, k, k, "NCC", ds));
    out.push(tinhHang("NOI_BO", 1, <>🏢 Lỗi nội bộ công ty</>, "Lỗi nội bộ công ty", "NOI_BO", nb));
    if (mo.NOI_BO) for (const k of ["G1", "G2", "G3", "G4", "KHAC"]) {
      const ds = theoKhau.get(k);
      if (ds?.length) out.push(tinhHang(`NB|${k}`, 2, GD_TEN[k], GD_TEN[k], "NOI_BO", ds));
    }
    out.push(tinhHang("TONG", 0, <b>Tổng cộng</b>, "Tổng cộng", "TONG", dong));
    return out;
  }, [dong, mo]);
  const tong = hangs[hangs.length - 1];

  // ---- v0.123 thiet ke lai (chu he thong: "kho nhin"): tieu de 2 tang theo nhom chi so, moi o 1 dong so (tabular), o xau to nen do theo muc do
  //      (so voi o lon nhat cung cot), 0 hien "·" mo; hang nhom co vach mau ben trai; tach NCC-NB / ten day du dua vao tooltip.
  const conHang = hangs.filter((h) => h.cap === 2);
  const maxCot = (f: (h: Hang) => number) => Math.max(1, ...conHang.map(f));
  type Cot = { k: string; h: ReactNode; title?: string; nhom: string; v?: (h: Hang) => number; tc?: string; xau?: boolean; r?: (h: Hang) => ReactNode; phu?: (h: Hang) => string };
  const COT: Cot[] = [
    { k: "po", nhom: "Quy mô tồn", h: "PO", v: (h) => h.po, tc: "tat_ca", title: "Số PO có dòng tồn trong nhóm (1 PO có thể có dòng ở cả NCC và nội bộ)" },
    { k: "dong", nhom: "Quy mô tồn", h: "Đơn đặt", v: (h) => h.dong, tc: "tat_ca", phu: (h) => pct(h.dong, tong.dong), title: "Số dòng linh kiện đặt còn tồn — % so với tổng" },
    { k: "thieu", nhom: "Quy mô tồn", h: "SL tồn", v: (h) => h.thieu, phu: (h) => pct(h.thieu, h.dat), title: "Số lượng linh kiện còn thiếu — % so với SL đặt" },
    { k: "t7", nhom: "Tồn quá (ngày)", h: "> 7", v: (h) => h.t7, tc: "t7", xau: true, title: "Tính từ ngày ban hành" },
    { k: "t14", nhom: "Tồn quá (ngày)", h: "> 14", v: (h) => h.t14, tc: "t14", xau: true },
    { k: "t21", nhom: "Tồn quá (ngày)", h: "> 21", v: (h) => h.t21, tc: "t21", xau: true },
    { k: "t30", nhom: "Tồn quá (ngày)", h: "> 30", v: (h) => h.t30, tc: "t30", xau: true, phu: (h) => pct(h.t30, h.dong) },
    { k: "max", nhom: "Tồn quá (ngày)", h: "Lâu nhất", r: (h) => h.tonMax ? <span style={{ color: h.tonMax > 30 ? "var(--danger-ink)" : undefined, fontWeight: 700 }}>{h.tonMax}<span className="muted" style={{ fontWeight: 400 }}> ng</span></span> : <span className="muted">·</span> },
    { k: "qua_dk", nhom: "Ngày DK & thúc NCC", h: "Quá DK", v: (h) => h.qua_dk, tc: "qua_dk", xau: true, title: "Đã quá ngày dự kiến mà chưa về đủ" },
    { k: "chua_dk", nhom: "Ngày DK & thúc NCC", h: "Chưa DK", v: (h) => h.chua_dk, tc: "chua_dk", xau: true, title: "Chưa có ngày dự kiến" },
    { k: "khong_thuc", nhom: "Ngày DK & thúc NCC", h: "Không thúc 7 ng", v: (h) => h.khong_thuc, tc: "khong_thuc", xau: true, title: "Không có mail / push / gọi-Zalo với NCC trong 7 ngày" },
    { k: "ceo", nhom: "Ngày DK & thúc NCC", h: "Cấp CEO", v: (h) => h.ceo, tc: "ceo", xau: true },
    { k: "ca", nhom: "Lỗi & giải trình", h: "Ca lỗi", v: (h) => h.ca, tc: "co_loi", title: "Vi phạm gộp (cùng lỗi, cùng PO, cùng kỳ) trên các dòng của nhóm" },
    { k: "gt", nhom: "Lỗi & giải trình", h: "Đã GT", title: "Đã giải trình thật / (đã + chưa + không giải trình). Ca tự khắc phục không tính", r: (h) => {
      const m = h.g + h.c + h.v;
      if (!m) return <span className="muted">·</span>;
      const t = h.g / m, mau = t < 0.5 ? "#DC2626" : t < 0.8 ? "#D97706" : "#16A34A";
      return <span title={`${h.g} / ${m} ca đã giải trình`} style={{ display: "inline-block", minWidth: 44, padding: "1px 6px", borderRadius: 10, background: `${mau}1A`, color: mau, fontWeight: 800 }}>{Math.round(t * 100)}%</span>;
    } },
    { k: "c", nhom: "Lỗi & giải trình", h: "Chưa GT", v: (h) => h.c, tc: "chua_gt", xau: true, title: "Ca lỗi còn trong hạn 16 giờ làm việc, chưa giải trình" },
    { k: "v", nhom: "Lỗi & giải trình", h: "Không GT", v: (h) => h.v, tc: "khong_gt", xau: true, title: "Hết 16 giờ làm việc không giải trình → vi phạm (tính riêng cho người phải giải trình)" },
  ];
  const nhomCot = COT.reduce<{ l: string; n: number }[]>((m, c) => { const x = m[m.length - 1]; if (x && x.l === c.nhom) x.n++; else m.push({ l: c.nhom, n: 1 }); return m; }, []);
  const NEN_NHOM: Record<string, string> = { "Quy mô tồn": "#F8FAFC", "Tồn quá (ngày)": "#FFF7ED", "Ngày DK & thúc NCC": "#FEFCE8", "Lỗi & giải trình": "#FEF2F2" };
  const VACH: Record<string, string> = { NCC: "#2563EB", NOI_BO: "#D97706", TONG: "#374151" };
  const dauNhom = (i: number) => i === 0 || COT[i - 1].nhom !== COT[i].nhom;
  const O = ({ h, c }: { h: Hang; c: Cot }) => {
    if (c.r) return <>{c.r(h)}</>;
    const v = c.v!(h);
    if (!v) return <span className="muted">·</span>;
    const muc = c.xau && h.cap === 2 ? Math.min(1, v / maxCot(c.v!)) : 0;
    const bam = !!c.tc;
    return (
      <span className={bam ? "bt-o" : undefined} role={bam ? "button" : undefined}
        onClick={bam ? (e) => { e.stopPropagation(); setXem({ hang: h, tc: TC[c.tc!] }); } : undefined}
        title={`${bam ? `Bấm xem ${v} dòng: ${TC[c.tc!].l}` : soLuong(v)} — ${h.nhomTxt}${c.phu ? ` (${c.phu(h)})` : ""}`}
        style={{ background: muc ? `rgba(220, 38, 38, ${0.08 + muc * 0.32})` : undefined, color: muc > 0.55 ? "#7F1D1D" : undefined }}>
        {soLuong(v)}{c.phu && <span className="bt-phu">{c.phu(h)}</span>}
      </span>
    );
  };
  // PO / ca loi nam o CA 2 ben -> tong < cong 2 nhom (giai thich duoi bang)
  const hN = hangs.find((h) => h.key === "NCC"), hB = hangs.find((h) => h.key === "NOI_BO");
  const poN = new Set(hN?.ds.map((d) => d.eo)), poB = new Set(hB?.ds.map((d) => d.eo));
  const poCa2 = [...poN].filter((x) => poB.has(x)).length;
  const caCa2 = (hN?.ca ?? 0) + (hB?.ca ?? 0) - tong.ca;
  const giuTxt = (h: Hang) => h.giu.map((x) => `${ten(x.ai) || "(không rõ)"} (${x.n})`).join(", ");

  const xuat = () => exportRowsToXlsx(hangs, [
    { header: "Nhóm", get: (h) => `${h.cap === 2 ? "   " : ""}${h.nhomTxt}` }, { header: "Số PO", get: (h) => h.po }, { header: "Số đơn đặt", get: (h) => h.dong },
    { header: "SL đặt", get: (h) => h.dat }, { header: "SL còn thiếu", get: (h) => h.thieu },
    { header: "> 7 ngày", get: (h) => h.t7 }, { header: "> 14 ngày", get: (h) => h.t14 }, { header: "> 21 ngày", get: (h) => h.t21 }, { header: "> 30 ngày", get: (h) => h.t30 },
    { header: "Tồn lâu nhất (ngày)", get: (h) => h.tonMax }, { header: "Quá ngày DK", get: (h) => h.qua_dk }, { header: "Chưa có ngày DK", get: (h) => h.chua_dk },
    { header: "Không thúc NCC 7 ngày", get: (h) => h.khong_thuc }, { header: "Cấp CEO", get: (h) => h.ceo },
    { header: "Ca lỗi", get: (h) => h.ca }, { header: "Ca lỗi do NCC", get: (h) => h.caNcc }, { header: "Ca lỗi nội bộ", get: (h) => h.caNb },
    { header: "Đã giải trình", get: (h) => h.g }, { header: "Chưa giải trình", get: (h) => h.c }, { header: "Không giải trình", get: (h) => h.v },
  ], "bang-trach-nhiem-mua-hang.xlsx", "Trách nhiệm");

  return (
    <div>
      <style>{`
        .bt-tbl { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
        .bt-tbl th, .bt-tbl td { padding: 6px 8px; border-bottom: 1px solid #EEF0F3; white-space: nowrap; vertical-align: middle; }
        .bt-tbl thead th { font-weight: 700; color: #4B5563; font-size: 12px; }
        .bt-tbl .bt-nhom th { font-size: 11px; text-transform: uppercase; letter-spacing: .3px; color: #6B7280; border-bottom: 2px solid #E5E7EB; text-align: center; }
        .bt-tbl td.so { text-align: right; }
        .bt-tbl td.ten, .bt-tbl th.ten { position: sticky; left: 0; background: inherit; z-index: 2; text-align: left; }
        .bt-tbl tr.cap1 td { font-weight: 800; }
        .bt-tbl tr.cap2 td { font-weight: 500; }
        .bt-tbl tbody tr:hover td { filter: brightness(0.97); }
        .bt-tbl tr.tong td { font-weight: 800; border-top: 2px solid #374151; }
        .bt-o { display: inline-block; min-width: 34px; padding: 1px 6px; border-radius: 6px; cursor: pointer; }
        .bt-o:hover { outline: 2px solid #2563EB; }
        .bt-phu { display: block; font-size: 10.5px; font-weight: 400; color: #6B7280; line-height: 1.1; }
        .bt-sep { border-left: 1px solid #E5E7EB; }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>Bảng trách nhiệm tồn đọng</b>
        <span style={{ fontSize: 12, display: "inline-flex", gap: 14, flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: VACH.NCC, borderRadius: 2, marginRight: 4 }} />Nhà cung cấp — đã gửi đơn, chờ NCC báo ngày / giao / giao bù</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: VACH.NOI_BO, borderRadius: 2, marginRight: 4 }} />Nội bộ — lập / thẩm định / duyệt / chưa gửi đơn NCC</span>
        </span>
        <span className="muted" style={{ fontSize: 11.5 }}>Ô càng đỏ càng nặng · bấm số để xem danh sách{gon ? "" : " · tồn tính từ ngày ban hành"}</span>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={xuat}>⬇ Excel</button>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 10 }}>
        <table className="bt-tbl">
          <thead>
            <tr className="bt-nhom">
              <th className="ten" style={{ background: "#fff" }} />
              {nhomCot.map((g) => <th key={g.l} colSpan={g.n} className="bt-sep" style={{ background: NEN_NHOM[g.l] }}>{g.l}</th>)}
              <th className="bt-sep" style={{ background: "#fff" }} />
            </tr>
            <tr>
              <th className="ten" style={{ background: "#fff", minWidth: 250 }}>Nhóm chịu trách nhiệm</th>
              {COT.map((c, i) => <th key={c.k} title={c.title} className={dauNhom(i) ? "bt-sep" : undefined}
                style={{ textAlign: "right", background: NEN_NHOM[c.nhom], minWidth: 60 }}>{c.h}</th>)}
              <th className="bt-sep" style={{ textAlign: "left", background: "#fff", minWidth: 160 }}>Ai giữ nhiều nhất</th>
            </tr>
          </thead>
          <tbody>{hangs.map((h) => (<Fragment key={h.key}>
            <tr className={h.cap === 0 ? "tong" : `cap${h.cap}`} style={{ background: h.cap === 1 ? (h.ben === "NCC" ? "#EFF6FF" : "#FFFBEB") : h.cap === 0 ? "#F3F4F6" : "#fff", cursor: "pointer" }}
              onClick={() => h.dong && setXem({ hang: h, tc: TC.tat_ca })}>
              <td className="ten" style={{ boxShadow: h.cap ? `inset 4px 0 0 ${VACH[h.ben]}` : undefined, paddingLeft: h.cap === 2 ? 32 : 12 }}>
                {h.cap === 1 && <span role="button" style={{ cursor: "pointer", display: "inline-block", width: 16 }} onClick={(e) => { e.stopPropagation(); setMo((m) => ({ ...m, [h.ben]: !m[h.ben] })); }}>{mo[h.ben] ? "▾" : "▸"}</span>}
                {h.nhom}
              </td>
              {COT.map((c, i) => <td key={c.k} className={`so${dauNhom(i) ? " bt-sep" : ""}`}><O h={h} c={c} /></td>)}
              <td className="bt-sep" style={{ fontSize: 12, fontWeight: 500 }} title={giuTxt(h)}>
                {h.giu[0] ? <>{ten(h.giu[0].ai) || "(không rõ)"} <span className="muted">· {h.giu[0].n}</span>{h.giu.length > 1 && <span className="muted"> +{h.giu.length - 1}</span>}</> : <span className="muted">·</span>}
              </td>
            </tr>
            {h.key === "NOI_BO" && mo.NOI_BO && dd.length > 0 && (() => {
              const DSo = ({ ds, l }: { ds: DuyetTn[]; l: string }) => ds.length
                ? <span className="bt-o" role="button" title={`Bấm xem ${ds.length} PO`} onClick={(e) => { e.stopPropagation(); setXemDuyet({ l, ds }); }}>{soLuong(ds.length)}</span>
                : <span className="muted">·</span>;
              const giu = new Map<string, number>();
              for (const x of dd) giu.set(x.ai ?? "", (giu.get(x.ai ?? "") ?? 0) + 1);
              const top = [...giu.entries()].sort((a, b) => b[1] - a[1]);
              const maxNg = Math.max(...dd.map(ngCho));
              const o: Record<string, ReactNode> = {
                po: <DSo ds={dd} l="PO chờ thẩm định / duyệt" />, dong: soLuong(dd.reduce((s, x) => s + x.so_dong, 0)),
                t7: <DSo ds={dDem(7)} l="PO chờ duyệt > 7 ngày" />, t14: <DSo ds={dDem(14)} l="PO chờ duyệt > 14 ngày" />,
                t21: <DSo ds={dDem(21)} l="PO chờ duyệt > 21 ngày" />, t30: <DSo ds={dDem(30)} l="PO chờ duyệt > 30 ngày" />,
                max: <span style={{ fontWeight: 700, color: maxNg > 7 ? "var(--danger-ink)" : undefined }}>{maxNg}<span className="muted" style={{ fontWeight: 400 }}> ng</span></span>,
              };
              return (
                <tr key="NB|DUYET" className="cap2" style={{ background: "#FFFDF5", cursor: "pointer" }} onClick={() => setXemDuyet({ l: "PO chờ thẩm định / duyệt", ds: dd })}
                  title="PO chưa ban hành nên chưa vào tồn — không cộng vào tổng. Cột tồn = số PO đã chờ duyệt quá n ngày.">
                  <td className="ten" style={{ boxShadow: `inset 4px 0 0 ${VACH.NOI_BO}`, paddingLeft: 32, fontStyle: "italic" }}>PO chờ thẩm định / duyệt <span className="muted" style={{ fontSize: 11 }}>(chưa ban hành, không cộng tổng)</span></td>
                  {COT.map((c, i) => <td key={c.k} className={`so${dauNhom(i) ? " bt-sep" : ""}`}>{o[c.k] ?? <span className="muted">·</span>}</td>)}
                  <td className="bt-sep" style={{ fontSize: 12 }} title={top.map(([ai, n]) => `${ten(ai) || "(không rõ)"} (${n})`).join(", ")}>{top[0] ? <>{ten(top[0][0]) || "(không rõ)"} <span className="muted">· {top[0][1]}</span>{top.length > 1 && <span className="muted"> +{top.length - 1}</span>}</> : null}</td>
                </tr>
              );
            })()}
          </Fragment>))}</tbody>
        </table>
      </div>
      {(poCa2 > 0 || caCa2 > 0) && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          ⓘ Tổng PO ({soLuong(tong.po)}) nhỏ hơn cộng 2 nhóm ({soLuong(poN.size)} + {soLuong(poB.size)}) vì <b>{soLuong(poCa2)} PO có dòng ở cả hai bên</b> (một phần dòng đã gửi
          đơn NCC, một phần chưa) — PO đó tính ở cả 2 nhóm nhưng tổng chỉ đếm 1 lần.{caCa2 > 0 && <> Ca lỗi gộp theo PO nên tương tự: {soLuong(caCa2)} ca nằm ở cả hai nhóm.</>} Các cột
          đếm theo dòng (đơn đặt, SL tồn, tồn &gt; n ngày…) cộng khớp.
        </div>
      )}
      {xem && <DanhSachDong hang={xem.hang} tc={xem.tc} onClose={() => setXem(null)} />}
      {xemDuyet && <DanhSachDuyet l={xemDuyet.l} ds={xemDuyet.ds} onClose={() => setXemDuyet(null)} />}
    </div>
  );
}

function DanhSachDong({ hang, tc, onClose }: { hang: Hang; tc: TieuChi; onClose: () => void }) {
  const qv = useQuickView();
  const rows = hang.ds.filter(tc.f).sort((a, b) => b.ton - a.ton);
  const loiTxt = (d: DongTn) => {
    const c = d.vb?.filter((x) => x[2] === "C").length ?? 0, v = d.vb?.filter((x) => x[2] === "V").length ?? 0, g = d.vb?.filter((x) => x[2] === "G").length ?? 0;
    return (d.vb?.length ?? 0) ? `${d.vb!.length} lỗi · ${g} đã GT · ${c} chưa · ${v} không GT` : "";
  };
  const cols: Col<DongTn>[] = [
    { key: "po", header: "PO", loc: "chu", gt: (r) => r.po, render: (r) => <span className="cell-link" onClick={(e) => { e.stopPropagation(); qv.openEo(r.eo); }}>{r.po}</span> },
    { key: "ma", header: "Mã LK", loc: "chu", gt: (r) => `${r.ma} ${r.ten}`, maxW: 220, render: (r) => <><b>{r.ma}</b><div className="muted" style={{ fontSize: 11 }}>{r.ten}</div></> },
    { key: "ncc", header: "NCC", loc: "chon", gt: (r) => r.ncc ?? "", render: (r) => r.ncc ?? "—" },
    { key: "nguoi", header: "Người đặt", loc: "chon", gt: (r) => r.nguoi ?? "", nhanChon: (v) => ten(v), render: (r) => ten(r.nguoi) },
    { key: "ben", header: "Bên đang giữ", loc: "chon", gt: (r) => (benCua(r) === "NCC" ? "Nhà cung cấp" : "Nội bộ"), render: (r) => benCua(r) === "NCC"
      ? <span className="badge final">NCC · {GD_NGAN[r.gd ?? ""] ?? r.gd}</span> : <span className="badge review">Nội bộ · {khauNoiBo(r) === "G4" ? "chưa gửi đơn NCC" : GD_NGAN[r.gd ?? ""] ?? r.gd}</span> },
    { key: "tt", header: "Tình trạng", loc: "chon", gt: (r) => TT_TEN[r.tt] ?? r.tt, render: (r) => TT_TEN[r.tt] ?? r.tt },
    { key: "ton", header: "Tồn (ngày)", loc: "so", gt: (r) => r.ton, align: "right", render: (r) => <b style={{ color: r.ton > 30 ? "var(--danger-ink)" : undefined }}>{r.ton}</b> },
    { key: "ndk", header: "Ngày DK", loc: "ngay", gt: (r) => r.ndk ?? "", render: (r) => r.ndk ? <>{ngay(r.ndk)}{r.qua_dk > 0 && <div style={{ color: "var(--danger-ink)", fontSize: 11 }}>quá {r.qua_dk} ng</div>}</> : <span className="muted">chưa có</span> },
    { key: "thieu", header: "Thiếu / đặt", loc: "so", gt: (r) => r.thieu, align: "right", render: (r) => `${soLuong(r.thieu)} / ${soLuong(r.dat)}` },
    { key: "thuc7", header: "Thúc NCC 7 ng", loc: "so", gt: (r) => r.thuc7, align: "right", render: (r) => r.thuc7 ? soLuong(r.thuc7) : <span style={{ color: "var(--danger-ink)" }}>0</span> },
    { key: "loi", header: "Lỗi", loc: "chu", gt: loiTxt, maxW: 200, render: (r) => <span style={{ fontSize: 11.5 }}>{loiTxt(r) || "—"}</span> },
    { key: "td", header: "Hoạt động cuối", loc: "ngay", gt: (r) => r.td_luc ?? "", render: (r) => r.td_luc ? tuBayGio(r.td_luc) : <span className="muted">chưa có</span> },
  ];
  const xuat = () => exportRowsToXlsx(rows, [
    { header: "PO", get: (r) => r.po }, { header: "Mã LK", get: (r) => r.ma }, { header: "Tên", get: (r) => r.ten }, { header: "NCC", get: (r) => r.ncc ?? "" },
    { header: "Người đặt", get: (r) => ten(r.nguoi) }, { header: "Bên đang giữ", get: (r) => (benCua(r) === "NCC" ? "Nhà cung cấp" : "Nội bộ") },
    { header: "Tình trạng", get: (r) => TT_TEN[r.tt] ?? r.tt }, { header: "Tồn (ngày)", get: (r) => r.ton }, { header: "Ngày DK", get: (r) => r.ndk ?? "" },
    { header: "Còn thiếu", get: (r) => r.thieu }, { header: "SL đặt", get: (r) => r.dat }, { header: "Thúc NCC 7 ngày", get: (r) => r.thuc7 }, { header: "Lỗi", get: loiTxt },
  ], "danh-sach-dong-ton.xlsx", "Dòng");
  return (
    <Modal title={`${tc.l} — ${hang.nhomTxt} (${rows.length} dòng)`} onClose={onClose} width={1200}
      footer={<><button className="btn" onClick={xuat}>⬇ Excel</button><button className="btn primary" onClick={onClose}>Đóng</button></>}>
      <DataTable cols={cols} rows={rows} keyOf={(r) => r.id} pageSize={20} onRowClick={(r) => qv.openDong(r.id)} empty="Không có dòng nào." />
    </Modal>
  );
}

function DanhSachDuyet({ l, ds, onClose }: { l: string; ds: DuyetTn[]; onClose: () => void }) {
  const qv = useQuickView();
  const cols: Col<DuyetTn>[] = [
    { key: "po", header: "PO", loc: "chu", gt: (r) => `${r.po} ${r.tieu_de ?? ""}`, maxW: 240, render: (r) => <><span className="cell-link">{r.po}</span><div className="muted" style={{ fontSize: 11 }}>{r.tieu_de}</div></> },
    { key: "buoc", header: "Bước", loc: "chon", gt: (r) => BUOC_TEN[r.buoc] ?? r.buoc, render: (r) => BUOC_TEN[r.buoc] ?? r.buoc },
    { key: "ai", header: "Đang chờ", loc: "chon", gt: (r) => r.ai ?? "", nhanChon: (v) => ten(v), render: (r) => <b>{ten(r.ai)}</b> },
    { key: "gio", header: "Đã chờ", loc: "so", gt: (r) => r.gio, align: "right", render: (r) => <b style={{ color: r.gio >= 48 ? "var(--danger-ink)" : undefined }}>{r.gio < 24 ? `${r.gio} giờ` : `${Math.floor(r.gio / 24)} ngày`}</b> },
    { key: "so_dong", header: "Số dòng", loc: "so", gt: (r) => r.so_dong, align: "right", render: (r) => soLuong(r.so_dong) },
    { key: "nguoi_tao", header: "Người lập", loc: "chon", gt: (r) => r.nguoi_tao, nhanChon: (v) => ten(v), render: (r) => ten(r.nguoi_tao) },
  ];
  return (
    <Modal title={`${l} (${ds.length} PO)`} onClose={onClose} width={1000} footer={<button className="btn primary" onClick={onClose}>Đóng</button>}>
      <DataTable cols={cols} rows={[...ds].sort((a, b) => b.gio - a.gio)} keyOf={(r) => `${r.eo_id}-${r.buoc}-${r.ai}`} pageSize={20} onRowClick={(r) => qv.openEo(r.eo_id)} />
    </Modal>
  );
}
