-- ============================================================================
-- Man "Vi pham & giai trinh" (routes/viPham.ts, FE pages/ViPham.tsx) - yeu cau 2026-11-04:
--  1. Nhac nho: he thong tu nhac khi ghi loi moi (lib/theoDoi.ts danhGiaQuyTac) + quan ly nhac tay. Luu tung lan.
--  2. Giai trinh chung cho ca PO (1 EO / ma 3TDO): 1 lan giai trinh dong loi cua MOI dong linh kien trong PO
--     -> moi dong van co 1 ban ghi tl_giai_trinh rieng (pham_vi 'PO', cung khoa nhom) de cac man cu doc nhu cu.
--  (Tien to ma EO moi 'MH-NNNNNN' doi o routes/eo.ts - CHI ma tao tu 2026-11-04, ma 'EO-' da cap giu nguyen.)
-- ============================================================================

ALTER TABLE tl_giai_trinh ADD COLUMN pham_vi TEXT NOT NULL DEFAULT 'DONG';  -- DONG | PO
ALTER TABLE tl_giai_trinh ADD COLUMN nhom TEXT;                             -- PO:<eo_id>:<ma ngau nhien> - gom 1 lan giai trinh PO
CREATE INDEX idx_tl_gt_nhom ON tl_giai_trinh(nhom) WHERE nhom IS NOT NULL;
CREATE INDEX idx_tl_loi_eo ON tl_loi(eo_id, trang_thai);

CREATE TABLE tl_nhac_nho (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  eo_item_id  INTEGER NOT NULL REFERENCES eo_item(id),
  eo_id       INTEGER NOT NULL REFERENCES eo(id),
  loi_id      INTEGER REFERENCES tl_loi(id),
  den_email   TEXT,                            -- nguoi duoc nhac (nguoi vi pham)
  kenh        TEXT NOT NULL CHECK (kenh IN ('HE_THONG', 'TAY')),
  noi_dung    TEXT,
  created_by  TEXT,                            -- NULL = he thong
  created_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_tl_nn_item ON tl_nhac_nho(eo_item_id);
CREATE INDEX idx_tl_nn_loi ON tl_nhac_nho(loi_id);
