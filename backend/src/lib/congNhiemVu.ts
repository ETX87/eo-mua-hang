/**
 * CONG NHIEM VU eOffice (v0.116, 2026-11-23) - day viec PO dang cho duyet len App Nhiem vu cong ty
 * (https://etx-eoffice.web.app/task, tab Lien ket, khoi "Mua hang") + thong bao day ve dien thoai.
 * Dac ta cong: ../../../api-cong-nhiem-vu.md (thu muc goc du an). Ma app "mua-hang", khoa = secret TASK_FEED_KEY.
 *
 * Luon gui ANH CHUP DU (toanBo: true): moi lan gom TOAN BO viec cho duyet cua MOI nguoi - nguoi vang mat
 * = cong xoa het viec cua ho, nen PO duyet xong / tu choi / rut lai tu bien mat o lan gui ke tiep.
 * Dung DUNG dieu kien hang cho cua man "Cho toi duyet" (routes/approvals.ts /count):
 *   - phieu REVIEW / FINAL dang PENDING o lan trinh dang mo  -> nguoi tham dinh / nguoi duyet mua
 *   - dong them sau ban hanh cho duyet                      -> nguoi duyet mua cua EO (gop 1 viec / EO + count)
 * Khi nao gui: (1) sau request API khi version eo/users doi (waitUntil, nhu maybeSyncDvbh), (2) cron moi gio
 * (lam moi "khan" theo gio), (3) nut "Day len App Nhiem vu" o man Don PO.
 */
import type { Env } from "../types";
import { versionTag } from "./dataVersions";
import { nowVN } from "./vnTime";
import { congGioLV } from "./gioLamViec";
import { docSla } from "./giaiDoan";
import { sha256Hex } from "./sha";
import { CHO_DUYET_SAU_BH_SQL } from "./choDuyetSauBh";

const CONG = "https://asia-southeast1-etx-nhan-su.cloudfunctions.net/taskFeedNhan";
const APP = "mua-hang";
const KHOA_STATE = "cong_nv_state";
const KHOA_LOCK = "cong_nv_lock";
const LOCK_MS = 2 * 60 * 1000;

export interface ViecCong { id: string; title: string; tag?: string; link?: string; han?: string; khan?: boolean; count?: number; gd?: boolean }
type Loai = "REVIEW" | "FINAL" | "POST";
export interface KetQuaCong {
  ok: boolean; nguoi: number; viec: number; theo_loai: Record<Loai, number>;
  viecMoi?: number; boChoGD?: number; khongRo?: unknown[]; loi?: string; luc: string;
}

export const congNvBat = (env: Env) => !!env.TASK_FEED_KEY;

