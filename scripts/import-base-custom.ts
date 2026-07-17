/**
 * 从 old sql/base_custom.sql 导入客户主档：
 * 1) lib/data/customers-list.seed.ts（供 mock / db:init）
 * 2) 当前 MySQL customers 表（重建表结构后全量导入）
 *
 * 原 id 写入 legacyId，本系统主键为 cu_{legacyId}。
 * 跳过全表无数据字段：version / remark
 *
 * 运行：pnpm db:import-customers
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import mysql from "mysql2/promise"
import dotenv from "dotenv"
import type { Customer } from "../lib/types"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env.development.local") })

const EXPECTED_COLS = 21

function parseValues(line: string): string[] | null {
  const idx = line.indexOf("VALUES (")
  if (idx < 0) return null
  const body = line.slice(idx + "VALUES (".length)
  const end = body.lastIndexOf(");")
  if (end < 0) return null
  const inner = body.slice(0, end)
  const parts: string[] = []
  let cur = ""
  let inStr = false
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === "\\" && inStr && i + 1 < inner.length) {
      const next = inner[i + 1]
      if (next === "n") cur += "\n"
      else if (next === "r") cur += "\r"
      else if (next === "t") cur += "\t"
      else cur += next
      i++
      continue
    }
    if (ch === "'" && !inStr) {
      inStr = true
      cur += ch
      continue
    }
    if (ch === "'" && inStr) {
      if (inner[i + 1] === "'") {
        cur += "''"
        i++
        continue
      }
      inStr = false
      cur += ch
      continue
    }
    if (ch === "," && !inStr) {
      parts.push(cur.trim())
      cur = ""
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function unquote(s: string): string | null {
  if (s === "NULL") return null
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'")
  return s
}

function strOrEmpty(s: string): string {
  return unquote(s) ?? ""
}

function dtOrEmpty(s: string): string {
  const v = unquote(s)
  if (!v) return ""
  return v.length >= 19 ? v.slice(0, 19) : v
}

function rowToCustomer(parts: string[]): Customer | null {
  if (parts.length < EXPECTED_COLS) {
    console.warn(`跳过列数不足的行：期望 ${EXPECTED_COLS}，实际 ${parts.length}`)
    return null
  }
  const legacyId = Number(parts[0])
  if (!Number.isFinite(legacyId)) return null
  const name = strOrEmpty(parts[2]).trim()
  if (!name) return null

  const hasSealRaw = strOrEmpty(parts[8])
  const useFlag = strOrEmpty(parts[9])
  const deleted = Number(unquote(parts[14]) ?? "0")

  return {
    id: `cu_${legacyId}`,
    legacyId,
    customId: strOrEmpty(parts[1]),
    name,
    abbreviation: strOrEmpty(parts[3]),
    contactUser: strOrEmpty(parts[4]),
    contactPhone: strOrEmpty(parts[5]),
    address: strOrEmpty(parts[6]),
    creditCode: strOrEmpty(parts[7]),
    hasSeal: hasSealRaw === "0",
    enabled: useFlag !== "1",
    deleted: deleted === 1,
    createBy: strOrEmpty(parts[10]),
    createTime: dtOrEmpty(parts[11]),
    updateBy: strOrEmpty(parts[12]),
    updateTime: dtOrEmpty(parts[13]),
    createName: strOrEmpty(parts[17]),
    updateName: strOrEmpty(parts[18]),
    identityCard: strOrEmpty(parts[19]),
    email: strOrEmpty(parts[20]),
  }
}

function parseCustomSql(sql: string): Customer[] {
  const list: Customer[] = []
  const seen = new Set<number>()
  for (const line of sql.split(/\r?\n/)) {
    if (!line.includes("INSERT INTO `base_custom`")) continue
    const parts = parseValues(line)
    if (!parts) continue
    const row = rowToCustomer(parts)
    if (!row) continue
    if (seen.has(row.legacyId)) {
      console.warn(`重复 legacyId=${row.legacyId}，后写覆盖`)
      const idx = list.findIndex((c) => c.legacyId === row.legacyId)
      if (idx >= 0) list.splice(idx, 1)
    }
    seen.add(row.legacyId)
    list.push(row)
  }
  list.sort((a, b) => a.legacyId - b.legacyId)
  return list
}

function writeSeedTs(rows: Customer[]) {
  const outPath = path.join(root, "lib", "data", "customers-list.seed.ts")
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const body = `/**
 * 由 scripts/import-base-custom.ts 从 old sql/base_custom.sql 生成
 * 请勿手工大段编辑；需更新时重新跑导入脚本。
 * legacyId = 老系统主键；本系统主键为 id（cu_{legacyId}）。
 * 已跳过全空字段：version / remark
 */
