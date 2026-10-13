-- (1) Thay ma linh kien tuong duong sau ban hanh (NCC/KRF giao ma B thay cho ma A da duyet):
--     eo_item.part_code = ma DANG DUNG (B); part_code_goc = ma da duyet ban dau (A), NULL neu chua thay.
--     AMIS khop dong theo ca part_code lan part_code_goc (lib/amisMatch.ts).
ALTER TABLE eo_item ADD COLUMN part_code_goc TEXT;
ALTER TABLE eo_item ADD COLUMN part_name_goc TEXT;
CREATE INDEX idx_eo_item_part_goc ON eo_item(part_code_goc) WHERE part_code_goc IS NOT NULL;

-- (2) Ke hoach hang ve 2 loai: 'NGAY' (ngay ve cu the) | 'TUAN' (don ke hoach thang KRF cap nhat
--     theo tuan). Ke hoach TUAN luu planned_date = Thu Bay cuoi tuan (lib/week.ts), tuan = 'Yyy-Wnn'.
ALTER TABLE item_plan ADD COLUMN loai TEXT NOT NULL DEFAULT 'NGAY';
ALTER TABLE item_plan ADD COLUMN tuan TEXT;
