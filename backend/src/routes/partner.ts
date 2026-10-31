import { Hono } from "hono";
import type { Env } from "../types";
import { bumpVersions } from "../lib/dataVersions";
import { tuDongDienKrf } from "../lib/krfGoiY";

/**
 * /api/partner - API cho he ngoai, KHONG dung session (mount TRUOC verifySessionMiddleware o index.ts).
 * POST /mail-events: app "theo-doi-mua-hang" (tong hop mail theodoimuahang@gmail.com qua Apps Script) day luong mail
 * da danh gia ve. Khop dot push theo ma "PUSH-YYMMDD-NNNN" (trong tieu de / ten file push chuan - routes/theoDoi.ts),
 * hoac theo id dong "EOI-<id>" / "LK-..." ma app do doc duoc trong file phan hoi.
 * Thu KRF (NHAN) co payload.dong.ngay_dap_ung -> tu dong dien ngay NM cam ket cho dong khop chac (lib/krfGoiY.ts tuDongDienKrf).
 * Xac thuc: header X-API-Key = secret THEODOI_MUAHANG_API_KEY (chua dat -> 503).
 */
const app = new Hono<{ Bindings: Env }>();

function eqConst(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

interface MailEvent {
  ext_id: string; huong: "GUI" | "NHAN"; ma_push?: string | null; id_dong?: string[];
  doi_tac?: string; tu?: string; den?: string; tieu_de?: string; tom_tat?: string; thoi_gian?: string; payload?: unknown;
}

app.post("/mail-events", async (c) => {
  const key = c.env.THEODOI_MUAHANG_API_KEY;
  if (!key) return c.json({ error: "NOT_CONFIGURED" }, 503);
  if (!eqConst(c.req.header("X-API-Key") ?? "", key)) return c.json({ error: "INVALID_API_KEY" }, 401);
  const b = (await c.req.json().catch(() => null)) as { events?: MailEvent[] } | null;
  const evs = Array.isArray(b?.events) ? b!.events : null;
  if (!evs || evs.length > 500) return c.json({ error: "INVALID_BODY" }, 400);
  const db = c.env.DB;
  // Ghi THEO LO (2026-10-31): truoc day moi dong cua moi thu = 1 INSERT tuan tu (+1 SELECT / ma LK-...) -> 1 lo 10 thu x 121 dong
  // = 1.210 truy van, vuot gioi han 1.000 truy van / request cua D1 (mat thu). Nay: 1 truy van tra ma LK-, 1 truy van ext_id da co,
  // INSERT ... SELECT FROM json_each theo goi (~700KB / goi), 1 batch cap nhat trang thai push -> so truy van khong phu thuoc so dong.
  const hopLe = evs.filter((e) => e?.ext_id && (e.huong === "GUI" || e.huong === "NHAN"));
  const maLk = [...new Set(hopLe.flatMap((e) => (e.id_dong ?? []).map((d) => String(d).trim())).filter((d) => d && !/^EOI-\d+$/.test(d)))];
  const lkId = new Map<string, number>();
  for (let i = 0; i < maLk.length; i += 500) {
    const rs = await db.prepare("SELECT id, legacy_id FROM eo_item WHERE legacy_id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(maLk.slice(i, i + 500))).all<{ id: number; legacy_id: string }>();
    for (const r of rs.results) lkId.set(r.legacy_id, r.id);
  }
  // 1 ban ghi / dong (app doc mail tach theo ma 3TDO + ma LK); payload qua 20.000 ky tu -> bo (truoc day cat ngang chuoi JSON -> hong JSON)
  type Dong = [string, string | null, number | null, string, string | null, string | null, string | null, string | null, string | null, string | null, string | null];
  const dong: Dong[] = [];
  const pushCapNhat = new Map<string, "GUI" | "NHAN">();
  for (const e of hopLe) {
    const maPush = (e.ma_push ?? /PUSH-\d{6}-\d{4}/.exec(`${e.tieu_de ?? ""}`)?.[0]) || null;
    const itemIds: number[] = [];
    for (const d of e.id_dong ?? []) {
      const m = /^EOI-(\d+)$/.exec(String(d).trim());
      const id = m ? Number(m[1]) : lkId.get(String(d).trim());
      if (id) itemIds.push(id);
    }
    const targets = itemIds.length ? itemIds : [null];
    const pl = e.payload ? JSON.stringify(e.payload) : null;
    for (const [i, itemId] of targets.entries()) {
      dong.push([targets.length > 1 ? `${e.ext_id}#${i}` : e.ext_id, maPush, itemId, e.huong, e.doi_tac ?? null, e.tu ?? null, e.den ?? null,
        e.tieu_de ?? null, (e.tom_tat ?? "").slice(0, 2000) || null, e.thoi_gian ?? null, pl && pl.length <= 20000 ? pl : null]);
    }
    if (maPush && pushCapNhat.get(maPush) !== "NHAN") pushCapNhat.set(maPush, e.huong);
  }
  // ext_id da co (chong trung, UNIQUE) -> biet chinh xac dong nao MOI (de tu dong dien ngay KRF chi cho thu moi)
  const daCo = new Set<string>();
  const ext = dong.map((d) => d[0]);
  for (let i = 0; i < ext.length; i += 500) {
    const rs = await db.prepare("SELECT ext_id FROM tl_mail WHERE ext_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ext.slice(i, i + 500))).all<{ ext_id: string }>();
    for (const r of rs.results) daCo.add(r.ext_id);
  }
  const moi = dong.filter((d) => !daCo.has(d[0]));
  let them = 0;
  for (let i = 0; i < moi.length;) {
    // goi theo kich thuoc (gioi han do dai tham so D1)
    let j = i, kt = 0;
    while (j < moi.length && (j === i || kt + JSON.stringify(moi[j]).length < 700_000)) kt += JSON.stringify(moi[j++]).length;
    const res = await db.prepare(
      `INSERT OR IGNORE INTO tl_mail (ext_id, ma_push, eo_item_id, huong, doi_tac, tu, den, tieu_de, tom_tat, thoi_gian, payload)
       SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'), json_extract(value,'$[4]'),
              json_extract(value,'$[5]'), json_extract(value,'$[6]'), json_extract(value,'$[7]'), json_extract(value,'$[8]'), json_extract(value,'$[9]'),
              json_extract(value,'$[10]') FROM json_each(?)`,
    ).bind(JSON.stringify(moi.slice(i, j))).run();
    them += res.meta.changes ?? 0;
    i = j;
  }
  if (pushCapNhat.size) {
    await db.batch([...pushCapNhat].map(([maPush, huong]) => db.prepare(
      `UPDATE tl_push SET trang_thai = CASE WHEN ? = 'NHAN' THEN 'DA_PHAN_HOI' WHEN trang_thai = 'DA_TAO' THEN 'DA_GUI' ELSE trang_thai END
       WHERE ma_push = ?`,
    ).bind(huong, maPush)));
  }
  // Thu KRF tra loi co ngay "KRF dap ung" cho dong nay -> tu dong dien ngay NM cam ket (lib/krfGoiY.ts, chi dong khop chac, chi thu MOI).
  const krfDong = new Set<number>();
  for (const d of moi) {
    if (d[2] && d[3] === "NHAN" && d[10]) {
      try { if (JSON.parse(d[10])?.dong?.ngay_dap_ung) krfDong.add(d[2]); } catch { /* bo qua */ }
    }
  }
  if (them) await bumpVersions(db, ["theo_doi"]);
  // Loi tu dong dien khong lam hong viec nhan mail (mail da ghi; dong khong dien duoc van hien o "Ngày KRF từ mail").
  const tuDong = await tuDongDienKrf(c.env, [...krfDong]).catch((err) => {
    console.error("tuDongDienKrf", err);
    return null;
  });
  return c.json({ received: evs.length, inserted: them, krf_tu_dong: tuDong ? { them: tuDong.them, sua: tuDong.sua } : null });
});

export default app;
