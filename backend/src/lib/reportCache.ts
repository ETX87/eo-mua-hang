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

  const value = await compute();
  try {
    const payload = await gzipB64(JSON.stringify(value));
    await db
      .prepare(
        `INSERT INTO report_cache (cache_key, version_tag, payload, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET version_tag = excluded.version_tag, payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .bind(key, tag, payload, nowVN())
      .run();
  } catch {
    /* payload qua lon du da nen -> bo qua cache, van tra ket qua */
  }
  return value;
}
