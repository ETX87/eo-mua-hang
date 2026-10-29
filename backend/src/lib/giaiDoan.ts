import type { Env } from "../types";
import { computeTienDo01 } from "../routes/reports";
import { cachedReport } from "./reportCache";
import { congGioLamViec } from "./theoDoi";
import { nowVN } from "./vnTime";

/**
 * 8 GIAI DOAN cua 1 dong don hang (chot 2026-10-29) - chi DO + BAO CAO dung/tre han (chua sinh loi giai trinh).
 *  G1 Lap & trinh EO      Nguoi tao         tao dong -> lan gui trinh dau tien sau khi tao
 *  G2 Tham dinh           Nguoi tham dinh   gui trinh (lan duoc duyet) -> tham dinh xong (khong co tham dinh = 0)
 *  G3 Duyet cuoi & BH     Nguoi duyet cuoi  tham dinh xong -> ban hanh. Dong them sau BH: tao dong -> duoc duyet
 *  G4 Gui don cho NCC     NV dat hang       ban hanh -> mail GUI dau tien (CC theodoimuahang@gmail.com, bang tl_mail)
 *                                           - LUONG SONG SONG: khong chan giai doan hien tai (app mail chua dong bo thi chua co)
 *  G5 Co ngay du kien     NV dat hang       ban hanh -> lan nhap ke hoach dau tien (= quy tac R1)
 *  G6 Cho san xuat & giao NCC               co ngay du kien -> hang ve lan dau (ngay chung tu AMIS). Dung hen = ve <= ngay DK lan dau
 *  G7 Nhap kho & len he thong Kho/Ke toan   ngay chung tu AMIS -> phieu duoc import vao app (chi do, khong bao gio "dang o")
 *  G8 Giao bu den du      NCC + NV theo doi hang ve lan dau -> ve du (luy ke >= SL dat)
 * Thoi gian & han tinh theo GIO LAM VIEC (bo Chu nhat) nhu R1. Han cau hinh app_settings 'giai_doan_sla' (JSON gio).
 * Moc ranh gioi cache theo version (eo, amis, settings, theo_doi); phan phu thuoc "bay gio" tinh luc request.
 */
export const GIAI_DOAN = [
  { k: "G1", l: "Lập & trình EO", vai_tro: "Người tạo EO" },
  { k: "G2", l: "Thẩm định", vai_tro: "Người thẩm định" },
  { k: "G3", l: "Duyệt cuối & ban hành", vai_tro: "Người duyệt cuối" },
  { k: "G4", l: "Gửi đơn cho NCC (mail)", vai_tro: "NV đặt hàng" },
  { k: "G5", l: "Có ngày dự kiến", vai_tro: "NV đặt hàng" },
  { k: "G6", l: "Chờ sản xuất & giao", vai_tro: "Nhà cung cấp" },
  { k: "G7", l: "Nhập kho & lên hệ thống", vai_tro: "Kho / Kế toán" },
  { k: "G8", l: "Giao bù đến đủ", vai_tro: "NCC + NV theo dõi" },
] as const;
export type MaGd = (typeof GIAI_DOAN)[number]["k"];
export const SLA_MAC_DINH: Record<string, number> = { G1: 24, G2: 24, G3: 24, G4: 24, G5: 24, G7: 24, G8: 168 }; // G6: theo ngay du kien

export interface MocGd { bd: string | null; kt: string | null; han: string | null }
export interface GdDong { item_id: number; gd: Record<string, MocGd>; so_lan_trinh: number; so_lan_tra_ve: number; ket_thuc: "XONG" | "HUY" | null }

