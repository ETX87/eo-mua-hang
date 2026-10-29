import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api } from "../api/client";
import { Card } from "../components/ui";
import { useQuickView } from "../components/quickview/QuickView";
import { soLuong } from "../lib/format";
import { MOC_TON } from "../lib/tonDong";

/**
 * Bang dieu khien cho quan ly (dau trang Tong quan) - nhin 3-5 giay: tra linh kien, ty le dap ung thang/tuan,
 * ton dong + moc thoi gian ton. Du lieu: GET /api/dashboard/quan-ly (gom tu bao cao 0.1 da cache), /dashboard/tim-linh-kien.
 */
export default function QuanLyPanel() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["dash-quan-ly"], queryFn: () => api.get<any>("/dashboard/quan-ly"), refetchInterval: 120000 });
  const [ky, setKy] = useState<"thang" | "tuan">("thang");
  const d = q.data;
  const cuoi = (a: any[] | undefined) => (a && a.length ? a[a.length - 1] : null);
  const thangNay = cuoi(d?.dap_ung.thang);
  const tuanNay = cuoi(d?.dap_ung.tuan);
  const t = d?.ton;
  const mauTyLe = (v: number | null | undefined) => (v == null ? undefined : v >= 90 ? "var(--ok-ink)" : v >= 70 ? "var(--warn-ink)" : "var(--danger-ink)");

  const O = ({ l, v, sub, mau, to, title }: { l: string; v: ReactNode; sub?: ReactNode; mau?: string; to?: string; title?: string }) => (
    <div className="ql-o" onClick={to ? () => nav(to) : undefined} style={{ cursor: to ? "pointer" : undefined }} title={title}>
      <div className="ql-l">{l}</div>
      <div className="ql-v" style={{ color: mau }}>{v}</div>
      {sub && <div className="ql-s">{sub}</div>}
    </div>
  );

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 16 }}>Bảng điều khiển mua hàng</strong>
        <TraLinhKien />
        {d && <span className="muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>Cập nhật {d.luc.slice(11, 16)} · tồn đọng tính đơn đặt từ {d.bo_qua_truoc.split("-").reverse().join("/")}</span>}
      </div>

      {q.isLoading || !d ? <div className="muted" style={{ padding: 20 }}>Đang tải chỉ số…</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 8 }}>
            <O l={`Đáp ứng tháng ${thangNay?.nhan ?? ""}`} v={thangNay?.ty_le_sl != null ? `${thangNay.ty_le_sl}%` : "—"} mau={mauTyLe(thangNay?.ty_le_sl)}
              sub={thangNay ? `${soLuong(thangNay.sl_ve)} / ${soLuong(thangNay.sl_dat)} · ${thangNay.ty_le_dong}% dòng đủ` : "chưa có đơn"}
              title="SL về (không tính về thừa) / SL đặt của các dòng ĐẶT trong tháng" />
            <O l={`Đáp ứng ${tuanNay?.nhan?.toLowerCase() ?? "tuần"}`} v={tuanNay?.ty_le_sl != null ? `${tuanNay.ty_le_sl}%` : "—"} mau={mauTyLe(tuanNay?.ty_le_sl)}
              sub={tuanNay ? `${soLuong(tuanNay.sl_ve)} / ${soLuong(tuanNay.sl_dat)} · ${tuanNay.ty_le_dong}% dòng đủ` : "chưa có đơn"}
              title="Tuần Chủ nhật – Thứ Bảy, theo ngày đặt" />
            <O l="Dòng chưa về đủ" v={soLuong(t.dong_chua_du)} mau={t.dong_chua_du ? "var(--warn-ink)" : undefined} sub={`thiếu ${soLuong(t.sl_thieu)} SL`} to="/theo-doi" />
            <O l="Dòng về = 0" v={soLuong(t.dong_ve_0)} mau={t.dong_ve_0 ? "var(--danger-ink)" : undefined} sub={`${soLuong(t.dong_ve_thieu)} dòng về thiếu`} to="/theo-doi" />
            <O l="Quá ngày dự kiến" v={soLuong(t.dong_qua_du_kien)} mau={t.dong_qua_du_kien ? "var(--danger-ink)" : undefined} sub={`${soLuong(t.dong_chua_ngay_du_kien)} dòng chưa có ngày DK`} to="/theo-doi?nhom=QUA_HAN_NDK" />
            <O l="EO đang tồn" v={soLuong(t.eo_ton)} sub="đã ban hành, chưa về đủ" to="/eo" />
            <O l="EO chưa duyệt" v={soLuong(t.eo_chua_duyet)} mau={t.eo_chua_duyet ? "var(--warn-ink)" : undefined} sub={`${t.eo_tham_dinh} đang thẩm định`} to="/eo" />
            <O l="Dòng thêm sau BH chờ duyệt" v={soLuong(t.dong_sau_bh_cho_duyet)} mau={t.dong_sau_bh_cho_duyet ? "var(--warn-ink)" : undefined} to="/approvals" />
          </div>

          {/* dong dang o tung giai doan (lib/giaiDoan) - bam -> So don hang loc san; so do = dang tre han */}
          {d.giai_doan && (
            <div style={{ display: "flex", gap: 6, alignItems: "stretch", marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 700, alignSelf: "center", width: 90 }}>Đơn đang ở<br />giai đoạn</div>
              {d.giai_doan.map((g: any, i: number) => (
                <div key={g.k} style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 120px", minWidth: 0 }}>
                  <div className="ql-o" onClick={() => nav(`/so-don-hang?gd=${g.k}`)} style={{ cursor: "pointer", flex: 1, borderTop: `3px solid ${g.tre ? "#DC2626" : g.n ? "#F59E0B" : "var(--border)"}` }} title={`${g.l} — ${g.vai_tro}. ${g.n} dòng đang ở, ${g.tre} trễ hạn`}>
                    <div className="ql-l">{g.k} · {g.l}</div>
                    <div className="ql-v" style={{ fontSize: 18 }}>{soLuong(g.n)}{g.tre > 0 && <span onClick={(e) => { e.stopPropagation(); nav(`/so-don-hang?gd=${g.k}&tre=tre`); }} style={{ fontSize: 12, color: "var(--danger-ink)", marginLeft: 6 }}>{g.tre} trễ</span>}</div>
                    <div className="ql-s">{g.vai_tro}</div>
                  </div>
                  {i < d.giai_doan.length - 1 && <span className="muted">›</span>}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 14, marginTop: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 13.5 }}>Tỷ lệ đáp ứng đặt hàng</b>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["thang", "tuan"] as const).map((k) => <button key={k} className={`qv-chip ${ky === k ? "on" : ""}`} onClick={() => setKy(k)}>{k === "thang" ? "Theo tháng" : "Theo tuần"}</button>)}
                </div>
                <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>Cột: SL đặt / SL về · Đường: % về/đặt</span>
              </div>
              <div style={{ height: 210 }}>
                <ResponsiveContainer>
                  <ComposedChart data={d.dap_ung[ky]} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="#EEE" vertical={false} />
                    <XAxis dataKey="nhan" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="sl" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="pt" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any, n: any) => (String(n).includes("%") ? `${v}%` : soLuong(v))} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5 }} />
                    <Bar yAxisId="sl" dataKey="sl_dat" name="SL đặt" fill="#FDE68A" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="sl" dataKey="sl_ve" name="SL về" fill="#86EFAC" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="pt" type="monotone" dataKey="ty_le_sl" name="% đáp ứng" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line yAxisId="pt" type="monotone" dataKey="ty_le_dong" name="% dòng về đủ" stroke="#2563EB" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <b style={{ fontSize: 13.5 }}>Đơn chưa về đủ theo thời gian tồn</b>
              <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>tính từ ngày đặt · bấm để xem danh sách</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, marginTop: 8 }}>
                {d.moc_ton.map((m: any) => {
                  const c = MOC_TON.find((x) => x.k === m.k)!;
                  return (
                    <div key={m.k} onClick={() => nav(`/theo-doi?ton=${m.k}`)} title={`${m.so_dong} dòng · ${m.so_eo} EO · thiếu ${soLuong(m.sl_thieu)} SL`}
                      style={{ cursor: "pointer", background: m.so_dong ? c.nen : "var(--panel-2)", borderRadius: 8, padding: "6px 8px", borderLeft: `4px solid ${m.so_dong ? c.mau : "var(--border)"}` }}>
                      <div style={{ fontSize: 11, color: m.so_dong ? c.mau : "var(--text-muted)", fontWeight: 700 }}>{m.l}</div>
                      <div style={{ fontSize: 19, fontWeight: 900, color: m.so_dong ? c.mau : "var(--text-muted)" }}>{soLuong(m.so_dong)}</div>
                      <div className="muted" style={{ fontSize: 10.5 }}>{m.so_eo} EO · thiếu {soLuong(m.sl_thieu)}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <b>EO chờ duyệt</b> theo thời gian chờ:{" "}
                {d.moc_cho_duyet.filter((m: any) => m.so_eo).length === 0 ? <span className="muted">không có</span>
                  : d.moc_cho_duyet.filter((m: any) => m.so_eo).map((m: any) => {
                    const c = MOC_TON.find((x) => x.k === m.k)!;
                    return <span key={m.k} style={{ background: c.nen, color: c.mau, borderRadius: 6, padding: "1px 7px", marginRight: 4, fontWeight: 700 }}>{m.l}: {m.so_eo}</span>;
                  })}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** O tra nhanh linh kien (ma / ten, khong dau) -> mo popup ma linh kien. */
function TraLinhKien() {
  const qv = useQuickView();
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const [mo, setMo] = useState(false);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = setTimeout(() => setDeb(q.trim()), 220); return () => clearTimeout(h); }, [q]);
  const r = useQuery({ queryKey: ["tim-lk", deb], queryFn: () => api.get<any[]>(`/dashboard/tim-linh-kien?q=${encodeURIComponent(deb)}`), enabled: deb.length >= 2 });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMo(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const ds = r.data ?? [];
  const chon = (ma: string) => { setMo(false); qv.openPart(ma); };
  return (
    <div ref={ref} style={{ position: "relative", width: 440 }}>
      <input className="input" style={{ height: 36, fontSize: 14 }} placeholder="🔍 Tra linh kiện: mã hoặc tên (không dấu)… Enter để mở"
        value={q} onFocus={() => setMo(true)} onChange={(e) => { setQ(e.target.value); setMo(true); setI(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, ds.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
          else if (e.key === "Enter") { if (ds[i]) chon(ds[i].ma); else if (q.trim()) chon(q.trim()); }
          else if (e.key === "Escape") setMo(false);
        }} />
      {mo && deb.length >= 2 && (
        <div className="card" style={{ position: "absolute", top: 40, left: 0, right: 0, zIndex: 30, padding: 4, maxHeight: 360, overflow: "auto", boxShadow: "var(--shadow-pop)" }}>
          {r.isLoading && <div className="muted" style={{ padding: 8, fontSize: 12.5 }}>Đang tìm…</div>}
          {!r.isLoading && ds.length === 0 && <div className="muted" style={{ padding: 8, fontSize: 12.5 }}>Không thấy mã nào. Enter để tra đúng mã "{q.trim()}".</div>}
          {ds.map((x, k) => (
            <div key={x.ma} onMouseDown={(e) => { e.preventDefault(); chon(x.ma); }} onMouseEnter={() => setI(k)}
              style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: k === i ? "#FFFBEB" : undefined, display: "flex", gap: 8, alignItems: "baseline" }}>
              <b style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{x.ma}</b>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 }}>{x.ten}</span>
              <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{x.so_dong ? `${x.so_dong} dòng · ${soLuong(x.sl)}` : "chỉ có phiếu AMIS"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
