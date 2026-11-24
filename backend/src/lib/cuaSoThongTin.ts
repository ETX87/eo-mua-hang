// Cua so thong tin (popup toan man hinh do Giam doc soan trong eOffice) - 2026-11-24.
// Tai lieu nguon: "API Cua so thong tin - danh cho app ngoai (ETX87)".
// Worker lam trung gian: giu ma khoa o secret CUA_SO_KHOA (khong lot vao ban build frontend), dem 60 giay
// trong bo nho isolate, tai luon tranh SVG (CSP connect-src cua frontend khong cho goi thang ra ngoai).
// LUAT CUNG: loi / cham / chua dat khoa -> tra "khong co cua so", KHONG BAO GIO chan nguoi dung.
// File nay giong het o moi app trong he DVBH (dat LK, doi tra, ong tho, vi pham, tiep nhan, mua hang, CCDC) -
// sua 1 cho thi chep sang cac app con lai.

const CS_URL = "https://asia-southeast1-etx-nhan-su.cloudfunctions.net/csApi";
const HET_GIO_MS = 3000; // API; tranh SVG chi cho 1,5 giay -> tong < 5 giay cua trinh duyet
const HET_GIO_SVG_MS = 1500;
const SVG_TOI_DA = 200_000;

type KetQua = { coCuaSo: boolean; cuaSo: Record<string, unknown> | null; kiemLaiSauGiay: number; tranhSvg?: string | null };

const RONG: KetQua = { coCuaSo: false, cuaSo: null, kiemLaiSauGiay: 60 };

let dem: { luc: number; giay: number; kq: KetQua } | null = null;
const demSvg = new Map<string, string | null>();

async function fetchHetGio(url: string, init: RequestInit = {}, ms = HET_GIO_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function taiSvg(url: unknown): Promise<string | null> {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return null;
  if (demSvg.has(url)) return demSvg.get(url) ?? null;
  let svg: string | null = null;
  try {
    const r = await fetchHetGio(url, {}, HET_GIO_SVG_MS);
    if (r.ok) {
      const txt = await r.text();
      const dau = txt.trimStart().slice(0, 200).toLowerCase();
      if (txt.length <= SVG_TOI_DA && (dau.startsWith("<svg") || (dau.startsWith("<?xml") && dau.includes("<svg")))) svg = txt;
    }
  } catch {
    svg = null;
  }
  if (demSvg.size > 50) demSvg.clear();
  if (svg) demSvg.set(url, svg); // loi thi khong nho, lan sau thu lai
  return svg;
}

export async function layCuaSoThongTin(khoa: string | undefined): Promise<KetQua> {
  if (!khoa) return RONG;
  const now = Date.now();
  if (dem && now - dem.luc < dem.giay * 1000) return dem.kq;
  let kq: KetQua = RONG;
  try {
    const r = await fetchHetGio(CS_URL, { headers: { "X-Cua-So-Khoa": khoa } });
    if (r.ok) {
      const j = (await r.json()) as KetQua;
      const giay = Math.max(30, Math.min(3600, Number(j?.kiemLaiSauGiay) || 60));
      if (j?.coCuaSo && j.cuaSo && typeof j.cuaSo === "object") {
        kq = { coCuaSo: true, cuaSo: j.cuaSo, kiemLaiSauGiay: giay, tranhSvg: await taiSvg(j.cuaSo.tranhSvgUrl) };
      } else {
        kq = { ...RONG, kiemLaiSauGiay: giay };
      }
    }
  } catch {
    kq = RONG;
  }
  dem = { luc: now, giay: kq.kiemLaiSauGiay, kq };
  return kq;
}
