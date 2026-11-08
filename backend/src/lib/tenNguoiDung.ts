import { cachedReport } from "./reportCache";
import { EFFECTIVE_GMAIL_SQL } from "./etxNhanSu";

/**
 * Ten hien thi cua moi Gmail trong he thong (2026-11-08): UU TIEN ho ten tren ETX nhan su, khong co moi hien Gmail
 * (FE lib/format ten() tu cat phan truoc @). Gom:
 *  - tai khoan da lien ket ETX (users.ma_nhan_su) -> users.ho_ten (dong bo tu ETX);
 *  - tai khoan chua lien ket nhung Gmail chinh / Gmail phu (user_alias) trung Gmail hieu luc cua 1 nhan su ETX -> ten ETX;
 *  - Gmail phu -> ten cua tai khoan chinh;
 *  - Gmail ETX khong co tai khoan (vd nguoi tao don tren Sheet cu) -> ten ETX.
 * Cache theo version 'users' (dong bo ETX, gan Gmail, them Gmail phu deu bump).
 */
export async function layTenNguoiDung(db: D1Database): Promise<Record<string, string>> {
  return cachedReport(db, "users:ten-hien-thi:v1", ["users"], async () => {
    const [u, e, a] = await Promise.all([
      db.prepare("SELECT LOWER(email) email, ho_ten, ma_nhan_su FROM users").all<{ email: string; ho_ten: string; ma_nhan_su: string | null }>(),
      db.prepare(
        `SELECT ${EFFECTIVE_GMAIL_SQL} g, e.ho_ten FROM etx_nhan_su e WHERE ${EFFECTIVE_GMAIL_SQL} IS NOT NULL AND TRIM(e.ho_ten) <> ''
         ORDER BY (e.gmail_gan_tay IS NOT NULL), (e.trang_thai_lam_viec = 'on')`,
      ).all<{ g: string; ho_ten: string }>(),
      db.prepare("SELECT LOWER(email) email, LOWER(user_email) user_email FROM user_alias").all<{ email: string; user_email: string }>(),
    ]);
    // ORDER BY tang dan -> dong uu tien (gan tay, dang lam) ghi de sau cung
    const etx = new Map<string, string>();
    for (const r of e.results) etx.set(r.g, r.ho_ten.trim());
    const phu = new Map<string, string[]>();
    for (const r of a.results) phu.set(r.user_email, [...(phu.get(r.user_email) ?? []), r.email]);
    const out: Record<string, string> = {};
    const tenUser = new Map<string, string>();
    for (const r of u.results) {
      const t = (r.ma_nhan_su && r.ho_ten?.trim() && !r.ho_ten.includes("@") ? r.ho_ten.trim() : null)
        ?? etx.get(r.email) ?? (phu.get(r.email) ?? []).map((x) => etx.get(x)).find(Boolean);
      if (t) { tenUser.set(r.email, t); out[r.email] = t; }
    }
    for (const r of a.results) { const t = tenUser.get(r.user_email) ?? etx.get(r.email); if (t) out[r.email] = t; }
    for (const [g, t] of etx) if (!out[g]) out[g] = t;
    return out;
  });
}

/** Gmail dang nhap -> email tai khoan chinh (Gmail phu trong user_alias), khong phai Gmail phu -> chinh no. */
export async function emailChinh(db: D1Database, email: string): Promise<string> {
  const r = await db.prepare("SELECT user_email FROM user_alias WHERE email = ?").bind(email.toLowerCase()).first<{ user_email: string }>();
  return r?.user_email ?? email;
}
