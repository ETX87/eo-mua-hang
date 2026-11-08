-- 0022 (2026-11-08): ghi loi lan dung cache theo dong gan nhat (lib/dongCache) de chan doan tren production
-- (lan dung dau tien that bai: 4 lan giu khoa nhung khong ghi duoc dong nao - nghi gioi han 100KB / cau lenh cua D1).
ALTER TABLE dong_cache_meta ADD COLUMN loi TEXT;
ALTER TABLE dong_cache_meta ADD COLUMN loi_luc TEXT;
