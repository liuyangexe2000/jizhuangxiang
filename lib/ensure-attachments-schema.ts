import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"

let ensured = false

/** 为已有库补齐 attachments.storagePath（幂等） */
export async function ensureAttachmentsStoragePathColumn(): Promise<void> {
  if (ensured) return
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'attachments'
         AND COLUMN_NAME = 'storagePath'`,
    )
    const count = Number((rows as { c: number }[])[0]?.c ?? 0)
    if (count === 0) {
      await pool.query(`ALTER TABLE \`attachments\` ADD COLUMN \`storagePath\` VARCHAR(500) NULL`)
      clearColumnCache("attachments")
      console.log("[v0] attachments.storagePath column added")
    }
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureAttachmentsStoragePathColumn skipped:", (e as Error).message)
  }
}
