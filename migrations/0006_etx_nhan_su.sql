-- Danh ba "ETX nhan su" dong bo 1 chieu tu he ETX (giong ../linh-kien-app migration 0029).
-- Lien ket voi users qua Gmail: gmail_gan_tay (Admin sua khi ETX sai / nhan su doi Gmail) uu tien hon gmail tu ETX.
CREATE TABLE etx_nhan_su (
  ma_nhan_su          TEXT PRIMARY KEY,
  ho_ten              TEXT NOT NULL DEFAULT '',
  chuc_danh           TEXT,
  gmail               TEXT,
  gmail_gan_tay       TEXT,
  trang_thai_lam_viec TEXT NOT NULL DEFAULT 'on',
  created_at          TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_at          TEXT
);
CREATE INDEX idx_etx_gmail_gan_tay ON etx_nhan_su(gmail_gan_tay);

CREATE TABLE etx_sync_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  last_run_at   TEXT,
  last_status   TEXT,
  changed_count INTEGER NOT NULL DEFAULT 0,
  linked_count  INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT
);
INSERT INTO etx_sync_state (id) VALUES (1);

ALTER TABLE users ADD COLUMN ma_nhan_su TEXT;
ALTER TABLE users ADD COLUMN chuc_danh TEXT;
