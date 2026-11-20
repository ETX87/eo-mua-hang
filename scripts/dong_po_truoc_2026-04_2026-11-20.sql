-- 2026-11-20: Ket thuc som CA PO cho moi PO ban hanh truoc 2026-04-01 con dong mo (yeu cau chu he thong).
-- Cung quy tac POST /eo/:id/ket-thuc-som: ve 1 phan -> SL dat = SL da ve (cat ke hoach xa nhat); chua ve -> SL 0 + CANCELLED_LINE.
DROP TABLE IF EXISTS _kts_dong;
CREATE TABLE _kts_dong AS
SELECT i.id, i.eo_id, i.current_qty,
       ROUND(COALESCE((SELECT SUM(r.qty_in) FROM amis_receipt r WHERE r.match_status = 'MATCHED_EO' AND r.matched_eo_item_id = i.id AND r.voided_at IS NULL), 0), 3) da_ve,
       (SELECT COALESCE(SUM(p.planned_qty), 0) FROM item_plan p WHERE p.eo_item_id = i.id AND p.deleted_at IS NULL) sl_kh,
       i.part_code, datetime('now', '+7 hours') now_vn
FROM eo_item i JOIN eo e ON e.id = i.eo_id
WHERE e.trang_thai = 'ISSUED' AND e.issued_at < '2026-04-01'
  AND i.line_status = 'ACTIVE' AND i.ket_thuc_som_at IS NULL;
DELETE FROM _kts_dong WHERE da_ve >= current_qty - 1e-9;

-- cat ke hoach: tu dot xa nhat, phan du = sl_kh - da_ve
DROP TABLE IF EXISTS _kts_kh;
CREATE TABLE _kts_kh AS
SELECT x.*, CASE WHEN x.cum <= x.du + 1e-9 THEN 'DEL' ELSE 'UPD' END hd,
       ROUND(x.planned_qty - (x.du - (x.cum - x.planned_qty)), 3) q_moi
FROM (
  SELECT p.id plan_id, p.eo_item_id, d.eo_id, p.planned_date, p.planned_qty, p.tuan, d.sl_kh - d.da_ve du,
         SUM(p.planned_qty) OVER (PARTITION BY p.eo_item_id ORDER BY p.planned_date DESC, p.id DESC) cum
  FROM item_plan p JOIN _kts_dong d ON d.id = p.eo_item_id
  WHERE p.deleted_at IS NULL AND d.sl_kh - d.da_ve > 1e-9
) x
WHERE x.cum - x.planned_qty < x.du - 1e-9;

INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, before_json, after_json, metadata_json, user_email, created_at)
SELECT 'eo_item', k.eo_item_id, k.eo_id, CASE k.hd WHEN 'DEL' THEN 'DELETE_PLAN' ELSE 'UPDATE_PLAN' END,
       CASE k.hd WHEN 'DEL' THEN json_object('planned_date', k.planned_date, 'planned_qty', k.planned_qty, 'tuan', k.tuan)
                 ELSE json_object('planned_date', k.planned_date, 'planned_qty', k.planned_qty) END,
       CASE k.hd WHEN 'DEL' THEN NULL ELSE json_object('planned_date', k.planned_date, 'planned_qty', k.q_moi) END,
       json_object('eo_item_id', k.eo_item_id, 'plan_id', k.plan_id, 'ly_do', 'Kết thúc sớm cả PO — SL đặt về SL đã về'),
       'smarttrade.vp@gmail.com', (SELECT now_vn FROM _kts_dong LIMIT 1)
FROM _kts_kh k;
UPDATE item_plan SET deleted_at = (SELECT now_vn FROM _kts_dong LIMIT 1), deleted_by = 'smarttrade.vp@gmail.com'
WHERE id IN (SELECT plan_id FROM _kts_kh WHERE hd = 'DEL');
UPDATE item_plan SET planned_qty = (SELECT q_moi FROM _kts_kh k WHERE k.plan_id = item_plan.id),
       updated_by = 'smarttrade.vp@gmail.com', updated_at = (SELECT now_vn FROM _kts_dong LIMIT 1)
WHERE id IN (SELECT plan_id FROM _kts_kh WHERE hd = 'UPD');

