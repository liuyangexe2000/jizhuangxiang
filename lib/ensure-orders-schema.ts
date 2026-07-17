import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"

let ensured = false

/** 为已有库补齐 use_box_orders.containerNos（幂等） */
export async function ensureOrdersContainerNosColumn(): Promise<void> {
  if (ensured) return
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'use_box_orders'
         AND COLUMN_NAME = 'containerNos'`,
    )
    const count = Number((rows as { c: number }[])[0]?.c ?? 0)
    if (count === 0) {
      await pool.query(`ALTER TABLE \`use_box_orders\` ADD COLUMN \`containerNos\` JSON NULL`)
      clearColumnCache("use_box_orders")
      console.log("[v0] use_box_orders.containerNos column added")
    }
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureOrdersContainerNosColumn skipped:", (e as Error).message)
  }
}
