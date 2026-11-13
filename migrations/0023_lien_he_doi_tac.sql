-- 0023 (2026-11-13): ghi nhan NHAC DOI TAC khong qua mail (goi dien / Zalo / tin nhan / gap truc tiep).
-- Moi lan ghi nhan: 1 ban ghi / dong (chung `nhom`). R3 (thu 2 / thu 4) coi lien he trong ky nhu da push (lib/theoDoi.ts danhGiaQuyTac);
-- ghi nhan muon (toi da 7 ngay truoc) -> tu bo loi R3 dang cho ma ky cua no chua ngay lien he (event XOA_LOI_THEO_DOI).
CREATE TABLE tl_lien_he (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nhom         TEXT NOT NULL,                     -- 1 lan ghi nhan nhieu dong
  eo_item_id   INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id        INTEGER NOT NULL REFERENCES eo(id),
  kenh         TEXT NOT NULL CHECK (kenh IN ('DIEN_THOAI', 'ZALO', 'TIN_NHAN', 'GAP', 'KHAC')),
  ngay_lien_he TEXT NOT NULL,                     -- YYYY-MM-DD HH:MM:SS gio VN (ngay that su goi / nhan tin)
  nguoi_lien_he TEXT,                             -- ten / SDT nguoi ben doi tac (tuy chon)
  ket_qua      TEXT NOT NULL,                     -- doi tac tra loi gi
  hinh_anh     TEXT,                              -- JSON [{name, drive_file_id, url}]
  created_by   TEXT NOT NULL REFERENCES users(email),
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_tl_lien_he_item ON tl_lien_he(eo_item_id, ngay_lien_he);