-- dong
UPDATE eo_item SET
  current_qty = (SELECT d.da_ve FROM _kts_dong d WHERE d.id = eo_item.id),
  line_status = CASE WHEN (SELECT d.da_ve FROM _kts_dong d WHERE d.id = eo_item.id) > 0 THEN 'ACTIVE' ELSE 'CANCELLED_LINE' END,
  post_issue_status = CASE WHEN (SELECT d.da_ve FROM _kts_dong d WHERE d.id = eo_item.id) <= 0 AND post_issue_status = 'PENDING' THEN NULL ELSE post_issue_status END,
  sl_dat_truoc_kts = current_qty,
  ket_thuc_som_at = (SELECT now_vn FROM _kts_dong LIMIT 1),
  ket_thuc_som_by = 'smarttrade.vp@gmail.com',
  ket_thuc_som_ly_do = 'Đóng PO tồn ban hành trước 04/2026 (yêu cầu chủ hệ thống 20/11/2026)',
  updated_by = 'smarttrade.vp@gmail.com', updated_at = (SELECT now_vn FROM _kts_dong LIMIT 1)
WHERE id IN (SELECT id FROM _kts_dong);

INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, before_json, after_json, metadata_json, user_email, created_at)
SELECT 'eo_item', d.id, d.eo_id, 'KET_THUC_SOM', json_object('qty', d.current_qty), json_object('qty', d.da_ve),
       json_object('reason', 'Đóng PO tồn ban hành trước 04/2026 (yêu cầu chủ hệ thống 20/11/2026)', 'pham_vi', 'PO', 'chua_ve', json(CASE WHEN d.da_ve <= 0 THEN 'true' ELSE 'false' END)),
       'smarttrade.vp@gmail.com', d.now_vn
FROM _kts_dong d;

INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, metadata_json, user_email, created_at)
SELECT 'eo', d.eo_id, d.eo_id, 'KET_THUC_SOM_PO',
       json_object('reason', 'Đóng PO tồn ban hành trước 04/2026 (yêu cầu chủ hệ thống 20/11/2026)', 'so_dong', COUNT(*),
                   'dong', json_group_array(json_object('id', d.id, 'part_code', d.part_code, 'truoc', d.current_qty, 'sau', d.da_ve))),
       'smarttrade.vp@gmail.com', MAX(d.now_vn)
FROM _kts_dong d GROUP BY d.eo_id;

-- tinh lai khop AMIS cho cac PO co dong bi huy (nhu recomputeMatch(scope))
DROP TABLE IF EXISTS _kts_ma;
CREATE TABLE _kts_ma AS SELECT DISTINCT e.approval_code ma FROM eo e WHERE e.approval_code IS NOT NULL AND e.id IN (SELECT eo_id FROM _kts_dong WHERE da_ve <= 0);
UPDATE amis_receipt SET match_status = 'UNMATCHED', matched_eo_item_id = NULL WHERE approval_code_raw IN (SELECT ma FROM _kts_ma);
UPDATE amis_receipt SET
  match_status = 'MATCHED_EO',
  matched_eo_item_id = (
    SELECT i.id FROM eo_item i JOIN eo e ON e.id = i.eo_id
    WHERE i.warehouse = amis_receipt.warehouse_name
      AND (i.part_code = amis_receipt.part_code OR i.part_code_goc = amis_receipt.part_code)
      AND e.approval_code = amis_receipt.approval_code_raw
      AND e.trang_thai IN ('ISSUED','CANCELLED')
    ORDER BY (i.line_status = 'ACTIVE') DESC, i.created_at, i.id LIMIT 1)
WHERE approval_code_raw IN (SELECT ma FROM _kts_ma) AND voided_at IS NULL AND EXISTS (
  SELECT 1 FROM eo_item i JOIN eo e ON e.id = i.eo_id
  WHERE i.warehouse = amis_receipt.warehouse_name
    AND (i.part_code = amis_receipt.part_code OR i.part_code_goc = amis_receipt.part_code)
    AND e.approval_code = amis_receipt.approval_code_raw
    AND e.trang_thai IN ('ISSUED','CANCELLED'));
UPDATE amis_receipt SET match_status = 'CODE_ONLY_NO_LINE', matched_eo_item_id = NULL
WHERE approval_code_raw IN (SELECT ma FROM _kts_ma) AND voided_at IS NULL AND match_status <> 'MATCHED_EO'
  AND EXISTS (SELECT 1 FROM eo e WHERE e.approval_code = amis_receipt.approval_code_raw AND e.trang_thai = 'ISSUED');

UPDATE data_versions SET version = version + 1 WHERE domain IN ('eo', 'amis');
DROP TABLE _kts_dong;
DROP TABLE _kts_kh;
DROP TABLE _kts_ma;