import type { Customer } from "../types"

export const customersSeed: Customer[] = ${JSON.stringify(rows, null, 2)}
`
  fs.writeFileSync(outPath, body, "utf8")
  console.log(`→ 已写入种子 ${outPath}（${rows.length} 条）`)
}

const CREATE_CUSTOMERS_SQL = `
DROP TABLE IF EXISTS \`customers\`;
CREATE TABLE \`customers\` (
  \`id\` VARCHAR(32) NOT NULL,
  \`legacyId\` INT NOT NULL,
  \`customId\` VARCHAR(32) NOT NULL DEFAULT '',
  \`name\` VARCHAR(120) NOT NULL,
  \`abbreviation\` VARCHAR(120) NOT NULL DEFAULT '',
  \`contactUser\` VARCHAR(120) NOT NULL DEFAULT '',
  \`contactPhone\` VARCHAR(40) NOT NULL DEFAULT '',
  \`address\` VARCHAR(300) NOT NULL DEFAULT '',
  \`creditCode\` VARCHAR(60) NOT NULL DEFAULT '',
  \`hasSeal\` TINYINT(1) NOT NULL DEFAULT 0,
  \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
  \`deleted\` TINYINT(1) NOT NULL DEFAULT 0,
  \`createBy\` VARCHAR(60) NOT NULL DEFAULT '',
  \`createName\` VARCHAR(50) NOT NULL DEFAULT '',
  \`createTime\` VARCHAR(32) NOT NULL DEFAULT '',
  \`updateBy\` VARCHAR(60) NOT NULL DEFAULT '',
  \`updateName\` VARCHAR(50) NOT NULL DEFAULT '',
  \`updateTime\` VARCHAR(32) NOT NULL DEFAULT '',
  \`identityCard\` VARCHAR(150) NOT NULL DEFAULT '',
  \`email\` VARCHAR(200) NOT NULL DEFAULT '',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_customers_legacyId\` (\`legacyId\`),
  KEY \`idx_customers_customId\` (\`customId\`),
  KEY \`idx_customers_name\` (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`

async function importToMysql(rows: Customer[]) {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })
  const conn = await pool.getConnection()
  try {
    await conn.query(CREATE_CUSTOMERS_SQL)
    const sql = `INSERT INTO \`customers\` (
      \`id\`, \`legacyId\`, \`customId\`, \`name\`, \`abbreviation\`,
      \`contactUser\`, \`contactPhone\`, \`address\`, \`creditCode\`,
      \`hasSeal\`, \`enabled\`, \`deleted\`,
      \`createBy\`, \`createName\`, \`createTime\`,
      \`updateBy\`, \`updateName\`, \`updateTime\`,
      \`identityCard\`, \`email\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

    await conn.beginTransaction()
    for (const c of rows) {
      await conn.query(sql, [
        c.id,
        c.legacyId,
        c.customId,
        c.name,
        c.abbreviation,
        c.contactUser,
        c.contactPhone,
        c.address,
        c.creditCode,
        c.hasSeal ? 1 : 0,
        c.enabled ? 1 : 0,
        c.deleted ? 1 : 0,
        c.createBy,
        c.createName,
        c.createTime,
        c.updateBy,
        c.updateName,
        c.updateTime,
        c.identityCard,
        c.email,
      ])
    }
    await conn.commit()
    console.log(`→ MySQL 导入完成：${rows.length} 条 → customers`)
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

async function main() {
  const sqlPath = path.join(root, "old sql", "base_custom.sql")
  if (!fs.existsSync(sqlPath)) {
    console.error(`找不到源文件：${sqlPath}`)
    process.exit(1)
  }
  console.log(`→ 读取 ${sqlPath}`)
  const sql = fs.readFileSync(sqlPath, "utf8")
  const rows = parseCustomSql(sql)
  console.log(`→ 解析得到 ${rows.length} 条客户`)
  if (rows.length === 0) {
    console.error("无有效数据，中止")
    process.exit(1)
  }
  const enabled = rows.filter((r) => r.enabled && !r.deleted).length
  console.log(`  启用且未删除：${enabled}，停用/删除：${rows.length - enabled}`)

  writeSeedTs(rows)
  await importToMysql(rows)
  console.log("完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