const boDau = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();
const laGiamDoc = (chucDanh: string | null | undefined) => !!chucDanh && boDau(chucDanh).includes("giam doc");
const cat = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Gom anh chup du: Map khoa nguoi -> {nguoi, items}. Khoa nguoi = Ma NS (cong tu tra email eOffice), khong co thi email. */
export async function gomViecChoDuyet(env: Env): Promise<{ ds: { nguoi: { maNS: string } | { email: string }; items: ViecCong[] }[]; theo_loai: Record<Loai, number> }> {
  const db = env.DB;
  const [phieu, themSau, sla] = await Promise.all([
    db.prepare(
      `SELECT a.step_type, LOWER(a.approver_email) email, a.assigned_at, s.id sub_id, e.id eo_id, e.eo_code, e.tieu_de,
              u.ma_nhan_su, u.chuc_danh
       FROM eo_approval a
       JOIN eo_submission s ON s.id = a.submission_id
       JOIN eo e ON e.id = s.eo_id
       LEFT JOIN users u ON u.email = a.approver_email
       WHERE a.status = 'PENDING' AND s.status = 'PENDING'`,
    ).all<{ step_type: "REVIEW" | "FINAL"; email: string; assigned_at: string; sub_id: number; eo_id: number; eo_code: string; tieu_de: string | null; ma_nhan_su: string | null; chuc_danh: string | null }>(),
    db.prepare(
      `SELECT e.id eo_id, e.eo_code, e.approval_code, e.tieu_de, LOWER(e.final_approver_email) email, COUNT(*) n, MIN(i.created_at) tu,
              u.ma_nhan_su
       FROM eo_item i
       JOIN eo e ON e.id = i.eo_id
       LEFT JOIN users u ON u.email = e.final_approver_email
       WHERE ${CHO_DUYET_SAU_BH_SQL("i")} AND e.trang_thai = 'ISSUED' AND e.final_approver_email IS NOT NULL
       GROUP BY e.id`,
    ).all<{ eo_id: number; eo_code: string; approval_code: string | null; tieu_de: string | null; email: string; n: number; tu: string; ma_nhan_su: string | null }>(),
    docSla(env),
  ]);

  const now = nowVN();
  const base = (env.FRONTEND_URL || "https://muahang.dichvu3t.workers.dev").replace(/\/+$/, "");
  const theo_loai: Record<Loai, number> = { REVIEW: 0, FINAL: 0, POST: 0 };
  const map = new Map<string, { nguoi: { maNS: string } | { email: string }; items: ViecCong[] }>();
  const them = (ma: string | null, email: string, v: ViecCong) => {
    const k = ma ? `ns:${ma}` : `em:${email}`;
    if (!map.has(k)) map.set(k, { nguoi: ma ? { maNS: ma } : { email }, items: [] });
    const ds = map.get(k)!.items;
    if (!ds.some((x) => x.id === v.id)) ds.push(v);
  };
  const hanTu = (tu: string, gio: number) => { const h = congGioLV(tu, gio); return { han: h.slice(0, 10), khan: now >= h }; };

  for (const p of phieu.results) {
    const final = p.step_type === "FINAL";
    const { han, khan } = hanTu(p.assigned_at, final ? sla.G3 : sla.G2);
    theo_loai[p.step_type]++;
    them(p.ma_nhan_su, p.email, {
      // id gan lan trinh: trinh lai sau khi sua = viec moi = bao lai
      id: `EO${p.eo_id}-L${p.sub_id}-${final ? "DUYET" : "THAMDINH"}`,
      tag: final ? "Duyệt mua PO" : "Thẩm định PO",
      title: cat(`${p.eo_code} · ${p.tieu_de || "PO mua hàng"} · chờ ${final ? "duyệt mua" : "thẩm định"}`, 200),
      link: `${base}/eo/${p.eo_id}`,
      han, khan,
      // duyet mua = Giam doc chinh tay quyet; tham dinh chi gd khi nguoi tham dinh la Giam doc (GD chi nhan dong gd/xem)
      gd: final || laGiamDoc(p.chuc_danh),
    });
  }
  for (const t of themSau.results) {
    const { han, khan } = hanTu(t.tu, sla.G3);
    theo_loai.POST++;
    them(t.ma_nhan_su, t.email, {
      id: `EO${t.eo_id}-THEMSAUBH`,
      tag: "Duyệt dòng thêm",
      title: cat(`${t.approval_code || t.eo_code} · ${t.n} dòng thêm sau ban hành chờ duyệt · ${t.tieu_de || ""}`.replace(/ · $/, ""), 200),
      link: `${base}/eo/${t.eo_id}`,
      han, khan, count: t.n, gd: true,
    });
  }
  // khan len dau, roi han som nhat (cong giu toi da 20 dong / nguoi, uu tien dong khan)
  for (const v of map.values()) v.items.sort((a, b) => Number(!!b.khan) - Number(!!a.khan) || (a.han ?? "").localeCompare(b.han ?? ""));
  return { ds: [...map.values()], theo_loai };
}

async function guiCong(env: Env, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let loi = "";
  for (let lan = 0; lan < 3; lan++) {
    const r = await fetch(CONG, {
      method: "POST",
      headers: { "X-Api-Key": env.TASK_FEED_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ app: APP, ...body }),
    });
    if (r.ok) return (await r.json()) as Record<string, unknown>;
    loi = `HTTP_${r.status}: ${(await r.text()).slice(0, 200)}`;
    if (r.status < 500) break; // 400/401: thu lai cung vo ich
    await new Promise((s) => setTimeout(s, 1000 * (lan + 1)));
  }
  throw new Error(loi);
}

