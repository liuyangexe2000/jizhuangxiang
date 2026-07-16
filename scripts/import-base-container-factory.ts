/**
 * 从 old sql/base_container_factory.sql 导入堆场全字段：
 * 1) lib/data/yards.seed.ts（供 mock / db:init）
 * 2) 当前 MySQL yards 表（重建表结构后全量导入）
 *
 * 原 id 写入 legacyId，本系统主键为 y_{legacyId}。
 * 运行：npx tsx scripts/import-base-container-factory.ts
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import mysql from "mysql2/promise"
import dotenv from "dotenv"
import type { Yard } from "../lib/types"
import { cityDictSeed } from "../lib/data/city-dict.seed"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env.development.local") })

const EXPECTED_COLS = 33

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
    // MySQL dump 常见 \' / \n 等转义（非仅标准 ''）
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

function numOrNull(s: string): number | null {
  const v = unquote(s)
  if (v === null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function strOrEmpty(s: string): string {
  return unquote(s) ?? ""
}

function dtOrEmpty(s: string): string {
  const v = unquote(s)
  if (!v) return ""
  return v.length >= 19 ? v.slice(0, 19) : v
}

function cityNameByRegionId(regionId: number | null): string {
  if (regionId == null) return ""
  const hit = cityDictSeed.find((c) => c.id === `c_${regionId}`)
  return hit?.name ?? ""
}

function rowToYard(parts: string[]): Yard | null {
  if (parts.length < EXPECTED_COLS) {
    console.warn(`跳过列数不足的行：期望 ${EXPECTED_COLS}，实际 ${parts.length}`)
    return null
  }
  const legacyId = Number(parts[0])
  if (!Number.isFinite(legacyId)) return null

  const regionId = numOrNull(parts[9])
  const hasSealRaw = strOrEmpty(parts[17])
  const useFlag = strOrEmpty(parts[18])
  const factoryType = strOrEmpty(parts[28])
  const deleted = Number(unquote(parts[23]) ?? "0")

  return {
    id: `y_${legacyId}`,
    legacyId,
    factoryId: strOrEmpty(parts[2]),
    factoryNumber: strOrEmpty(parts[1]),
    factoryCode: strOrEmpty(parts[30]),
    name: strOrEmpty(parts[3]),
    region: factoryType === "1" ? "境外" : "境内",
    city: cityNameByRegionId(regionId),
    regionId,
    agent: strOrEmpty(parts[29]),
    proxyCompanyId: strOrEmpty(parts[16]),
    address: strOrEmpty(parts[6]),
    phone: strOrEmpty(parts[5]),
    contactUser: strOrEmpty(parts[4]),
    email: strOrEmpty(parts[11]),
    creditCode: strOrEmpty(parts[10]),
    currencyId: numOrNull(parts[7]),
    dailyExpenses: numOrNull(parts[8]),
    freeDuration: numOrNull(parts[12]),
    boardingFee: numOrNull(parts[13]),
    alightingFee: numOrNull(parts[14]),
    secondaryRemovalFee: numOrNull(parts[15]),
    hasSeal: hasSealRaw === "0",
    capacity: 0,
    current: 0,
    enabled: useFlag !== "1",
    deleted: deleted === 1,
    version: numOrNull(parts[24]),
    remark: strOrEmpty(parts[25]),
    receiveRemark: strOrEmpty(parts[31]),
    remarkReturnOrder: strOrEmpty(parts[32]),
    createBy: strOrEmpty(parts[19]),
    createName: strOrEmpty(parts[26]),
    createTime: dtOrEmpty(parts[20]),
    updateBy: strOrEmpty(parts[21]),
    updateName: strOrEmpty(parts[27]),
    updateTime: dtOrEmpty(parts[22]),
  }
}

function parseFactorySql(sql: string): Yard[] {
  const yards: Yard[] = []
  const seen = new Set<number>()
  for (const line of sql.split(/\r?\n/)) {
    if (!line.includes("INSERT INTO `base_container_factory`")) continue
    const parts = parseValues(line)
    if (!parts) continue
    const yard = rowToYard(parts)
    if (!yard) continue
    if (seen.has(yard.legacyId)) {
      console.warn(`重复 legacyId=${yard.legacyId}，后写覆盖`)
    }
    seen.add(yard.legacyId)
    yards.push(yard)
  }
  yards.sort((a, b) => a.legacyId - b.legacyId)
  return yards
}

function writeSeedTs(yards: Yard[]) {
  const outPath = path.join(root, "lib", "data", "yards.seed.ts")
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const body = `/**
 * 由 scripts/import-base-container-factory.ts 从 old sql/base_container_factory.sql 生成
 * 请勿手工大段编辑；需更新时重新跑导入脚本。
 * legacyId = 老系统主键；本系统主键为 id（y_{legacyId}）。
 */
import type { Yard } from "../types"

