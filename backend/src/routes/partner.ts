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
  let them = 0;
  const krfDong = new Set<number>();
  for (const e of evs) {
    if (!e?.ext_id || (e.huong !== "GUI" && e.huong !== "NHAN")) continue;
    const maPush = (e.ma_push ?? /PUSH-\d{6}-\d{4}/.exec(`${e.tieu_de ?? ""}`)?.[0]) || null;
    // id dong: EOI-<id> truc tiep; LK-... tra legacy_id
    const itemIds: number[] = [];
    for (const d of e.id_dong ?? []) {
      const m = /^EOI-(\d+)$/.exec(d.trim());
      if (m) itemIds.push(Number(m[1]));
      else {
        const r = await db.prepare("SELECT id FROM eo_item WHERE legacy_id = ?").bind(d.trim()).first<{ id: number }>();
        if (r) itemIds.push(r.id);
      }
    }
    const targets = itemIds.length ? itemIds : [null];
    for (const [i, itemId] of targets.entries()) {
      const res = await db.prepare(
        `INSERT OR IGNORE INTO tl_mail (ext_id, ma_push, eo_item_id, huong, doi_tac, tu, den, tieu_de, tom_tat, thoi_gian, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(targets.length > 1 ? `${e.ext_id}#${i}` : e.ext_id, maPush, itemId, e.huong, e.doi_tac ?? null, e.tu ?? null, e.den ?? null,
        e.tieu_de ?? null, (e.tom_tat ?? "").slice(0, 2000) || null, e.thoi_gian ?? null, e.payload ? JSON.stringify(e.payload).slice(0, 20000) : null).run();
      them += res.meta.changes ?? 0;
      // Thu KRF tra loi co ngay "KRF đáp ứng" cho dong nay -> tu dong dien ngay NM cam ket (lib/krfGoiY.ts, chi dong khop chac).
      if (itemId && e.huong === "NHAN" && (res.meta.changes ?? 0) > 0 && (e.payload as any)?.dong?.ngay_dap_ung) krfDong.add(itemId);
    }
    if (maPush) {
      await db.prepare(
        `UPDATE tl_push SET trang_thai = CASE WHEN ? = 'NHAN' THEN 'DA_PHAN_HOI' WHEN trang_thai = 'DA_TAO' THEN 'DA_GUI' ELSE trang_thai END
         WHERE ma_push = ?`,
      ).bind(e.huong, maPush).run();
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
