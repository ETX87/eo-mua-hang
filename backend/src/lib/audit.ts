import type { D1Database } from "@cloudflare/workers-types";
import { nowVN } from "./vnTime";

/** Ghi 1 dong event_log. Goi trong cung batch voi write nghiep vu khi co the. */
export function eventStmt(
  db: D1Database,
  e: {
    entity_type: string;
    entity_id: number;
    eo_id: number | null;
    event_type: string;
    user_email: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
    at?: string;
  },
) {
  return db
    .prepare(
      `INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, before_json, after_json, metadata_json, user_email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.entity_type,
      e.entity_id,
      e.eo_id,
      e.event_type,
      e.before != null ? JSON.stringify(e.before) : null,
      e.after != null ? JSON.stringify(e.after) : null,
      e.metadata != null ? JSON.stringify(e.metadata) : null,
      e.user_email,
      e.at ?? nowVN(),
    );
}