export const yardsSeed: Yard[] = ${JSON.stringify(yards, null, 2)}
`
  fs.writeFileSync(outPath, body, "utf8")
  console.log(`→ 已写入种子 ${outPath}（${yards.length} 条）`)
}

const CREATE_YARDS_SQL = `
DROP TABLE IF EXISTS \`yards\`;
CREATE TABLE \`yards\` (
  \`id\` VARCHAR(32) NOT NULL,
  \`legacyId\` INT NOT NULL,
  \`factoryId\` VARCHAR(32) NOT NULL DEFAULT '',
  \`factoryNumber\` VARCHAR(50) NOT NULL DEFAULT '',
  \`factoryCode\` VARCHAR(100) NOT NULL DEFAULT '',
  \`name\` VARCHAR(120) NOT NULL,
  \`region\` VARCHAR(20) NOT NULL,
  \`city\` VARCHAR(60) NOT NULL DEFAULT '',
  \`regionId\` INT NULL,
  \`agent\` VARCHAR(120) NOT NULL DEFAULT '',
  \`proxyCompanyId\` VARCHAR(32) NOT NULL DEFAULT '',
  \`address\` VARCHAR(500) NOT NULL DEFAULT '',
  \`phone\` VARCHAR(120) NOT NULL DEFAULT '',
  \`contactUser\` VARCHAR(100) NOT NULL DEFAULT '',
  \`email\` VARCHAR(200) NOT NULL DEFAULT '',
  \`creditCode\` VARCHAR(60) NOT NULL DEFAULT '',
  \`currencyId\` INT NULL,
  \`dailyExpenses\` DECIMAL(12,4) NULL,
  \`freeDuration\` INT NULL,
  \`boardingFee\` DECIMAL(12,4) NULL,
  \`alightingFee\` DECIMAL(12,4) NULL,
  \`secondaryRemovalFee\` DECIMAL(12,4) NULL,
  \`hasSeal\` TINYINT(1) NOT NULL DEFAULT 0,
  \`capacity\` INT NOT NULL DEFAULT 0,
  \`current\` INT NOT NULL DEFAULT 0,
  \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
  \`deleted\` TINYINT(1) NOT NULL DEFAULT 0,
  \`version\` INT NULL,
  \`remark\` TEXT NULL,
  \`receiveRemark\` VARCHAR(200) NOT NULL DEFAULT '',
  \`remarkReturnOrder\` TEXT NULL,
  \`createBy\` VARCHAR(60) NOT NULL DEFAULT '',
  \`createName\` VARCHAR(50) NOT NULL DEFAULT '',
  \`createTime\` VARCHAR(32) NOT NULL DEFAULT '',
  \`updateBy\` VARCHAR(60) NOT NULL DEFAULT '',
  \`updateName\` VARCHAR(50) NOT NULL DEFAULT '',
  \`updateTime\` VARCHAR(32) NOT NULL DEFAULT '',
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_yards_legacyId\` (\`legacyId\`),
  KEY \`idx_yards_factoryId\` (\`factoryId\`),
  KEY \`idx_yards_factoryCode\` (\`factoryCode\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`

async function importToMysql(yards: Yard[]) {
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
    await conn.query(CREATE_YARDS_SQL)
    const sql = `INSERT INTO \`yards\` (
      \`id\`, \`legacyId\`, \`factoryId\`, \`factoryNumber\`, \`factoryCode\`,
      \`name\`, \`region\`, \`city\`, \`regionId\`, \`agent\`, \`proxyCompanyId\`,
      \`address\`, \`phone\`, \`contactUser\`, \`email\`, \`creditCode\`,
      \`currencyId\`, \`dailyExpenses\`, \`freeDuration\`, \`boardingFee\`, \`alightingFee\`, \`secondaryRemovalFee\`,
      \`hasSeal\`, \`capacity\`, \`current\`, \`enabled\`, \`deleted\`, \`version\`,
      \`remark\`, \`receiveRemark\`, \`remarkReturnOrder\`,
      \`createBy\`, \`createName\`, \`createTime\`, \`updateBy\`, \`updateName\`, \`updateTime\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

    await conn.beginTransaction()
    for (const y of yards) {
      await conn.query(sql, [
        y.id,
        y.legacyId,
        y.factoryId,
        y.factoryNumber,
        y.factoryCode,
        y.name,
        y.region,
        y.city,
        y.regionId,
        y.agent,
        y.proxyCompanyId,
        y.address,
        y.phone,
        y.contactUser,
        y.email,
        y.creditCode,
        y.currencyId,
        y.dailyExpenses,
        y.freeDuration,
        y.boardingFee,
        y.alightingFee,
        y.secondaryRemovalFee,
        y.hasSeal ? 1 : 0,
        y.capacity,
        y.current,
        y.enabled ? 1 : 0,
        y.deleted ? 1 : 0,
        y.version,
        y.remark || null,
        y.receiveRemark,
        y.remarkReturnOrder || null,
        y.createBy,
        y.createName,
        y.createTime,
        y.updateBy,
        y.updateName,
        y.updateTime,
      ])
    }
    await conn.commit()
    const [cnt] = await conn.query("SELECT COUNT(*) AS n FROM `yards`")
    console.log(`→ MySQL yards 已导入 ${(cnt as { n: number }[])[0].n} 条`)
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

async function main() {
  const sqlPath = path.join(root, "old sql", "base_container_factory.sql")
  const sql = fs.readFileSync(sqlPath, "utf8")
  const yards = parseFactorySql(sql)
  const cn = yards.filter((y) => y.region === "境内").length
  const abroad = yards.filter((y) => y.region === "境外").length
  const enabled = yards.filter((y) => y.enabled).length
  const withCity = yards.filter((y) => y.city).length
  console.log(`解析 base_container_factory：${yards.length} 条`)
  console.log(`境内 ${cn} / 境外 ${abroad}；启用 ${enabled}；已解析城市 ${withCity}`)
  console.log(
    "样例：",
    yards
      .slice(0, 3)
      .map((y) => `${y.legacyId}:${y.name}/${y.city || "-"}/${y.factoryCode}`)
      .join(", "),
  )

  writeSeedTs(yards)
  await importToMysql(yards)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
