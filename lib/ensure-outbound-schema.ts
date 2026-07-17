import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"

let ensured = false

async function ensureColumn(table: string, column: string, ddl: string): Promise<void> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column],
  )
  const count = Number((rows as { c: number }[])[0]?.c ?? 0)
  if (count === 0) {
    await pool.query(ddl)
    clearColumnCache(table)
    console.log(`[v0] ${table}.${column} column added`)
  }
}

/** 为已有库补齐 outbound_events.attempts / lastError（幂等） */
export async function ensureOutboundExtraColumns(): Promise<void> {
  if (ensured) return
  try {
    await ensureColumn(
      "outbound_events",
      "attempts",
      "ALTER TABLE `outbound_events` ADD COLUMN `attempts` INT NOT NULL DEFAULT 0",
    )
    await ensureColumn(
      "outbound_events",
      "lastError",
      "ALTER TABLE `outbound_events` ADD COLUMN `lastError` VARCHAR(500) NULL",
    )
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureOutboundExtraColumns skipped:", (e as Error).message)
  }
}
