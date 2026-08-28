import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"

let ensured = false

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  )
  return Number((rows as { c: number }[])[0]?.c ?? 0) > 0
}

/** 幂等创建 account_applications 表 */
export async function ensureAccountApplicationsSchema(): Promise<void> {
  if (ensured) return
  try {
    if (!(await tableExists("account_applications"))) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`account_applications\` (
          \`id\` VARCHAR(32) NOT NULL,
          \`name\` VARCHAR(100) NOT NULL,
          \`org\` VARCHAR(200) NOT NULL,
          \`email\` VARCHAR(200) NOT NULL,
          \`phone\` VARCHAR(30) NOT NULL,
          \`remark\` VARCHAR(500) NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT '待审核',
          \`createdAt\` VARCHAR(30) NOT NULL,
          \`reviewedAt\` VARCHAR(30) NULL,
          \`reviewedBy\` VARCHAR(100) NULL,
          \`rejectReason\` VARCHAR(500) NULL,
          \`createdUserId\` VARCHAR(32) NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_aa_status\` (\`status\`),
          KEY \`idx_aa_email\` (\`email\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log("[v0] account_applications table created")
    }
    clearColumnCache("account_applications")
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureAccountApplicationsSchema skipped:", (e as Error).message)
  }
}
