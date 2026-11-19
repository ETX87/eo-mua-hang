import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { APP_VERSION } from "../version";

/**
 * CACHE PHIA TRINH DUYET cho React Query (v0.097, yeu cau 2026-11-19 "mo app load rat cham… neu du lieu khong doi thi han che load lai moi lan mo web").
 * - Luu cac query DOC (Tong quan, Dieu hanh, Ca CEO, Don PO, Vi pham, danh muc…) vao IndexedDB `eomua-cache` / `rq-v1` sau moi lan tai thanh cong.
 * - Mo app: nap lai (hydrate) TRUOC khi ve -> man hien ngay du lieu lan truoc; React Query thay du lieu da cu (staleTime) nen tu tai lai o NEN,
 *   co du lieu moi thi tu thay. Khong doi -> nguoi dung khong phai cho.
 * - Theo tai khoan: kem email; mo app bang tai khoan khac -> xoa sach (khong lo du lieu cua nguoi khac). Dang xuat / nut "Tải lại dữ liệu" -> xoa.
 * - Bo qua: query loi, du lieu qua lon (> 4MB JSON), cache cu hon 3 ngay. LK dat co cache rieng (lib/sdhCache).
 */
const DB = "eomua-cache", STORE = "kv", KEY = "rq-v1";
const TOI_DA_TUOI_MS = 3 * 86400_000;
const TOI_DA_KY_TU = 4_000_000;
/** query DOC duoc luu (phan tu dau cua queryKey) */
const LUU = new Set([
  "me", "users-ten", "dm-kho", "dm-loaihinh", "inbox-count", "notif-count", "notif-list", "dash-summary", "dash-quan-ly",
  "dieu-hanh", "ca-ceo", "eo-dem", "eo-list", "vi-pham", "vi-pham-ma-loi", "tl-danh-muc", "goi-y-dong",
]);

function moDb(): Promise<IDBDatabase> {
  return new Promise((ok, loi) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => loi(r.error);
  });
}
async function ghi(v: unknown) {
  try {
    const db = await moDb();
    await new Promise<void>((ok) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, KEY); t.oncomplete = () => ok(); t.onerror = () => ok(); });
  } catch { /* IndexedDB loi (che do rieng tu...) -> bo qua */ }
}
async function doc(): Promise<any> {
  try {
    const db = await moDb();
    return await new Promise((ok) => { const g = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY); g.onsuccess = () => ok(g.result ?? null); g.onerror = () => ok(null); });
  } catch { return null; }
}
export async function xoaCacheTrinhDuyet() { await ghi(null); }

/** Nap cache vao QueryClient truoc khi ve (toi da ~400ms - IndexedDB cham thi bo qua, ve binh thuong). */
export async function napCache(qc: QueryClient): Promise<void> {
  const v = await Promise.race([doc(), new Promise((ok) => setTimeout(() => ok(null), 400))]) as { luc: number; email: string; state: any; pb?: string } | null;
  // v0.099: cache cua PHIEN BAN KHAC (cau truc du lieu co the doi - bug man CEO trang v0.098) -> bo, tai moi
  if (!v?.state || v.pb !== APP_VERSION || Date.now() - v.luc > TOI_DA_TUOI_MS) return;
  try { hydrate(qc, v.state); } catch { /* cache hong */ }
}

/** Tu luu sau moi thay doi (gop 2 giay). Doi tai khoan (query "me" khac email da luu) -> xoa cache cu. */
export function batLuuCache(qc: QueryClient) {
  let hen: ReturnType<typeof setTimeout> | null = null;
  let emailDaLuu: string | null = null;
  doc().then((v) => { emailDaLuu = v?.email ?? null; });
  const luu = () => {
    const me = qc.getQueryData<{ email?: string }>(["me"]);
    if (!me?.email) return;
    if (emailDaLuu && emailDaLuu !== me.email) {
      // tai khoan khac -> bo moi du lieu dang hien cua tai khoan cu (tru "me"), luu lai tu dau
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && LUU.has(String(q.queryKey[0])) && q.state.dataUpdatedAt < Date.now() - 1000 });
    }
    const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === "success" && LUU.has(String(q.queryKey[0])) });
    const json = JSON.stringify(state);
    if (json.length > TOI_DA_KY_TU) {
      // qua lon: bo cac query nang nhat (dieu-hanh / vi-pham) truoc
      state.queries = state.queries.filter((x) => !["dieu-hanh", "vi-pham"].includes(String(x.queryKey[0])));
    }
    emailDaLuu = me.email;
    ghi({ luc: Date.now(), email: me.email, pb: APP_VERSION, state });
  };
  qc.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "success") return;
    if (hen) clearTimeout(hen);
    hen = setTimeout(luu, 2000);
  });
}
