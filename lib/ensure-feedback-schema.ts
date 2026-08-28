import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"

let ensured = false

/** 幂等补齐 feedback_tickets.processFeedback（工单处理反馈） */
export async function ensureFeedbackProcessFeedbackColumn(): Promise<void> {
  if (ensured) return
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'feedback_tickets'
         AND COLUMN_NAME = 'processFeedback'`,
    )
    const count = Number((rows as { c: number }[])[0]?.c ?? 0)
    if (count === 0) {
      await pool.query(
        `ALTER TABLE \`feedback_tickets\` ADD COLUMN \`processFeedback\` TEXT NULL AFTER \`status\``,
      )
      clearColumnCache("feedback_tickets")
      console.log("[v0] feedback_tickets.processFeedback column added")
    }
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureFeedbackProcessFeedbackColumn skipped:", (e as Error).message)
  }
}
