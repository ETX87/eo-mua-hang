import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, AppVariables } from "../types";
import { requireAdmin } from "../middleware/guards";
import { bumpVersions } from "../lib/dataVersions";
import { encryptSecret } from "../lib/secretBox";
import { nowVN } from "../lib/vnTime";
import { cachedReport } from "../lib/reportCache";
import { khoa, layBoChuan, chuan, type LoaiChuan } from "../lib/chuanHoa";
import { eventStmt } from "../lib/audit";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ---- doc: ai cung xem duoc (dung cho dropdown form) ----
// goi y o nhap dong linh kien (form EO) + bo loc: ma LK -> ten (EO truoc, AMIS sau), doi tac, ly do PS da tung dung
app.get("/goi-y-dong", async (c) => c.json(await cachedReport(c.env.DB, "dm:goi-y-dong:v2", ["eo", "amis", "settings"], async () => {
  const [lk, dt, ld] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ma, ten FROM (
         SELECT part_code ma, MAX(NULLIF(TRIM(part_name), '')) ten, 0 nguon FROM eo_item WHERE TRIM(part_code) <> '' GROUP BY UPPER(TRIM(part_code))
         UNION ALL
         SELECT part_code, MAX(NULLIF(TRIM(part_name), '')), 1 FROM amis_receipt WHERE voided_at IS NULL AND TRIM(part_code) <> ''
           AND UPPER(TRIM(part_code)) NOT IN (SELECT UPPER(TRIM(part_code)) FROM eo_item) GROUP BY UPPER(TRIM(part_code))
       ) ORDER BY ma`,
    ).all<{ ma: string; ten: string | null }>(),
    // v0.066: chi danh muc chuan (dm_chuan, migration 0020) - doi tac xep theo so dong dung nhieu nhat
    c.env.DB.prepare(
      `SELECT d.ten v FROM dm_chuan d LEFT JOIN (SELECT supplier, COUNT(*) n FROM eo_item GROUP BY supplier) x ON x.supplier = d.ten
       WHERE d.loai = 'DOI_TAC' AND d.active = 1 ORDER BY COALESCE(x.n, 0) DESC, d.ten`,
    ).all<{ v: string }>(),
    c.env.DB.prepare("SELECT ten v FROM dm_chuan WHERE loai = 'LY_DO' AND active = 1 ORDER BY thu_tu, ten").all<{ v: string }>(),
  ]);
  return {
    linh_kien: lk.results.map((r) => ({ ma: r.ma.trim(), ten: r.ten ?? "" })),
    doi_tac: dt.results.map((r) => r.v),
    ly_do: ld.results.map((r) => r.v),
  };
})));
app.get("/kho", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_warehouse ORDER BY ten_kho").all()).results));
app.get("/loai-hinh", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_eo_category ORDER BY code").all()).results));
app.get("/toc-do", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM settings_speed_bucket ORDER BY min_days").all()).results));
app.get("/app", async (c) => c.json((await c.env.DB.prepare("SELECT * FROM app_settings ORDER BY key").all()).results));

// ---- Danh muc chuan Doi tac / Ly do PS (2026-11-08, lib/chuanHoa.ts) - xem: Admin ----
// GET /chuan -> danh muc + bi danh + so dong dang dung + gia tri CHUA chuan dang co trong eo_item (rac can chuyen)
app.get("/chuan", requireAdmin, async (c) => {
  const db = c.env.DB;
  const bo = await layBoChuan(db);
  const [ds, bd, dt, ld] = await Promise.all([
    db.prepare("SELECT loai, ten, active, thu_tu FROM dm_chuan ORDER BY loai, thu_tu, ten").all<{ loai: LoaiChuan; ten: string; active: number; thu_tu: number }>(),
    db.prepare("SELECT loai, khoa, ten_chuan FROM dm_bi_danh ORDER BY loai, ten_chuan, khoa").all(),
    db.prepare("SELECT supplier v, COUNT(*) n FROM eo_item WHERE TRIM(COALESCE(supplier, '')) <> '' GROUP BY supplier").all<{ v: string; n: number }>(),
    db.prepare("SELECT reason v, COUNT(*) n FROM eo_item WHERE TRIM(COALESCE(reason, '')) <> '' GROUP BY reason").all<{ v: string; n: number }>(),
  ]);
  const dem = (loai: LoaiChuan, rs: { v: string; n: number }[]) => {
    const dung: Record<string, number> = {};
    const chua: { gia_tri: string; so_dong: number; goi_y: string | null }[] = [];
    for (const r of rs) {
      if (bo.ten[loai].includes(r.v)) dung[r.v] = r.n;
      else chua.push({ gia_tri: r.v, so_dong: r.n, goi_y: chuan(bo, loai, r.v) ?? null });
    }
    return { dung, chua: chua.sort((a, b) => b.so_dong - a.so_dong) };
  };
  return c.json({ danh_muc: ds.results, bi_danh: bd.results, DOI_TAC: dem("DOI_TAC", dt.results), LY_DO: dem("LY_DO", ld.results) });
});

// ---- ghi: Admin ----
app.use("/*", async (c, next) => (c.req.method === "GET" ? next() : requireAdmin(c, next)));

// PUT /chuan { loai, ten, ten_moi?, active? } - them / doi ten (doi luon du lieu eo_item + bi danh) / ngung dung 1 gia tri chuan.
// Ly do PS co dinh 4 gia tri (chot 2026-11-08) - chi doi ten / bat tat, khong them.
app.put("/chuan", async (c) => {
  const db = c.env.DB;
  const u = c.get("user");
  const b = (await c.req.json().catch(() => ({}))) as { loai?: LoaiChuan; ten?: string; ten_moi?: string; active?: number };
  const loai = b.loai;
  const ten = (b.ten ?? "").trim();
  if ((loai !== "DOI_TAC" && loai !== "LY_DO") || !ten) return c.json({ error: "BAD_INPUT" }, 400);
  const co = await db.prepare("SELECT ten FROM dm_chuan WHERE loai = ? AND ten = ?").bind(loai, ten).first();
  const bo = await layBoChuan(db);
  if (!co) {
    if (loai === "LY_DO") return c.json({ error: "LY_DO_CO_DINH" }, 400);
    const trung = chuan(bo, loai, ten);
    if (trung) return c.json({ error: "DA_CO", ten_chuan: trung }, 409);
    await db.prepare("INSERT INTO dm_chuan (loai, ten, thu_tu) VALUES (?, ?, (SELECT COALESCE(MAX(thu_tu), 0) + 1 FROM dm_chuan WHERE loai = ?))").bind(loai, ten, loai).run();
  } else {
    const moi = (b.ten_moi ?? "").trim();
    const stmts: D1PreparedStatement[] = [];
    if (moi && moi !== ten) {
      if (await db.prepare("SELECT 1 FROM dm_chuan WHERE loai = ? AND ten = ?").bind(loai, moi).first()) return c.json({ error: "DA_CO", ten_chuan: moi }, 409);
      const cot = loai === "DOI_TAC" ? "supplier" : "reason";
      stmts.push(
        db.prepare("UPDATE dm_chuan SET ten = ? WHERE loai = ? AND ten = ?").bind(moi, loai, ten),
        db.prepare("UPDATE dm_bi_danh SET ten_chuan = ? WHERE loai = ? AND ten_chuan = ?").bind(moi, loai, ten),
        // ten cu thanh bi danh -> nhap ten cu van nhan ra
        db.prepare("INSERT INTO dm_bi_danh (loai, khoa, ten_chuan) VALUES (?, ?, ?) ON CONFLICT(loai, khoa) DO UPDATE SET ten_chuan = excluded.ten_chuan").bind(loai, khoa(ten), moi),
        db.prepare(`UPDATE eo_item SET ${cot}_goc = COALESCE(${cot}_goc, ${cot}), ${cot} = ? WHERE ${cot} = ?`).bind(moi, ten),
      );
    }
    if (b.active === 0 || b.active === 1) stmts.push(db.prepare("UPDATE dm_chuan SET active = ? WHERE loai = ? AND ten = ?").bind(b.active, loai, moi || ten));
    if (stmts.length) await db.batch(stmts);
  }
  await db.batch([eventStmt(db, { entity_type: "danh_muc", entity_id: 0, eo_id: null, event_type: "SUA_DANH_MUC_CHUAN", user_email: u.email, after: { loai, ten, ten_moi: b.ten_moi ?? null, active: b.active ?? null } })]);
  await bumpVersions(db, ["settings", "eo"]);
  return c.json({ ok: true });
});

// POST /chuan/chuyen { loai, gia_tri: string[], ten_chuan, bi_danh?: boolean (mac dinh true) }
// Chuyen gia tri "rac" trong eo_item ve 1 gia tri chuan (giu ban goc o *_goc), them bi danh de lan sau nhap tu nhan ra.
// Ly do PS: chu goc khong phai bi danh ro rang -> chep vao ghi chu ("Lý do cũ: …") nhu lan chuyen dau (migration 0020).
app.post("/chuan/chuyen", async (c) => {
  const db = c.env.DB;
  const u = c.get("user");
  const b = (await c.req.json().catch(() => ({}))) as { loai?: LoaiChuan; gia_tri?: string[]; ten_chuan?: string; bi_danh?: boolean; ghi_chu?: boolean };
  const loai = b.loai;
  const ds = [...new Set((b.gia_tri ?? []).map((x) => String(x)).filter((x) => x.trim()))].slice(0, 200);
  if ((loai !== "DOI_TAC" && loai !== "LY_DO") || !ds.length || !b.ten_chuan) return c.json({ error: "BAD_INPUT" }, 400);
  if (!(await db.prepare("SELECT 1 FROM dm_chuan WHERE loai = ? AND ten = ? AND active = 1").bind(loai, b.ten_chuan).first())) return c.json({ error: "KHONG_CO_TEN_CHUAN" }, 400);
  const cot = loai === "DOI_TAC" ? "supplier" : "reason";
  const json = JSON.stringify(ds);
  const stmts: D1PreparedStatement[] = [];
  if (loai === "LY_DO" && b.ghi_chu) {
    stmts.push(db.prepare(
      `UPDATE eo_item SET ghi_chu = TRIM(COALESCE(ghi_chu, '') || CASE WHEN TRIM(COALESCE(ghi_chu, '')) <> '' THEN ' | ' ELSE '' END || 'Lý do cũ: ' || reason)
       WHERE reason IN (SELECT value FROM json_each(?))`).bind(json));
  }
  stmts.push(db.prepare(`UPDATE eo_item SET ${cot}_goc = COALESCE(${cot}_goc, ${cot}), ${cot} = ? WHERE ${cot} IN (SELECT value FROM json_each(?))`).bind(b.ten_chuan, json));
  if (b.bi_danh !== false) {
    for (const v of ds) {
      const k = khoa(v);
      if (k) stmts.push(db.prepare("INSERT INTO dm_bi_danh (loai, khoa, ten_chuan) VALUES (?, ?, ?) ON CONFLICT(loai, khoa) DO UPDATE SET ten_chuan = excluded.ten_chuan").bind(loai, k, b.ten_chuan));
    }
  }
  stmts.push(eventStmt(db, { entity_type: "danh_muc", entity_id: 0, eo_id: null, event_type: "CHUAN_HOA_DU_LIEU", user_email: u.email, after: { loai, gia_tri: ds, ten_chuan: b.ten_chuan } }));
  const res = await db.batch(stmts);
  await bumpVersions(db, ["eo", "settings"]);
  return c.json({ ok: true, so_dong: res[loai === "LY_DO" && b.ghi_chu ? 1 : 0].meta.changes ?? 0 });
});

// DELETE /chuan/bi-danh?loai=&khoa= - bo 1 bi danh
app.delete("/chuan/bi-danh", async (c) => {
  await c.env.DB.prepare("DELETE FROM dm_bi_danh WHERE loai = ? AND khoa = ?").bind(c.req.query("loai") ?? "", c.req.query("khoa") ?? "").run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.put("/kho/:ten", async (c) => {
  const ten = decodeURIComponent(c.req.param("ten")).trim();
  if (!ten) return c.json({ error: "BAD_INPUT" }, 400);
  const b = (await c.req.json()) as { ma_kho?: string; active?: number };
  await c.env.DB.prepare(
    `INSERT INTO settings_warehouse (ten_kho, ma_kho, active) VALUES (?, ?, ?)
     ON CONFLICT(ten_kho) DO UPDATE SET ma_kho = excluded.ma_kho, active = excluded.active`,
  ).bind(ten, b.ma_kho ?? null, b.active ?? 1).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.put("/loai-hinh/:code", async (c) => {
  const code = decodeURIComponent(c.req.param("code")).trim();
  if (!code) return c.json({ error: "BAD_INPUT" }, 400);
  const b = (await c.req.json()) as { ten?: string; cap2?: string; phong_ban?: string };
  await c.env.DB.prepare(
    `INSERT INTO settings_eo_category (code, ten, cap2, phong_ban) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET ten = excluded.ten, cap2 = excluded.cap2, phong_ban = excluded.phong_ban`,
  ).bind(code, b.ten ?? code, b.cap2 ?? null, b.phong_ban ?? null).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

// min_days la khoa chinh -> doi nguong = xoa dong cu + them dong moi trong 1 batch
app.put("/toc-do", async (c) => {
  const b = (await c.req.json()) as { old_min_days?: number | null; min_days: number; label: string };
  if (typeof b.min_days !== "number" || !Number.isFinite(b.min_days) || !b.label?.trim()) {
    return c.json({ error: "BAD_INPUT" }, 400);
  }
  const stmts = [];
  if (b.old_min_days != null && b.old_min_days !== b.min_days) {
    stmts.push(c.env.DB.prepare("DELETE FROM settings_speed_bucket WHERE min_days = ?").bind(b.old_min_days));
  } else if (b.old_min_days == null) {
    const dup = await c.env.DB.prepare("SELECT 1 FROM settings_speed_bucket WHERE min_days = ?").bind(b.min_days).first();
    if (dup) return c.json({ error: "ALREADY_EXISTS" }, 409);
  }
  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO settings_speed_bucket (min_days, label) VALUES (?, ?)
       ON CONFLICT(min_days) DO UPDATE SET label = excluded.label`,
    ).bind(b.min_days, b.label.trim()),
  );
  await c.env.DB.batch(stmts);
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.delete("/toc-do/:min", async (c) => {
  const n = await c.env.DB.prepare("SELECT COUNT(*) n FROM settings_speed_bucket").first<{ n: number }>();
  if ((n?.n ?? 0) <= 1) return c.json({ error: "LAST_BUCKET" }, 409);
  await c.env.DB.prepare("DELETE FROM settings_speed_bucket WHERE min_days = ?").bind(Number(c.req.param("min"))).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

app.put("/app/:key", async (c) => {
  const key = decodeURIComponent(c.req.param("key"));
  const b = (await c.req.json()) as { value?: string };
  await c.env.DB.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).bind(key, b.value ?? null).run();
  await bumpVersions(c.env.DB, ["settings"]);
  return c.json({ ok: true });
});

// ---- Google Drive OAuth (uy quyen 1 tai khoan Google THAT de upload file dinh kem EO) ----
// Port nguyen ban tu ../linh-kien-app (backend/src/routes/settingsDatMua.ts) - da chay that trong
// production o he do. Dung chung GOOGLE_CLIENT_ID/SECRET voi dang nhap, chi xin them scope
// drive.file qua 1 luong uy quyen rieng (access_type=offline de lay refresh_token, luu ma hoa).
const GOOGLE_DRIVE_STATE_COOKIE = "eomua_drive_oauth_state";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";

app.get("/google-drive/status", requireAdmin, async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT google_email, authorized_by, authorized_at FROM google_drive_oauth WHERE id = 1",
  ).first<{ google_email: string; authorized_by: string; authorized_at: string }>();
  if (!row) return c.json({ connected: false });
  return c.json({ connected: true, ...row });
});

app.get("/google-drive/authorize", requireAdmin, async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, GOOGLE_DRIVE_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });

  const redirectUri = `${new URL(c.req.url).origin}/api/danh-muc/google-drive/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/google-drive/callback", requireAdmin, async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, GOOGLE_DRIVE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_DRIVE_STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const redirectUri = `${url.origin}/api/danh-muc/google-drive/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google: " + (await tokenRes.text()), 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokenJson.refresh_token) {
    return c.text(
      "Google khong tra ve refresh_token (co the tai khoan da tung uy quyen truoc do) - vao myaccount.google.com/permissions, go quyen truy cap cua app nay roi thu lai.",
      400,
    );
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const userInfo = (await userInfoRes.json()) as { email: string };

  const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "EO mua hang - Tai lieu dinh kem", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!folderRes.ok) return c.text("Khong the tao folder Drive: " + (await folderRes.text()), 502);
  const { id: folderId } = (await folderRes.json()) as { id: string };

  const refreshTokenEnc = await encryptSecret(c.env, tokenJson.refresh_token);
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO google_drive_oauth (id, google_email, refresh_token_enc, folder_id, authorized_by, authorized_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       folder_id = excluded.folder_id, authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  ).bind(userInfo.email, refreshTokenEnc, folderId, user.email, nowVN()).run();

  return c.redirect(c.env.FRONTEND_URL || "/");
});

export default app;
