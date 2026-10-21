-- ============================================================================
-- "Theo doi linh kien dat" - kiem soat ngay du kien hang ve tung dong EO (lib/theoDoi.ts, routes/theoDoi.ts).
-- Quy tac (chot 2026-10-21):
--  R1  EO ban hanh -> trong 24h lam viec (bo Chu nhat) phai co ngay du kien, khong co -> loi
--  R3  Thu 2 / thu 4: dong chua co ngay du kien phai duoc push doi tac (tao file push chuan) trong ngay, khong -> loi
--  R4  Qua ngay du kien ma chua du hang -> trong 24h lam viec phai nhap ngay du kien moi, khong -> loi
--  Moi loi phai giai trinh: Ai (tl_danh_muc AI) + Loi gi (tl_danh_muc LOI) + noi dung (+ anh bang chung voi R1/R4)
--  Cap CEO: lui ngay du kien >= 3 lan | ngay du kien - ngay dat >= 30 ngay ma chua du | >= 3 loi
-- Chi ap cho EO ban hanh tu app_settings 'theo_doi_ap_dung_tu' (dong cu khong bi phat hoi to).
-- ============================================================================

CREATE TABLE tl_danh_muc (
  loai     TEXT NOT NULL CHECK (loai IN ('AI', 'LOI')),
  ma       TEXT NOT NULL,
  ten      TEXT NOT NULL,
  thu_tu   INTEGER NOT NULL DEFAULT 0,
  active   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (loai, ma)
);
INSERT INTO tl_danh_muc (loai, ma, ten, thu_tu) VALUES
  ('AI', 'NGUOI_DAT', 'Người đặt hàng', 1),
  ('AI', 'DOI_TAC', 'Đối tác / NCC', 2),
  ('AI', 'KHO', 'Kho', 3),
  ('AI', 'KE_TOAN', 'Kế toán', 4),
  ('AI', 'NGUOI_DUYET', 'Người duyệt', 5),
  ('AI', 'KHAC', 'Khác', 9),
  ('LOI', 'KHONG_NDK_24H', 'Không cập nhật ngày dự kiến trong 24h', 1),
  ('LOI', 'KHONG_NDK_QUA_HAN', 'Không cập nhật ngày dự kiến mới khi quá hạn', 2),
  ('LOI', 'KHONG_PUSH', 'Không push đối tác (thứ 2 / thứ 4)', 3),
  ('LOI', 'NCC_KHONG_PHAN_HOI', 'NCC không phản hồi', 4),
  ('LOI', 'NCC_BAO_TRE', 'NCC báo trễ', 5),
  ('LOI', 'NCC_HET_HANG', 'NCC hết hàng', 6),
  ('LOI', 'DAT_SAI', 'Đặt sai mã / số lượng', 7),
  ('LOI', 'CHAM_DUYET', 'Chậm duyệt', 8),
  ('LOI', 'KHAC', 'Khác', 9);

-- Loi: he thong tu ghi (R1/R3/R4, khoa = idempotent) hoac nguoi dung ghi tay khi giai trinh (quy_tac 'TAY').
CREATE TABLE tl_loi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_item_id    INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id         INTEGER NOT NULL REFERENCES eo(id),
  quy_tac       TEXT NOT NULL CHECK (quy_tac IN ('R1', 'R3', 'R4', 'TAY')),
  khoa          TEXT NOT NULL UNIQUE,          -- R1:<item> | R3:<item>:<ngay> | R4:<item>:<ngay du kien> | TAY:<item>:<id gt>
  han           TEXT,                          -- thoi diem het han (gio VN)
  ngay_tham_chieu TEXT,                        -- R3: ngay thu 2/4; R4: ngay du kien bi qua
  ai_ma         TEXT,
  ai_email      TEXT,
  loi_ma        TEXT,
  trang_thai    TEXT NOT NULL DEFAULT 'CHO_GIAI_TRINH' CHECK (trang_thai IN ('CHO_GIAI_TRINH', 'DA_GIAI_TRINH')),
  giai_trinh_id INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_tl_loi_item ON tl_loi(eo_item_id);
CREATE INDEX idx_tl_loi_mo ON tl_loi(trang_thai) WHERE trang_thai = 'CHO_GIAI_TRINH';

CREATE TABLE tl_giai_trinh (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_item_id  INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id       INTEGER NOT NULL REFERENCES eo(id),
  loi_id      INTEGER REFERENCES tl_loi(id),
  ai_ma       TEXT NOT NULL,
  ai_email    TEXT,
  loi_ma      TEXT NOT NULL,
  noi_dung    TEXT NOT NULL,
  hinh_anh    TEXT,                            -- JSON [{name, drive_file_id, url}]
  created_by  TEXT NOT NULL REFERENCES users(email),
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_tl_gt_item ON tl_giai_trinh(eo_item_id);

-- Push doi tac: 1 lan tao file chuan = 1 dot (ma_push in trong tieu de mail + ten file de app theo-doi-mua-hang bat).
CREATE TABLE tl_push (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_push     TEXT NOT NULL UNIQUE,            -- PUSH-YYMMDD-NNNN
  doi_tac     TEXT,
  so_dong     INTEGER NOT NULL DEFAULT 0,
  tieu_de     TEXT,
  ten_file    TEXT,
  trang_thai  TEXT NOT NULL DEFAULT 'DA_TAO' CHECK (trang_thai IN ('DA_TAO', 'DA_GUI', 'DA_PHAN_HOI')),
  created_by  TEXT NOT NULL REFERENCES users(email),
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE TABLE tl_push_item (
  push_id     INTEGER NOT NULL REFERENCES tl_push(id),
  eo_item_id  INTEGER NOT NULL REFERENCES eo_item(id),
  ngay        TEXT NOT NULL,                   -- ngay VN tao push (YYYY-MM-DD)
  PRIMARY KEY (push_id, eo_item_id)
);
CREATE INDEX idx_tl_push_item ON tl_push_item(eo_item_id, ngay);

-- Luong mail dong bo tu app "theo-doi-mua-hang" (POST /api/partner/mail-events).
CREATE TABLE tl_mail (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id      TEXT NOT NULL UNIQUE,            -- id mail ben app kia (chong trung)
  ma_push     TEXT,
  eo_item_id  INTEGER REFERENCES eo_item(id),
  huong       TEXT NOT NULL CHECK (huong IN ('GUI', 'NHAN')),
  doi_tac     TEXT,
  tu          TEXT,
  den         TEXT,
  tieu_de     TEXT,
  tom_tat     TEXT,
  thoi_gian   TEXT,
  payload     TEXT,
  synced_at   TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_tl_mail_push ON tl_mail(ma_push);
CREATE INDEX idx_tl_mail_item ON tl_mail(eo_item_id);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('theo_doi_ap_dung_tu', '2026-10-21');
INSERT OR IGNORE INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('tl_push', 0);
INSERT OR IGNORE INTO data_versions (domain, version) VALUES ('theo_doi', 0);

-- lan danh gia quy tac gan nhat (lib/theoDoi.ts danhGiaQuyTac - chay toi da 10 phut/lan sau request)
CREATE TABLE tl_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  danh_gia_luc  TEXT,
  running_until TEXT,
  so_loi_moi    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO tl_state (id) VALUES (1);
