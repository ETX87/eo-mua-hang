import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { bumpVersions } from "./dataVersions";

// Dong bo danh ba "ETX nhan su" (PULL 1 chieu, chi bam tay - he nay khong cron). Port tu
// ../linh-kien-app (lib/etxNhanSuClient.ts + lib/etxNhanSuSync.ts). Lien ket users <-> nhan su theo
// Gmail hieu luc = gmail_gan_tay (Admin) neu co, nguoc lai gmail tu ETX; gmail_gan_tay = '' nghia la
// Admin chu dong bo lien ket. Chi dong bo HO TEN + CHUC DANH; vai tro quyen (users.vai_tro) van gan tay.

interface EtxItem {
  maNhanSu: string;
  hoTen: string;
  chucDanh: string | null;
  gmail: string | null;
  trangThaiLamViec: "on" | "off";
}

interface EtxPage {
  soTrang: number;
  nhanSu: EtxItem[];
}

const PAGE_SIZE = 1000;
const CHUNK = 400;

/** SQL bieu thuc Gmail hieu luc cua 1 dong etx_nhan_su (alias e). */
export const EFFECTIVE_GMAIL_SQL =
  "LOWER(TRIM(CASE WHEN e.gmail_gan_tay IS NOT NULL THEN NULLIF(e.gmail_gan_tay, '') ELSE e.gmail END))";

