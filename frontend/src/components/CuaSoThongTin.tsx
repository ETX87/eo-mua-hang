// Cua so thong tin (popup toan man hinh Giam doc soan tren eOffice) - 2026-11-24.
// Doc qua Worker GET /api/cua-so (backend lib/cuaSoThongTin.ts giu ma khoa). Hien MOI LAN mo app va khi quay lai
// app sau khi an >= 10 phut. Nut "Vao app" khoa khoaNutGiay giay; Esc / nut Back chi dong duoc sau khi het khoa.
// Loi / cham -> khong hien gi, nguoi dung vao app binh thuong (luat bat buoc cua eOffice).
// Mau sac theo DUNG dac ta cua eOffice (du lieu tu Giam doc), khong theo token cua app - co y.
// Mount 1 lan o main.tsx, ngoai App -> hien ca o man dang nhap, phu len moi popup khac cua app.
// File nay giong het o moi app trong he DVBH - sua 1 cho thi chep sang cac app con lai.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Mau = { chu?: string; nhan?: string; phu?: string; nut?: string; nutChu?: string; the?: string };
type CuaSo = {
  id: string;
  phienBan?: number;
  khoaNutGiay?: number;
  boCuc?: string;
  mau?: Mau;
  nhan?: string;
  tieuDe?: string;
  phuDe?: string;
  doan?: string[];
  loiKet?: string;
  nutVao?: string;
  bieuTuong?: string;
};
type KetQua = { coCuaSo: boolean; cuaSo: CuaSo | null; kiemLaiSauGiay?: number; tranhSvg?: string | null };

const AN_LAU_MS = 10 * 60_000;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Inter, Roboto, "Segoe UI", sans-serif';

