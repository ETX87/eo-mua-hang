import type { D1Database } from "@cloudflare/workers-types";
import { versionTag, type DataDomain } from "./dataVersions";
import { todayVN, nowVN } from "./vnTime";

/**
 * Bao cao/dashboard doc nang: KHONG query bang nguon moi request. Boc compute() trong cachedReport():
 * tao version-tag tu cac domain khai bao (+ ngay VN) va so voi tag da cache; chi chay lai khi lech.
 * Payload duoc gzip + base64 (bang report_cache.payload la TEXT, JSON 7k dong ~2.5MB vuot gioi han
 * tham so D1 -> nen ~10x).
 *
 * Moi write path phai goi bumpVersions(db, [...domains]). Endpoint doc bang ngoai `domains` cua no
 * se phuc vu cache cu mai mai.
 */
async function gzipB64(s: string): Promise<string> {
  const cs = new CompressionStream("gzip");
  const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(s));
  w.close();
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzipB64(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Response(ds.readable).text();
}

export async function cachedReport<T>(
  db: D1Database,
  key: string,
  domains: DataDomain[],
  compute: () => Promise<T>,
  opts: { dateSensitive?: boolean } = {},
): Promise<T> {
  const tag = (await versionTag(db, domains)) + (opts.dateSensitive === false ? "" : `|${todayVN()}`);

  const hit = await db
    .prepare("SELECT version_tag, payload FROM report_cache WHERE cache_key = ?")
    .bind(key)
    .first<{ version_tag: string; payload: string }>();
  if (hit && hit.version_tag === tag) {
    try {
      return JSON.parse(await gunzipB64(hit.payload)) as T;
    } catch {
      /* cache hong -> tinh lai */
    }
  }

  // Chong tinh lai dong thoi (2026-11-06): da co ban cache (khac tag) -> gianh khoa computing_until. Gianh duoc thi tinh;
  // khong gianh duoc (request khac dang tinh) thi cho toi da CHO_TOI_DA_MS de doc ket qua cua request do - KHONG tra du
  // lieu cu (cac cache dan xuat ghi theo tag moi se bi sai mai). Het thoi gian / tag doi tiep -> tu tinh nhu cu.
  if (hit) {
    const daGianh = await db
      .prepare(
        `UPDATE report_cache SET computing_until = ?
         WHERE cache_key = ? AND version_tag = ? AND (computing_until IS NULL OR computing_until < ?)`,
      )
      .bind(vnSau(KHOA_MS), key, hit.version_tag, nowVN())
      .run()
      .then((r) => r.meta.changes > 0)
      .catch(() => true);
    if (!daGianh) {
      const hetHan = Date.now() + CHO_TOI_DA_MS;
      while (Date.now() < hetHan) {
        await new Promise((r) => setTimeout(r, BUOC_CHO_MS));
        const moi = await db.prepare("SELECT version_tag FROM report_cache WHERE cache_key = ?").bind(key).first<{ version_tag: string }>();
        if (moi?.version_tag === tag) {
          const p = await db.prepare("SELECT payload FROM report_cache WHERE cache_key = ? AND version_tag = ?").bind(key, tag).first<{ payload: string }>();
          if (p) {
            try {
              return JSON.parse(await gunzipB64(p.payload)) as T;
            } catch {
              break;
            }
          }
        }
        if (!moi || moi.version_tag !== hit.version_tag) break; // da sang tag khac (version doi tiep) -> tu tinh
      }
    }
  }

  let value: T;
  try {
    value = await compute();
  } catch (e) {
    await db.prepare("UPDATE report_cache SET computing_until = NULL WHERE cache_key = ?").bind(key).run().catch(() => {});
    throw e;
  }
  try {
    const payload = await gzipB64(JSON.stringify(value));
    await db
      .prepare(
        `INSERT INTO report_cache (cache_key, version_tag, payload, updated_at, computing_until) VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(cache_key) DO UPDATE SET version_tag = excluded.version_tag, payload = excluded.payload, updated_at = excluded.updated_at,
           computing_until = NULL`,
      )
      .bind(key, tag, payload, nowVN())
      .run();
  } catch {
    /* payload qua lon du da nen -> bo qua cache, van tra ket qua */
    await db.prepare("UPDATE report_cache SET computing_until = NULL WHERE cache_key = ?").bind(key).run().catch(() => {});
  }
  return value;
}

const KHOA_MS = 30_000; // khoa tu het han neu request tinh bi huy giua chung
const CHO_TOI_DA_MS = 10_000;
const BUOC_CHO_MS = 500;
const vnSau = (ms: number) => new Date(Date.now() + 7 * 3600_000 + ms).toISOString().slice(0, 19).replace("T", " ");
