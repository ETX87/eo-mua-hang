import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireBrowser = createRequire(resolve(repo, "../huong-dan/_build/package.json"));
const puppeteer = requireBrowser("puppeteer-core");
const dist = resolve(repo, "frontend/dist");
import { seed, email } from "./demo-d1-seed.mjs";
const wrapper = `
import worker from "./backend/src/index.ts";
const logs = [];
export default { async fetch(req, env, ctx) {
  if (new URL(req.url).pathname === "/__demo_metrics") return Response.json(logs.splice(0));
  let stats = { reads: 0, writes: 0, queries: 0 };
  const record = (result) => {
    for (const r of [result].flat()) {
      stats.reads += r.meta.rows_read;
      stats.writes += r.meta.rows_written;
      stats.queries++;
    }
    return result;
  };
  const db = env.DB;
  const jobs = [];
  const start = Date.now();
  const response = await worker.fetch(req, { ...env, DB: {
    prepare(sql) {
      function wrap(stmt) {
        return {
          stmt,
          bind: (...args) => wrap(stmt.bind(...args)),
          run: async () => record(await stmt.run()),
          all: async () => record(await stmt.all()),
          first: async (column) => {
            const row = record(await stmt.all()).results[0];
            return row ? (column ? row[column] : row) : null;
          },
        };
      }
      return wrap(db.prepare(sql));
    },
    batch: async (stmts) => record(await db.batch(stmts.map(s => s.stmt))),
  }}, { waitUntil: (p) => jobs.push(p) });
  const foreground = { ...stats };
  const elapsed = Date.now() - start;
  await Promise.allSettled(jobs);
  logs.push({ path: new URL(req.url).pathname, status: response.status, ms: elapsed,
    ...stats, foreground });
  return response;
} };
`;

const { outputFiles } = await build({
  stdin: { contents: wrapper, resolveDir: repo, loader: "ts" },
  bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"],
});
const files = (await readdir(resolve(repo, "migrations"))).filter((f) => f.endsWith(".sql")).sort();
const migrations = await Promise.all(files.map((f) => readFile(resolve(repo, "migrations", f), "utf8")));
const browser = process.env.D1_DEMO_EVENTS_ONLY === "1" ? null : await puppeteer.launch({
  executablePath: process.env.D1_DEMO_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-background-timer-throttling"],
});

const screens = [
  ["Tổng quan", "/"],
  ["Đơn PO", "/eo"],
  ["Việc cần duyệt", "/eo?chip=cho_toi_duyet"],
  ["Tạo EO", "/eo/new"],
  ["Sửa EO", "/eo/1/edit"],
  ["LK đặt", "/don-hang"],
  ["Chi tiết EO", "/eo/2"],
  ["Quick view linh kiện", process.env.D1_DEMO_PART_FROM_EO === "1" ? "/eo/2" : "/don-hang", "part"],
  ["Quick view dòng", "/don-hang", "line"],
  ["Kế hoạch tuần", "/don-hang/ke-hoach-tuan"],
  ["Kế hoạch tuần theo PO", "/don-hang/ke-hoach-tuan?eo=2"],
  ["Báo cáo giai đoạn", "/don-hang?tab=bao-cao&bc=giai-doan"],
  ["Tiến độ tuần", "/don-hang?tab=bao-cao&bc=tien-do-tuan"],
  ["Lũy kế năm", "/don-hang?tab=bao-cao&bc=luy-ke-nam"],
  ["Điều hành", "/dieu-hanh"],
  ["Ca CEO", "/ca-ceo"],
  ["Vi phạm", "/vi-pham"],
  ["Bảng mã lỗi", "/ma-loi"],
  ["Nhập AMIS", "/amis"],
  ["AMIS chưa khớp", "/amis?tab=chua-khop"],
  ["Người dùng", "/admin/users"],
  ["ETX nhân sự", "/admin/users", "ETX nhân sự"],
  ["Vai trò", "/admin/roles"],
  ["Danh mục", "/admin/danh-muc"],
  ["Cấu hình", "/admin/cau-hinh"],
  ["Thông báo", "/", "notifications"],
];


