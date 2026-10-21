import type { Env } from "../types";
import { computeTienDo01 } from "../routes/reports";
import { cachedReport } from "./reportCache";
import { versionTag } from "./dataVersions";
import { nowVN, todayVN } from "./vnTime";
import { sha256Hex } from "./sha";
import { layDongTheoDoi } from "./theoDoi";

/**
 * Day thong tin PO (moi dong eo_item) sang app DVBH: POST <DVBH>/api/partner/sync/po-dat-hang
 * (header X-API-Key, Service Binding `DVBH` - goi workers.dev <-> workers.dev cung account bang fetch
 * thuong de dinh loi 1042). DVBH upsert theo id_dat_lk, dung song song voi Google Sheet cu.
 *
 * KHONG cron (kien truc app nay): middleware index.ts goi maybeSyncDvbh() sau moi request /api/*;
 * chi chay khi version eo/amis/settings HOAC ngay VN doi so voi lan dong bo xong (canh bao, so ngay xu
 * ly doi theo ngay), cach lan chay truoc >= 20s, khong co lan khac dang chay. Moi lan chi gui dong co
 * hash payload khac lan gui thanh cong truoc (bang dvbh_sync_item). Loi -> giu version cu, request sau
 * thu lai.
 */
const PUSH_CHUNK = 1000;
const MIN_GAP_MS = 20_000;
const LOCK_MS = 120_000;
const APP_URL = "https://muahang.dichvu3t.workers.dev";

export function dvbhEnabled(env: Env): boolean {
  return !!env.DVBH_API_KEY && !!env.DVBH_BASE_URL;
}

const vnPlus = (ms: number) => new Date(Date.now() + 7 * 3600_000 + ms).toISOString().slice(0, 19).replace("T", " ");
const TRANG_THAI_DONG = ["Kết thúc", "Đơn trên EO bị hủy"];

/** Payload day du cho moi dong (thu tu field co dinh -> hash on dinh). */
export async function buildDvbhRows(env: Env) {
  const db = env.DB;
  const base = await cachedReport(db, "rep:tien-do-01", ["eo", "amis", "settings"], () => computeTienDo01(env));
  const plans = (await db.prepare(
    `SELECT eo_item_id, loai, tuan, planned_date, planned_qty, factory_committed_date, ghi_chu
     FROM item_plan WHERE deleted_at IS NULL ORDER BY eo_item_id, planned_date, id`,
  ).all<any>()).results;
  const receipts = (await db.prepare(
    `SELECT matched_eo_item_id, doc_no, doc_date, warehouse_name, qty_in
     FROM amis_receipt WHERE match_status = 'MATCHED_EO' AND matched_eo_item_id IS NOT NULL ORDER BY doc_date, id`,
  ).all<any>()).results;
  const planBy = new Map<number, any[]>();
  for (const p of plans) {
    const a = planBy.get(p.eo_item_id) ?? [];
    a.push({ loai: p.loai, ngay: p.planned_date, tuan: p.tuan, sl: p.planned_qty, ngay_nm_cam_ket: p.factory_committed_date, ghi_chu: p.ghi_chu });
    planBy.set(p.eo_item_id, a);
  }
  const recBy = new Map<number, any[]>();
  for (const r of receipts) {
    const a = recBy.get(r.matched_eo_item_id) ?? [];
    a.push({ so_ct: r.doc_no, ngay: r.doc_date, kho: r.warehouse_name, sl: r.qty_in });
    recBy.set(r.matched_eo_item_id, a);
  }
  // chi so "Theo doi linh kien dat" (lib/theoDoi.ts): tinh trang, han ngay du kien, so lan lui, so loi, ly do cap CEO
  const td = new Map((await layDongTheoDoi(env, "tat_ca")).map((t) => [t.item_id, t]));
  return base.map((r) => {
    const capNhat = [r.ngay_cap_nhat_dong, r.ngay_cap_nhat_so_luong].filter(Boolean).sort().pop() ?? r.ngay_tao;
    return {
      id_dat_lk: r.id_dat_lk,
      eo_item_id: r.item_id, eo_id: r.eo_id, eo_code: r.eo_code, ma_phe_duyet: r.ma_phe_duyet ?? null,
      link: `${APP_URL}/eo/${r.eo_id}`,
      trang_thai_eo: r.trang_thai_eo, nguoi_duyet_cuoi: r.nguoi_duyet_cuoi, ngay_ban_hanh: r.ngay_ban_hanh,
      loai_hinh: r.loai_hinh ?? null, ly_do_ps: r.ly_do_ps ?? null, phan_loai: r.phan_loai_thoi_diem_dat,
      id_crm: r.id_crm || null, id_dat_hang: r.id_dat_hang || null, ghi_chu: r.ghi_chu || null,
      kho: r.kho, doi_tac: r.doi_tac ?? null, ma_lk: r.part_code, ma_lk_goc: r.part_code_goc ?? null, ten_lk: r.part_name ?? "",
      sl_dat: r.so_luong_dat, sl_nhap_amis: r.sl_nhap_amis_dung_eo, sl_doi_chieu_sai_thua: r.doi_chieu_sai_thua, sl_con_thieu: r.so_luong_con_thieu,
      trang_thai: r.trang_thai_don_hang, trang_thai_gon: TRANG_THAI_DONG.includes(r.trang_thai_don_hang) ? "Kết thúc" : "Đang xử lý",
      canh_bao: r.canh_bao || null, toc_do_hang_ve: r.toc_do_hang_ve || null, thoi_gian_xu_ly: r.thoi_gian_xu_ly_ngay,
      so_lan_doi_ngay: r.so_lan_doi_ngay_du_kien,
      ngay_du_kien_lan_dau: r.ngay_du_kien_lan_dau ?? null, ngay_du_kien_gan_nhat: r.ngay_du_kien_gan_nhat ?? null,
      ngay_ve_theo_eo: r.ngay_nhap_kho_amis_theo_eo ?? null, ngay_ve_dung_kho: r.ngay_nhap_kho_amis ?? null, ngay_ve_toan_quoc: r.ngay_nhap_toan_quoc_amis ?? null,
      ngay_tao: r.ngay_tao, ngay_cap_nhat: capNhat,
      ke_hoach: planBy.get(r.item_id) ?? [],
      phieu_nhap: recBy.get(r.item_id) ?? [],
      theo_doi: td.has(r.item_id) ? (() => {
        const t = td.get(r.item_id)!;
        return { ap_dung: t.ap_dung, tinh_trang: t.tinh_trang, han_ngay_du_kien: t.han_ngay_du_kien, han_cap_nhat_lai: t.han_cap_nhat_lai,
          so_lan_lui: t.so_lan_lui, so_loi: t.so_loi, so_loi_cho_giai_trinh: t.so_loi_cho_gt, cap_ceo: t.ceo_ly_do.length > 0, ceo_ly_do: t.ceo_ly_do };
      })() : null,
    };
  });
}

