import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, PageHeader, Spinner, Popover } from "../components/ui";
import { DataTable, FilterBar, RefreshFiltersBtn, type Col } from "../components/DataTable";
import { useQuickView } from "../components/quickview/QuickView";
import { I } from "../lib/icons";
import { soLuong, ngay, ngayGio, ten, tuBayGio } from "../lib/format";
import { exportRowsToXlsx } from "../lib/exportXlsx";
import { useDanhMuc } from "./theodoi/shared";
import { MUC, MA_CEO, mucCua, gomCa, useCaCeo, type Muc, type C } from "../lib/caCeo";

/**
 * MENU "CA TON CEO" (v0.091, yeu cau lanh dao tach rieng menu) - GET /api/ca-ceo (backend routes/caCeo.ts):
 * dong dang mo cap CEO kem ma ER.MH-201 (lui >= 3 lan) / 202 (ngay DK cach ngay dat >= 30 ngay) / 203 (>= 3 loi) + dien giai tung ly do,
 * va hanh dong: da thuc NCC bao nhieu lan, NCC tra loi gi, giai trinh gan nhat, im lang bao lau. Bam dong -> popup don hang.
 * v0.100 (yeu cau 2026-11-19): GOP CA = 1 PO + 1 ma CEO (nhu gop vi pham) - khop backend lib/caCeo gomCaCeo; dong co 2-3 ma nam trong 2-3 ca.
 * Do hot ca: moi dong da xong -> DA_XONG · co dong RAT_HOT -> RAT_HOT · con lai GIAM_HOT. Tab "Dang theo doi" (rat hot + giam hot) / tab nho "Da xong".
 */
