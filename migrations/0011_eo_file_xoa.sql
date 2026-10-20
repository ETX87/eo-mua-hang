-- Xoa file dinh kem EO (nut "×" o form Tao/Sua EO + tab Tai lieu dinh kem). Khong hard-delete eo_file (CLAUDE.md):
-- xoa mem, file van con tren Google Drive, lich su EO ghi DELETE_FILE.
ALTER TABLE eo_file ADD COLUMN deleted_at TEXT;
ALTER TABLE eo_file ADD COLUMN deleted_by TEXT REFERENCES users(email);
