import type { Env, AppUser } from "../types";
import { nowVN } from "./vnTime";
import { eventStmt } from "./audit";
import { bumpVersions } from "./dataVersions";
import { canEditPlan } from "./eoAccess";
import { layDongTheoDoi, type DongTheoDoi } from "./theoDoi";

/**
 * Goi y "Ngay nha may cam ket" tu mail KRF (app theodoimuahang day ve tl_mail qua /api/partner/mail-events, moi dong 1 ban ghi:
 * payload.dong = { ngay_dap_ung, dap_ung, note, ton_kho, ... } doc tu file / bang KRF tra loi - cot "KRF đáp ứng").
 * KHONG tu ghi: nguoi dung chon dong + bam ap dung (ngay KRF anh huong R1/R4, so lan lui, cap CEO).
 */
export interface MailKrf {
  tl_mail_id: number;
  eo_item_id: number;
  ngay: string | null; // ngay KRF dap ung doc duoc (YYYY-MM-DD) - null = KRF ghi chu (CCTT, "chờ mua hàng phản hồi"...)
  dap_ung: string; // gia tri goc o "KRF đáp ứng"
  note: string;
  ton_kho: number | null;
  thoi_gian: string | null;
  tu: string | null;
  tieu_de: string | null;
  gmail_link: string | null;
}

/** Thu KRF (NHAN) MOI NHAT cua tung dong co du lieu dong tu theodoimuahang. */
export async function mailKrfMoiNhat(env: Env, itemIds: number[]): Promise<Map<number, MailKrf>> {
  const out = new Map<number, MailKrf>();
  if (!itemIds.length) return out;
  const rs = await env.DB.prepare(
    `SELECT m.id, m.eo_item_id, m.thoi_gian, m.tu, m.tieu_de,
            json_extract(m.payload, '$.dong.ngay_dap_ung') AS ngay, json_extract(m.payload, '$.dong.dap_ung') AS dap_ung,
            json_extract(m.payload, '$.dong.note') AS note, json_extract(m.payload, '$.dong.ton_kho') AS ton_kho,
            json_extract(m.payload, '$.gmail_link') AS gmail_link
     FROM tl_mail m
     WHERE m.huong = 'NHAN' AND m.eo_item_id IN (SELECT value FROM json_each(?1))
       AND json_extract(m.payload, '$.nguon') = 'theodoimuahang' AND json_extract(m.payload, '$.dong') IS NOT NULL
     ORDER BY m.thoi_gian, m.id`,
  ).bind(JSON.stringify(itemIds)).all<any>();
  for (const r of rs.results) {
    out.set(r.eo_item_id, {
      tl_mail_id: r.id, eo_item_id: r.eo_item_id, ngay: /^\d{4}-\d{2}-\d{2}$/.test(String(r.ngay ?? "")) ? r.ngay : null,
      dap_ung: String(r.dap_ung ?? ""), note: String(r.note ?? ""), ton_kho: typeof r.ton_kho === "number" ? r.ton_kho : null,
      thoi_gian: r.thoi_gian, tu: r.tu, tieu_de: r.tieu_de, gmail_link: r.gmail_link ?? null,
    });
  }
  return out;
}

interface PlanLive { id: number; planned_date: string; planned_qty: number; factory_committed_date: string | null; ghi_chu: string | null; loai: string }

export type CachApDung = "THEM_DOT" | "SUA_DOT" | "SUA_TAY";

/** Cach ap dung ngay KRF cho 1 dong: chua co dot -> them dot; dung 1 dot ngay -> sua dot; nhieu dot / ke hoach tuan -> sua tay. */
function cachApDung(plans: PlanLive[]): CachApDung {
  if (!plans.length) return "THEM_DOT";
  if (plans.length === 1 && plans[0].loai !== "TUAN") return "SUA_DOT";
  return "SUA_TAY";
}

async function planSong(env: Env, itemIds: number[]): Promise<Map<number, PlanLive[]>> {
  const out = new Map<number, PlanLive[]>();
  if (!itemIds.length) return out;
  const rs = await env.DB.prepare(
    `SELECT id, eo_item_id, planned_date, planned_qty, factory_committed_date, ghi_chu, loai FROM item_plan
     WHERE deleted_at IS NULL AND eo_item_id IN (SELECT value FROM json_each(?)) ORDER BY planned_date, id`,
  ).bind(JSON.stringify(itemIds)).all<PlanLive & { eo_item_id: number }>();
  for (const p of rs.results) out.set(p.eo_item_id, [...(out.get(p.eo_item_id) ?? []), p]);
  return out;
}

export interface GoiYKrf extends DongTheoDoi {
  krf: MailKrf;
  cach: CachApDung;
  so_dot: number;
}

/** Dong DANG MO co ngay KRF moi nhat KHAC ngay nha may cam ket hien tai (hoac chua co) -> danh sach goi y. */
export async function layGoiYKrf(env: Env): Promise<{ goi_y: GoiYKrf[]; khop: number; chi_ghi_chu: number }> {
  const dong = await layDongTheoDoi(env, "dang_mo");
  const mail = await mailKrfMoiNhat(env, dong.map((d) => d.item_id));
  const co = dong.filter((d) => mail.has(d.item_id));
  const plans = await planSong(env, co.map((d) => d.item_id));
  const goiY: GoiYKrf[] = [];
  let khop = 0;
  let chiGhiChu = 0;
  for (const d of co) {
    const m = mail.get(d.item_id)!;
    if (!m.ngay) { chiGhiChu++; continue; }
    if (m.ngay === d.ngay_nm_cam_ket) { khop++; continue; }
    const ps = plans.get(d.item_id) ?? [];
    goiY.push({ ...d, krf: m, cach: cachApDung(ps), so_dot: ps.length });
  }
  goiY.sort((a, b) => String(b.krf.thoi_gian).localeCompare(String(a.krf.thoi_gian)));
  return { goi_y: goiY, khop, chi_ghi_chu: chiGhiChu };
}

