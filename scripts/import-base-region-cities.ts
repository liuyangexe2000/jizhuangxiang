/**
 * 从 old sql/base_region.sql 提取提/还箱城市，写入：
 * 1) lib/data/city-dict.seed.ts（供 mock / db:init）
 * 2) 当前 MySQL city_dict 表（清空后全量导入，保留业务可用短名）
 *
 * 运行：npx tsx scripts/import-base-region-cities.ts
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import mysql from "mysql2/promise"
import dotenv from "dotenv"
import type { CityDictItem } from "../lib/types"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env.development.local") })

type RegionRow = {
  id: number
  parent_id: number
  name: string
  user_flag: string
  deleted: number
  level: number
}

/** 旧库短名/错名 → 本系统业务常用名 */
const NAME_ALIAS: Record<string, string> = {
  马拉: "马拉舍维奇",
}

/** 国家名清洗 */
const COUNTRY_ALIAS: Record<string, string> = {
  越南Vietnam: "越南",
}

/** 业务上常用城市编码（其余用 R{旧id}） */
const CODE_BY_NAME: Record<string, string> = {
  西安: "XA",
  郑州: "ZZ",
  成都: "CD",
  重庆: "CQ",
  武汉: "WH",
  北京: "BJ",
  上海: "SH",
  天津: "TJ",
  广州: "GZ",
  深圳: "SZ",
  青岛: "QD",
  大连: "DL",
  宁波: "NB",
  南京: "NJ",
  苏州: "SZU",
  杭州: "HZ",
  长沙: "CS",
  合肥: "HF",
  乌鲁木齐: "URC",
  汉堡: "HAM",
  杜伊斯堡: "DUI",
  纽伦堡: "NUE",
  慕尼黑: "MUC",
  法兰克福: "FRA",
  马拉舍维奇: "MAL",
  华沙: "WAW",
  罗兹: "LOZ",
  波兹南: "POZ",
  布达佩斯: "BUD",
  维也纳: "VIE",
  布拉格: "PRG",
  米兰: "MIL",
  鹿特丹: "RTM",
  安特卫普: "ANR",
  伦敦: "LON",
  莫斯科: "MOW",
  圣彼得堡: "LED",
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

function unquote(s: string) {
  if (s === "NULL") return null
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'")
  return s
}

function parseRegionSql(sql: string): RegionRow[] {
  const rows: RegionRow[] = []
  for (const line of sql.split(/\r?\n/)) {
    if (!line.includes("INSERT INTO `base_region`")) continue
    const parts = parseValues(line)
    if (!parts || parts.length < 14) continue
    rows.push({
      id: Number(parts[0]),
      parent_id: Number(parts[1]),
      name: String(unquote(parts[2]) ?? ""),
      user_flag: String(unquote(parts[3]) ?? "0"),
      deleted: Number(parts[8]),
      level: Number(parts[13]),
    })
  }
  return rows
}

/** 中国地级市名称去「市」；保留自治州/地区/盟等完整名 */
function normalizeCityName(raw: string, isChina: boolean): string {
  let name = raw.trim()
  if (NAME_ALIAS[name]) name = NAME_ALIAS[name]
  if (isChina) {
    if (name.endsWith("市") && !name.endsWith("自治州") && name.length > 2) {
      name = name.slice(0, -1)
    }
  }
  return name
}

function resolveMeta(
  node: RegionRow,
  byId: Map<number, RegionRow>,
): { country: string; province: string } | null {
  const parent = byId.get(node.parent_id)
  if (!parent) return null

  if (node.level === 3) {
    if (parent.level === 1) {
      return { country: COUNTRY_ALIAS[parent.name] ?? parent.name, province: "" }
    }
    if (parent.level === 2) {
      const country = byId.get(parent.parent_id)
      if (!country) return null
      return {
        country: COUNTRY_ALIAS[country.name] ?? country.name,
        province: parent.name,
      }
    }
    return null
  }

  // level=2 且无 level=3 子节点时，该节点本身即为可选城市（如俄罗斯/明斯克）
  if (node.level === 2 && parent.level === 1) {
    return {
      country: COUNTRY_ALIAS[parent.name] ?? parent.name,
      province: node.name,
    }
  }

  return null
}

function isActive(row: RegionRow) {
  return row.deleted === 0 && row.user_flag === "0"
}

function hasActiveLevel3Child(node: RegionRow, rows: RegionRow[]) {
  return rows.some((r) => r.parent_id === node.id && r.level === 3 && isActive(r))
}

function buildCityDict(rows: RegionRow[]): CityDictItem[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const level3 = rows.filter((r) => r.level === 3 && isActive(r))
  const level2Leaves = rows.filter(
    (r) => r.level === 2 && isActive(r) && !hasActiveLevel3Child(r, rows),
  )
  const selectable = [...level3, ...level2Leaves]

  const out: CityDictItem[] = []

  const sorted = [...selectable].sort((a, b) => {
    const ca = resolveMeta(a, byId)?.country === "中国" ? 0 : 1
    const cb = resolveMeta(b, byId)?.country === "中国" ? 0 : 1
    if (ca !== cb) return ca - cb
    return a.id - b.id
  })

  let sort = 1
  const usedCodes = new Set<string>()

  for (const c of sorted) {
    const meta = resolveMeta(c, byId)
    if (!meta) continue
    const isChina = meta.country === "中国"
    const name = normalizeCityName(c.name, isChina)
    if (!name) continue

    let code = CODE_BY_NAME[name] || `R${c.id}`
    if (usedCodes.has(code)) code = `R${c.id}`
    usedCodes.add(code)

    out.push({
      id: `c_${c.id}`,
      code,
      name,
      region: isChina ? "境内" : "境外",
      country: meta.country,
      province: meta.province,
      usableAsPickup: true,
      usableAsReturn: true,
      enabled: true,
      sort: sort++,
    })
  }
  return out
}

function writeSeedTs(cities: CityDictItem[]) {
  const outPath = path.join(root, "lib", "data", "city-dict.seed.ts")
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const body = `/**
 * 由 scripts/import-base-region-cities.ts 从 old sql/base_region.sql 生成
 * 请勿手工大段编辑；需更新时重新跑导入脚本。
 */
import type { CityDictItem } from "../types"

export const cityDictSeed: CityDictItem[] = ${JSON.stringify(cities, null, 2)}
`
  fs.writeFileSync(outPath, body, "utf8")
  console.log(`→ 已写入种子 ${outPath}（${cities.length} 条）`)
}

async function importToMysql(cities: CityDictItem[]) {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  const conn = await pool.getConnection()
  try {
    try {
      await conn.query(
        "ALTER TABLE `city_dict` ADD COLUMN `province` VARCHAR(60) NOT NULL DEFAULT '' AFTER `country`",
      )
    } catch {
      // 列已存在
    }
    await conn.beginTransaction()
    await conn.query("DELETE FROM `city_dict`")
    const sql = `INSERT INTO \`city_dict\`
      (\`id\`, \`code\`, \`name\`, \`region\`, \`country\`, \`province\`, \`usableAsPickup\`, \`usableAsReturn\`, \`enabled\`, \`sort\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    for (const c of cities) {
      await conn.query(sql, [
        c.id,
        c.code,
        c.name,
        c.region,
        c.country,
        c.province,
        c.usableAsPickup ? 1 : 0,
        c.usableAsReturn ? 1 : 0,
        c.enabled ? 1 : 0,
        c.sort,
      ])
    }
    await conn.commit()
    const [cnt] = await conn.query("SELECT COUNT(*) AS n FROM `city_dict`")
    console.log(`→ MySQL city_dict 已导入 ${(cnt as any[])[0].n} 条`)
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

async function main() {
  const sqlPath = path.join(root, "old sql", "base_region.sql")
  const sql = fs.readFileSync(sqlPath, "utf8")
  const regions = parseRegionSql(sql)
  console.log(`解析 base_region：${regions.length} 行`)

  const cities = buildCityDict(regions)
  const cn = cities.filter((c) => c.region === "境内").length
  const abroad = cities.filter((c) => c.region === "境外").length
  console.log(`提取城市：合计 ${cities.length}（境内 ${cn} / 境外 ${abroad}）`)
  console.log(
    "样例：",
    cities
      .filter((c) => ["西安", "汉堡", "马拉舍维奇", "华沙"].includes(c.name))
      .map((c) => `${c.name}/${c.code}/${c.country}`)
      .join(", "),
  )

  writeSeedTs(cities)
  await importToMysql(cities)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
