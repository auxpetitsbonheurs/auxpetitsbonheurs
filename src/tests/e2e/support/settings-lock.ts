// The Settings row is one per site: specs that save Settings or Availability (S-056..S-059)
// take this Postgres advisory lock so parallel workers never race on its `version`, and leave
// the shared values (fee, windows, policies, prefix) as they found them.
import type postgres from "postgres";

const SETTINGS_LOCK = 580_056;

export async function withSettingsLock<T>(sql: postgres.Sql, work: () => Promise<T>): Promise<T> {
  const connection = await sql.reserve();
  try {
    await connection`select pg_advisory_lock(${SETTINGS_LOCK})`;
    return await work();
  } finally {
    await connection`select pg_advisory_unlock(${SETTINGS_LOCK})`;
    connection.release();
  }
}