async function layCuaSo(): Promise<KetQua | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch("/api/cua-so", { credentials: "same-origin", signal: ctl.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as KetQua;
    return j?.coCuaSo && j.cuaSo ? j : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function chuoi(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Doi mau net tranh: net thuong #1d1d1f, net nhan lop .d #0071e3 (dac ta eOffice). */
function tranhUrl(svg: string | null | undefined, net: string, nhan: string): string | null {
  if (!svg) return null;
  const doi = svg.replace(/#1d1d1f/gi, net).replace(/#0071e3/gi, nhan);
  const them = doi.replace(/<svg([^>]*)>/i, `<svg$1><style>.d{stroke:${nhan}}</style>`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(them)}`;
}

const KIEU_APPLE = new Set(["apTrang", "dem", "mauPhang", "theSP"]);

export function CuaSoThongTin() {
  const [kq, setKq] = useState<KetQua | null>(null);
  const [conKhoa, setConKhoa] = useState(0);
  const anLuc = useRef<number | null>(null);
  const dangTai = useRef(false);

  const tai = useCallback(async () => {
    if (dangTai.current) return;
    dangTai.current = true;
    const r = await layCuaSo();
    dangTai.current = false;
    if (r?.cuaSo) {
      setKq(r);
      setConKhoa(Math.max(0, Math.min(30, Number(r.cuaSo.khoaNutGiay ?? 3) || 0)));
    }
  }, []);

  useEffect(() => {
    void tai();
    const doi = () => {
      if (document.visibilityState === "hidden") {
        anLuc.current = Date.now();
      } else if (anLuc.current != null) {
        const lau = Date.now() - anLuc.current;
        anLuc.current = null;
        if (lau >= AN_LAU_MS) void tai();
      }
    };
    document.addEventListener("visibilitychange", doi);
    return () => document.removeEventListener("visibilitychange", doi);
  }, [tai]);

  const mo = !!kq?.cuaSo;

  useEffect(() => {
    if (!mo || conKhoa <= 0) return;
    const t = setTimeout(() => setConKhoa((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [mo, conKhoa]);

  const dong = useCallback(() => setKq(null), []);

  // Esc + nut Back: chi dong duoc khi het khoa.
  const khoaRef = useRef(conKhoa);
  khoaRef.current = conKhoa;
  useEffect(() => {
    if (!mo) return;
    const phim = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      if (khoaRef.current <= 0) dong();
    };
    window.addEventListener("keydown", phim, true);
    return () => window.removeEventListener("keydown", phim, true);
  }, [mo, dong]);

  useEffect(() => {
    if (!mo) return;
    history.pushState({ cuaSoThongTin: true }, "");
    let daDong = false;
    const back = () => {
      if (khoaRef.current > 0) history.pushState({ cuaSoThongTin: true }, "");
      else {
        daDong = true;
        dong();
      }
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (!daDong && (history.state as { cuaSoThongTin?: boolean } | null)?.cuaSoThongTin) history.back();
    };
  }, [mo, dong]);

  useEffect(() => {
    if (!mo) return;
    const cu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = cu;
    };
  }, [mo]);

  if (!kq?.cuaSo) return null;
  const cs = kq.cuaSo;
  const mau = cs.mau ?? {};
  const boCuc = KIEU_APPLE.has(chuoi(cs.boCuc)) ? chuoi(cs.boCuc) : "cu";
  const nhan = chuoi(mau.nhan) || "#0071e3";
  const doan = Array.isArray(cs.doan) ? cs.doan.filter((x) => typeof x === "string" && x.trim()) : [];
  const nhanNut = `${chuoi(cs.nutVao) || "Vào app"}${conKhoa > 0 ? ` (${conKhoa})` : ""}`;

  // Bang mau theo bo cuc (dac ta muc 4).
  const p = {
    apTrang: { nen: "#ffffff", tieuDe: "#1d1d1f", phuDe: nhan, doan: "#6e6e73", nhan: "#6e6e73", nut: "#1d1d1f", nutChu: "#ffffff", net: "#1d1d1f", netNhan: "#0071e3", trai: false },
    dem: { nen: "#000000", tieuDe: "#f5f5f7", phuDe: "#ffd60a", doan: "#a1a1a6", nhan: "#a1a1a6", nut: "#f5f5f7", nutChu: "#000000", net: "#ffffff", netNhan: "#ffd60a", trai: false },
    mauPhang: { nen: nhan, tieuDe: "#ffffff", phuDe: "rgba(255,255,255,.72)", doan: "rgba(255,255,255,.88)", nhan: "rgba(255,255,255,.85)", nut: "#ffffff", nutChu: nhan, net: "#ffffff", netNhan: "#ffffff", trai: true },
    theSP: { nen: "#f5f5f7", tieuDe: "#1d1d1f", phuDe: nhan, doan: "#6e6e73", nhan: nhan, nut: nhan, nutChu: "#ffffff", net: "#1d1d1f", netNhan: "#0071e3", trai: true },
    cu: { nen: "rgba(15,23,42,.55)", tieuDe: chuoi(mau.chu) || "#1d1d1f", phuDe: chuoi(mau.phu) || "#6e6e73", doan: chuoi(mau.phu) || "#6e6e73", nhan: nhan, nut: chuoi(mau.nut) || nhan, nutChu: chuoi(mau.nutChu) || "#ffffff", net: chuoi(mau.chu) || "#1d1d1f", netNhan: nhan, trai: false },
  }[boCuc as "apTrang"]!;

  const anh = tranhUrl(kq.tranhSvg, p.net, p.netNhan);
  const apple = boCuc !== "cu";
  const canh: CSSProperties["textAlign"] = p.trai ? "left" : "center";

  const eNhan = chuoi(cs.nhan) ? (
    <div style={{ fontSize: 15, fontWeight: 600, color: p.nhan, letterSpacing: ".01em", marginBottom: 10 }}>{cs.nhan}</div>
  ) : null;
  const eTieuDe = (
    <h1
      style={{
        margin: 0,
        fontWeight: 700,
        letterSpacing: "-0.03em",
        lineHeight: 1.05,
        fontSize: apple ? "clamp(40px, 7vw, 88px)" : "clamp(26px, 4vw, 38px)",
        color: p.tieuDe,
      }}
    >
      {chuoi(cs.tieuDe)}
      {chuoi(cs.phuDe) ? (
        apple ? (
          <span style={{ display: "block", color: p.phuDe }}>{cs.phuDe}</span>
        ) : (
          <span style={{ display: "block", fontSize: "0.55em", fontWeight: 500, letterSpacing: 0, marginTop: 8, color: p.phuDe }}>{cs.phuDe}</span>
        )
      ) : null}
    </h1>
  );
  const eDoan = doan.length ? (
    <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
      {doan.map((d, i) => (
        <p key={i} style={{ margin: 0, fontSize: apple ? "clamp(17px, 1.6vw, 21px)" : 16, lineHeight: 1.5, color: p.doan, whiteSpace: "pre-line" }}>
          {d}
        </p>
      ))}
    </div>
  ) : null;
  const eTranh = anh ? (
    <img
      src={anh}
      alt=""
      style={{ display: "block", width: "100%", maxWidth: boCuc === "theSP" ? 420 : 360, maxHeight: "32vh", objectFit: "contain", margin: p.trai && boCuc !== "theSP" ? "28px 0 0" : "28px auto 0" }}
    />
  ) : null;
  const eNut = (
    <div style={{ marginTop: 32, display: "flex", justifyContent: p.trai ? "flex-start" : "center" }}>
      <button
        type="button"
        autoFocus
        disabled={conKhoa > 0}
        onClick={dong}
        style={{
          minWidth: 180,
          padding: "14px 32px",
          borderRadius: 999,
          border: "none",
          background: p.nut,
          color: p.nutChu,
          fontSize: 17,
          fontWeight: 600,
          fontFamily: FONT,
          cursor: conKhoa > 0 ? "not-allowed" : "pointer",
          opacity: conKhoa > 0 ? 0.55 : 1,
          transition: "opacity .2s",
        }}
      >
        {nhanNut}
      </button>
    </div>
  );
  const eLoiKet = chuoi(cs.loiKet) ? (
    <div style={{ marginTop: 18, fontSize: 14, fontWeight: 600, color: boCuc === "cu" ? nhan : p.nhan }}>{cs.loiKet}</div>
  ) : null;

  let noiDung: ReactNode;
  if (boCuc === "apTrang") noiDung = <>{eTranh}<div style={{ marginTop: 24 }}>{eNhan}{eTieuDe}</div>{eDoan}{eNut}{eLoiKet}</>;
  else if (boCuc === "dem") noiDung = <>{eNhan}{eTieuDe}{eTranh}{eDoan}{eNut}{eLoiKet}</>;
  else if (boCuc === "mauPhang") noiDung = <>{eNhan}{eTieuDe}{eDoan}{eTranh}{eNut}{eLoiKet}</>;
  else if (boCuc === "theSP")
    noiDung = (
      <div style={{ background: "#ffffff", borderRadius: 30, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.08)" }}>
        {anh ? (
          <div style={{ background: "#fbfbfd", padding: "28px 24px 32px" }}>
            {eTranh}
          </div>
        ) : null}
        <div style={{ padding: "32px clamp(24px, 4vw, 48px) 36px", textAlign: "left" }}>
          {eNhan}{eTieuDe}{eDoan}{eNut}{eLoiKet}
        </div>
      </div>
    );
  else
    noiDung = (
      <div style={{ background: chuoi(mau.the) || "#ffffff", borderRadius: 24, padding: "36px clamp(22px, 4vw, 44px)", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        {chuoi(cs.bieuTuong) ? <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 14 }}>{cs.bieuTuong}</div> : null}
        {eNhan}{eTieuDe}{eDoan}{eTranh}{eNut}{eLoiKet}
      </div>
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={chuoi(cs.tieuDe) || "Thông tin"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: p.nen,
        overflowY: "auto",
        fontFamily: FONT,
        WebkitFontSmoothing: "antialiased",
        display: "flex",
      }}
    >
      <div
        style={{
          margin: "auto",
          width: "100%",
          maxWidth: boCuc === "theSP" ? 720 : boCuc === "cu" ? 560 : 880,
          padding: "48px clamp(20px, 5vw, 56px) calc(48px + env(safe-area-inset-bottom))",
          textAlign: canh,
          boxSizing: "border-box",
        }}
      >
        {noiDung}
      </div>
    </div>
  );
}
