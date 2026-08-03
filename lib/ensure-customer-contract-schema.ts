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

/** 客户用箱合同起止日（幂等） */
export async function ensureCustomerContractColumns(): Promise<void> {
  if (ensured) return
  try {
    await ensureColumn(
      "customers",
      "contractStart",
      "ALTER TABLE `customers` ADD COLUMN `contractStart` VARCHAR(16) NOT NULL DEFAULT '' AFTER `email`",
    )
    await ensureColumn(
      "customers",
      "contractEnd",
      "ALTER TABLE `customers` ADD COLUMN `contractEnd` VARCHAR(16) NOT NULL DEFAULT '' AFTER `contractStart`",
    )
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureCustomerContractColumns skipped:", (e as Error).message)
  }
}
