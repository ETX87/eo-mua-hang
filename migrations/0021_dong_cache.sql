-- 0021 (2026-11-08, yeu cau #25 tang toc): cache THEO TUNG DONG cua /api/so-don-hang (lib/dongCache.ts).
-- Moi dong linh kien 1 ban ghi (du lieu da gop: bao cao 0.1 + EO + giai doan + theo doi). Khi du lieu doi (version eo/amis/settings/
-- theo_doi hoac sang ngay) chi GHI LAI dong co noi dung khac (so sig), danh seq moi -> popup PO doc dung cac dong cua PO;
-- danh sach LK dat (FE luu IndexedDB) chi tai dong seq > seq da co. Phan phu thuoc "bay gio" (gio tung giai doan, tre han,
-- tinh trang theo doi) tinh lai moi request cho dong DANG MO tu nguon_now - khong ghi lai dong.
CREATE TABLE dong_cache (
  item_id   INTEGER PRIMARY KEY,
  eo_id     INTEGER NOT NULL,
  ma_lk     TEXT,               -- UPPER(part_code) - popup ma linh kien doc theo ma
  ma_goc    TEXT,               -- UPPER(part_code_goc) (ma da duyet truoc khi thay ma tuong duong)
  sig       TEXT NOT NULL,
  seq       INTEGER NOT NULL,
  mo        INTEGER NOT NULL DEFAULT 0,
  data      TEXT NOT NULL,
  nguon_now TEXT
);
CREATE INDEX idx_dong_cache_eo ON dong_cache(eo_id);
CREATE INDEX idx_dong_cache_seq ON dong_cache(seq);
CREATE INDEX idx_dong_cache_mo ON dong_cache(mo);
CREATE INDEX idx_dong_cache_ma ON dong_cache(ma_lk);
CREATE INDEX idx_dong_cache_ma_goc ON dong_cache(ma_goc);

CREATE TABLE dong_cache_meta (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  tag            TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  epoch          TEXT NOT NULL,
  sla            TEXT,
  building_until TEXT
);
INSERT INTO dong_cache_meta (id, seq, epoch) VALUES (1, 0, lower(hex(randomblob(6))));
