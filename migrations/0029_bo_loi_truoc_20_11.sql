-- v0.148 (2026-11-28, chu he thong): "chung ta chot bo loi tu truoc 20/11 thi bo het loi, them log auto bo loi vao roi tinh da giai trinh".
-- Noi tiep 0028 (bo vi pham CHOT truoc 20/11): nay bo theo MOC LOI (COALESCE(han, created_at)) truoc 2026-11-20 (ngay dao tao).
-- 1) Vi pham (AUTO:QUA_HAN) cua loi co moc truoc 20/11 -> AUTO:CU (tinh da giai trinh, khong tinh vi pham), giu ban ghi + noi dung cu.
--    Luc viet: 1 ban ghi (vi pham chot 20/11 10:52, moc lui 09/11 - 0028 da giu lai vi chot sau 20/11).
-- 2) Loi moc truoc 20/11 con CHO_GIAI_TRINH: luc viet = 0; tu nay lib/theoDoi tuGiaiTrinh tu dong AUTO:CU (LOI_TINH_TU) moi lan quet.
UPDATE tl_giai_trinh
SET nhom = 'AUTO:CU',
    noi_dung = 'Bỏ lỗi: mốc lỗi trước thời điểm đào tạo 20/11/2026 — tính đã giải trình, không tính vi phạm. (Trước đó: ' || noi_dung || ')'
WHERE pham_vi = 'AUTO' AND nhom = 'AUTO:QUA_HAN'
  AND id IN (SELECT giai_trinh_id FROM tl_loi WHERE giai_trinh_id IS NOT NULL AND COALESCE(han, created_at) < '2026-11-20');

INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
SELECT 'eo', g.eo_id, g.eo_id, 'BO_LOI_TRUOC_20_11', json_object('so_loi', COUNT(*)),
       json_object('ly_do', 'Lỗi có mốc trước đào tạo 20/11/2026 — tự bỏ, tính đã giải trình'), NULL, datetime('now', '+7 hours')
FROM tl_giai_trinh g
WHERE g.pham_vi = 'AUTO' AND g.nhom = 'AUTO:CU' AND instr(g.noi_dung, 'Bỏ lỗi: mốc lỗi trước thời điểm đào tạo 20/11/2026') > 0 AND instr(g.noi_dung, '(Trước đó:') > 0
  AND NOT EXISTS (SELECT 1 FROM event_log e WHERE e.event_type = 'BO_LOI_TRUOC_20_11' AND e.eo_id = g.eo_id)
GROUP BY g.eo_id;

UPDATE data_versions SET version = version + 1 WHERE domain = 'theo_doi';
