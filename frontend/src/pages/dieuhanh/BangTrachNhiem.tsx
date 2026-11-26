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

  const So = ({ h, v, tc, xau, sub }: { h: Hang; v: number; tc: string; xau?: boolean; sub?: ReactNode }) => (
    <span role="button" onClick={(e) => { e.stopPropagation(); if (v) setXem({ hang: h, tc: TC[tc] }); }}
      title={v ? `Bấm xem ${v} dòng: ${TC[tc].l} — ${h.nhomTxt}` : undefined}
      style={{ cursor: v ? "pointer" : "default", fontWeight: h.cap < 2 ? 800 : 600, color: !v ? "var(--muted)" : xau ? "var(--danger-ink)" : undefined, textDecoration: v ? "underline dotted" : undefined }}>
      {soLuong(v)}{sub && <div className="muted" style={{ fontSize: 10.5, fontWeight: 400, textDecoration: "none" }}>{sub}</div>}
    </span>
  );
  const nenHang = (h: Hang) => (h.cap === 0 ? "#F3F4F6" : h.cap === 1 ? (h.ben === "NCC" ? "#EFF6FF" : "#FFFBEB") : undefined);
  const cols: { h: ReactNode; title?: string; r: (h: Hang) => ReactNode; w?: number; left?: boolean }[] = [
    { h: "Nhóm chịu trách nhiệm", left: true, w: 250, r: (h) => (
      <span style={{ paddingLeft: h.cap === 2 ? 18 : 0, fontWeight: h.cap < 2 ? 800 : 500, display: "inline-flex", gap: 6, alignItems: "center" }}>
        {h.cap === 1 && <span role="button" style={{ cursor: "pointer", width: 14 }} onClick={() => setMo((m) => ({ ...m, [h.ben]: !m[h.ben] }))}>{mo[h.ben] ? "▾" : "▸"}</span>}
        {h.nhom}
      </span>) },
    { h: "Số PO", r: (h) => <So h={h} v={h.po} tc="tat_ca" /> },
    { h: "Số đơn đặt", title: "Số dòng linh kiện đặt còn tồn (mỗi dòng = 1 đơn đặt)", r: (h) => <So h={h} v={h.dong} tc="tat_ca" sub={h.cap ? pct(h.dong, tong.dong) : undefined} /> },
    { h: "SL linh kiện tồn", title: "Số lượng còn thiếu / số lượng đặt", r: (h) => <span style={{ fontWeight: h.cap < 2 ? 800 : 600 }}>{soLuong(h.thieu)}<div className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>/ {soLuong(h.dat)} · {pct(h.thieu, h.dat)}</div></span> },
    { h: "> 7 ngày", r: (h) => <So h={h} v={h.t7} tc="t7" /> },
    { h: "> 14 ngày", r: (h) => <So h={h} v={h.t14} tc="t14" xau /> },
    { h: "> 21 ngày", r: (h) => <So h={h} v={h.t21} tc="t21" xau /> },
    { h: "> 30 ngày", r: (h) => <So h={h} v={h.t30} tc="t30" xau sub={h.dong ? pct(h.t30, h.dong) : undefined} /> },
    { h: "Tồn lâu nhất", r: (h) => <span style={{ color: h.tonMax > 30 ? "var(--danger-ink)" : undefined, fontWeight: 700 }}>{h.tonMax ? `${h.tonMax} ng` : "—"}</span> },
    { h: "Quá ngày DK", r: (h) => <So h={h} v={h.qua_dk} tc="qua_dk" xau /> },
    { h: "Chưa có ngày DK", r: (h) => <So h={h} v={h.chua_dk} tc="chua_dk" /> },
    { h: "Không thúc NCC 7 ngày", title: "Dòng không có mail / push / gọi-Zalo với NCC trong 7 ngày", r: (h) => <So h={h} v={h.khong_thuc} tc="khong_thuc" xau /> },
    { h: "Cấp CEO", r: (h) => <So h={h} v={h.ceo} tc="ceo" xau /> },
    { h: "Ca lỗi", title: "Vi phạm gộp (cùng lỗi, cùng PO, cùng kỳ) trên các dòng của nhóm — kèm do NCC / do nội bộ", r: (h) => <So h={h} v={h.ca} tc="co_loi" sub={h.ca ? `NCC ${h.caNcc} · NB ${h.caNb}` : undefined} /> },
    { h: "Đã giải trình", title: "Ca đã giải trình thật / (đã giải trình + chưa giải trình + không giải trình). Ca tự khắc phục không tính", r: (h) => {
      const m = h.g + h.c + h.v;
      return <span style={{ fontWeight: 800, color: m && h.g / m < 0.5 ? "var(--danger-ink)" : m ? "var(--ok-ink)" : "var(--muted)" }}>{pct(h.g, m)}<div className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>{m ? `${h.g}/${m}` : ""}</div></span>;
    } },
    { h: "Chưa giải trình", title: "Ca lỗi còn trong hạn 16 giờ làm việc, chưa giải trình", r: (h) => <So h={h} v={h.c} tc="chua_gt" xau /> },
    { h: "Không giải trình", title: "Hết 16 giờ làm việc không giải trình → vi phạm (lỗi của người phải giải trình, tính riêng)", r: (h) => <So h={h} v={h.v} tc="khong_gt" xau /> },
    { h: "Ai đang giữ nhiều nhất", left: true, w: 170, r: (h) => <span style={{ fontSize: 11.5 }}>{h.giu.map((x) => `${ten(x.ai) || "(không rõ)"} (${x.n})`).join(", ")}</span> },
  ];

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
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <b style={{ fontSize: 15 }}>Bảng trách nhiệm tồn đọng — nhà cung cấp & nội bộ</b>
        <span className="muted" style={{ fontSize: 11.5 }}>
          NCC = dòng đã gửi đơn và đang chờ NCC báo ngày / giao hàng / giao bù · Nội bộ = đang lập / thẩm định / duyệt hoặc chưa ghi nhận gửi đơn cho NCC.
          {!gon && " Tồn tính từ ngày ban hành. Bấm số bất kỳ để xem danh sách."}</span>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={xuat}>⬇ Excel</button>
      </div>
      <div className="tbl-wrap" style={{ overflowX: "auto" }}>
        <table className="tbl tbl-dense">
          <thead><tr>{cols.map((c, i) => <th key={i} title={c.title} style={{ textAlign: c.left ? "left" : "right", minWidth: c.w, whiteSpace: "normal", verticalAlign: "bottom" }}>{c.h}</th>)}</tr></thead>
          <tbody>{hangs.map((h) => (<Fragment key={h.key}>
            <tr key={h.key} style={{ background: nenHang(h), cursor: "pointer" }} onClick={() => h.dong && setXem({ hang: h, tc: TC.tat_ca })}>
              {cols.map((c, i) => <td key={i} style={{ textAlign: c.left ? "left" : "right", verticalAlign: "top" }}>{c.r(h)}</td>)}
            </tr>
            {h.key === "NOI_BO" && mo.NOI_BO && dd.length > 0 && (() => {
              const DSo = ({ ds, l, xau }: { ds: DuyetTn[]; l: string; xau?: boolean }) => <span role="button" onClick={(e) => { e.stopPropagation(); if (ds.length) setXemDuyet({ l, ds }); }}
                style={{ cursor: ds.length ? "pointer" : "default", fontWeight: 600, color: !ds.length ? "var(--muted)" : xau ? "var(--danger-ink)" : undefined, textDecoration: ds.length ? "underline dotted" : undefined }}>{soLuong(ds.length)}</span>;
              const giu = new Map<string, number>();
              for (const x of dd) giu.set(x.ai ?? "", (giu.get(x.ai ?? "") ?? 0) + 1);
              return (
                <tr key="NB|DUYET" style={{ cursor: "pointer" }} onClick={() => setXemDuyet({ l: "PO chờ thẩm định / duyệt", ds: dd })}
                  title="PO chưa ban hành nên chưa vào tồn — không cộng vào tổng. Số ở cột tồn = số PO chờ quá n ngày.">
                  <td style={{ paddingLeft: 18 }}>G2–G3 PO chưa ban hành, đang chờ thẩm định / duyệt — người duyệt <span className="muted" style={{ fontSize: 11 }}>(không cộng vào tổng)</span></td>
                  <td style={{ textAlign: "right" }}><DSo ds={dd} l="PO chờ thẩm định / duyệt" /></td>
                  <td style={{ textAlign: "right" }}>{soLuong(dd.reduce((s, x) => s + x.so_dong, 0))}</td>
                  <td />
                  {[7, 14, 21, 30].map((n) => <td key={n} style={{ textAlign: "right" }}><DSo ds={dDem(n)} l={`PO chờ duyệt > ${n} ngày`} xau={n >= 14} /></td>)}
                  <td style={{ textAlign: "right", fontWeight: 700, color: Math.max(...dd.map(ngCho)) > 7 ? "var(--danger-ink)" : undefined }}>{Math.max(...dd.map(ngCho))} ng</td>
                  <td colSpan={8} />
                  <td style={{ fontSize: 11.5 }}>{[...giu.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ai, n]) => `${ten(ai) || "(không rõ)"} (${n})`).join(", ")}</td>
                </tr>
              );
            })()}
          </Fragment>))}</tbody>
        </table>
      </div>
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
