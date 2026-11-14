-- 0024 (2026-11-14): them Ly do PS chuan "Het hang" (thu tu 4, sau "Phat sinh") + bi danh "het hang".
-- Bi danh cu "canh bao het hang" van -> "Phat sinh" (du lieu 0020 da chuyen, khong doi hoi to).
INSERT OR IGNORE INTO dm_chuan (loai, ten, thu_tu) VALUES ('LY_DO', 'Hết hàng', 4);
INSERT OR IGNORE INTO dm_bi_danh (loai, khoa, ten_chuan) VALUES
  ('LY_DO', 'hethang', 'Hết hàng'),
  ('LY_DO', 'donhethang', 'Hết hàng');
