-- 0015: chi muc cho cac truy van dem / doc lap lai nhieu (do bang `wrangler d1 insights` 7 ngay, 2026-10-31).
-- Chi THEM chi muc, khong doi du lieu.

-- Viec can xu ly (Ke toan) + dashboard: COUNT chung tu AMIS co ma EO nhung khong khop dong (~446 lan/tuan, quet ca bang)
CREATE INDEX IF NOT EXISTS idx_amis_trang_thai_song ON amis_receipt(match_status) WHERE voided_at IS NULL;

-- Viec can xu ly / chip "Cho toi duyet" / dashboard: dong them sau ban hanh cho duyet (~850 lan/tuan, quet ca bang)
CREATE INDEX IF NOT EXISTS idx_eo_item_cho_duyet_sau_bh ON eo_item(eo_id) WHERE post_issue_status = 'PENDING';

-- Giai doan G4 (mail GUI dau tien moi dong) + goi y ngay KRF (mail NHAN moi dong): loc theo huong + dong
CREATE INDEX IF NOT EXISTS idx_tl_mail_huong_item ON tl_mail(huong, eo_item_id, thoi_gian);
