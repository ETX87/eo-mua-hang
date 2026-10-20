-- Day thong tin PO (dong EO) sang app DVBH (POST dvbh /api/partner/sync/po-dat-hang) - lib/dvbhSync.ts.
-- Khong cron: sau moi request, neu version eo/amis/settings hoac ngay VN doi -> tinh lai, chi gui dong
-- co hash khac lan gui truoc.
CREATE TABLE dvbh_sync_item (
  id_dat_lk  TEXT PRIMARY KEY,           -- legacy 'LK-...' hoac 'EOI-<eo_item.id>'
  row_hash   TEXT NOT NULL,              -- sha256 payload da gui thanh cong
  pushed_at  TEXT NOT NULL
);

CREATE TABLE dvbh_sync_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  version_tag   TEXT,                    -- tag eo/amis/settings da dong bo xong
  ngay          TEXT,                    -- ngay VN lan dong bo xong (canh bao / so ngay xu ly doi theo ngay)
  running_until TEXT,                    -- khoa chong chay song song
  last_run_at   TEXT,
  last_ok_at    TEXT,
  last_error    TEXT,
  last_pushed   INTEGER NOT NULL DEFAULT 0,
  last_full_at  TEXT
);
INSERT INTO dvbh_sync_state (id) VALUES (1);
