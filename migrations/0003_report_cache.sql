-- Cache ket qua bao cao/dashboard (compute-on-miss theo version-tag) - tranh quet lai
-- eo_item/amis_receipt/event_log moi request. Xem backend/src/lib/reportCache.ts + KE_HOACH_TOI_UU.
CREATE TABLE report_cache (
  cache_key   TEXT PRIMARY KEY,   -- vd 'tien-do-don-hang:toan_bo'
  version_tag TEXT NOT NULL,      -- 'eo:12|amis:5|2026-09-09'
  payload     TEXT NOT NULL,      -- JSON ket qua
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
