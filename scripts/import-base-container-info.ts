/**
 * 从 old sql/base_container_info.sql 导入集装箱主档：
 * 1) lib/data/containers.seed.ts（供 mock / db:init）
 * 2) 当前 MySQL container_masters 表（重建表结构后全量导入）
 *
 * 原 id 写入 legacyId，本系统主键为 containerNo。
 * 跳过全表无数据字段：container_uuid / temp_* / fuel* / rental_cost / version
 *
 * 运行：pnpm db:import-containers
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import mysql from "mysql2/promise"
import dotenv from "dotenv"
import type { ContainerMaster, ContainerType } from "../lib/types"
import { DEFAULT_CONTAINER_TYPE } from "../lib/container-types"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env.development.local") })

/** 与 CREATE TABLE 列顺序一致，共 40 列 */
const EXPECTED_COLS = 40

/**
 * 老系统 container_type_id=3 + container_type_spec_id=166 为本批数据唯一组合；
 * 尚无类型字典表时按业务默认映射为 40HQ（导入后仍保留原始 id 便于二次匹配）。
 */
const TYPE_MAP: Record<string, ContainerType> = {
  "3:166": "40HQ",
}

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

function epochToLocal(epoch: number | null): string {
  if (epoch == null || !Number.isFinite(epoch) || epoch <= 0) return ""
  const d = new Date(epoch * 1000)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 「中国-陕西省-西安市」→「西安」；「青岛市」→「青岛」 */
function parseCityName(raw: string): string {
  if (!raw) return ""
  const parts = raw
    .split("-")
    .map((s) => s.trim())
    .filter(Boolean)
  let name = parts[parts.length - 1] || raw
  name = name.replace(/(特别行政区|自治区|地区|盟|州|市|县|区)$/u, "")
  return name || raw
}

function mapOwnership(attr: string): ContainerMaster["ownership"] {
  return attr === "2" || attr === "3" ? "租赁箱" : "自有箱"
}

function mapStatus(code: string): ContainerMaster["status"] {
  switch (code) {
    case "1":
      return "在途"
    case "3":
      return "维修中"
    case "4":
      return "已报废"
    case "2":
      return "在场" // 锁定：业务展示仍按在场，码保留在 statusCode
    default:
      return "在场"
  }
}

function mapType(typeId: number | null, specId: number | null): ContainerType {
  const key = `${typeId ?? ""}:${specId ?? ""}`
  return TYPE_MAP[key] ?? DEFAULT_CONTAINER_TYPE
}

function calcStorageDays(startEpoch: number | null, nowSec: number): number {
  if (startEpoch == null || startEpoch <= 0) return 0
  return Math.max(0, Math.floor((nowSec - startEpoch) / 86400))
}

function rowToContainer(parts: string[], nowSec: number): ContainerMaster | null {
  if (parts.length < EXPECTED_COLS) {
    console.warn(`跳过列数不足的行：期望 ${EXPECTED_COLS}，实际 ${parts.length}`)
    return null
  }
  const legacyId = Number(parts[0])
  if (!Number.isFinite(legacyId)) return null

  const containerNo = strOrEmpty(parts[2]).trim().toUpperCase()
  if (!containerNo) return null

  const containerTypeId = numOrNull(parts[3])
  const containerTypeSpecId = numOrNull(parts[4])
  const attr = strOrEmpty(parts[5]) || "1"
  const cityRaw = strOrEmpty(parts[7])
  const statusCode = strOrEmpty(parts[16]) || "0"
  const startTime = numOrNull(parts[37])
  const updateTime = dtOrEmpty(parts[31])
  const lastGateTime = updateTime || epochToLocal(startTime) || ""

  return {
    containerNo,
    legacyId,
    type: mapType(containerTypeId, containerTypeSpecId),
    containerTypeId,
    containerTypeSpecId,
    ownership: mapOwnership(attr),
    containerAttribute: attr,
    containerSupplierId: strOrEmpty(parts[6]),
    cityRaw,
    currentCity: parseCityName(cityRaw),
    currentYard: strOrEmpty(parts[8]),
    factoryId: strOrEmpty(parts[9]),
    color: strOrEmpty(parts[14]),
    batch: strOrEmpty(parts[15]),
    status: mapStatus(statusCode),
    statusCode,
    validStart: numOrNull(parts[17]),
    validEnd: numOrNull(parts[18]),
    currencyId: numOrNull(parts[20]),
    exchangeRate: numOrNull(parts[21]) ?? 0,
    containerLife: numOrNull(parts[22]),
    productionTime: numOrNull(parts[23]),
    manufacturer: strOrEmpty(parts[24]),
    depreciation: numOrNull(parts[25]),
    purchasePrice: numOrNull(parts[26]),
    lifeCycle: numOrNull(parts[27]),
    createBy: strOrEmpty(parts[28]),
    createTime: dtOrEmpty(parts[29]),
    updateBy: strOrEmpty(parts[30]),
    updateTime,
    deleted: Number(unquote(parts[32]) ?? "0") === 1,
    remark: strOrEmpty(parts[34]),
    createName: strOrEmpty(parts[35]),
    updateName: strOrEmpty(parts[36]),
    startTime,
    manualStatus: strOrEmpty(parts[38]) || "0",
    freeDay: numOrNull(parts[39]) ?? 0,
    lastGateTime,
    storageDays: calcStorageDays(startTime, nowSec),
  }
}

function parseContainerSql(sql: string): ContainerMaster[] {
  const nowSec = Math.floor(Date.now() / 1000)
  const list: ContainerMaster[] = []
  const seenNo = new Set<string>()
  const seenLegacy = new Set<number>()

  for (const line of sql.split(/\r?\n/)) {
    if (!line.includes("INSERT INTO `base_container_info`")) continue
    const parts = parseValues(line)
    if (!parts) continue
    const row = rowToContainer(parts, nowSec)
    if (!row || row.legacyId == null) continue
    if (seenLegacy.has(row.legacyId)) {
      console.warn(`重复 legacyId=${row.legacyId}，后写覆盖`)
    }
    if (seenNo.has(row.containerNo)) {
      console.warn(`重复箱号 ${row.containerNo}（legacyId=${row.legacyId}），后写覆盖`)
      const idx = list.findIndex((c) => c.containerNo === row.containerNo)
      if (idx >= 0) list.splice(idx, 1)
    }
    seenLegacy.add(row.legacyId)
    seenNo.add(row.containerNo)
    list.push(row)
  }
  list.sort((a, b) => (a.legacyId ?? 0) - (b.legacyId ?? 0))
  return list
}

function writeSeedTs(rows: ContainerMaster[]) {
  const outPath = path.join(root, "lib", "data", "containers.seed.ts")
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const body = `/**
 * 由 scripts/import-base-container-info.ts 从 old sql/base_container_info.sql 生成
 * 请勿手工大段编辑；需更新时重新跑导入脚本。
 * legacyId = 老系统主键；本系统主键为 containerNo。
 * 已跳过全空字段：container_uuid / temp_start / temp_end / fuel / fuel_type / rental_cost / version
 */
import type { ContainerMaster } from "../types"

export const containerMastersSeed: ContainerMaster[] = ${JSON.stringify(rows, null, 2)}
`
  fs.writeFileSync(outPath, body, "utf8")
  console.log(`→ 已写入种子 ${outPath}（${rows.length} 条）`)
}

const CREATE_CONTAINERS_SQL = `
DROP TABLE IF EXISTS \`container_masters\`;
CREATE TABLE \`container_masters\` (
  \`containerNo\` VARCHAR(40) NOT NULL,
  \`legacyId\` INT NULL,
  \`type\` VARCHAR(10) NOT NULL,
  \`containerTypeId\` INT NULL,
  \`containerTypeSpecId\` INT NULL,
  \`ownership\` VARCHAR(20) NOT NULL,
  \`containerAttribute\` CHAR(1) NOT NULL DEFAULT '1',
  \`containerSupplierId\` VARCHAR(32) NOT NULL DEFAULT '',
  \`cityRaw\` VARCHAR(120) NOT NULL DEFAULT '',
  \`currentCity\` VARCHAR(60) NOT NULL DEFAULT '',
  \`currentYard\` VARCHAR(120) NOT NULL DEFAULT '',
  \`factoryId\` VARCHAR(64) NOT NULL DEFAULT '',
  \`color\` VARCHAR(20) NOT NULL DEFAULT '',
  \`batch\` VARCHAR(20) NOT NULL DEFAULT '',
  \`status\` VARCHAR(20) NOT NULL,
  \`statusCode\` CHAR(1) NOT NULL DEFAULT '0',
  \`validStart\` BIGINT NULL,
  \`validEnd\` BIGINT NULL,
  \`currencyId\` INT NULL,
  \`exchangeRate\` DECIMAL(12,2) NOT NULL DEFAULT 0,
  \`containerLife\` INT NULL,
  \`productionTime\` BIGINT NULL,
  \`manufacturer\` VARCHAR(60) NOT NULL DEFAULT '',
  \`depreciation\` DECIMAL(12,4) NULL,
  \`purchasePrice\` DECIMAL(12,4) NULL,
  \`lifeCycle\` INT NULL,
  \`createBy\` VARCHAR(60) NOT NULL DEFAULT '',
  \`createTime\` VARCHAR(32) NOT NULL DEFAULT '',
  \`updateBy\` VARCHAR(60) NOT NULL DEFAULT '',
  \`updateTime\` VARCHAR(32) NOT NULL DEFAULT '',
  \`deleted\` TINYINT(1) NOT NULL DEFAULT 0,
  \`remark\` TEXT NULL,
  \`createName\` VARCHAR(50) NOT NULL DEFAULT '',
  \`updateName\` VARCHAR(50) NOT NULL DEFAULT '',
  \`startTime\` BIGINT NULL,
  \`manualStatus\` CHAR(1) NOT NULL DEFAULT '0',
  \`freeDay\` INT NOT NULL DEFAULT 0,
  \`lastGateTime\` VARCHAR(32) NOT NULL DEFAULT '',
  \`storageDays\` INT NOT NULL DEFAULT 0,
  \`relatedOrderNo\` VARCHAR(40) NULL,
  PRIMARY KEY (\`containerNo\`),
  UNIQUE KEY \`uk_cm_legacyId\` (\`legacyId\`),
  KEY \`idx_cm_factoryId\` (\`factoryId\`),
  KEY \`idx_cm_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`

async function importToMysql(rows: ContainerMaster[]) {
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
    await conn.query(CREATE_CONTAINERS_SQL)
    const sql = `INSERT INTO \`container_masters\` (
      \`containerNo\`, \`legacyId\`, \`type\`, \`containerTypeId\`, \`containerTypeSpecId\`,
      \`ownership\`, \`containerAttribute\`, \`containerSupplierId\`,
      \`cityRaw\`, \`currentCity\`, \`currentYard\`, \`factoryId\`,
      \`color\`, \`batch\`, \`status\`, \`statusCode\`,
      \`validStart\`, \`validEnd\`, \`currencyId\`, \`exchangeRate\`,
      \`containerLife\`, \`productionTime\`, \`manufacturer\`,
      \`depreciation\`, \`purchasePrice\`, \`lifeCycle\`,
      \`createBy\`, \`createTime\`, \`updateBy\`, \`updateTime\`, \`deleted\`,
      \`remark\`, \`createName\`, \`updateName\`,
      \`startTime\`, \`manualStatus\`, \`freeDay\`,
      \`lastGateTime\`, \`storageDays\`, \`relatedOrderNo\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

    await conn.beginTransaction()
    const batchSize = 200
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize)
      for (const c of chunk) {
        await conn.query(sql, [
          c.containerNo,
          c.legacyId ?? null,
          c.type,
          c.containerTypeId ?? null,
          c.containerTypeSpecId ?? null,
          c.ownership,
          c.containerAttribute ?? "1",
          c.containerSupplierId ?? "",
          c.cityRaw ?? "",
          c.currentCity,
          c.currentYard,
          c.factoryId ?? "",
          c.color ?? "",
          c.batch ?? "",
          c.status,
          c.statusCode ?? "0",
          c.validStart ?? null,
          c.validEnd ?? null,
          c.currencyId ?? null,
          c.exchangeRate ?? 0,
          c.containerLife ?? null,
          c.productionTime ?? null,
          c.manufacturer ?? "",
          c.depreciation ?? null,
          c.purchasePrice ?? null,
          c.lifeCycle ?? null,
          c.createBy ?? "",
          c.createTime ?? "",
          c.updateBy ?? "",
          c.updateTime ?? "",
          c.deleted ? 1 : 0,
          c.remark || null,
          c.createName ?? "",
          c.updateName ?? "",
          c.startTime ?? null,
          c.manualStatus ?? "0",
          c.freeDay ?? 0,
          c.lastGateTime,
          c.storageDays,
          c.relatedOrderNo ?? null,
        ])
      }
      console.log(`  … 已写入 ${Math.min(i + batchSize, rows.length)} / ${rows.length}`)
    }
    await conn.commit()
    console.log(`→ MySQL 导入完成：${rows.length} 条 → container_masters`)
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

async function main() {
  const sqlPath = path.join(root, "old sql", "base_container_info.sql")
  if (!fs.existsSync(sqlPath)) {
    console.error(`找不到源文件：${sqlPath}`)
    process.exit(1)
  }
  console.log(`→ 读取 ${sqlPath}`)
  const sql = fs.readFileSync(sqlPath, "utf8")
  const rows = parseContainerSql(sql)
  console.log(`→ 解析得到 ${rows.length} 条集装箱`)
  if (rows.length === 0) {
    console.error("无有效数据，中止")
    process.exit(1)
  }

  const statusCount = new Map<string, number>()
  for (const r of rows) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1)
  console.log("  状态分布：", Object.fromEntries(statusCount))

  writeSeedTs(rows)
  await importToMysql(rows)
  console.log("→ 同步五维库存台账…")
  const { spawnSync } = await import("node:child_process")
  const r = spawnSync("npx", ["tsx", "scripts/rebuild-inventory-from-containers.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  })
  if (r.status !== 0) {
    console.warn("库存重算失败，可稍后手动执行：pnpm db:rebuild-inventory")
  }
  console.log("完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
