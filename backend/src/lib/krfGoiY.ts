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
  ma_po: string; // ma 3TDO / ma LK doc trong mail (de kiem tra khop chac truoc khi TU DONG dien)
  ma_lk: string;
}

/** Thu KRF (NHAN) MOI NHAT cua tung dong co du lieu dong tu theodoimuahang. */
export async function mailKrfMoiNhat(env: Env, itemIds: number[]): Promise<Map<number, MailKrf>> {
  const out = new Map<number, MailKrf>();
  if (!itemIds.length) return out;
  const rs = await env.DB.prepare(
    `SELECT m.id, m.eo_item_id, m.thoi_gian, m.tu, m.tieu_de,
            json_extract(m.payload, '$.dong.ngay_dap_ung') AS ngay, json_extract(m.payload, '$.dong.dap_ung') AS dap_ung,
            json_extract(m.payload, '$.dong.note') AS note, json_extract(m.payload, '$.dong.ton_kho') AS ton_kho,
            json_extract(m.payload, '$.gmail_link') AS gmail_link,
            json_extract(m.payload, '$.dong.ma_po') AS ma_po, json_extract(m.payload, '$.dong.ma_lk') AS ma_lk
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
      ma_po: String(r.ma_po ?? ""), ma_lk: String(r.ma_lk ?? ""),
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


interface NguoiApDung {
  email: string; // created_by / updated_by cua item_plan (FK users -> bat buoc email co that)
  eventEmail: string | null; // event_log.user_email (NULL = He thong)
  coQuyen: (it: { created_by: string }) => boolean;
  nguon: "mail_krf" | "mail_krf_tu_dong";
  tienTo: string; // dau ghi chu dot: "Theo mail KRF" / "Tự động theo mail KRF"
}

/**
 * Ap dung ngay KRF cho cac dong. Moi dong: kiem tra quyen, lay lai mail KRF moi nhat (khong tin ngay tu client), them / sua dot ke
 * hoach + ghi event_log (ADD_PLAN / UPDATE_PLAN, metadata.nguon) - dem lui ngay nhu sua tay.
 */
async function apDung(env: Env, ai: NguoiApDung, itemIds: number[]) {
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
    if (!ai.coQuyen(it)) { boQua("READ_ONLY"); continue; }
    if (!m?.ngay) { boQua("KHONG_CO_NGAY_KRF"); continue; }
    if ((it.da_ve || 0) >= it.current_qty) { boQua("DA_VE_DU"); continue; }
    const ghiChu = `${ai.tienTo} ${ddmm(m.thoi_gian)}: đáp ứng ${ddmm(m.ngay)}${m.note ? ` (${m.note.slice(0, 120)})` : ""}`;
    const meta2 = { eo_item_id: id, nguon: ai.nguon, tl_mail_id: m.tl_mail_id };
    const cach = cachApDung(ps);
    if (cach === "SUA_TAY") { boQua("NHIEU_DOT"); continue; }
    if (cach === "THEM_DOT") {
      const qty = it.current_qty - (it.da_ve || 0);
      const after = { eo_item_id: id, planned_date: m.ngay, planned_qty: qty, factory_committed_date: m.ngay, ghi_chu: ghiChu };
      stmts.push(
        db.prepare(
          `INSERT INTO item_plan (eo_item_id, planned_date, planned_qty, factory_committed_date, ghi_chu, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(id, m.ngay, qty, m.ngay, ghiChu, ai.email, now),
        eventStmt(db, { entity_type: "eo_item", entity_id: id, eo_id: it.eo_id, event_type: "ADD_PLAN", user_email: ai.eventEmail, at: now, after, metadata: meta2 }),
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
        .bind(dk, m.ngay, ghiChu, ai.email, now, p.id),
      eventStmt(db, {
        entity_type: "eo_item", entity_id: id, eo_id: it.eo_id, event_type: "UPDATE_PLAN", user_email: ai.eventEmail, at: now,
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

/** Nguoi dung chon dong o man "Ngày KRF từ mail" roi bam ap dung - quyen nhu sua ke hoach tay (canEditPlan). */
export function apDungKrf(env: Env, u: AppUser, itemIds: number[]) {
  return apDung(env, { email: u.email, eventEmail: u.email, coQuyen: (it) => canEditPlan(u, it), nguon: "mail_krf", tienTo: "Theo mail KRF" }, itemIds);
}

/**
 * TU DONG dien ngay KRF khi nhan mail-events (routes/partner.ts) - chi dong KHOP CHAC:
 *  - ma 3TDO + ma LK trong mail = approval_code + part_code / part_code_goc cua dong EO (app theodoimuahang da gan eo_item_id, kiem lai);
 *  - trong EO chi DUNG 1 dong dang hieu luc mang ma LK do (2 dong cung ma khac kho -> khong chac -> de goi y bam tay);
 *  - dong chua ve du, co 0 hoac 1 dot ke hoach ngay (nhieu dot -> khong biet dot nao -> goi y).
 * Nguoi ghi = BOOTSTRAP_ADMIN_EMAIL (item_plan.created_by bat buoc la user co that), event_log.user_email = NULL (He thong),
 * metadata.nguon = 'mail_krf_tu_dong'. Dong con lai van hien o "Ngày KRF từ mail".
 */
export async function tuDongDienKrf(env: Env, itemIds: number[]) {
  const ids = [...new Set(itemIds)];
  if (!ids.length || !env.BOOTSTRAP_ADMIN_EMAIL) return { them: 0, sua: 0, bo_qua: [] as { eo_item_id: number; ly_do: string }[] };
  const [mail, info] = await Promise.all([
    mailKrfMoiNhat(env, ids),
    env.DB.prepare(
      `SELECT i.id, e.approval_code, upper(i.part_code) AS ma, upper(COALESCE(i.part_code_goc, '')) AS ma_goc,
              (SELECT COUNT(*) FROM eo_item j WHERE j.eo_id = i.eo_id AND j.line_status = 'ACTIVE'
                 AND (upper(j.part_code) = upper(i.part_code) OR upper(COALESCE(j.part_code_goc, '')) = upper(i.part_code))) AS cung_ma
       FROM eo_item i JOIN eo e ON e.id = i.eo_id
       WHERE i.id IN (SELECT value FROM json_each(?)) AND i.line_status = 'ACTIVE' AND e.trang_thai = 'ISSUED'`,
    ).bind(JSON.stringify(ids)).all<{ id: number; approval_code: string | null; ma: string; ma_goc: string; cung_ma: number }>(),
  ]);
  const chac = info.results.filter((r) => {
    const m = mail.get(r.id);
    const lk = (m?.ma_lk ?? "").trim().toUpperCase();
    return !!m?.ngay && !!r.approval_code && m.ma_po === r.approval_code && !!lk && (lk === r.ma || lk === r.ma_goc) && r.cung_ma === 1;
  }).map((r) => r.id);
  if (!chac.length) return { them: 0, sua: 0, bo_qua: [] as { eo_item_id: number; ly_do: string }[] };
  return apDung(env, {
    email: env.BOOTSTRAP_ADMIN_EMAIL, eventEmail: null, coQuyen: () => true, nguon: "mail_krf_tu_dong", tienTo: "Tự động theo mail KRF",
  }, chac);
}
