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

async function ensureColumn(table: string, column: string, ddl: string) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  if (Number((rows as { c: number }[])[0]?.c ?? 0) === 0) {
    await pool.query(ddl)
    clearColumnCache(table)
  }
}

/** 审批通过后暂存登录凭据，供申请人自助查询（首次查询后清除密码） */
export async function ensureAccountApplicationCredentialColumns(): Promise<void> {
  await ensureAccountApplicationsSchema()
  try {
    await ensureColumn(
      "account_applications",
      "issuedLoginAccount",
      "ALTER TABLE `account_applications` ADD COLUMN `issuedLoginAccount` VARCHAR(64) NULL AFTER `createdUserId`",
    )
    await ensureColumn(
      "account_applications",
      "issuedInitialPassword",
      "ALTER TABLE `account_applications` ADD COLUMN `issuedInitialPassword` VARCHAR(64) NULL AFTER `issuedLoginAccount`",
    )
  } catch (e) {
    console.warn("[v0] ensureAccountApplicationCredentialColumns skipped:", (e as Error).message)
  }
}