async function postChunk(env: Env, rows: unknown[], cheDo: "delta" | "full") {
  const url = `${env.DVBH_BASE_URL!.replace(/\/$/, "")}/api/partner/sync/po-dat-hang`;
  const req = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": env.DVBH_API_KEY! },
    body: JSON.stringify({ nguon: "muahang", che_do: cheDo, thoi_diem: nowVN(), rows }),
  });
  const res = env.DVBH ? await env.DVBH.fetch(req) : await fetch(req);
  if (!res.ok) throw new Error(`DVBH ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { upserted?: number; changed?: number };
}

/** Gui cac dong thay doi (full = gui het, bo qua hash). Tra ve so dong da gui. */
export async function pushDvbh(env: Env, full = false): Promise<{ pushed: number; total: number }> {
  const db = env.DB;
  const rows = await buildDvbhRows(env);
  const known = new Map<string, string>();
  if (!full) {
    const rs = await db.prepare("SELECT id_dat_lk, row_hash FROM dvbh_sync_item").all<{ id_dat_lk: string; row_hash: string }>();
    for (const r of rs.results) known.set(r.id_dat_lk, r.row_hash);
  }
  const changed: { row: any; hash: string }[] = [];
  for (const row of rows) {
    const hash = await sha256Hex(JSON.stringify(row));
    if (full || known.get(row.id_dat_lk) !== hash) changed.push({ row, hash });
  }
  for (let i = 0; i < changed.length; i += PUSH_CHUNK) {
    const chunk = changed.slice(i, i + PUSH_CHUNK);
    await postChunk(env, chunk.map((x) => x.row), full ? "full" : "delta");
    const now = nowVN();
    // ghi hash sau khi DVBH nhan thanh cong (json_each - tranh gioi han 100 bien/statement)
    for (let j = 0; j < chunk.length; j += 400) {
      await db.prepare(
        `INSERT INTO dvbh_sync_item (id_dat_lk, row_hash, pushed_at)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), ? FROM json_each(?) WHERE 1
         ON CONFLICT(id_dat_lk) DO UPDATE SET row_hash = excluded.row_hash, pushed_at = excluded.pushed_at`,
      ).bind(now, JSON.stringify(chunk.slice(j, j + 400).map((x) => [x.row.id_dat_lk, x.hash]))).run();
    }
  }
  return { pushed: changed.length, total: rows.length };
}

/** Goi sau moi request (waitUntil). force = bo qua kiem tra version / khoang cach (nut Admin). */
export async function maybeSyncDvbh(env: Env, opts: { force?: boolean; full?: boolean } = {}): Promise<{ ran: boolean; pushed?: number; total?: number; error?: string }> {
  if (!dvbhEnabled(env)) return { ran: false, error: "NOT_CONFIGURED" };
  const db = env.DB;
  const tag = await versionTag(db, ["eo", "amis", "settings", "theo_doi"]);
  const today = todayVN();
  const st = await db.prepare("SELECT version_tag, ngay FROM dvbh_sync_state WHERE id = 1").first<{ version_tag: string | null; ngay: string | null }>();
  if (!opts.force && st && st.version_tag === tag && st.ngay === today) return { ran: false };

  const now = nowVN();
  const claim = await db.prepare(
    `UPDATE dvbh_sync_state SET running_until = ?
     WHERE id = 1 AND (running_until IS NULL OR running_until < ?) AND (? = 1 OR last_run_at IS NULL OR last_run_at < ?)`,
  ).bind(vnPlus(LOCK_MS), now, opts.force ? 1 : 0, vnPlus(-MIN_GAP_MS)).run();
  if (!claim.meta.changes) return { ran: false };

  try {
    const r = await pushDvbh(env, !!opts.full);
    await db.prepare(
      `UPDATE dvbh_sync_state SET version_tag = ?, ngay = ?, last_ok_at = ?, last_error = NULL, last_pushed = ?,
         last_full_at = CASE WHEN ? = 1 THEN ? ELSE last_full_at END, running_until = NULL, last_run_at = ? WHERE id = 1`,
    ).bind(tag, today, nowVN(), r.pushed, opts.full ? 1 : 0, nowVN(), nowVN()).run();
    return { ran: true, ...r };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dvbh sync", msg);
    await db.prepare("UPDATE dvbh_sync_state SET last_error = ?, running_until = NULL, last_run_at = ? WHERE id = 1")
      .bind(msg.slice(0, 500), nowVN()).run();
    return { ran: true, error: msg };
  }
}
