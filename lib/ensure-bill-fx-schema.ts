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

/** 账单币种 / 汇率 / 折合人民币（幂等） */
export async function ensureBillFxColumns(): Promise<void> {
  if (ensured) return
  try {
    await ensureColumn(
      "bills",
      "currency",
      "ALTER TABLE `bills` ADD COLUMN `currency` VARCHAR(4) NOT NULL DEFAULT 'CNY' AFTER `amount`",
    )
    await ensureColumn(
      "bills",
      "exchangeRate",
      "ALTER TABLE `bills` ADD COLUMN `exchangeRate` DECIMAL(12,6) NOT NULL DEFAULT 1 AFTER `currency`",
    )
    await ensureColumn(
      "bills",
      "amountCny",
      "ALTER TABLE `bills` ADD COLUMN `amountCny` DECIMAL(12,2) NULL AFTER `exchangeRate`",
    )
    // 历史行：折合人民币默认等于 amount
    await pool.query(
      "UPDATE `bills` SET `amountCny` = `amount` WHERE `amountCny` IS NULL OR `currency` = 'CNY'",
    )
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureBillFxColumns skipped:", (e as Error).message)
  }
}