// trangThai=all de bat ca nguoi da nghi (phat hien chuyen on<->off). Gom het cac trang truoc khi ghi:
// 1 trang loi -> throw, khong ghi DB do dang.
async function fetchAll(env: Env): Promise<EtxItem[]> {
  if (!env.ETX_HR_BASE_URL || !env.ETX_HR_API_KEY) throw new Error("Chưa cấu hình ETX_HR_BASE_URL / ETX_HR_API_KEY");
  const base = env.ETX_HR_BASE_URL.replace(/\/$/, "");
  const items: EtxItem[] = [];
  let trang = 1;
  let soTrang = 1;
  do {
    const res = await fetch(`${base}/hrApi?trangThai=all&co=${PAGE_SIZE}&trang=${trang}`, {
      headers: { Authorization: `Bearer ${env.ETX_HR_API_KEY}` },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ETX trả lỗi ${res.status} (trang ${trang}): ${text.slice(0, 200)}`);
    }
    const body = (await res.json()) as EtxPage;
    items.push(...body.nhanSu);
    soTrang = body.soTrang;
    trang++;
  } while (trang <= soTrang);
  return items;
}

async function runChunks(db: D1Database, stmts: D1PreparedStatement[]) {
  for (let i = 0; i < stmts.length; i += CHUNK) await db.batch(stmts.slice(i, i + CHUNK));
}

/**
 * Gan users.ma_nhan_su / ho_ten / chuc_danh theo Gmail hieu luc. Chi ghi dong thuc su doi.
 * Neu 1 Gmail khop nhieu nhan su: uu tien gan tay, roi dang lam (on).
 */
export async function relinkUsers(db: D1Database): Promise<number> {
  const [{ results: etx }, { results: users }] = await Promise.all([
    db.prepare(
      `SELECT e.ma_nhan_su, e.ho_ten, e.chuc_danh, e.trang_thai_lam_viec, e.gmail_gan_tay, ${EFFECTIVE_GMAIL_SQL} eff
       FROM etx_nhan_su e WHERE ${EFFECTIVE_GMAIL_SQL} IS NOT NULL`,
    ).all<{ ma_nhan_su: string; ho_ten: string; chuc_danh: string | null; trang_thai_lam_viec: string; gmail_gan_tay: string | null; eff: string }>(),
    db.prepare("SELECT email, ho_ten, ma_nhan_su, chuc_danh FROM users").all<{ email: string; ho_ten: string; ma_nhan_su: string | null; chuc_danh: string | null }>(),
  ]);

  const rank = (r: { gmail_gan_tay: string | null; trang_thai_lam_viec: string }) =>
    (r.gmail_gan_tay ? 2 : 0) + (r.trang_thai_lam_viec === "on" ? 1 : 0);
  const byEmail = new Map<string, (typeof etx)[number]>();
  for (const r of etx) {
    const cur = byEmail.get(r.eff);
    if (!cur || rank(r) > rank(cur)) byEmail.set(r.eff, r);
  }

  const stmts: D1PreparedStatement[] = [];
  let linked = 0;
  for (const u of users) {
    const m = byEmail.get(u.email.toLowerCase());
    if (m) {
      linked++;
      const hoTen = m.ho_ten?.trim() || u.ho_ten;
      if (u.ma_nhan_su !== m.ma_nhan_su || u.ho_ten !== hoTen || u.chuc_danh !== m.chuc_danh) {
        stmts.push(db.prepare("UPDATE users SET ma_nhan_su = ?, ho_ten = ?, chuc_danh = ? WHERE email = ?")
          .bind(m.ma_nhan_su, hoTen, m.chuc_danh, u.email));
      }
    } else if (u.ma_nhan_su) {
      // het lien ket (doi Gmail / bo gan) -> giu ho ten, bo ma + chuc danh
      stmts.push(db.prepare("UPDATE users SET ma_nhan_su = NULL, chuc_danh = NULL WHERE email = ?").bind(u.email));
    }
  }
  await runChunks(db, stmts);
  if (stmts.length) await bumpVersions(db, ["users"]);
  return linked;
}

/** Lien ket ngay 1 tai khoan (vua tao / vua doi Gmail) voi danh ba ETX da co, khong goi ETX. */
export async function linkOneUser(db: D1Database, email: string): Promise<void> {
  const m = await db.prepare(
    `SELECT e.ma_nhan_su, e.ho_ten, e.chuc_danh FROM etx_nhan_su e WHERE ${EFFECTIVE_GMAIL_SQL} = ?
     ORDER BY (e.gmail_gan_tay IS NOT NULL) DESC, (e.trang_thai_lam_viec = 'on') DESC LIMIT 1`,
  ).bind(email.toLowerCase()).first<{ ma_nhan_su: string; ho_ten: string; chuc_danh: string | null }>();
  if (m) {
    await db.prepare("UPDATE users SET ma_nhan_su = ?, ho_ten = CASE WHEN ? <> '' THEN ? ELSE ho_ten END, chuc_danh = ? WHERE email = ?")
      .bind(m.ma_nhan_su, m.ho_ten ?? "", m.ho_ten ?? "", m.chuc_danh, email).run();
  } else {
    await db.prepare("UPDATE users SET ma_nhan_su = NULL, chuc_danh = NULL WHERE email = ? AND ma_nhan_su IS NOT NULL").bind(email).run();
  }
}

export interface EtxSyncResult { changed: number; inserted: number; total: number; linked: number; locked: number; unlocked: number }

export async function runEtxSync(env: Env, db: D1Database): Promise<EtxSyncResult> {
  const items = await fetchAll(env);
  const { results: existing } = await db
    .prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec FROM etx_nhan_su")
    .all<{ ma_nhan_su: string; ho_ten: string; chuc_danh: string | null; gmail: string | null; trang_thai_lam_viec: string }>();
  const map = new Map(existing.map((r) => [r.ma_nhan_su, r]));

  const now = nowVN();
  const stmts: D1PreparedStatement[] = [];
  const toggles: { ma: string; on: boolean }[] = [];
  let changed = 0, inserted = 0;

  for (const it of items) {
    const ma = it.maNhanSu?.trim();
    if (!ma) continue;
    const gmail = it.gmail?.trim().toLowerCase() || null;
    const tt = it.trangThaiLamViec === "off" ? "off" : "on";
    const old = map.get(ma);
    if (!old) {
      stmts.push(db.prepare(
        `INSERT INTO etx_nhan_su (ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(ma, it.hoTen ?? "", it.chucDanh ?? null, gmail, tt, now, now));
      inserted++;
      continue;
    }
    if (old.ho_ten !== (it.hoTen ?? "") || old.chuc_danh !== (it.chucDanh ?? null) || old.gmail !== gmail || old.trang_thai_lam_viec !== tt) {
      stmts.push(db.prepare(
        "UPDATE etx_nhan_su SET ho_ten = ?, chuc_danh = ?, gmail = ?, trang_thai_lam_viec = ?, updated_at = ? WHERE ma_nhan_su = ?",
      ).bind(it.hoTen ?? "", it.chucDanh ?? null, gmail, tt, now, ma));
      changed++;
      if (old.trang_thai_lam_viec !== tt) toggles.push({ ma, on: tt === "on" });
    }
  }
  await runChunks(db, stmts);
  const linked = await relinkUsers(db);

  // Nghi viec (on->off) -> khoa tai khoan lien ket; di lam lai (off->on) -> mo. Chi xu ly luc CHUYEN trang thai,
  // de Admin tu khoa/mo tay van giu nguyen giua cac lan dong bo. Khong bao gio khoa Admin khoi tao.
  let locked = 0, unlocked = 0;
  if (toggles.length) {
    const boot = (env.BOOTSTRAP_ADMIN_EMAIL ?? "").toLowerCase();
    const res = await db.batch(toggles.map((t) =>
      db.prepare("UPDATE users SET active = ? WHERE ma_nhan_su = ? AND LOWER(email) <> ?").bind(t.on ? 1 : 0, t.ma, boot),
    ));
    res.forEach((r, i) => { const n = r.meta.changes ?? 0; if (toggles[i].on) unlocked += n; else locked += n; });
    if (locked + unlocked) await bumpVersions(db, ["users"]);
  }
  return { changed, inserted, total: items.length, linked, locked, unlocked };
}

/** Luon ghi etx_sync_state (thanh cong hay loi) de UI hien lan chay gan nhat. */
export async function runEtxSyncWithState(env: Env, db: D1Database): Promise<EtxSyncResult | null> {
  try {
    const r = await runEtxSync(env, db);
    await db.prepare(
      "UPDATE etx_sync_state SET last_run_at = ?, last_status = 'ok', changed_count = ?, linked_count = ?, last_error = NULL WHERE id = 1",
    ).bind(nowVN(), r.changed + r.inserted, r.linked).run();
    return r;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.prepare("UPDATE etx_sync_state SET last_run_at = ?, last_status = 'error', last_error = ? WHERE id = 1")
      .bind(nowVN(), msg.slice(0, 500)).run();
    return null;
  }
}
