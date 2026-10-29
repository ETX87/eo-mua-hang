import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { api } from "../../api/client";
import { PageHeader, Card, Spinner } from "../../components/ui";
import { soLuong, ten } from "../../lib/format";
import { gioTxt } from "../../lib/giaiDoan";

/**
 * Bao cao "Giai doan don hang" (dot 2): moi giai doan G1..G8 - so dong da qua, thoi gian TB / trung vi / P90 (gio lam viec),
 * % dung han, dang o + dang tre; xep hang theo nguoi / phong ban / NCC / kho / loai hinh; xu huong theo thang dat.
 * Du lieu: GET /api/so-don-hang (cung nguon So don hang, da cache). Bam so lieu -> So don hang da loc san.
 */
type Row = Record<string, any>;
const ngayDatCua = (r: Row) => (r.sau_ban_hanh ? r.ngay_tao : r.ngay_ban_hanh ?? r.ngay_tao) as string | null;
const pTram = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const phanVi = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] * 10) / 10;
};
const mauPt = (v: number | null) => (v == null ? undefined : v >= 90 ? "var(--ok-ink)" : v >= 70 ? "var(--warn-ink)" : "var(--danger-ink)");

interface ThongKe { k: string; xong: number; tb: number | null; tv: number | null; p90: number | null; dung: number; coHan: number; pt: number | null; dang: number; dangTre: number }
function thongKe(rows: Row[], k: string): ThongKe {
  const gio: number[] = [];
  let dung = 0, coHan = 0, dang = 0, dangTre = 0;
  for (const r of rows) {
    const m = r.gd_moc?.[k];
    if (!m?.bd) continue;
    const tre = r.gd_tre_tung?.[k];
    if (m.kt) {
      gio.push(r.gd_gio_tung?.[k] ?? 0);
      if (tre != null) { coHan++; if (!tre) dung++; }
    } else if (!["XONG", "HUY"].includes(r.gd_hien_tai)) {
      dang++; if (tre) dangTre++;
    }
  }
  return {
    k, xong: gio.length, tb: gio.length ? Math.round((gio.reduce((s, x) => s + x, 0) / gio.length) * 10) / 10 : null,
    tv: phanVi(gio, 0.5), p90: phanVi(gio, 0.9), dung, coHan, pt: pTram(dung, coHan), dang, dangTre,
  };
}

const CHIEU: { k: string; l: string; get: (r: Row) => string | null; hien?: (v: string) => string }[] = [
  { k: "nguoi_tao", l: "Người tạo EO", get: (r) => r.nguoi_tao, hien: ten },
  { k: "nguoi_duyet_cuoi", l: "Người duyệt cuối", get: (r) => r.nguoi_duyet_cuoi, hien: ten },
  { k: "phong_ban", l: "Phòng ban", get: (r) => r.phong_ban },
  { k: "doi_tac", l: "Nhà cung cấp", get: (r) => r.doi_tac },
  { k: "kho", l: "Kho", get: (r) => r.kho },
  { k: "loai_hinh", l: "Loại hình", get: (r) => r.loai_hinh },
];

