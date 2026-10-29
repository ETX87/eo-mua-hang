import type { D1Database } from "@cloudflare/workers-types";

/**
 * Tinh lai match_status / matched_eo_item_id cho amis_receipt (mo phong cot C/D cua sheet
 * "2.2. All" - xem REPORT_SPEC.md §2.2). `scopeCodes` = danh sach approval_code_raw bi anh huong
 * (khi 1 EO vua ISSUED). Bo trong = tinh lai toan bo.
 */
const SCOPE_CHUNK = 80; // D1: gioi han so bien bind moi cau lenh - chia nho de tranh SQLITE_ERROR "too many SQL variables"

export async function recomputeMatch(db: D1Database, scopeCodes?: string[]): Promise<void> {
  const hasScope = scopeCodes && scopeCodes.length > 0;
  if (!hasScope) {
    await recomputeMatchChunk(db, undefined);
    return;
  }
  for (let i = 0; i < scopeCodes!.length; i += SCOPE_CHUNK) {
    await recomputeMatchChunk(db, scopeCodes!.slice(i, i + SCOPE_CHUNK));
  }
}

async function recomputeMatchChunk(db: D1Database, scopeCodes?: string[]): Promise<void> {
  const hasScope = scopeCodes && scopeCodes.length > 0;
  const inList = hasScope ? `(${scopeCodes!.map(() => "?").join(",")})` : "";
  const scopeSql = hasScope ? `WHERE amis_receipt.approval_code_raw IN ${inList}` : "";
  const bind = hasScope ? scopeCodes! : [];

  // 0. reset scope
  await db.prepare(
    `UPDATE amis_receipt SET match_status = 'UNMATCHED', matched_eo_item_id = NULL ${scopeSql}`,
  ).bind(...bind).run();
  const live = "amis_receipt.voided_at IS NULL"; // dong da huy (0008) khong bao gio khop

  // 1. MATCHED_EO: (kho ; ma hang ; approval_code) khop 1 eo_item cua EO da ISSUED/CANCELLED.
  //    Ma hang khop ma dang dung HOAC ma goc truoc khi thay ma tuong duong (eo_item.part_code_goc).
  await db.prepare(
    `UPDATE amis_receipt SET
       match_status = 'MATCHED_EO',
       matched_eo_item_id = (
         SELECT i.id FROM eo_item i JOIN eo e ON e.id = i.eo_id
         WHERE i.warehouse = amis_receipt.warehouse_name
           AND (i.part_code = amis_receipt.part_code OR i.part_code_goc = amis_receipt.part_code)
           AND e.approval_code = amis_receipt.approval_code_raw
           AND e.trang_thai IN ('ISSUED','CANCELLED')
         -- uu tien dong dang hieu luc: dong da huy (tao som hon) khong duoc "giu" phieu nhap
         ORDER BY (i.line_status = 'ACTIVE') DESC, i.created_at, i.id LIMIT 1)
     ${scopeSql ? scopeSql + " AND" : "WHERE"} ${live} AND EXISTS (
       SELECT 1 FROM eo_item i JOIN eo e ON e.id = i.eo_id
       WHERE i.warehouse = amis_receipt.warehouse_name
         AND (i.part_code = amis_receipt.part_code OR i.part_code_goc = amis_receipt.part_code)
         AND e.approval_code = amis_receipt.approval_code_raw
         AND e.trang_thai IN ('ISSUED','CANCELLED'))`,
  ).bind(...bind).run();

  // 2. CODE_ONLY_NO_LINE: chua khop item nhung approval_code_raw la ma cua 1 EO da ISSUED
  await db.prepare(
    `UPDATE amis_receipt SET match_status = 'CODE_ONLY_NO_LINE', matched_eo_item_id = NULL
     ${scopeSql ? scopeSql + " AND" : "WHERE"} ${live} AND match_status <> 'MATCHED_EO'
       AND EXISTS (SELECT 1 FROM eo e WHERE e.approval_code = amis_receipt.approval_code_raw AND e.trang_thai = 'ISSUED')`,
  ).bind(...bind).run();
}
