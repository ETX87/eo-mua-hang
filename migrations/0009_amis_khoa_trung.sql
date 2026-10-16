-- Khoa chong trung AMIS dang van ban, tinh duoc ca trong SQL (thay cho so sanh natural_key = sha256):
--   khoa_trung = SO_CT | Ten kho | MA_HANG | SL nhap | Ngay CT (YYYY-MM-DD) | MA_PHE_DUYET   (+ '#n' neu dong
--   giong het thu n trong cung 1 file - 1 chung tu co 2 dong cung ma, cung SL).
-- MISA khong co ID dong -> kế toán tai lai file chong lan ky cu + ky moi, dong da co nhan ra bang khoa nay.
-- Code tinh khoa: backend/src/routes/amis.ts khoaTrung() - PHAI khop bieu thuc duoi.

-- (1) Ngay dang 'm/d/yy' (SheetJS hien thi o ngay theo dinh dang mac dinh - import qua UI truoc 0009) -> ISO.
UPDATE amis_receipt SET doc_date =
  ('20' || substr(substr(doc_date, instr(doc_date, '/') + 1), instr(substr(doc_date, instr(doc_date, '/') + 1), '/') + 1))
  || '-' || printf('%02d', CAST(substr(doc_date, 1, instr(doc_date, '/') - 1) AS INTEGER))
  || '-' || printf('%02d', CAST(substr(substr(doc_date, instr(doc_date, '/') + 1), 1, instr(substr(doc_date, instr(doc_date, '/') + 1), '/') - 1) AS INTEGER))
WHERE doc_date GLOB '[0-9]*/[0-9]*/[0-9][0-9]';

UPDATE amis_receipt SET posting_date =
  ('20' || substr(substr(posting_date, instr(posting_date, '/') + 1), instr(substr(posting_date, instr(posting_date, '/') + 1), '/') + 1))
  || '-' || printf('%02d', CAST(substr(posting_date, 1, instr(posting_date, '/') - 1) AS INTEGER))
  || '-' || printf('%02d', CAST(substr(substr(posting_date, instr(posting_date, '/') + 1), 1, instr(substr(posting_date, instr(posting_date, '/') + 1), '/') - 1) AS INTEGER))
WHERE posting_date GLOB '[0-9]*/[0-9]*/[0-9][0-9]';

-- (2) khoa trung
ALTER TABLE amis_receipt ADD COLUMN khoa_trung TEXT;
UPDATE amis_receipt SET khoa_trung =
  UPPER(TRIM(doc_no)) || '|' || TRIM(warehouse_name) || '|' || UPPER(TRIM(part_code)) || '|'
  || CASE WHEN qty_in = CAST(qty_in AS INTEGER) THEN CAST(CAST(qty_in AS INTEGER) AS TEXT) ELSE CAST(qty_in AS TEXT) END
  || '|' || doc_date || '|' || UPPER(TRIM(approval_code_raw));

-- (3) chung tu bi nap 2 lan do lech dinh dang ngay (lich su ISO + UI 'm/d/yy') -> giu dong id nho nhat, dong sau
--     danh dau huy (khong xoa) + doi khoa de khong vuong UNIQUE.
UPDATE amis_receipt SET
  voided_at = datetime('now', '+7 hours'),
  void_reason = 'Trùng chứng từ (chuẩn hóa khóa chống trùng 0009)',
  match_status = 'UNMATCHED', matched_eo_item_id = NULL,
  khoa_trung = khoa_trung || '#dup' || id
WHERE id NOT IN (SELECT MIN(id) FROM amis_receipt GROUP BY khoa_trung);

CREATE UNIQUE INDEX idx_amis_khoa_trung ON amis_receipt(khoa_trung);

-- (4) bao cao cache theo data_versions -> lam moi
UPDATE data_versions SET version = version + 1 WHERE domain = 'amis';
