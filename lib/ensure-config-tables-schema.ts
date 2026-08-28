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

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  return Number((rows as { c: number }[])[0]?.c ?? 0) > 0
}

/** 幂等补齐价目/代管公司表及扩展列 */
export async function ensureConfigTablesSchema(): Promise<void> {
  if (ensured) return
  try {
    if (!(await tableExists("use_box_price_rules"))) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`use_box_price_rules\` (
          \`id\` VARCHAR(32) NOT NULL,
          \`pickupCity\` VARCHAR(60) NOT NULL,
          \`returnCity\` VARCHAR(60) NOT NULL,
          \`containerType\` VARCHAR(10) NOT NULL,
          \`unitPrice\` DECIMAL(12,2) NOT NULL DEFAULT 0,
          \`freeDays\` INT NOT NULL DEFAULT 30,
          \`overdueDailyRate\` DECIMAL(12,2) NOT NULL DEFAULT 0,
          \`priceKind\` VARCHAR(20) NOT NULL DEFAULT 'standard',
          \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_ubpr_route_type\` (\`pickupCity\`, \`returnCity\`, \`containerType\`),
          KEY \`idx_ubpr_pickup\` (\`pickupCity\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log("[v0] use_box_price_rules table created")
    } else {
      if (!(await columnExists("use_box_price_rules", "freeDays"))) {
        await pool.query(
          "ALTER TABLE `use_box_price_rules` ADD COLUMN `freeDays` INT NOT NULL DEFAULT 30 AFTER `unitPrice`",
        )
      }
      if (!(await columnExists("use_box_price_rules", "overdueDailyRate"))) {
        await pool.query(
          "ALTER TABLE `use_box_price_rules` ADD COLUMN `overdueDailyRate` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `freeDays`",
        )
      }
      if (!(await columnExists("use_box_price_rules", "priceKind"))) {
        await pool.query(
          "ALTER TABLE `use_box_price_rules` ADD COLUMN `priceKind` VARCHAR(20) NOT NULL DEFAULT 'standard' AFTER `overdueDailyRate`",
        )
      }
    }
    clearColumnCache("use_box_price_rules")

    if (!(await tableExists("proxy_companies"))) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`proxy_companies\` (
          \`id\` VARCHAR(32) NOT NULL,
          \`name\` VARCHAR(120) NOT NULL,
          \`contactUser\` VARCHAR(100) NOT NULL DEFAULT '',
          \`phone\` VARCHAR(120) NOT NULL DEFAULT '',
          \`email\` VARCHAR(200) NOT NULL DEFAULT '',
          \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_proxy_name\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log("[v0] proxy_companies table created")
    }
    clearColumnCache("proxy_companies")

    if (!(await tableExists("dispatch_price_rules"))) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`dispatch_price_rules\` (
          \`id\` VARCHAR(32) NOT NULL,
          \`pickupPlace\` VARCHAR(120) NOT NULL,
          \`scope\` VARCHAR(200) NOT NULL,
          \`returnCities\` JSON NULL,
          \`unitPrice\` DECIMAL(12,2) NOT NULL DEFAULT 0,
          \`overdue\` VARCHAR(80) NOT NULL,
          \`suggestTerm\` INT NOT NULL DEFAULT 30,
          \`zone\` VARCHAR(20) NOT NULL,
          \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
          PRIMARY KEY (\`id\`),
          KEY \`idx_dpr_pickup\` (\`pickupPlace\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log("[v0] dispatch_price_rules table created")
    } else if (!(await columnExists("dispatch_price_rules", "returnCities"))) {
      await pool.query("ALTER TABLE `dispatch_price_rules` ADD COLUMN `returnCities` JSON NULL AFTER `scope`")
    }
    clearColumnCache("dispatch_price_rules")

    ensured = true
  } catch (e) {
    console.warn("[v0] ensureConfigTablesSchema skipped:", (e as Error).message)
  }
}
