import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { EFFECTIVE_GMAIL_SQL, linkOneUser, relinkUsers, runEtxSyncWithState } from "../lib/etxNhanSu";

// Quan tri danh ba "ETX nhan su" - Admin-only toan bo router (du lieu nhan su).
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();
app.use("*", requireAdmin);

const EMAIL_RE = /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/;

// GET /?search=&trang_thai=on|off&lien_ket=co|chua&page=&pageSize=
app.get("/", async (c) => {
  const search = c.req.query("search")?.trim().normalize("NFC");
  const trangThai = c.req.query("trang_thai");
  const lienKet = c.req.query("lien_ket");
  const where: string[] = [];
  const bind: unknown[] = [];
  if (search) {
    where.push("(LOWER(e.ma_nhan_su) LIKE LOWER(?) OR LOWER(e.ho_ten) LIKE LOWER(?) OR LOWER(COALESCE(e.gmail,'')) LIKE LOWER(?) OR LOWER(COALESCE(e.gmail_gan_tay,'')) LIKE LOWER(?) OR LOWER(COALESCE(e.chuc_danh,'')) LIKE LOWER(?))");
    bind.push(...Array(5).fill(`%${search}%`));
  }
  if (trangThai === "on" || trangThai === "off") { where.push("e.trang_thai_lam_viec = ?"); bind.push(trangThai); }
  if (lienKet === "co") where.push("u.email IS NOT NULL");
  if (lienKet === "chua") where.push("u.email IS NULL");
  const base = `FROM etx_nhan_su e LEFT JOIN users u ON u.email = ${EFFECTIVE_GMAIL_SQL} ${where.length ? "WHERE " + where.join(" AND ") : ""}`;

  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 50) || 50));
  const total = await c.env.DB.prepare(`SELECT COUNT(*) n ${base}`).bind(...bind).first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT e.*, ${EFFECTIVE_GMAIL_SQL} gmail_hieu_luc, u.email user_email, u.vai_tro user_vai_tro,
            u.trang_thai_duyet user_trang_thai, u.active user_active
     ${base} ORDER BY e.trang_thai_lam_viec DESC, e.ho_ten LIMIT ? OFFSET ?`,
  ).bind(...bind, pageSize, (page - 1) * pageSize).all();
  return c.json({ rows: results, total: total?.n ?? 0, page, pageSize });
});

app.get("/sync-status", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM etx_sync_state WHERE id = 1").first();
  const n = await c.env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM etx_nhan_su) tong, (SELECT COUNT(*) FROM users WHERE ma_nhan_su IS NOT NULL) da_lien_ket, (SELECT COUNT(*) FROM users WHERE ma_nhan_su IS NULL) chua_lien_ket",
  ).first();
  return c.json({ ...row, ...n });
});

// POST /sync/run - nut "Dong bo ngay" (he nay khong cron)
app.post("/sync/run", async (c) => {
  const r = await runEtxSyncWithState(c.env, c.env.DB);
  const state = await c.env.DB.prepare("SELECT * FROM etx_sync_state WHERE id = 1").first();
  return c.json({ ...state, result: r });
});

// PATCH /:ma/gmail  body: { gmail: string|null|"" , tao_tai_khoan?: boolean, chuyen_tu?: string }
//  - gmail = null  -> bo gan tay, dung lai Gmail tu ETX
//  - gmail = ""    -> chu dong bo lien ket (nhan su nay khong gan tai khoan nao)
//  - gmail = email -> gan tay (ETX sai Gmail / nhan su doi Gmail su dung). Email nay bi go khoi nhan su khac dang gan tay.
//  - tao_tai_khoan: Gmail chua co tai khoan -> tao tai khoan da duyet (Admin dang chu dong gan)
//  - chuyen_tu: email tai khoan cu -> chep vai tro + co nghiep vu sang Gmail moi roi khoa tai khoan cu
app.patch("/:ma/gmail", async (c) => {
  const ma = c.req.param("ma");
  const b = (await c.req.json()) as { gmail?: string | null; tao_tai_khoan?: boolean; chuyen_tu?: string | null };
  const row = await c.env.DB.prepare(`SELECT e.*, ${EFFECTIVE_GMAIL_SQL} eff FROM etx_nhan_su e WHERE e.ma_nhan_su = ?`)
    .bind(ma).first<{ ho_ten: string; eff: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);

  let gan: string | null;
  if (b.gmail === null || b.gmail === undefined) gan = null;
  else {
    gan = b.gmail.trim().toLowerCase();
    if (gan && !EMAIL_RE.test(gan)) return c.json({ error: "INVALID_EMAIL" }, 400);
  }
  const me = c.get("user").email;
  const now = nowVN();
  const stmts: D1PreparedStatement[] = [];
  if (gan) {
    stmts.push(c.env.DB.prepare("UPDATE etx_nhan_su SET gmail_gan_tay = NULL, updated_at = ? WHERE gmail_gan_tay = ? AND ma_nhan_su <> ?").bind(now, gan, ma));
  }
  stmts.push(c.env.DB.prepare("UPDATE etx_nhan_su SET gmail_gan_tay = ?, updated_at = ? WHERE ma_nhan_su = ?").bind(gan, now, ma));

  const newEmail = gan ?? null;
  if (newEmail && b.tao_tai_khoan) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO users (email, ho_ten, trang_thai_duyet, active, approved_at, approved_by)
       VALUES (?, ?, 'Da duyet', 1, ?, ?) ON CONFLICT(email) DO NOTHING`,
    ).bind(newEmail, row.ho_ten || newEmail, now, me));
  }
  const oldEmail = b.chuyen_tu?.trim().toLowerCase();
  if (newEmail && oldEmail && oldEmail !== newEmail) {
    const old = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(oldEmail).first<any>();
    if (!old) return c.json({ error: "OLD_ACCOUNT_NOT_FOUND" }, 404);
    if (oldEmail === (c.env.BOOTSTRAP_ADMIN_EMAIL ?? "").toLowerCase()) return c.json({ error: "CANNOT_MOVE_BOOTSTRAP_ADMIN" }, 400);
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO users (email, ho_ten, vai_tro, la_nv_dat_hang, la_nv_kho, la_ke_toan, la_theo_doi_td, la_view, khu_vuc_kho,
                            trang_thai_duyet, active, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Da duyet', 1, ?, ?)
         ON CONFLICT(email) DO UPDATE SET vai_tro = excluded.vai_tro, la_nv_dat_hang = excluded.la_nv_dat_hang,
           la_nv_kho = excluded.la_nv_kho, la_ke_toan = excluded.la_ke_toan, la_theo_doi_td = excluded.la_theo_doi_td,
           la_view = excluded.la_view, khu_vuc_kho = excluded.khu_vuc_kho, trang_thai_duyet = 'Da duyet', active = 1,
           approved_at = excluded.approved_at, approved_by = excluded.approved_by`,
      ).bind(newEmail, row.ho_ten || old.ho_ten || newEmail, old.vai_tro, old.la_nv_dat_hang, old.la_nv_kho, old.la_ke_toan,
        old.la_theo_doi_td, old.la_view, old.khu_vuc_kho, now, me),
      c.env.DB.prepare("UPDATE users SET active = 0 WHERE email = ?").bind(oldEmail),
    );
  }
  await c.env.DB.batch(stmts);

  // lien ket lai: Gmail cu cua nhan su nay (neu doi), Gmail moi, va tai khoan cu
  for (const e of new Set([row.eff, newEmail, oldEmail].filter(Boolean) as string[])) await linkOneUser(c.env.DB, e);
  await bumpVersions(c.env.DB, ["users"]);
  return c.json({ ok: true });
});

// POST /relink - lien ket lai toan bo theo danh ba dang co (khong goi ETX)
app.post("/relink", async (c) => c.json({ linked: await relinkUsers(c.env.DB) }));

export default app;