/**
 * Gui anh chup du len cong. force = bo qua kiem tra version (nut bam, cron). Khoa 2 phut chong 2 lan gui chong nhau.
 * Tra null khi khong chay (chua cau hinh / khong doi / dang co lan khac chay).
 */
export async function dayCongNhiemVu(env: Env, opts: { force?: boolean } = {}): Promise<KetQuaCong | null> {
  if (!congNvBat(env)) return null;
  const db = env.DB;
  const tag = await versionTag(db, ["eo", "users"]);
  const now = nowVN();
  let cu: { tag?: string | null; hash?: string; ok?: boolean; luc?: string } = {};
  try { const st = await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(KHOA_STATE).first<{ value: string }>(); cu = st ? JSON.parse(st.value) : {}; } catch { /* state hong -> gui lai */ }
  if (!opts.force) {
    if (cu.tag === tag) return null;
    // lan truoc loi (vd 401 khoa sai) -> sau request chi thu lai moi 10 phut, khong dap cong moi request
    if (cu.ok === false && cu.luc && cu.luc > new Date(Date.now() + 7 * 3600e3 - 10 * 60e3).toISOString().slice(0, 19).replace("T", " ")) return null;
  }
  const het = new Date(Date.now() + 7 * 3600e3 + LOCK_MS).toISOString().slice(0, 19).replace("T", " ");
  const claim = await db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE app_settings.value < ?`,
  ).bind(KHOA_LOCK, het, now).run();
  if (!claim.meta.changes) return null;

  let kq: KetQuaCong;
  let tagLuu: string | null = tag;
  let hash = cu.hash;
  try {
    const { ds, theo_loai } = await gomViecChoDuyet(env);
    const nguoi = ds.map((d) => ({ ...d.nguoi, items: d.items.slice(0, 200) }));
    hash = await sha256Hex(JSON.stringify(nguoi));
    // version doi nhung hang cho duyet khong doi (sua ke hoach, AMIS...) -> khong goi cong
    if (!opts.force && cu.ok && hash === cu.hash) {
      await db.batch([
        db.prepare("UPDATE app_settings SET value = json_set(value, '$.tag', ?) WHERE key = ?").bind(tag, KHOA_STATE),
        db.prepare("UPDATE app_settings SET value = '' WHERE key = ?").bind(KHOA_LOCK),
      ]);
      return null;
    }
    const r = await guiCong(env, { toanBo: true, nguoi });
    kq = {
      ok: r.ok === true, nguoi: ds.length, viec: ds.reduce((s, d) => s + d.items.length, 0), theo_loai,
      viecMoi: r.viecMoi as number | undefined, boChoGD: r.boChoGD as number | undefined,
      khongRo: Array.isArray(r.khongRo) && r.khongRo.length ? r.khongRo : undefined, luc: nowVN(),
    };
  } catch (err) {
    kq = { ok: false, nguoi: 0, viec: 0, theo_loai: { REVIEW: 0, FINAL: 0, POST: 0 }, loi: (err instanceof Error ? err.message : String(err)).slice(0, 300), luc: nowVN() };
    tagLuu = null; // loi -> request ke tiep thu lai
    console.error("cong nhiem vu", kq.loi);
  }
  await db.batch([
    db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(KHOA_STATE, JSON.stringify({ tag: tagLuu, hash: kq.ok ? hash : null, ...kq })),
    db.prepare("UPDATE app_settings SET value = '' WHERE key = ?").bind(KHOA_LOCK),
  ]);
  return kq;
}

export async function trangThaiCong(env: Env): Promise<{ bat: boolean; lan_cuoi: (KetQuaCong & { tag?: string | null }) | null }> {
  const st = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(KHOA_STATE).first<{ value: string }>();
  let lan_cuoi = null;
  try { lan_cuoi = st ? JSON.parse(st.value) : null; } catch { /* bo qua */ }
  return { bat: congNvBat(env), lan_cuoi };
}
