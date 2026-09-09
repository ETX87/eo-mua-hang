/**
 * Sinh ID tuan tu qua bang dem `id_counters` (UPDATE ... RETURNING, atomic O(1)).
 * Cot: ten_bang / gia_tri_hien_tai (khop linh-kien-app). Dong seed phai co san trong migration -
 * neu them key moi, nho INSERT vao 0001_init.sql.
 */
export async function nextSequentialId(
  db: D1Database,
  key: string,
  prefix: string,
  width: number,
): Promise<string> {
  const row = await db
    .prepare("UPDATE id_counters SET gia_tri_hien_tai = gia_tri_hien_tai + 1 WHERE ten_bang = ? RETURNING gia_tri_hien_tai")
    .bind(key)
    .first<{ gia_tri_hien_tai: number }>();
  const next = row?.gia_tri_hien_tai ?? 1;
  return `${prefix}-${String(next).padStart(width, "0")}`;
}