export default function CaCeo() {
  const qv = useQuickView();
  const qc = useQueryClient();
  const q = useCaCeo();
  const [muc, setMuc] = useState<Muc | "">("");
  const dm = useDanhMuc();
  const tenDm = (loai: string, ma: string | null) => (dm.data ?? []).find((x) => x.loai === loai && x.ma === ma)?.ten ?? ma ?? "";
  // v0.129: ma CEO tren URL (?ma=ER.MH-201) - menu cap 2 "Đơn PO › PO tồn CEO › …"
  const [sp, setSp] = useSearchParams();
  const ma = sp.get("ma") ?? "";
  const setMa = (v: string) => setSp((s) => { const n = new URLSearchParams(s); if (v) n.set("ma", v); else n.delete("ma"); return n; }, { replace: true });
  const [tab, setTab] = useState<"dang" | "xong">("dang");
  const rows = q.data?.rows ?? [];
  const caAll = useMemo(() => gomCa(rows), [rows]);
  const caTab = useMemo(() => caAll.filter((c) => (tab === "xong") === (c.muc === "DA_XONG")), [caAll, tab]);
  // v0.131: nhom nhanh "khong thuc NCC 7 ngay" (truoc la o so) + o tim
  const [khongThuc, setKhongThuc] = useState(false);
  const [tim, setTim] = useState("");
  const khongThucCa = (c: (typeof caAll)[number]) => c.dong.every((r) => r.muc_xu_ly === "DA_XONG" || !r.thuc7);
  const ds = useMemo(() => {
    const w = tim.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().split(/\s+/).filter(Boolean);
    const bd = (x: unknown) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
    return caTab.filter((c) => (!ma || c.ma === ma) && (!muc || c.muc === muc) && (!khongThuc || khongThucCa(c))).flatMap((c) => c.dong)
      .filter((r) => !w.length || ((h) => w.every((t) => h.includes(t)))(bd(`${r.po} ${r.ma_lk} ${r.ten_lk} ${r.doi_tac ?? ""} ${r.kho} ${r.nguoi_dat ?? ""} ${r._ma.ma}`)));
  }, [caTab, ma, muc, khongThuc, tim]); // eslint-disable-line react-hooks/exhaustive-deps
  const soXong = caAll.filter((c) => c.muc === "DA_XONG").length;
  const caDang = caAll.length - soXong;
  const doiTab = (t: "dang" | "xong") => { setTab(t); setMuc(""); setKhongThuc(false); };
  if (q.isLoading) return <><PageHeader title="PO tồn CEO" /><Spinner /></>;

  const cols: Col<C>[] = [
    { key: "muc", header: "Mức xử lý", loc: "chon", gt: (r) => r.muc_xu_ly, nhanChon: (v) => MUC[v as Muc]?.ngan ?? v, gtSap: (r) => ({ RAT_HOT: 3, GIAM_HOT: 2, DA_XONG: 1 })[r.muc_xu_ly], maxW: 230,
      render: (r) => <div title={r.ly_do_xu_ly.join("\n")}>
        <span style={{ background: mucCua(r.muc_xu_ly).nen, color: mucCua(r.muc_xu_ly).mau, fontWeight: 800, fontSize: 11.5, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{mucCua(r.muc_xu_ly).icon} {mucCua(r.muc_xu_ly).ngan}</span>
        <div style={{ fontSize: 11.5, color: mucCua(r.muc_xu_ly).mau, marginTop: 2 }}>{r.ly_do_xu_ly.slice(0, 2).join(" · ")}{r.ly_do_xu_ly.length > 2 ? " …" : ""}</div></div> },
    { key: "ma", header: "Mã CEO · lý do", loc: "chon", gt: (r) => r._ma.ma, maxW: 280,
      render: (r) => <span title={`${r._ma.ten}: ${r._ma.gia_tri} (ngưỡng ${r._ma.nguong})\n${r._ma.chi_tiet.join("\n")}`} style={{ fontSize: 12 }}>
        <b style={{ fontFamily: "ui-monospace, monospace", color: "#8a0010" }}>{r._ma.ma}</b> {r._ma.ten} · <b>{r._ma.gia_tri}</b>
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
        <b style={{ fontFamily: "ui-monospace, monospace", color: "#8a0010" }}>{r0._ma.ma}</b><span>{tenMa(r0._ma.ma)}</span>
        <span className="cell-link" onClick={(e) => { e.stopPropagation(); qv.openEo(r0.eo_id); }}><b>{r0.po}</b></span>
        <span className="muted">{r0.doi_tac ?? "—"} · {ten(r0.nguoi_dat)}</span>
        <span><b>{d.length}</b> dòng LK{xong && tab === "dang" ? ` · ${xong} đã xong` : ""}</span>
        {tab === "dang" && <span>tồn <b style={{ color: tonMax > 30 ? "var(--danger-ink)" : undefined }}>{tonMax} ng</b></span>}
        {cho > 0 && <span style={{ color: "var(--danger-ink)" }}>lỗi chờ GT <b>{cho}</b></span>}
        {tab === "dang" && <span style={{ color: thuc ? "var(--ok-ink)" : "var(--danger-ink)" }}>thúc NCC 7 ng: <b>{thuc}</b></span>}
      </span>;
    },
  };
  // v0.131 (chu he thong 27/11/2026 "PO ton CEO cung can lam lai giao dien, uu tien table danh sach"): bo 2 the lon + hang o so;
  // 1 thanh thao tac gon (giong Don PO / Vi pham) roi BANG. Ma CEO: menu cap 2 (?ma=) hoac o chon; muc / NCC / kho / nguoi = loc tieu de cot.
  const soCa = (f: (c: (typeof caAll)[number]) => boolean) => caTab.filter(f).length;
  const coLoc = !!(ma || muc || khongThuc || tim);
  const xoaLoc = () => { setMa(""); setMuc(""); setKhongThuc(false); setTim(""); };
  const soCaHien = new Set(ds.map((r) => r._khoa)).size;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHeader title="PO tồn CEO" />
      <Card>
        <FilterBar>
          <div className="seg" role="tablist">
            {([["dang", "🔥 Đang theo dõi", caDang], ["xong", "⚪ Đã xong", soXong]] as const).map(([k, l, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""}
                onClick={() => doiTab(k)}>{l} ({soLuong(n)})</button>
            ))}
          </div>
          <select className="select tb" style={{ width: 230, borderColor: ma ? "var(--brand-yellow-btn)" : undefined }} value={ma} onChange={(e) => setMa(e.target.value)} title="Mã CEO (lý do lên cấp CEO)">
            <option value="">Mọi mã CEO ({soLuong(caTab.length)} ca)</option>
            {MA_CEO.map((m) => <option key={m.ma} value={m.ma}>{m.ma} · {m.l} ({soLuong(soCa((c) => c.ma === m.ma))})</option>)}
          </select>
          {tab === "dang" && (["RAT_HOT", "GIAM_HOT"] as Muc[]).map((k) => {
            const on = muc === k;
            return <button key={k} className="btn sm" title={MUC[k].mo_ta} onClick={() => setMuc(on ? "" : k)}
              style={{ fontWeight: on ? 800 : 600, color: MUC[k].mau, borderColor: on ? MUC[k].mau : undefined, background: on ? MUC[k].nen : undefined }}>
              {MUC[k].icon} {MUC[k].l} ({soLuong(soCa((c) => c.muc === k))})</button>;
          })}
          {tab === "dang" && <button className="btn sm" title="Mọi dòng còn thiếu của ca đều chưa được thúc NCC trong 7 ngày" onClick={() => setKhongThuc(!khongThuc)}
            style={{ fontWeight: khongThuc ? 800 : 600, color: "#d70015", borderColor: khongThuc ? "#d70015" : undefined, background: khongThuc ? "#ffe7e5" : undefined }}>
            Không thúc NCC 7 ngày ({soLuong(soCa(khongThucCa))})</button>}
          <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 280 }}>
            <I.search width={15} height={15} style={{ position: "absolute", left: 11, top: 9, color: "var(--text-faint)" }} />
            <input className="input tb" style={{ paddingLeft: 32 }} placeholder="Tìm PO, mã / tên LK, NCC, kho…" value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
          {coLoc && <RefreshFiltersBtn onClick={xoaLoc} />}
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}><b style={{ color: "var(--text)" }}>{soLuong(soCaHien)}</b> ca · {soLuong(new Set(ds.map((r) => r.eo_id)).size)} PO · {soLuong(ds.length)} dòng LK</span>
          <button className="btn sm" style={{ padding: "0 9px" }} onClick={() => qc.invalidateQueries({ queryKey: ["ca-ceo"] })} title="Tải lại"><I.refresh width={13} height={13} /></button>
          <button className="btn sm" style={{ padding: "0 9px" }} onClick={xuat} title="Xuất Excel các dòng đang lọc"><I.download width={14} height={14} /></button>
          <Popover align="right" width={420} btnClass="btn sm ghost" title="Chú giải" label={<I.help width={15} height={15} />}>
            <div style={{ fontSize: 12, lineHeight: 1.55 }}>
              <div><b>1 ca</b> = 1 PO + 1 mã CEO (gộp các dòng LK cùng lý do trên PO, như gộp vi phạm). Tổng {soLuong(caAll.length)} ca / {soLuong(rows.length)} dòng LK.</div>
              {(["RAT_HOT", "GIAM_HOT", "DA_XONG"] as Muc[]).map((k) => <div key={k} style={{ marginTop: 4 }}><b style={{ color: MUC[k].mau }}>{MUC[k].icon} {MUC[k].l}</b> — {MUC[k].mo_ta}</div>)}
              <div style={{ marginTop: 4 }}>{MA_CEO.map((m) => `${m.ma}: ${m.l}`).join(" · ")}</div>
              <div className="muted" style={{ marginTop: 6 }}>Bấm tiêu đề ca để thu gọn / mở · rê chuột lên mã CEO xem diễn giải · bấm dòng → popup đơn hàng · lọc / sắp xếp: phễu / tiêu đề cột.</div>
            </div>
          </Popover>
        </FilterBar>
        <DataTable key={tab} cols={cols} rows={ds} keyOf={(r) => r.item_id} pageSize={30} nhom={nhomCfg} onRowClick={(r) => qv.openDong(r.item_id)} timKiem={false}
          empty={coLoc ? "Không có ca khớp bộ lọc." : tab === "dang" ? "Không có ca CEO đang theo dõi." : "Chưa có ca CEO nào đã xong."} />
      </Card>
    </div>
  );
}
