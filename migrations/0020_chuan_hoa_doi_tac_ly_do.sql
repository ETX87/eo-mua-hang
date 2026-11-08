-- 0020 (2026-11-08) - SINH BOI scripts/gen_0020_chuan_hoa.py, khong sua tay.
-- 1) user_alias: nhieu Gmail dang nhap cho 1 tai khoan (email phu -> users.email chinh).
CREATE TABLE user_alias (
  email      TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email),
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  created_by TEXT
);
CREATE INDEX idx_user_alias_user ON user_alias(user_email);

-- 2) Danh muc chuan Doi tac / Ly do PS + bi danh (khoa = chu thuong khong dau, bo ky tu khac chu/so - lib/chuanHoa.ts khoa()).
CREATE TABLE dm_chuan (
  loai   TEXT NOT NULL CHECK (loai IN ('DOI_TAC','LY_DO')),
  ten    TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  thu_tu INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (loai, ten)
);
CREATE TABLE dm_bi_danh (
  loai       TEXT NOT NULL CHECK (loai IN ('DOI_TAC','LY_DO')),
  khoa       TEXT NOT NULL,
  ten_chuan  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
  PRIMARY KEY (loai, khoa)
);
INSERT INTO dm_chuan (loai, ten, thu_tu) VALUES
  ('DOI_TAC', 'Karofi', 0),
  ('DOI_TAC', 'Livotec', 1),
  ('DOI_TAC', 'Korihome', 2),
  ('DOI_TAC', 'Mishio', 3),
  ('DOI_TAC', 'Cuckoo', 4),
  ('DOI_TAC', 'Sanaky', 5),
  ('DOI_TAC', 'Media Mart', 6),
  ('DOI_TAC', 'Gcool', 7),
  ('DOI_TAC', 'Bách Tường Phát', 8),
  ('DOI_TAC', 'Kangaroo', 9),
  ('DOI_TAC', 'Purastar', 10),
  ('DOI_TAC', 'Lọc tổng', 11),
  ('DOI_TAC', 'LKDH', 12),
  ('DOI_TAC', 'NCC', 13),
  ('LY_DO', 'Ký gửi', 0),
  ('LY_DO', 'Đặt lần đầu', 1),
  ('LY_DO', 'Kế hoạch tháng', 2),
  ('LY_DO', 'Phát sinh', 3);
INSERT INTO dm_bi_danh (loai, khoa, ten_chuan) VALUES
  ('DOI_TAC', 'bachtuongphat', 'Bách Tường Phát'),
  ('DOI_TAC', 'cuckoo', 'Cuckoo'),
  ('DOI_TAC', 'dieuhoalivotec', 'Livotec'),
  ('DOI_TAC', 'gcool', 'Gcool'),
  ('DOI_TAC', 'giadunglivotec', 'Livotec'),
  ('DOI_TAC', 'hutmuilivotec', 'Livotec'),
  ('DOI_TAC', 'kangaroo', 'Kangaroo'),
  ('DOI_TAC', 'karo', 'Karofi'),
  ('DOI_TAC', 'karofi', 'Karofi'),
  ('DOI_TAC', 'korihome', 'Korihome'),
  ('DOI_TAC', 'krf', 'Karofi'),
  ('DOI_TAC', 'krh', 'Korihome'),
  ('DOI_TAC', 'livotec', 'Livotec'),
  ('DOI_TAC', 'lkdh', 'LKDH'),
  ('DOI_TAC', 'loctong', 'Lọc tổng'),
  ('DOI_TAC', 'lvt', 'Livotec'),
  ('DOI_TAC', 'media', 'Media Mart'),
  ('DOI_TAC', 'mediamart', 'Media Mart'),
  ('DOI_TAC', 'mishio', 'Mishio'),
  ('DOI_TAC', 'mm', 'Media Mart'),
  ('DOI_TAC', 'ncc', 'NCC'),
  ('DOI_TAC', 'purastar', 'Purastar'),
  ('DOI_TAC', 'sanaky', 'Sanaky'),
  ('DOI_TAC', 'snk', 'Sanaky'),
  ('LY_DO', 'canbaohethang', 'Phát sinh'),
  ('LY_DO', 'canhbaohethang', 'Phát sinh'),
  ('LY_DO', 'datlandau', 'Đặt lần đầu'),
  ('LY_DO', 'doncanhbaohethang', 'Phát sinh'),
  ('LY_DO', 'dondathangkehoachthang', 'Kế hoạch tháng'),
  ('LY_DO', 'dondatlandau', 'Đặt lần đầu'),
  ('LY_DO', 'donhangkygui', 'Ký gửi'),
  ('LY_DO', 'donkehoachthang', 'Kế hoạch tháng'),
  ('LY_DO', 'donphatsinh', 'Phát sinh'),
  ('LY_DO', 'donphatsinhkhongdutru', 'Phát sinh'),
  ('LY_DO', 'hangkygui', 'Ký gửi'),
  ('LY_DO', 'kehoachthang', 'Kế hoạch tháng'),
  ('LY_DO', 'khthang', 'Kế hoạch tháng'),
  ('LY_DO', 'kygui', 'Ký gửi'),
  ('LY_DO', 'landau', 'Đặt lần đầu'),
  ('LY_DO', 'phatsinh', 'Phát sinh'),
  ('LY_DO', 'phatsinhkhongdutru', 'Phát sinh');

-- 3) Cot giu ban goc. Chuyen du lieu cu: file RIENG scripts/_data/0020_chuyen_du_lieu.sql (chua gia tri that - KHONG dua len git,
--    repo cong khai), chay 1 lan sau migration: npx wrangler d1 execute eo-mua-hang-db --remote --file scripts/_data/0020_chuyen_du_lieu.sql
ALTER TABLE eo_item ADD COLUMN supplier_goc TEXT;
ALTER TABLE eo_item ADD COLUMN reason_goc TEXT;

-- 4) R1 24h cho nhom Karofi / Livotec / Korihome: chi dong bat dau theo doi tu ngay nay (dong cu giu 48h, khong ghi loi hoi to).
INSERT INTO app_settings (key, value) VALUES ('r1_24h_tu', '2026-11-08') ON CONFLICT(key) DO NOTHING;

-- bao cao / cache theo doi tinh lai
UPDATE data_versions SET version = version + 1 WHERE domain IN ('eo', 'settings', 'users');
