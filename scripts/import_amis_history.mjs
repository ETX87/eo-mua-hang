// Nap lich su AMIS/MISA tu sheet "2.2. All" (report Google Sheet) vao D1 qua /api/amis/import.
// Nguon: scripts/amis_rows.json  (do scripts/extract_amis.py sinh tu bc_export.xlsx).
// Chay khi worker dang chay (dev hoac dev --remote):
//   B=http://localhost:8790/api node scripts/import_amis_history.mjs [path-to-json]
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const B = process.env.B || "http://localhost:8790/api";
const SRC = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), "amis_rows.json");

const rows = JSON.parse(readFileSync(SRC, "utf8"));
console.log("doc", rows.length, "dong tu 2.2 All");

const CHUNK = 1200;
let totIns = 0, totDup = 0, totSkip = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const part = rows.slice(i, i + CHUNK);
  const res = await fetch(B + "/amis/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: `2.2 All (report) lô ${i / CHUNK + 1}`, rows: part }),
  }).then((r) => r.json());
  totIns += res.inserted || 0;
  totDup += res.duplicate || 0;
  totSkip += res.skipped || 0;
  console.log(`lô ${i / CHUNK + 1}: +${res.inserted} trùng ${res.duplicate} bỏ ${res.skipped}`);
}
console.log(`TỔNG: nhập ${totIns} · trùng ${totDup} · bỏ ${totSkip}`);

// tinh lai match toan bo cho chac
const rc = await fetch(B + "/amis/recompute-match", { method: "POST" }).then((r) => r.json());
console.log("match:", JSON.stringify(rc.distribution));

const d = await fetch(B + "/dashboard/tien-do-tomtat").then((r) => r.json());
console.log("tien do:", JSON.stringify({ tong: d.tong_don_hang, hoan_thanh: d.hoan_thanh, dang_giao: d.dang_giao, cham: d.cham }));
