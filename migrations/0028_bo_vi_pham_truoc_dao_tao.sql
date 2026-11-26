-- v0.128 (2026-11-26, chu he thong): "Bỏ toàn bộ vi phạm bị chốt từ trước 20/11 => tính là bỏ qua trước thời điểm đào tạo 20/11".
-- Vi pham = loi he thong tu chot "het han giai trinh" (tl_giai_trinh pham_vi 'AUTO', nhom 'AUTO:QUA_HAN'). Chot (g.created_at) truoc
-- 2026-11-20 -> doi sang 'AUTO:CU' (nhom "bo qua", khong tinh vi pham o man Vi pham / Don PO / Dieu hanh / Ca CEO / bang ma loi), giu nguyen
-- ban ghi loi + lich su. Thuc te luc chay: 348 vi pham, deu chot 18/11 14:38 (luc tinh nang tu chot len production, ap hoi to) + 1 vi pham 20/11 10:52.
UPDATE tl_giai_trinh
SET nhom = 'AUTO:CU',
    noi_dung = 'Bỏ qua vi phạm: hệ thống chốt trước thời điểm đào tạo 20/11/2026 — không tính vi phạm. (Trước đó: ' || noi_dung || ')'
WHERE pham_vi = 'AUTO' AND nhom = 'AUTO:QUA_HAN' AND created_at < '2026-11-20';

INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, after_json, metadata_json, user_email, created_at)
SELECT 'eo', g.eo_id, g.eo_id, 'BO_VI_PHAM_CU', json_object('so_loi', COUNT(*)), json_object('ly_do', 'Vi phạm chốt trước đào tạo 20/11/2026 — bỏ qua'), NULL, datetime('now', '+7 hours')
FROM tl_giai_trinh g WHERE g.pham_vi = 'AUTO' AND g.nhom = 'AUTO:CU' AND instr(g.noi_dung, 'trước thời điểm đào tạo 20/11/2026') > 0 GROUP BY g.eo_id;

UPDATE data_versions SET version = version + 1 WHERE domain = 'theo_doi';
