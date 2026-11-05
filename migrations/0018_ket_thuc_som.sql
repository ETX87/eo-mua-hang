-- "Ket thuc som" 1 don dat (dong linh kien) - POST /eo/items/:id/ket-thuc-som (2026-11-05): SL dat ve dung SL da ve theo AMIS,
-- bao cao 0.1 trang thai "Kết thúc sớm" (dong lai nhu Ket thuc). Luu SL dat truoc do de tra cuu.
ALTER TABLE eo_item ADD COLUMN ket_thuc_som_at TEXT;
ALTER TABLE eo_item ADD COLUMN ket_thuc_som_by TEXT;
ALTER TABLE eo_item ADD COLUMN ket_thuc_som_ly_do TEXT;
ALTER TABLE eo_item ADD COLUMN sl_dat_truoc_kts REAL;
-- bao cao 0.1 / theo doi da cache -> tinh lai (them trang thai "Kết thúc sớm", don huy khong tinh SL ve)
UPDATE data_versions SET version = version + 1 WHERE domain = 'eo';
