import type { D1Database } from "@cloudflare/workers-types";
import { nowVN } from "./vnTime";

/** Ghi 1 dong notification (thong bao ca nhan cho nguoi tao EO). Goi trong cung batch voi write nghiep vu. */
export function notifyStmt(
  db: D1Database,
  n: { email: string; loai: string; noi_dung: string; eo_id: number; at?: string },
) {
  return db
    .prepare("INSERT INTO notification (email, loai, noi_dung, eo_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(n.email, n.loai, n.noi_dung, n.eo_id, n.at ?? nowVN());
}
