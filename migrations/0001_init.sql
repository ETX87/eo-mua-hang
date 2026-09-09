-- ============================================================================
-- EO MUA HANG - schema khoi tao (Phase 1 -> Phase 3)
-- Nguon: ../TARGET_DATABASE.md . D1/SQLite. Gio luu = gio tuong Asia/Ho_Chi_Minh
-- (datetime('now','+7 hours')). Cot & comment khong dau; chuoi UI co dau o tang app.
-- users khoa chinh = email (dong bo quy uoc voi linh-kien-app / smarttrade base).
-- ============================================================================

-- ---------- ha tang dung chung ----------

CREATE TABLE id_counters (
  ten_bang         TEXT PRIMARY KEY,
  gia_tri_hien_tai INTEGER NOT NULL DEFAULT 0
);
INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES
  ('approval_code', 0),   -- 3TDO-NNNNNN cap khi ISSUED (tiep noi chuoi legacy - xem MIGRATION_PLAN)
  ('eo_code', 0);         -- EO-NNNNNN cho EO tao moi tren he

CREATE TABLE data_versions (
  domain  TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO data_versions (domain, version) VALUES
  ('eo', 0), ('amis', 0), ('users', 0), ('settings', 0);

-- ---------- users ----------

CREATE TABLE users (
  email             TEXT PRIMARY KEY,
  ho_ten            TEXT NOT NULL DEFAULT '',
  vai_tro           TEXT CHECK (vai_tro IN ('Admin','KH cung ung','Ke toan','Kho','Theo doi tien do','View')),
  la_nv_dat_hang    INTEGER NOT NULL DEFAULT 0,   -- tao EO
  la_nv_kho         INTEGER NOT NULL DEFAULT 0,   -- tao EO + cap nhat plan
  la_ke_toan        INTEGER NOT NULL DEFAULT 0,   -- import AMIS
  la_theo_doi_td    INTEGER NOT NULL DEFAULT 0,   -- cap nhat plan / ngay ve
  la_view           INTEGER NOT NULL DEFAULT 0,   -- chi doc
  khu_vuc_kho       TEXT,                          -- CSV ma kho (chi loc/uu tien, KHONG chan xem)
  trang_thai_duyet  TEXT NOT NULL DEFAULT 'Cho duyet'
                      CHECK (trang_thai_duyet IN ('Cho duyet','Da duyet','Tu choi')),
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  approved_at       TEXT,
  approved_by       TEXT REFERENCES users(email)
);
CREATE INDEX idx_users_active ON users(active);

-- ---------- eo ----------

CREATE TABLE eo (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_code               TEXT NOT NULL UNIQUE,       -- legacy 3TMH-/CPMH- ; moi = 'EO-' || seq
  approval_code         TEXT UNIQUE,                -- 3TDO-NNNNNN, cap khi ISSUED
  tieu_de               TEXT NOT NULL DEFAULT '',
  noi_dung              TEXT NOT NULL DEFAULT '',
  loai_hinh             TEXT,                       -- -> settings_eo_category.code (FK mem)
  phong_ban             TEXT,
  trang_thai            TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (trang_thai IN ('DRAFT','IN_REVIEW','WAITING_FINAL_APPROVAL',
                                                'REJECTED','ISSUED','CANCELLED')),
  current_submission_id INTEGER,                    -- REFERENCES eo_submission(id) (khai bao sau)
  final_approver_email  TEXT REFERENCES users(email),
  created_by            TEXT NOT NULL REFERENCES users(email),
  created_at            TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by            TEXT REFERENCES users(email),
  updated_at            TEXT,
  issued_by             TEXT REFERENCES users(email),
  issued_at             TEXT,
  cancelled_by          TEXT REFERENCES users(email),
  cancelled_at          TEXT,
  cancel_reason         TEXT,
  ghi_chu               TEXT,
  legacy_id             TEXT,                       -- 'Tao quy trinh moi'.ID tai lieu
  legacy_source         TEXT                        -- 'gsheet:Tao quy trinh moi' | 'orphan_synthetic'
);
CREATE INDEX idx_eo_trang_thai   ON eo(trang_thai);
CREATE INDEX idx_eo_approval_code ON eo(approval_code);
CREATE INDEX idx_eo_created_at    ON eo(created_at);
CREATE INDEX idx_eo_created_by    ON eo(created_by);
CREATE INDEX idx_eo_legacy_id     ON eo(legacy_id);

-- ---------- eo_submission ----------

CREATE TABLE eo_submission (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_id          INTEGER NOT NULL REFERENCES eo(id),
  version        INTEGER NOT NULL,
  skip_review    INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','APPROVED','REJECTED','REQUEST_UPDATE','SUPERSEDED','CANCELLED')),
  submitted_by   TEXT NOT NULL REFERENCES users(email),
  submitted_at   TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  closed_at      TEXT,
  note           TEXT,
  legacy_step_id TEXT,
  UNIQUE (eo_id, version)
);
CREATE INDEX idx_submission_eo ON eo_submission(eo_id);

-- ---------- eo_approval ----------

CREATE TABLE eo_approval (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id              INTEGER NOT NULL REFERENCES eo_submission(id),
  step_type                  TEXT NOT NULL CHECK (step_type IN ('REVIEW','FINAL')),
  step_no                    INTEGER NOT NULL DEFAULT 1,
  approver_email             TEXT NOT NULL REFERENCES users(email),
  status                     TEXT NOT NULL DEFAULT 'PENDING'
                               CHECK (status IN ('PENDING','APPROVED','REJECTED','REQUEST_UPDATE','WITHDRAWN','SKIPPED')),
  assigned_at                TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  action_at                  TEXT,
  comment                    TEXT,
  carried_from_submission_id INTEGER REFERENCES eo_submission(id),
  legacy_log_id              TEXT
);
CREATE INDEX idx_approval_submission ON eo_approval(submission_id);
CREATE INDEX idx_approval_user_pending ON eo_approval(approver_email) WHERE status = 'PENDING';

-- ---------- eo_item ----------

CREATE TABLE eo_item (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_id                  INTEGER NOT NULL REFERENCES eo(id),
  part_code              TEXT NOT NULL,
  part_name              TEXT NOT NULL DEFAULT '',
  warehouse              TEXT NOT NULL,
  supplier               TEXT,
  original_qty           REAL NOT NULL,
  current_qty            REAL NOT NULL,
  reason                 TEXT,
  crm_id                 TEXT,
  order_id               TEXT,
  ghi_chu                TEXT,
  line_status            TEXT NOT NULL DEFAULT 'ACTIVE'
                           CHECK (line_status IN ('ACTIVE','CANCELLED_LINE')),
  post_issue_status      TEXT CHECK (post_issue_status IN ('PENDING','APPROVED')),
  post_issue_approved_by TEXT REFERENCES users(email),
  post_issue_approved_at TEXT,
  created_by             TEXT NOT NULL REFERENCES users(email),
  created_at             TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  created_after_issue    INTEGER NOT NULL DEFAULT 0,
  updated_by             TEXT REFERENCES users(email),
  updated_at             TEXT,
  legacy_id              TEXT,                      -- 'DS DAT LK'.ID DAT LK
  legacy_approval_code   TEXT                       -- 3TE-/3TDO- ghi tren item cu
);
CREATE INDEX idx_eo_item_eo        ON eo_item(eo_id);
CREATE INDEX idx_eo_item_part      ON eo_item(part_code);
CREATE INDEX idx_eo_item_warehouse ON eo_item(warehouse);
CREATE INDEX idx_eo_item_legacy    ON eo_item(legacy_id);
CREATE INDEX idx_eo_item_matchkey  ON eo_item(warehouse, part_code);

-- ---------- item_plan ----------

CREATE TABLE item_plan (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_item_id             INTEGER NOT NULL REFERENCES eo_item(id),
  planned_date           TEXT NOT NULL,
  planned_qty            REAL NOT NULL,
  factory_committed_date TEXT,
  ghi_chu                TEXT,
  created_by             TEXT NOT NULL REFERENCES users(email),
  created_at             TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  updated_by             TEXT REFERENCES users(email),
  updated_at             TEXT,
  deleted_at             TEXT,
  deleted_by             TEXT REFERENCES users(email),
  legacy_id              TEXT
);
CREATE INDEX idx_item_plan_item ON item_plan(eo_item_id);
CREATE INDEX idx_item_plan_date ON item_plan(planned_date);
CREATE INDEX idx_item_plan_live ON item_plan(eo_item_id) WHERE deleted_at IS NULL;

-- ---------- eo_comment ----------

CREATE TABLE eo_comment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_id         INTEGER NOT NULL REFERENCES eo(id),
  submission_id INTEGER REFERENCES eo_submission(id),
  user_email    TEXT NOT NULL REFERENCES users(email),
  noi_dung      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  legacy_id     TEXT
);
CREATE INDEX idx_comment_eo ON eo_comment(eo_id);

