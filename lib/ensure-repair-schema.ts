import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"

let ensured = false

/** 为已有库补齐 repair_orders.processLog（幂等） */
export async function ensureRepairProcessLogColumn(): Promise<void> {
  if (ensured) return
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'repair_orders'
         AND COLUMN_NAME = 'processLog'`,
    )
    const count = Number((rows as { c: number }[])[0]?.c ?? 0)
    if (count === 0) {
      await pool.query(`ALTER TABLE \`repair_orders\` ADD COLUMN \`processLog\` JSON NULL`)
      clearColumnCache("repair_orders")
      console.log("[v0] repair_orders.processLog column added")
    }
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureRepairProcessLogColumn skipped:", (e as Error).message)
  }
}
