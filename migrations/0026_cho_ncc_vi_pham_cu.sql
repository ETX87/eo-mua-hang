-- v0.113 (2026-11-23): sua cac van de tim thay khi dung vai tro NV dat hang (yeu cau chu he thong: "fix cac loi tim thay,
-- tuy nhien cac loi vi pham cu truoc thang 11 thi bo qua (auto bo vi pham do vi pham cu)").

-- 1) "Cho NCC bao ngay": khi ghi nhan nhac doi tac ma NCC CHUA co ngay -> hen ngay hoi lai (<= 7 ngay). Trong khoang
--    [ngay lien he, hen_lai] he thong KHONG ghi them loi lap R1 (thu 3/6) / R3 (thu 2/4) cho dong do. NULL = khong hen.
--    Them kenh 'MAIL' (NCC tra loi qua mail nhung chua co ngay) -> CHECK cua 0023 phai doi => dung lai bang (SQLite khong sua CHECK tai cho).
PRAGMA defer_foreign_keys = true;
CREATE TABLE tl_lien_he_moi (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nhom         TEXT NOT NULL,
  eo_item_id   INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id        INTEGER NOT NULL REFERENCES eo(id),
  kenh         TEXT NOT NULL CHECK (kenh IN ('DIEN_THOAI', 'ZALO', 'TIN_NHAN', 'GAP', 'MAIL', 'KHAC')),
  ngay_lien_he TEXT NOT NULL,
  nguoi_lien_he TEXT,
  ket_qua      TEXT NOT NULL,
  hinh_anh     TEXT,
  created_by   TEXT NOT NULL REFERENCES users(email),
  created_at   TEXT NOT NULL,
  hen_lai      TEXT                              -- v0.113: YYYY-MM-DD hen hoi lai NCC (cho NCC bao ngay), NULL = khong hen
);
INSERT INTO tl_lien_he_moi (id, nhom, eo_item_id, eo_id, kenh, ngay_lien_he, nguoi_lien_he, ket_qua, hinh_anh, created_by, created_at)
  SELECT id, nhom, eo_item_id, eo_id, kenh, ngay_lien_he, nguoi_lien_he, ket_qua, hinh_anh, created_by, created_at FROM tl_lien_he;
DROP TABLE tl_lien_he;
ALTER TABLE tl_lien_he_moi RENAME TO tl_lien_he;
CREATE INDEX idx_tl_lien_he_item ON tl_lien_he(eo_item_id, ngay_lien_he);
CREATE INDEX idx_tl_lien_he_hen ON tl_lien_he(hen_lai) WHERE hen_lai IS NOT NULL;

-- 2) Nhan danh muc loi cu ghi "48h" (quy tac that: 8h / 16h lam viec tu v0.103).
UPDATE tl_danh_muc SET ten = 'Không có ngày dự kiến đúng hạn (8h / 16h làm việc)' WHERE loai = 'LOI' AND ma = 'KHONG_NDK_24H';

-- 3) Vi pham CU (moc loi truoc 01/11/2026) da bi he thong dong "qua han giai trinh" -> bo qua, khong tinh vi pham
--    (898 loi cua 1 NV bi dong 1 lan luc 18/11 14:00 - truoc khi co nhac / popup). nhom moi 'AUTO:CU'.
UPDATE tl_giai_trinh
SET nhom = 'AUTO:CU', noi_dung = 'Tự bỏ vi phạm do vi phạm cũ (mốc lỗi trước 01/11/2026) — không tính vi phạm.'
WHERE pham_vi = 'AUTO' AND nhom = 'AUTO:QUA_HAN'
  AND id IN (SELECT l.giai_trinh_id FROM tl_loi l WHERE l.giai_trinh_id IS NOT NULL AND COALESCE(l.han, l.created_at) < '2026-11-01');

INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
SELECT 'eo', g.eo_id, g.eo_id, 'BO_VI_PHAM_CU', json_object('so_loi', COUNT(*)), json_object('ly_do', 'Vi phạm cũ trước 01/11/2026 — bỏ qua'), NULL, datetime('now', '+7 hours')
FROM tl_giai_trinh g WHERE g.nhom = 'AUTO:CU' GROUP BY g.eo_id;

UPDATE data_versions SET version = version + 1 WHERE domain = 'theo_doi';