-- ---------- eo_file ----------

CREATE TABLE eo_file (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_id         INTEGER NOT NULL REFERENCES eo(id),
  submission_id INTEGER REFERENCES eo_submission(id),
  file_name     TEXT NOT NULL,
  drive_file_id TEXT,
  drive_url     TEXT,
  file_type     TEXT,
  file_size     INTEGER,
  kind          TEXT DEFAULT 'ATTACHMENT' CHECK (kind IN ('ATTACHMENT','ISSUED_PDF')),
  legacy_path   TEXT,
  uploaded_by   TEXT REFERENCES users(email),
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  ghi_chu       TEXT,
  legacy_id     TEXT
);
CREATE INDEX idx_file_eo ON eo_file(eo_id);

-- ---------- AMIS (import MISA, append-only) ----------

CREATE TABLE amis_import_batch (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_filename TEXT,
  file_hash       TEXT,
  imported_by     TEXT NOT NULL REFERENCES users(email),
  imported_at     TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  row_count       INTEGER NOT NULL DEFAULT 0,
  inserted_count  INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,
  ghi_chu         TEXT
);

CREATE TABLE amis_receipt (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id    INTEGER NOT NULL REFERENCES amis_import_batch(id),
  warehouse_code     TEXT,
  warehouse_name     TEXT NOT NULL,
  part_code          TEXT NOT NULL,
  part_name          TEXT,
  posting_date       TEXT,
  doc_date           TEXT NOT NULL,
  doc_no             TEXT NOT NULL,
  uom                TEXT,
  description        TEXT,
  qty_in             REAL NOT NULL DEFAULT 0,
  qty_out            REAL NOT NULL DEFAULT 0,
  qty_balance        REAL,
  tk_kho             TEXT,
  tk_doi_ung         TEXT,
  approval_code_raw  TEXT NOT NULL,
  match_key          TEXT NOT NULL,   -- warehouse_name || ';' || part_code || ';' || approval_code_raw
  match_status       TEXT NOT NULL DEFAULT 'UNMATCHED'
                       CHECK (match_status IN ('MATCHED_EO','CODE_ONLY_NO_LINE','UNMATCHED')),
  matched_eo_item_id INTEGER REFERENCES eo_item(id),
  natural_key        TEXT NOT NULL UNIQUE,
  source_row         INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_amis_doc_date     ON amis_receipt(doc_date);
CREATE INDEX idx_amis_approval     ON amis_receipt(approval_code_raw);
CREATE INDEX idx_amis_matchkey     ON amis_receipt(match_key);
CREATE INDEX idx_amis_part_wh      ON amis_receipt(part_code, warehouse_name);
CREATE INDEX idx_amis_matched_item ON amis_receipt(matched_eo_item_id);

-- ---------- event_log (audit thong nhat, giu vinh vien) ----------

CREATE TABLE event_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT NOT NULL,
  entity_id     INTEGER NOT NULL,
  eo_id         INTEGER REFERENCES eo(id),
  event_type    TEXT NOT NULL,
  before_json   TEXT,
  after_json    TEXT,
  metadata_json TEXT,
  user_email    TEXT REFERENCES users(email),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_event_eo      ON event_log(eo_id);
CREATE INDEX idx_event_entity  ON event_log(entity_type, entity_id);
CREATE INDEX idx_event_created ON event_log(created_at);
CREATE INDEX idx_event_type    ON event_log(event_type);

-- ---------- settings ----------

CREATE TABLE settings_speed_bucket (
  min_days REAL NOT NULL PRIMARY KEY,
  label    TEXT NOT NULL
);
INSERT INTO settings_speed_bucket (min_days, label) VALUES
  (-999999, '1. Duoi 1 ngay'),
  (1,       '2. Tu 1 - 3 ngay'),
  (3,       '3. Tu 3 - 7 ngay'),
  (7,       '4. Tu 7 - 10 ngay'),
  (10,      '5. Tu 10 - 14 ngay'),
  (14,      '6. Tu 14 - 21 ngay'),
  (21,      '7. Tu 21 - 30 ngay'),
  (30,      '8. Tren 30 ngay');

CREATE TABLE settings_warehouse (
  ten_kho TEXT PRIMARY KEY,
  ma_kho  TEXT,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE settings_eo_category (
  code      TEXT PRIMARY KEY,
  ten       TEXT,
  cap2      TEXT,
  phong_ban TEXT
);

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- migration staging ----------

CREATE TABLE staging_legacy (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_sheet TEXT NOT NULL,
  legacy_id    TEXT,
  raw_json     TEXT NOT NULL,
  issue        TEXT,
  resolved     INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  loaded_at    TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_staging_source ON staging_legacy(source_sheet, resolved);

CREATE TABLE legacy_id_map (
  source_sheet TEXT NOT NULL,
  legacy_id    TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id    INTEGER NOT NULL,
  note         TEXT,
  PRIMARY KEY (source_sheet, legacy_id)
);