export default function BaoCaoGiaiDoan() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["so-don-hang"], queryFn: () => api.get<{ giai_doan: any[]; sla: Record<string, number>; rows: Row[] }>("/so-don-hang") });
  const homNay = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [tu, setTu] = useState(() => `${homNay.slice(0, 4)}-${String(Math.max(1, Number(homNay.slice(5, 7)) - 2)).padStart(2, "0")}-01`);
  const [den, setDen] = useState("");
  const [kho, setKho] = useState("");
  const [doiTac, setDoiTac] = useState("");
  const [loaiHinh, setLoaiHinh] = useState("");
  const [chieu, setChieu] = useState("nguoi_tao");
  const [gdXh, setGdXh] = useState("G5");

  const all = q.data?.rows ?? [];
  const gds = (q.data?.giai_doan ?? []) as { k: string; l: string; vai_tro: string }[];
  const sla = q.data?.sla ?? {};
  const uniq = (f: (r: Row) => any) => [...new Set(all.map(f).filter(Boolean) as string[])].sort();
  const rows = useMemo(() => all.filter((r) => {
    const d = (ngayDatCua(r) ?? "").slice(0, 10);
    if (tu && (!d || d < tu)) return false;
    if (den && (!d || d > den)) return false;
    return (!kho || r.kho === kho) && (!doiTac || r.doi_tac === doiTac) && (!loaiHinh || r.loai_hinh === loaiHinh);
  }), [all, tu, den, kho, doiTac, loaiHinh]);
  const tk = useMemo(() => gds.map((g) => ({ ...thongKe(rows, g.k), l: g.l, vai_tro: g.vai_tro })), [rows, gds]);

  // xep hang theo chieu: moi gia tri -> so dong + thong ke giai doan dang chon
  const c = CHIEU.find((x) => x.k === chieu)!;
  const xepHang = useMemo(() => {
    const nhom = new Map<string, Row[]>();
    for (const r of rows) { const v = c.get(r); if (v) nhom.set(v, [...(nhom.get(v) ?? []), r]); }
    return [...nhom.entries()].map(([v, rs]) => ({ v, n: rs.length, s: thongKe(rs, gdXh) }))
      .filter((x) => x.s.xong + x.s.dang > 0).sort((a, b) => (a.s.pt ?? 101) - (b.s.pt ?? 101) || b.n - a.n);
  }, [rows, c, gdXh]);

  // xu huong theo thang dat: TB gio + % dung han cua giai doan dang chon
  const xuHuong = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const d = ngayDatCua(r); if (d) m.set(d.slice(0, 7), [...(m.get(d.slice(0, 7)) ?? []), r]); }
    return [...m.entries()].sort().map(([k, rs]) => { const s = thongKe(rs, gdXh); return { thang: `${k.slice(5)}/${k.slice(2, 4)}`, tb: s.tb, pt: s.pt, n: s.xong }; });
  }, [rows, gdXh]);

  // G4 song song -> loc rieng g4 (khong phai "giai doan hien tai"); con lai loc giai doan hien tai
  const den2 = (k: string, tre?: boolean) => nav(k === "G4" ? `/so-don-hang?g4=${tre ? "tre" : "chua"}` : `/so-don-hang?gd=${k}${tre ? "&tre=tre" : ""}`);
  const S = ({ v, on, opts, l }: { v: string; on: (v: string) => void; opts: string[]; l: string }) => (
    <select className="select" style={{ width: 170, height: 32 }} value={v} onChange={(e) => on(e.target.value)}><option value="">{l}</option>{opts.map((x) => <option key={x}>{x}</option>)}</select>
  );
  if (q.isLoading) return <Spinner />;
  const slaTxt = (k: string) => (k === "G6" ? "ngày DK lần đầu" : sla[k] != null ? gioTxt(sla[k]) : "—");

  return (
    <div>
      <PageHeader title="Báo cáo – Giai đoạn đơn hàng" />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Đơn đặt từ</span>
          <input className="input" type="date" style={{ width: 150, height: 32 }} value={tu} onChange={(e) => setTu(e.target.value)} />
          <span className="muted">đến</span>
          <input className="input" type="date" style={{ width: 150, height: 32 }} value={den} onChange={(e) => setDen(e.target.value)} />
          <S v={kho} on={setKho} opts={uniq((r) => r.kho)} l="Mọi kho" />
          <S v={doiTac} on={setDoiTac} opts={uniq((r) => r.doi_tac)} l="Mọi NCC" />
          <S v={loaiHinh} on={setLoaiHinh} opts={uniq((r) => r.loai_hinh)} l="Mọi loại hình" />
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{soLuong(rows.length)} dòng · thời gian = giờ làm việc (bỏ Chủ nhật) · 1 ngày = 24 giờ LV</span>
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <b style={{ fontSize: 14 }}>Tổng hợp theo giai đoạn</b>
        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>bấm số "đang ở" / "đang trễ" để mở danh sách trong Sổ đơn hàng</span>
        <div className="tbl-wrap" style={{ marginTop: 8 }}>
          <table className="tbl tbl-dense">
            <thead><tr><th>Giai đoạn</th><th>Vai trò</th><th>Hạn</th><th style={{ textAlign: "right" }}>Đã qua</th><th style={{ textAlign: "right" }}>Trung bình</th><th style={{ textAlign: "right" }}>Trung vị</th><th style={{ textAlign: "right" }}>90% dòng ≤</th><th style={{ textAlign: "right" }}>% đúng hạn</th><th style={{ textAlign: "right" }}>Đang ở</th><th style={{ textAlign: "right" }}>Đang trễ</th></tr></thead>
            <tbody>
              {tk.map((s) => (
                <tr key={s.k}>
                  <td><b>{s.k}</b> {s.l}{s.k === "G4" && <div className="muted" style={{ fontSize: 10.5 }}>song song · theo mail CC theodoimuahang</div>}{s.k === "G7" && <div className="muted" style={{ fontSize: 10.5 }}>chỉ đo độ trễ cập nhật AMIS</div>}</td>
                  <td className="muted">{s.vai_tro}</td>
                  <td className="muted">{slaTxt(s.k)}</td>
                  <td style={{ textAlign: "right" }}>{soLuong(s.xong)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{gioTxt(s.tb) || "—"}</td>
                  <td style={{ textAlign: "right" }}>{gioTxt(s.tv) || "—"}</td>
                  <td style={{ textAlign: "right" }}>{gioTxt(s.p90) || "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 800, color: mauPt(s.pt) }} title={`${s.dung} / ${s.coHan} dòng có hạn`}>{s.pt != null ? `${s.pt}%` : "—"}</td>
                  <td style={{ textAlign: "right" }}>{s.dang ? <button className="qv-link" onClick={() => den2(s.k)}>{soLuong(s.dang)}</button> : "0"}</td>
                  <td style={{ textAlign: "right" }}>{s.dangTre ? <button className="qv-link" style={{ color: "var(--danger-ink)", fontWeight: 800 }} onClick={() => den2(s.k, true)}>{soLuong(s.dangTre)}</button> : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ height: 220, marginTop: 12 }}>
          <ResponsiveContainer>
            <ComposedChart data={tk.map((s) => ({ ten: s.k, tb: s.tb, p90: s.p90, pt: s.pt }))} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#EEE" vertical={false} />
              <XAxis dataKey="ten" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="g" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} unit="h" />
              <YAxis yAxisId="p" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any, n: any) => (String(n).includes("%") ? `${v}%` : gioTxt(v))} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5 }} />
              <Bar yAxisId="g" dataKey="tb" name="Trung bình" fill="#FDE68A" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="g" dataKey="p90" name="90% dòng ≤" fill="#FCA5A5" radius={[3, 3, 0, 0]} />
              <Line yAxisId="p" dataKey="pt" name="% đúng hạn" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3 }} />
              <ReferenceLine yAxisId="p" y={90} stroke="#16A34A" strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 12 }}>
        <Card>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>Xếp hạng</b>
            <select className="select" style={{ width: 170, height: 30 }} value={chieu} onChange={(e) => setChieu(e.target.value)}>{CHIEU.map((x) => <option key={x.k} value={x.k}>theo {x.l}</option>)}</select>
            <select className="select" style={{ width: 210, height: 30 }} value={gdXh} onChange={(e) => setGdXh(e.target.value)}>{gds.map((g) => <option key={g.k} value={g.k}>{g.k} · {g.l}</option>)}</select>
            <span className="muted" style={{ fontSize: 11.5 }}>% đúng hạn thấp lên đầu</span>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="tbl tbl-dense">
              <thead><tr><th>{c.l}</th><th style={{ textAlign: "right" }}>Dòng</th><th style={{ textAlign: "right" }}>Đã qua</th><th style={{ textAlign: "right" }}>TB</th><th style={{ textAlign: "right" }}>90% ≤</th><th style={{ textAlign: "right" }}>% đúng hạn</th><th style={{ textAlign: "right" }}>Đang ở / trễ</th></tr></thead>
              <tbody>
                {xepHang.length === 0 && <tr><td colSpan={7} className="muted">Chưa có dữ liệu.</td></tr>}
                {xepHang.map((x) => (
                  <tr key={x.v}>
                    <td>{c.hien ? c.hien(x.v) : x.v}</td>
                    <td style={{ textAlign: "right" }}>{soLuong(x.n)}</td>
                    <td style={{ textAlign: "right" }}>{soLuong(x.s.xong)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{gioTxt(x.s.tb) || "—"}</td>
                    <td style={{ textAlign: "right" }}>{gioTxt(x.s.p90) || "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: mauPt(x.s.pt) }}>{x.s.pt != null ? `${x.s.pt}%` : "—"}</td>
                    <td style={{ textAlign: "right" }}>{x.s.dang}{x.s.dangTre ? <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}> / {x.s.dangTre}</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <b style={{ fontSize: 14 }}>Xu hướng theo tháng đặt — {gdXh} {gds.find((g) => g.k === gdXh)?.l}</b>
          <div style={{ height: 300, marginTop: 8 }}>
            <ResponsiveContainer>
              <ComposedChart data={xuHuong} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#EEE" vertical={false} />
                <XAxis dataKey="thang" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="g" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} unit="h" />
                <YAxis yAxisId="p" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10.5 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any, n: any) => (String(n).includes("%") ? `${v}%` : n === "Số dòng" ? v : gioTxt(v))} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5 }} />
                <Bar yAxisId="g" dataKey="tb" name="Thời gian TB" fill="#FDE68A" radius={[3, 3, 0, 0]} />
                <Line yAxisId="p" dataKey="pt" name="% đúng hạn" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
