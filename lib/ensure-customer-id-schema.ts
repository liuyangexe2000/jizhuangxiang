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

/** 为已有库补齐 use_box_orders / bills.customerId（幂等） */
export async function ensureCustomerIdColumns(): Promise<void> {
  if (ensured) return
  try {
    await ensureColumn(
      "use_box_orders",
      "customerId",
      "ALTER TABLE `use_box_orders` ADD COLUMN `customerId` VARCHAR(32) NULL",
    )
    await ensureColumn(
      "bills",
      "customerId",
      "ALTER TABLE `bills` ADD COLUMN `customerId` VARCHAR(32) NULL",
    )
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureCustomerIdColumns skipped:", (e as Error).message)
  }
}
