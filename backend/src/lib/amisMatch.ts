import type { D1Database } from "@cloudflare/workers-types";

/**
 * Tinh lai match_status / matched_eo_item_id cho amis_receipt (mo phong cot C/D cua sheet
 * "2.2. All" - xem REPORT_SPEC.md §2.2). `scopeCodes` = danh sach approval_code_raw bi anh huong
 * (khi 1 EO vua ISSUED). Bo trong = tinh lai toan bo.
 */
export async function recomputeMatch(db: D1Database, scopeCodes?: string[]): Promise<void> {
  const hasScope = scopeCodes && scopeCodes.length > 0;
  const inList = hasScope ? `(${scopeCodes!.map(() => "?").join(",")})` : "";
  const scopeSql = hasScope ? `WHERE amis_receipt.approval_code_raw IN ${inList}` : "";
  const bind = hasScope ? scopeCodes! : [];

  // 0. reset scope
  await db.prepare(
    `UPDATE amis_receipt SET match_status = 'UNMATCHED', matched_eo_item_id = NULL ${scopeSql}`,
  ).bind(...bind).run();

  // 1. MATCHED_EO: (kho ; ma hang ; approval_code) khop 1 eo_item cua EO da ISSUED/CANCELLED
  await db.prepare(
    `UPDATE amis_receipt SET
       match_status = 'MATCHED_EO',
       matched_eo_item_id = (
         SELECT i.id FROM eo_item i JOIN eo e ON e.id = i.eo_id
         WHERE i.warehouse = amis_receipt.warehouse_name
           AND i.part_code = amis_receipt.part_code
           AND e.approval_code = amis_receipt.approval_code_raw
           AND e.trang_thai IN ('ISSUED','CANCELLED')
         ORDER BY i.created_at, i.id LIMIT 1)
     ${scopeSql ? scopeSql + " AND" : "WHERE"} EXISTS (
       SELECT 1 FROM eo_item i JOIN eo e ON e.id = i.eo_id
       WHERE i.warehouse = amis_receipt.warehouse_name
         AND i.part_code = amis_receipt.part_code
         AND e.approval_code = amis_receipt.approval_code_raw
         AND e.trang_thai IN ('ISSUED','CANCELLED'))`,
  ).bind(...bind).run();

  // 2. CODE_ONLY_NO_LINE: chua khop item nhung approval_code_raw la ma cua 1 EO da ISSUED
  await db.prepare(
    `UPDATE amis_receipt SET match_status = 'CODE_ONLY_NO_LINE', matched_eo_item_id = NULL
     ${scopeSql ? scopeSql + " AND" : "WHERE"} match_status <> 'MATCHED_EO'
       AND EXISTS (SELECT 1 FROM eo e WHERE e.approval_code = amis_receipt.approval_code_raw AND e.trang_thai = 'ISSUED')`,
  ).bind(...bind).run();
}
