INSERT INTO eo_item (eo_id, part_code, part_name, warehouse, original_qty, current_qty, line_status, created_by, created_at, ghi_chu)
SELECT e.id, r.part_code, '', r.warehouse_name, SUM(r.qty_in), SUM(r.qty_in), 'ACTIVE', e.created_by, datetime('now','+7 hours'),
       'Bo sung tu dong tu doi chieu AMIS (du lieu goc thieu dong linh kien)'
FROM amis_receipt r
JOIN eo e ON e.approval_code = r.approval_code_raw
WHERE e.legacy_source IS NOT NULL
  AND e.trang_thai IN ('ISSUED','CANCELLED')
  AND (SELECT COUNT(*) FROM eo_item i WHERE i.eo_id = e.id) = 0
GROUP BY e.id, r.warehouse_name, r.part_code;

INSERT INTO event_log (entity_type, entity_id, eo_id, event_type, metadata_json, user_email, created_at)
SELECT 'eo', e.id, e.id, 'BACKFILL_ITEMS_FROM_AMIS',
  json_object('n_items', (SELECT COUNT(*) FROM eo_item i WHERE i.eo_id = e.id AND i.ghi_chu = 'Bo sung tu dong tu doi chieu AMIS (du lieu goc thieu dong linh kien)')),
  'smarttrade.vp@gmail.com', datetime('now','+7 hours')
FROM eo e
WHERE e.legacy_source IS NOT NULL
  AND e.trang_thai IN ('ISSUED','CANCELLED')
  AND EXISTS (SELECT 1 FROM eo_item i WHERE i.eo_id = e.id AND i.ghi_chu = 'Bo sung tu dong tu doi chieu AMIS (du lieu goc thieu dong linh kien)');

UPDATE data_versions SET version = version + 1 WHERE domain IN ('eo','amis');

UPDATE amis_receipt SET match_status = 'UNMATCHED', matched_eo_item_id = NULL;

UPDATE amis_receipt SET
  match_status = 'MATCHED_EO',
  matched_eo_item_id = (
    SELECT i.id FROM eo_item i JOIN eo e ON e.id = i.eo_id
    WHERE i.warehouse = amis_receipt.warehouse_name
      AND i.part_code = amis_receipt.part_code
      AND e.approval_code = amis_receipt.approval_code_raw
      AND e.trang_thai IN ('ISSUED','CANCELLED')
    ORDER BY i.created_at, i.id LIMIT 1)
WHERE EXISTS (
  SELECT 1 FROM eo_item i JOIN eo e ON e.id = i.eo_id
  WHERE i.warehouse = amis_receipt.warehouse_name
    AND i.part_code = amis_receipt.part_code
    AND e.approval_code = amis_receipt.approval_code_raw
    AND e.trang_thai IN ('ISSUED','CANCELLED'));

UPDATE amis_receipt SET match_status = 'CODE_ONLY_NO_LINE', matched_eo_item_id = NULL
WHERE match_status <> 'MATCHED_EO'
  AND EXISTS (SELECT 1 FROM eo e WHERE e.approval_code = amis_receipt.approval_code_raw AND e.trang_thai = 'ISSUED');
