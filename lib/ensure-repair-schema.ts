import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"

let processLogEnsured = false
let quoteEnsured = false

async function columnExists(column: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'repair_orders'
       AND COLUMN_NAME = ?`,
    [column],
  )
  return Number((rows as { c: number }[])[0]?.c ?? 0) > 0
}

/** 为已有库补齐 repair_orders.processLog（幂等） */
export async function ensureRepairProcessLogColumn(): Promise<void> {
  if (processLogEnsured) return
  try {
    if (!(await columnExists("processLog"))) {
      await pool.query(`ALTER TABLE \`repair_orders\` ADD COLUMN \`processLog\` JSON NULL`)
      clearColumnCache("repair_orders")
      console.log("[v0] repair_orders.processLog column added")
    }
    processLogEnsured = true
  } catch (e) {
    console.warn("[v0] ensureRepairProcessLogColumn skipped:", (e as Error).message)
  }
}

const QUOTE_COLUMNS: { name: string; ddl: string }[] = [
  { name: "quoteLines", ddl: "ADD COLUMN `quoteLines` JSON NULL" },
  { name: "quoteStatus", ddl: "ADD COLUMN `quoteStatus` VARCHAR(20) NULL" },
  { name: "quoteTotal", ddl: "ADD COLUMN `quoteTotal` DECIMAL(12,2) NULL" },
  { name: "quoteApprovedBy", ddl: "ADD COLUMN `quoteApprovedBy` VARCHAR(100) NULL" },
  { name: "quoteApprovedAt", ddl: "ADD COLUMN `quoteApprovedAt` VARCHAR(30) NULL" },
  { name: "quoteRejectReason", ddl: "ADD COLUMN `quoteRejectReason` VARCHAR(500) NULL" },
]

/** 为已有库补齐 repair_orders 报价审批列（幂等） */
export async function ensureRepairQuoteColumns(): Promise<void> {
  if (quoteEnsured) return
  try {
    await ensureRepairProcessLogColumn()
    for (const col of QUOTE_COLUMNS) {
      if (!(await columnExists(col.name))) {
        await pool.query(`ALTER TABLE \`repair_orders\` ${col.ddl}`)
        console.log(`[v0] repair_orders.${col.name} column added`)
      }
    }
    clearColumnCache("repair_orders")
    quoteEnsured = true
  } catch (e) {
    console.warn("[v0] ensureRepairQuoteColumns skipped:", (e as Error).message)
  }
}
