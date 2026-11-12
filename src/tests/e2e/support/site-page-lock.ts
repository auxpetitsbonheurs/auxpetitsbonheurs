// Brand pages (E-13 `site_page`) are one row per page, shared by every spec: a spec that saves
// one takes this Postgres advisory lock so parallel workers never race on its `version`, and
// puts the row (text, flags, photos) back as it found it.
import type postgres from "postgres";

/** One lock per page: specs saving different pages run side by side. */
const LOCKS: Record<string, number> = { our_story: 580_245, workshops: 580_246, gallery: 580_247, contact: 580_248, custom_order: 580_249 };

/**
 * `work` gets the reserved connection: the worker's `db` pool has one connection, which the lock
 * holds, so queries inside `work` must use the connection it is given.
 */
export async function withSitePage<T>(sql: postgres.Sql, key: string, work: (connection: postgres.ReservedSql) => Promise<T>): Promise<T> {
  const connection = await sql.reserve();
  try {
    await connection`select pg_advisory_lock(${LOCKS[key]!})`;
    const [saved] = await connection<{ content: unknown; event: unknown; is_placeholder: boolean }[]>`select content, event, is_placeholder from site_page where key = ${key}`;
    try {
      return await work(connection);
    } finally {
      await connection`delete from site_page_photo where page_key = ${key}`;
      await connection`update site_page set content = ${connection.json(saved!.content as postgres.JSONValue)}, event = ${saved!.event === null ? null : connection.json(saved!.event as postgres.JSONValue)}, is_placeholder = ${saved!.is_placeholder} where key = ${key}`;
    }
  } finally {
    await connection`select pg_advisory_unlock(${LOCKS[key]!})`;
    connection.release();
  }
}