const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json" };
const results = [];
const yearsToRun = process.argv.slice(2).map(Number);
const output = resolve(repo, "..", process.env.D1_DEMO_OUTPUT ?? "demo-d1-ket-qua.json");
const selectedScreens = process.env.D1_DEMO_SCREENS?.split("|");
const timeout = Number(process.env.D1_DEMO_TIMEOUT_MS ?? 45000);
try {
  for (const years of yearsToRun.length ? yearsToRun : [1, 3, 5]) {
    const mf = new Miniflare(convertV4MiniflareOptions({
      modules: true, script: outputFiles[0].text, compatibilityDate: "2026-07-16",
      compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"],
      bindings: { LOCAL_DEV_BYPASS_AUTH: "true", BOOTSTRAP_ADMIN_EMAIL: email },
    }));
    const db = await mf.getD1Database("DB");
    for (const sql of migrations) {
      const statements = sql.replace(/--[^\r\n]*/g, "").split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
        .map((s) => s.trim()).filter(Boolean);
      if (statements.length) await db.batch(statements.map((s) => db.prepare(s)));
    }
    await db.batch(seed(years).map((s) => db.prepare(s)));
    const counts = await db.prepare(`SELECT (SELECT count(*) FROM eo) eo, (SELECT count(*) FROM eo_item) items,
      (SELECT count(*) FROM amis_receipt) amis, (SELECT count(*) FROM item_plan) plans,
      (SELECT count(*) FROM tl_loi) violations`).first();
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname.startsWith("/api/")) {
          const r = await mf.dispatchFetch(url.href);
          response.writeHead(r.status, { "content-type": "application/json" });
          response.end(Buffer.from(await r.arrayBuffer()));
        } else {
          const file = resolve(dist, "." + decodeURIComponent(url.pathname));
          if (!file.startsWith(dist + sep) && file !== dist) {
            response.writeHead(404).end();
            return;
          }
          const asset = extname(file) ? file : resolve(dist, "index.html");
          const bytes = await readFile(asset);
          response.writeHead(200, { "content-type": mime[extname(asset)] ?? "application/octet-stream" }).end(bytes);
        }
      } catch (err) {
        response.writeHead(500).end(String(err));
      }
    });
    await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${server.address().port}`;
    const drain = async () => (await mf.dispatchFetch("http://local/__demo_metrics")).json();
    const snapshot = { years, counts, screens: [], events: [] };
    results.push(snapshot);
    console.log("Dataset", years, counts);
    try {
      // Measure the periodic evaluation independently, then keep its gate fresh during screen runs.
      await (await fetch(base + "/api/health")).text();
      snapshot.events.push({ name: "Đánh giá định kỳ lần đầu", requests: await drain() });
      if (process.env.D1_DEMO_WARM_SDH === "1") {
        await (await fetch(base + "/api/so-don-hang?eo_id=2")).arrayBuffer();
        snapshot.events.push({ name: "Dựng cache Sổ đơn hàng từ đầu", requests: await drain() });
      }
      for (const [name, path, action] of screens.filter(([name]) => browser && (!selectedScreens || selectedScreens.includes(name)))) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          for (const phase of ["first", "repeat"]) {
            const expected = {
              "LK đặt": "/api/so-don-hang",
              "Kế hoạch tuần theo PO": "/api/plans/lines",
              "Điều hành": "/api/dieu-hanh",
              "Ca CEO": "/api/ca-ceo",
              "Bảng mã lỗi": "/api/vi-pham/ma-loi",
              "Thông báo": "/api/dashboard/summary",
              "Đơn PO": "/api/eo",
            }[name];
            const required = expected ? ["/api/viec-can-lam", expected] : ["/api/viec-can-lam"];
            const waitForApis = required.map((endpoint) =>
              page.waitForResponse(async (response) => {
                if (new URL(response.url()).pathname !== endpoint) return false;
                await response.buffer();
                return true;
              }, { timeout }));
            await Promise.all([page.goto(base + path, { waitUntil: "domcontentloaded", timeout }), ...waitForApis]);
            await page.waitForNetworkIdle({ idleTime: 750, timeout });
            if (action === "part" || action === "line") {
              const selector = action === "part" ? 'button[title*="Shift + bấm"][title*="trong PO"]' : 'button[title^="Xem đơn hàng:"]';
              await page.waitForSelector(selector, { visible: true, timeout });
            }
            const initial = await drain();
            if (action) {
              const clicked = await page.evaluate((act) => {
                let element;
                if (act === "notifications") element = document.querySelector('button[title*="Thông báo"], button[aria-label*="Thông báo"]');
                else if (act === "part") {
                  element = document.querySelector('button[title*="Shift + bấm"][title*="trong PO"]');
                  if (element) {
                    element.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
                    return true;
                  }
                }
                else if (act === "line") element = document.querySelector('button[title^="Xem đơn hàng:"]');
                else element = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === act);
                element?.click();
                return !!element;
              }, action);
              if (!clicked) errors.push(`Không tìm thấy thao tác: ${action}`);
              await page.waitForNetworkIdle({ idleTime: 400, timeout });
            }
            const interaction = action ? await drain() : [];
            const text = await page.evaluate(() => (document.querySelector("main") ?? document.body).innerText.trim().split("\n").filter(Boolean).slice(0, 22));
            snapshot.screens.push({ name, path, phase, initial, interaction, errors: errors.splice(0), text });
            await writeFile(output, JSON.stringify(results, null, 2));
            console.log(years, phase, name, [...initial, ...interaction].reduce((n, r) => n + r.reads, 0));
          }
        } catch (err) {
          snapshot.screens.push({ name, error: String(err), requests: await drain() });
        } finally {
          await context.close();
        }
      }
      for (const [name, path] of [
        ["Quick view dòng qua API", "/api/theo-doi/dong/9"],
        ["Quick view linh kiện qua API", "/api/xem/linh-kien?ma=LK-0017"],
        ["Polling Việc cần làm", "/api/viec-can-lam"],
        ["Polling chuông", "/api/notifications/count"],
      ]) {
        const response = await fetch(base + path);
        const bytes = (await response.arrayBuffer()).byteLength;
        snapshot.events.push({ name, bytes, requests: await drain() });
      }
      await db.prepare("UPDATE data_versions SET version=version+1 WHERE domain='eo'").run();
      const response = await fetch(base + "/api/so-don-hang?eo_id=2");
      await response.arrayBuffer();
      snapshot.events.push({ name: "Mở một PO sau đổi version EO", requests: await drain() });
      if (process.env.D1_DEMO_EVENTS_ONLY === "1") {
        const size = await db.prepare("SELECT id FROM dong_cache_meta WHERE id=1").all();
        snapshot.localStorageBytes = size.meta.size_after ?? null;
        await db.prepare("UPDATE tl_state SET danh_gia_luc=datetime('now','+7 hours','-20 minutes') WHERE id=1").run();
        await (await fetch(base + "/api/health")).arrayBuffer();
        snapshot.events.push({ name: "Đánh giá định kỳ sau khi đã có dữ liệu", requests: await drain() });
        await db.prepare("UPDATE data_versions SET version=version+1 WHERE domain='eo'").run();
        await Promise.all(Array.from({ length: 8 }, async () => {
          const result = await fetch(base + "/api/so-don-hang?eo_id=2");
          await result.arrayBuffer();
        }));
        snapshot.events.push({ name: "8 người mở PO đồng thời sau đổi version", requests: await drain() });
      }
      if (process.env.D1_DEMO_MUTATION === "1") {
        const r = await mf.dispatchFetch("http://local/api/amis/recompute-match", { method: "POST" });
        await r.arrayBuffer();
        snapshot.events.push({ name: "Đối soát lại toàn bộ AMIS", requests: await drain() });
      }
    } finally {
      server.closeAllConnections();
      await new Promise((ok) => server.close(ok));
      await mf.dispose();
      await writeFile(output, JSON.stringify(results, null, 2));
    }
  }
} finally {
  await browser?.close();
}
