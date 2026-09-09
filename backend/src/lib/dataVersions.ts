/**
 * He version-tag cho cache bao cao (xem REPORT_SPEC.md §6). Moi write path goi bumpVersions() ngay
 * sau khi ghi. Endpoint bao cao bao compute trong cachedReport(): so sanh tag (cac domain + ngay VN)
 * voi tag da cache, chi tinh lai khi lech.
 */
export type DataDomain = "eo" | "amis" | "users" | "settings";

export async function bumpVersions(db: D1Database, domains: DataDomain[]): Promise<void> {
  if (domains.length === 0) return;
  const stmts = domains.map((d) =>
    db.prepare("UPDATE data_versions SET version = version + 1 WHERE domain = ?").bind(d),
  );
  await db.batch(stmts);
}

export async function versionTag(db: D1Database, domains: DataDomain[], extra = ""): Promise<string> {
  const placeholders = domains.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT domain, version FROM data_versions WHERE domain IN (${placeholders})`)
    .bind(...domains)
    .all<{ domain: string; version: number }>();
  const map = new Map(rows.results.map((r) => [r.domain, r.version]));
  return domains.map((d) => `${d}:${map.get(d) ?? 0}`).join("|") + (extra ? `|${extra}` : "");
}
