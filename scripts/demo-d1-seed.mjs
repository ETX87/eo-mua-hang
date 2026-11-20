// Fixture tong hop cho demo-d1.mjs / do-sql-api.mjs (600 EO, 4.800 dong LK moi nam). Chi dung cho DB Miniflare tam.
export const email = "demo@example.invalid";

export function seed(years) {
  return [
    `INSERT INTO users(email,ho_ten,vai_tro,trang_thai_duyet,active) VALUES ('${email}','Admin Demo','Admin','Da duyet',1)`,
    `INSERT INTO settings_warehouse(ten_kho) VALUES ('Kho demo')`,
    `WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i < ${600 * years})
      INSERT INTO eo(id,eo_code,approval_code,tieu_de,trang_thai,created_at,issued_at,created_by,final_approver_email)
      SELECT i,printf('MH-%06d',i),CASE WHEN i%30<>1 THEN printf('3TDO-%06d',i) END,'Đơn mô phỏng '||i,
        CASE WHEN i%30=1 THEN 'DRAFT' ELSE 'ISSUED' END,
        datetime('now','+7 hours',printf('-%d days',(i-1)*365/600)),
        CASE WHEN i%30<>1 THEN datetime('now','+7 hours',printf('-%d days',(i-1)*365/600)) END,
        '${email}','${email}' FROM n`,
    `WITH n(i) AS (VALUES(1),(2),(3),(4),(5),(6),(7),(8))
      INSERT INTO eo_item(id,eo_id,part_code,part_name,warehouse,supplier,original_qty,current_qty,created_by,created_at)
      SELECT (e.id-1)*8+n.i,e.id,printf('LK-%04d',e.id%250*8+n.i),'Linh kiện demo '||n.i,
        (SELECT ten_kho FROM settings_warehouse LIMIT 1),'Đối tác '||e.id%30,20,20,'${email}',e.created_at FROM eo e CROSS JOIN n`,
    `INSERT INTO item_plan(eo_item_id,planned_date,planned_qty,created_by,created_at)
      SELECT i.id,date(i.created_at,'+14 days'),20,'${email}',i.created_at FROM eo_item i WHERE i.id%3<>0`,
    `INSERT INTO amis_import_batch(id,source_filename,imported_by) VALUES (1,'demo.xlsx','${email}')`,
    `WITH n(i) AS (VALUES(1),(2))
      INSERT INTO amis_receipt(import_batch_id,warehouse_name,part_code,part_name,doc_date,doc_no,qty_in,
           approval_code_raw,match_key,match_status,matched_eo_item_id,natural_key)
      SELECT 1,x.warehouse,x.part_code,x.part_name,date(x.created_at,'+3 days'),printf('PN-%d-%d',x.id,n.i),10,
        e.approval_code,x.warehouse||';'||x.part_code||';'||e.approval_code,
        CASE WHEN x.id%11=0 THEN 'CODE_ONLY_NO_LINE' ELSE 'MATCHED_EO' END,
        CASE WHEN x.id%11<>0 THEN x.id END,printf('%d:%d',x.id,n.i)
      FROM eo_item x JOIN eo e ON e.id=x.eo_id CROSS JOIN n
      WHERE e.approval_code IS NOT NULL AND (e.id>150 OR x.id%3=0)`,
    `UPDATE eo SET current_submission_id=id WHERE id%20=1 AND trang_thai='DRAFT' AND id<>1`,
    `INSERT INTO eo_submission(id,eo_id,version,submitted_by,submitted_at)
      SELECT id,id,1,'${email}',created_at FROM eo WHERE current_submission_id IS NOT NULL`,
    `INSERT INTO eo_approval(submission_id,step_type,step_no,approver_email)
      SELECT id,'REVIEW',1,'${email}' FROM eo_submission`,
    `UPDATE eo SET trang_thai='IN_REVIEW' WHERE current_submission_id IS NOT NULL`,
    `INSERT INTO tl_loi(eo_item_id,eo_id,quy_tac,khoa,han,ai_email,loi_ma,created_at)
      SELECT i.id,i.eo_id,'R1','R1:'||i.id,i.created_at,'${email}','KHONG_NDK_24H',i.created_at
      FROM eo_item i JOIN eo e ON e.id=i.eo_id WHERE i.id%9=0 AND e.trang_thai='ISSUED'`,
  ];
}
