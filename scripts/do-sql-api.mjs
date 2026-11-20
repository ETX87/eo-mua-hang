// Do so dong D1 doc/ghi THEO TUNG CAU SQL cua 1 hoac nhieu API, tren fixture demo-d1 (1/3/5 nam). Chi chay local (Miniflare).
// node scripts/do-sql-api.mjs 5 /api/viec-can-lam /api/notifications/count
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { seed, email } from "./demo-d1-seed.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = `
import worker from "./backend/src/index.ts";
const logs = [];
export default { async fetch(req, env, ctx) {
  if (new URL(req.url).pathname === "/__sql") return Response.json(logs.splice(0));
  const rec = (sql, result) => { for (const r of [result].flat()) logs.push({ sql: sql.split(String.fromCharCode(10)).map((x) => x.trim()).join(" ").slice(0, 160), reads: r.meta.rows_read, writes: r.meta.rows_written }); return result; };
  const db = env.DB;
  const jobs = [];
  const res = await worker.fetch(req, { ...env, DB: {
    prepare(sql) {
      const wrap = (stmt) => ({ stmt,
        bind: (...a) => wrap(stmt.bind(...a)),
        run: async () => rec(sql, await stmt.run()),
        all: async () => rec(sql, await stmt.all()),
        raw: async (o) => { const r = await stmt.all(); rec(sql, r); return (await stmt.raw(o)); },
        first: async (col) => { const row = rec(sql, await stmt.all()).results[0]; return row ? (col ? row[col] : row) : null; } });
      return wrap(db.prepare(sql));
    },
    batch: async (stmts) => { const r = await db.batch(stmts.map((s) => s.stmt)); r.forEach((x) => logs.push({ sql: "(batch)", reads: x.meta.rows_read, writes: x.meta.rows_written })); return r; },
  } }, { waitUntil: (p) => jobs.push(p), passThroughOnException() {} });
  await Promise.allSettled(jobs);
  return res;
} };`;
const { outputFiles } = await build({ stdin: { contents: wrapper, resolveDir: repo, loader: "ts" }, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"] });
const [years, ...paths] = process.argv.slice(2);
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: outputFiles[0].text, compatibilityDate: "2026-07-16", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"],
  bindings: { LOCAL_DEV_BYPASS_AUTH: "true", BOOTSTRAP_ADMIN_EMAIL: email, DOC_API_KEY: "demo-doc-key" },
}));
try {
  const db = await mf.getD1Database("DB");
  for (const f of (await readdir(resolve(repo, "migrations"))).filter((f) => f.endsWith(".sql")).sort()) {
    const st = (await readFile(resolve(repo, "migrations", f), "utf8")).replace(/--[^\r\n]*/g, "").split(/;(?=(?:[^']*'[^']*')*[^']*$)/).map((s) => s.trim()).filter(Boolean);
    if (st.length) await db.batch(st.map((s) => db.prepare(s)));
  }
  await db.batch(seed(Number(years || 5)).map((s) => db.prepare(s)));
  // D1_SQL_TRUOC: cau SQL them du lieu thu (noi ";;") chay sau seed
  for (const q of (process.env.D1_SQL_TRUOC ?? "").split(";;").map((x) => x.trim()).filter(Boolean)) await db.prepare(q).run();
  await (await mf.dispatchFetch("http://local/api/health")).text(); // danh gia lan dau
  await (await mf.dispatchFetch("http://local/__sql")).text();
  for (const p of paths) {
    for (const lan of [1, 2]) {
      const r = await mf.dispatchFetch("http://local" + p, { headers: { "X-API-Key": "demo-doc-key" } });
      if (process.env.D1_IN_KQ === "1" && lan === 1) console.log((await r.clone().text()).slice(0, 3000));
      await r.arrayBuffer();
      const sql = await (await mf.dispatchFetch("http://local/__sql")).json();
      console.log(`\n== ${p} lan ${lan} (HTTP ${r.status}) tong doc ${sql.reduce((s, x) => s + x.reads, 0)} ghi ${sql.reduce((s, x) => s + x.writes, 0)}`);
      for (const x of sql.sort((a, b) => b.reads - a.reads)) if (x.reads > 50 || x.writes) console.log(String(x.reads).padStart(7), String(x.writes).padStart(5), x.sql);
    }
  }
} finally { await mf.dispose(); }