const ddmm = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");

/**
 * Ap dung ngay KRF da chon. Moi dong: kiem tra quyen (canEditPlan nhu sua ke hoach tay), lay lai mail KRF moi nhat (khong tin ngay
 * tu client), them / sua dot ke hoach + ghi event_log (ADD_PLAN / UPDATE_PLAN, metadata.nguon = 'mail_krf') - dem lui ngay nhu sua tay.
 */
export async function apDungKrf(env: Env, u: AppUser, itemIds: number[]) {
  const ids = [...new Set(itemIds.map(Number).filter((x) => x > 0))].slice(0, 2000);
  const db = env.DB;
  const [mail, plans, meta] = await Promise.all([
    mailKrfMoiNhat(env, ids),
    planSong(env, ids),
    db.prepare(
      `SELECT i.id, i.eo_id, i.current_qty, e.created_by,
              (SELECT COALESCE(SUM(qty_in), 0) FROM amis_receipt a WHERE a.match_status = 'MATCHED_EO' AND a.matched_eo_item_id = i.id
                 AND a.voided_at IS NULL) AS da_ve
       FROM eo_item i JOIN eo e ON e.id = i.eo_id WHERE i.id IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify(ids)).all<{ id: number; eo_id: number; current_qty: number; created_by: string; da_ve: number }>(),
  ]);
  const metaBy = new Map(meta.results.map((m) => [m.id, m]));
  const now = nowVN();
  const kq = { them: 0, sua: 0, bo_qua: [] as { eo_item_id: number; ly_do: string }[] };
  const stmts: D1PreparedStatement[] = [];
  for (const id of ids) {
    const it = metaBy.get(id);
    const m = mail.get(id);
    const ps = plans.get(id) ?? [];
    const boQua = (ly_do: string) => kq.bo_qua.push({ eo_item_id: id, ly_do });
    if (!it) { boQua("ITEM_NOT_FOUND"); continue; }
    if (!canEditPlan(u, it)) { boQua("READ_ONLY"); continue; }
    if (!m?.ngay) { boQua("KHONG_CO_NGAY_KRF"); continue; }
    const ghiChu = `Theo mail KRF ${ddmm(m.thoi_gian)}: đáp ứng ${ddmm(m.ngay)}${m.note ? ` (${m.note.slice(0, 120)})` : ""}`;
    const meta2 = { eo_item_id: id, nguon: "mail_krf", tl_mail_id: m.tl_mail_id };
    const cach = cachApDung(ps);
    if (cach === "SUA_TAY") { boQua("NHIEU_DOT"); continue; }
    if (cach === "THEM_DOT") {
      const qty = Math.max(0, it.current_qty - (it.da_ve || 0));
      if (!(qty > 0)) { boQua("DA_VE_DU"); continue; }
      const after = { eo_item_id: id, planned_date: m.ngay, planned_qty: qty, factory_committed_date: m.ngay, ghi_chu: ghiChu };
      stmts.push(
        db.prepare(
          `INSERT INTO item_plan (eo_item_id, planned_date, planned_qty, factory_committed_date, ghi_chu, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(id, m.ngay, qty, m.ngay, ghiChu, u.email, now),
        eventStmt(db, { entity_type: "eo_item", entity_id: id, eo_id: it.eo_id, event_type: "ADD_PLAN", user_email: u.email, at: now, after, metadata: meta2 }),
      );
      kq.them++;
      continue;
    }
    const p = ps[0];
    if (p.factory_committed_date === m.ngay) { boQua("DA_KHOP"); continue; }
    // Ngay du kien di theo ngay KRF khi: chua co ngay NM / dang bang ngay NM cu (giong form "Ngay hang ve") / SOM HON ngay KRF
    // (khong the du kien ve truoc ngay NCC cam ket - vd dong qua ngay du kien, KRF bao ngay moi). Muon hon ngay KRF -> giu.
    const dk = !p.factory_committed_date || p.planned_date === p.factory_committed_date || p.planned_date < m.ngay ? m.ngay : p.planned_date;
    const after = { planned_date: dk, factory_committed_date: m.ngay, ghi_chu: ghiChu };
    stmts.push(
      db.prepare("UPDATE item_plan SET planned_date = ?, factory_committed_date = ?, ghi_chu = ?, updated_by = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(dk, m.ngay, ghiChu, u.email, now, p.id),
      eventStmt(db, {
        entity_type: "eo_item", entity_id: id, eo_id: it.eo_id, event_type: "UPDATE_PLAN", user_email: u.email, at: now,
        before: { planned_date: p.planned_date, planned_qty: p.planned_qty, factory_committed_date: p.factory_committed_date }, after,
        metadata: { ...meta2, plan_id: p.id },
      }),
    );
    kq.sua++;
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  if (stmts.length) await bumpVersions(db, ["eo", "theo_doi"]);
  return kq;
}
