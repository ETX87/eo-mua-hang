-- Sua du lieu AMIS khi chung tu MISA bi sai roi da sua (khong hard-delete - xem CLAUDE.md):
--   (1) import che do 'SYNC' (dong bo lai ky): dong song trong [ky_tu, ky_den] + pham vi kho ma KHONG con
--       trong file -> danh dau huy; (2) huy ca 1 lo import; (3) huy / khoi phuc tung dong.
-- Dong da huy: voided_at IS NOT NULL, luon match_status = 'UNMATCHED' (lib/amisMatch.ts bo qua) nen moi
-- truy van 'MATCHED_EO' / 'CODE_ONLY_NO_LINE' tu dong khong tinh. Import lai dung chung tu (natural_key)
-- -> tu khoi phuc.
ALTER TABLE amis_receipt ADD COLUMN voided_at TEXT;
ALTER TABLE amis_receipt ADD COLUMN voided_by TEXT REFERENCES users(email);
ALTER TABLE amis_receipt ADD COLUMN void_reason TEXT;
ALTER TABLE amis_receipt ADD COLUMN void_batch_id INTEGER REFERENCES amis_import_batch(id);
CREATE INDEX idx_amis_batch ON amis_receipt(import_batch_id);
CREATE INDEX idx_amis_live_doc_date ON amis_receipt(doc_date) WHERE voided_at IS NULL;

ALTER TABLE amis_import_batch ADD COLUMN mode TEXT NOT NULL DEFAULT 'APPEND';  -- 'APPEND' | 'SYNC'
ALTER TABLE amis_import_batch ADD COLUMN ky_tu TEXT;
ALTER TABLE amis_import_batch ADD COLUMN ky_den TEXT;
ALTER TABLE amis_import_batch ADD COLUMN kho_pham_vi TEXT;                      -- JSON mang ten kho; NULL = moi kho
ALTER TABLE amis_import_batch ADD COLUMN voided_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE amis_import_batch ADD COLUMN restored_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE amis_import_batch ADD COLUMN cancelled_at TEXT;
ALTER TABLE amis_import_batch ADD COLUMN cancelled_by TEXT REFERENCES users(email);
ALTER TABLE amis_import_batch ADD COLUMN cancel_reason TEXT;
