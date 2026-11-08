import { api } from "../api/client";

/**
 * Danh sach LK dat (GET /so-don-hang) TAI TANG DAN (2026-11-08, yeu cau #25/#27; backend lib/dongCache):
 *  - Trinh duyet giu toan bo dong + seq + epoch trong IndexedDB (con sau khi tai lai trang / mo lai).
 *  - Moi lan tai chi xin dong co seq > seq da co (dong co noi dung doi) + phan "bay gio" cua dong dang mo (gio giai doan, tre han,
 *    tinh trang theo doi) -> it du lieu truyen, server khong phai giai nen / gop lai toan he thong.
 *  - epoch khac (cache server dung lai tu dau) / loi IndexedDB -> tai het.
 */
type Row = Record<string, any>;
export interface DsSdh { giai_doan: any[]; sla: Record<string, number>; rows: Row[]; danh_gia_luc: string | null }
interface Luu { seq: number; epoch: string; rows: Row[] }

const DB = "eomua-cache", STORE = "kv", KEY = "sdh-v1";
function moDb(): Promise<IDBDatabase> {
  return new Promise((ok, loi) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => loi(r.error);
  });
}
async function doc(): Promise<Luu | null> {
  try {
    const db = await moDb();
    return await new Promise((ok) => {
      const g = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      g.onsuccess = () => ok((g.result as Luu) ?? null);
      g.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function ghi(v: Luu) {
  try {
    const db = await moDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).put(v, KEY);
  } catch { /* trinh duyet chan IndexedDB -> lan sau tai het */ }
}

// ban trong bo nho (cung tab) - tranh doc IndexedDB moi lan React Query goi lai
let nho: Luu | null = null;

export async function taiSoDonHang(): Promise<DsSdh> {
  const cu = nho ?? (await doc());
  const qs = cu ? `?seq=${cu.seq}&epoch=${encodeURIComponent(cu.epoch)}` : "?seq=0";
  const r = await api.get<DsSdh & { seq: number; epoch: string; reset: boolean; now: Row[] }>(`/so-don-hang${qs}`);
  let map: Map<number, Row>;
  if (r.reset || !cu) map = new Map();
  else map = new Map(cu.rows.map((x) => [x.item_id, x]));
  for (const x of r.rows) map.set(x.item_id, x);
  // phan "bay gio" cua dong dang mo khong doi noi dung (khong nam trong rows)
  for (const n of r.now ?? []) { const x = map.get(n.item_id); if (x) map.set(n.item_id, { ...x, ...n }); }
  const rows = [...map.values()].sort((a, b) => a.item_id - b.item_id);
  nho = { seq: r.seq, epoch: r.epoch, rows };
  void ghi(nho);
  return { giai_doan: r.giai_doan, sla: r.sla, rows, danh_gia_luc: r.danh_gia_luc };
}