const parse = (s: string) => Date.parse(s.slice(0, 19).replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z"));
const lon = (a?: string | null, b?: string | null) => (!a ? b ?? null : !b ? a : a > b ? a : b);

/** So gio LAM VIEC (bo Chu nhat) giua 2 moc gio VN. */
export function gioLamViec(a: string, b: string): number {
  let t = parse(a);
  const het = parse(b);
  if (!(het > t)) return 0;
  let ms = 0;
  while (t < het) {
    const d = new Date(t);
    const nuaDem = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const buoc = Math.min(nuaDem, het) - t;
    if (d.getUTCDay() !== 0) ms += buoc;
    t += buoc;
  }
  return Math.round((ms / 3600_000) * 10) / 10;
}

async function docSla(env: Env): Promise<Record<string, number>> {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'giai_doan_sla'").first<{ value: string }>();
  try { return { ...SLA_MAC_DINH, ...(r?.value ? JSON.parse(r.value) : {}) }; } catch { return { ...SLA_MAC_DINH }; }
}

/** Moc ranh gioi tung giai doan cho MOI dong (cache). */
async function tinhMoc(env: Env): Promise<{ sla: Record<string, number>; dong: GdDong[] }> {
  const db = env.DB;
  const sla = await docSla(env);
  const base = await cachedReport(db, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(env));
  const [subs, revs, items, firstPlan, mail, nhap] = await Promise.all([
    db.prepare("SELECT eo_id, id, status, submitted_at, skip_review FROM eo_submission ORDER BY eo_id, version").all<any>(),
    // tham dinh xong cua tung lan trinh = lan action cuoi cung cua buoc REVIEW (APPROVED / SKIPPED)
    db.prepare("SELECT submission_id, MAX(action_at) t, COUNT(*) n FROM eo_approval WHERE step_type = 'REVIEW' AND status IN ('APPROVED','SKIPPED') GROUP BY submission_id").all<any>(),
    db.prepare("SELECT id, created_at, created_after_issue, post_issue_approved_at, line_status FROM eo_item").all<any>(),
    db.prepare("SELECT eo_item_id, MIN(created_at) t FROM item_plan GROUP BY eo_item_id").all<any>(),
    db.prepare(
      `SELECT x.item_id, MIN(m.thoi_gian) t FROM (
         SELECT id m_id, eo_item_id item_id FROM tl_mail WHERE huong = 'GUI' AND eo_item_id IS NOT NULL
         UNION
         SELECT m.id, pi.eo_item_id FROM tl_mail m JOIN tl_push p ON p.ma_push = m.ma_push JOIN tl_push_item pi ON pi.push_id = p.id WHERE m.huong = 'GUI'
       ) x JOIN tl_mail m ON m.id = x.m_id GROUP BY x.item_id`,
    ).all<any>(),
    db.prepare(
      `SELECT matched_eo_item_id id, doc_date d, qty_in q, created_at c FROM amis_receipt
       WHERE match_status = 'MATCHED_EO' AND matched_eo_item_id IS NOT NULL AND voided_at IS NULL ORDER BY doc_date, id`,
    ).all<any>(),
  ]);
  const subsBy = new Map<number, any[]>();
  for (const s of subs.results) subsBy.set(s.eo_id, [...(subsBy.get(s.eo_id) ?? []), s]);
  const revBy = new Map(revs.results.map((r: any) => [r.submission_id, r]));
  const itemBy = new Map(items.results.map((r: any) => [r.id, r]));
  const planBy = new Map(firstPlan.results.map((r: any) => [r.eo_item_id, r.t as string]));
  const mailBy = new Map(mail.results.map((r: any) => [r.item_id, r.t as string]));
  const nhapBy = new Map<number, any[]>();
  for (const r of nhap.results) nhapBy.set(r.id, [...(nhapBy.get(r.id) ?? []), r]);

  const dong: GdDong[] = base.map((r: any) => {
    const it = itemBy.get(r.item_id) ?? {};
    const tao: string = it.created_at ?? r.ngay_tao;
    const ss = subsBy.get(r.eo_id) ?? [];
    const sauBh = it.created_after_issue === 1;
    const gd: Record<string, MocGd> = {};
    const dat = (k: string, bd: string | null, kt: string | null, han?: string | null) => {
      gd[k] = { bd, kt: bd && kt ? lon(kt, bd) : kt, han: han === undefined ? (bd && sla[k] != null ? congGioLamViec(bd, sla[k]) : null) : han };
    };
    let t0: string | null; // moc bat dau sau duyet (ban hanh / dong sau BH duoc duyet)
    if (sauBh) {
      dat("G1", null, null); dat("G2", null, null);
      dat("G3", tao, it.post_issue_approved_at ?? null);
      t0 = it.post_issue_approved_at ?? null;
    } else {
      const sDau = ss.find((s) => s.submitted_at >= tao.slice(0, 19)) ?? null;
      dat("G1", tao, sDau?.submitted_at ?? null);
      // G2 tinh tu lan trinh DAU (lan bi tra ve & trinh lai nam trong G2) -> tham dinh xong cua lan duoc duyet;
      // EO da qua buoc tham dinh (cho duyet cuoi / ban hanh) ma khong co tham dinh -> G2 = 0.
      const sDuyet = ss.find((s) => s.status === "APPROVED") ?? ss[ss.length - 1] ?? null;
      const bdG2 = sDau?.submitted_at ?? null;
      const quaThamDinh = ["WAITING_FINAL_APPROVAL", "ISSUED"].includes(r.trang_thai_eo);
      const rv = sDuyet ? revBy.get(sDuyet.id) : null;
      dat("G2", bdG2, bdG2 && quaThamDinh ? (rv?.t ?? sDuyet?.submitted_at ?? bdG2) : null);
      dat("G3", gd.G2.kt, r.ngay_ban_hanh ?? null);
      t0 = r.ngay_ban_hanh ?? null;
    }
    const ve = nhapBy.get(r.item_id) ?? [];
    const veDau = ve[0] ?? null;
    let luy = 0, veDu: string | null = null;
    for (const x of ve) { luy += x.q || 0; if (!veDu && r.so_luong_dat > 0 && luy >= r.so_luong_dat) veDu = x.d; }
    dat("G4", t0, t0 ? mailBy.get(r.item_id) ?? null : null);
    const kh = t0 ? planBy.get(r.item_id) ?? null : null;
    dat("G5", t0, kh);
    const bdG6 = gd.G5.kt;
    dat("G6", bdG6, bdG6 && veDau ? veDau.d : null, r.ngay_du_kien_lan_dau ? `${String(r.ngay_du_kien_lan_dau).slice(0, 10)} 23:59:59` : null);
    dat("G7", veDau ? veDau.d : null, veDau ? veDau.c : null, veDau ? congGioLamViec(`${veDau.d} 23:59:59`, sla.G7) : null);
    dat("G8", veDau ? veDau.d : null, veDu);
    const huy = r.trang_thai_don_hang === "Đơn trên EO bị hủy" || it.line_status === "CANCELLED_LINE";
    return {
      item_id: r.item_id, gd,
      so_lan_trinh: ss.length, so_lan_tra_ve: ss.filter((s) => ["REQUEST_UPDATE", "REJECTED", "CANCELLED", "SUPERSEDED"].includes(s.status)).length,
      ket_thuc: huy ? "HUY" : r.trang_thai_don_hang === "Kết thúc" ? "XONG" : null,
    };
  });
  return { sla, dong };
}

/** Moc + chi so "bay gio": giai doan hien tai, gio da qua tung giai doan, tre han. */
export interface GdKetQua {
  gd_hien_tai: string; gd_hien_tai_ten: string; gd_bat_dau: string | null; gd_gio: number | null; gd_tre: boolean | null;
  g4_trang_thai: "DA_GUI" | "CHUA_GHI_NHAN" | "TRE" | null;
  so_lan_trinh: number; so_lan_tra_ve: number;
  gio: Record<string, number | null>; tre: Record<string, boolean | null>; moc: Record<string, MocGd>;
}
const THU_TU = ["G1", "G2", "G3", "G5", "G6", "G8"]; // G4 song song, G7 chi do

export async function layGiaiDoan(env: Env): Promise<{ sla: Record<string, number>; map: Map<number, GdKetQua> }> {
  const { sla, dong } = await cachedReport(env.DB, "rep:giai-doan", ["eo", "amis", "settings", "theo_doi"], () => tinhMoc(env));
  const now = nowVN();
  const map = new Map<number, GdKetQua>();
  for (const x of dong) {
    const gio: Record<string, number | null> = {}, tre: Record<string, boolean | null> = {};
    for (const [k, m] of Object.entries(x.gd)) {
      gio[k] = m.bd ? gioLamViec(m.bd, m.kt ?? now) : null;
      const moc = m.kt ?? (x.ket_thuc ? null : now);
      tre[k] = m.bd && m.han && moc ? moc > m.han : null;
    }
    // giai doan hien tai = giai doan dau tien (theo thu tu chinh) da bat dau ma chua ket thuc
    const cur = x.ket_thuc === "HUY" ? "HUY" : x.ket_thuc === "XONG" ? "XONG" : THU_TU.find((k) => x.gd[k]?.bd && !x.gd[k]?.kt) ?? "G1";
    const g4 = x.gd.G4;
    const ten = cur === "XONG" ? "Hoàn tất (về đủ)" : cur === "HUY" ? "Đã hủy" : GIAI_DOAN.find((g) => g.k === cur)!.l;
    map.set(x.item_id, {
      gd_hien_tai: cur, gd_hien_tai_ten: ten, gd_bat_dau: x.gd[cur]?.bd ?? null,
      gd_gio: x.gd[cur]?.bd ? gio[cur] : null, gd_tre: x.gd[cur] ? tre[cur] : null,
      g4_trang_thai: !g4?.bd ? null : g4.kt ? "DA_GUI" : tre.G4 ? "TRE" : "CHUA_GHI_NHAN",
      so_lan_trinh: x.so_lan_trinh, so_lan_tra_ve: x.so_lan_tra_ve, gio, tre, moc: x.gd,
    });
  }
  return { sla, map };
}
