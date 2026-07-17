/**
 * 根据堆场数据，同步城市字典启用状态：
 * - 存在「未删除且启用」堆场的城市 → enabled + usableAsPickup + usableAsReturn 全开
 * - 其余城市 → 全部停用（enabled / 可提 / 可还 均为 false）
 *
 * 匹配优先 regionId → city_dict.id（c_{regionId}），其次按城市名称。
 *
 * 运行：pnpm db:sync-cities-by-yards
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import mysql from "mysql2/promise"
import dotenv from "dotenv"
import type { CityDictItem, Yard } from "../lib/types"
import { cityDictSeed } from "../lib/data/city-dict.seed"
import { yardsSeed } from "../lib/data/yards.seed"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env.development.local") })

function activeYards(yards: Yard[]): Yard[] {
  return yards.filter((y) => !y.deleted && y.enabled !== false)
}

/** 有堆场的城市 id 集合 */
export function cityIdsWithYards(yards: Yard[], cities: CityDictItem[]): Set<string> {
  const active = activeYards(yards)
  const regionIds = new Set(
    active.map((y) => y.regionId).filter((id): id is number => id != null && Number.isFinite(id)),
  )
  const names = new Set(active.map((y) => y.city.trim()).filter(Boolean))

  const ids = new Set<string>()
  for (const c of cities) {
    const m = /^c_(\d+)$/.exec(c.id)
    if (m && regionIds.has(Number(m[1]))) {
      ids.add(c.id)
      continue
    }
    if (names.has(c.name)) ids.add(c.id)
  }
  return ids
}

export function applyCityFlagsByYards(
  cities: CityDictItem[],
  yards: Yard[],
): { next: CityDictItem[]; enabledNames: string[]; disabledCount: number } {
  const withYard = cityIdsWithYards(yards, cities)
  const next = cities.map((c) => {
    const on = withYard.has(c.id)
    return {
      ...c,
      enabled: on,
      usableAsPickup: on,
      usableAsReturn: on,
    }
  })
  const enabledNames = next.filter((c) => c.enabled).map((c) => c.name).sort((a, b) => a.localeCompare(b, "zh"))
  const disabledCount = next.filter((c) => !c.enabled).length
  return { next, enabledNames, disabledCount }
}

function writeSeed(cities: CityDictItem[]) {
  const outPath = path.join(root, "lib", "data", "city-dict.seed.ts")
  const body = `/**
 * 由 scripts/import-base-region-cities.ts 从 old sql/base_region.sql 生成；
 * 启用状态由 scripts/sync-cities-by-yards.ts 按堆场回写（有堆场城市才启用可提/可还）。
 * 请勿手工大段编辑城市列表；启用状态请跑 pnpm db:sync-cities-by-yards。
 */
import type { CityDictItem } from "../types"

export const cityDictSeed: CityDictItem[] = ${JSON.stringify(cities, null, 2)}
`
  fs.writeFileSync(outPath, body, "utf8")
  console.log(`→ 已写入种子 ${outPath}（${cities.length} 条）`)
}

async function loadFromMysql(): Promise<{ yards: Yard[]; cities: CityDictItem[] } | null> {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    })
    const conn = await pool.getConnection()
    try {
      await conn.query("SELECT 1")
      const [yardRows] = await conn.query("SELECT * FROM `yards`")
      const [cityRows] = await conn.query("SELECT * FROM `city_dict`")
      const yards = (yardRows as Record<string, unknown>[]).map((r) => ({
        ...r,
        enabled: r.enabled === 1 || r.enabled === true || r.enabled === "1",
        deleted: r.deleted === 1 || r.deleted === true || r.deleted === "1",
        hasSeal: r.hasSeal === 1 || r.hasSeal === true || r.hasSeal === "1",
      })) as unknown as Yard[]
      const cities = (cityRows as Record<string, unknown>[]).map((r) => ({
        ...r,
        usableAsPickup: r.usableAsPickup === 1 || r.usableAsPickup === true || r.usableAsPickup === "1",
        usableAsReturn: r.usableAsReturn === 1 || r.usableAsReturn === true || r.usableAsReturn === "1",
        enabled: r.enabled === 1 || r.enabled === true || r.enabled === "1",
        sort: Number(r.sort) || 0,
      })) as unknown as CityDictItem[]
      return { yards, cities }
    } finally {
      conn.release()
      await pool.end()
    }
  } catch {
    return null
  }
}

async function syncMysql(cities: CityDictItem[]) {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const sql = `UPDATE \`city_dict\` SET \`enabled\`=?, \`usableAsPickup\`=?, \`usableAsReturn\`=? WHERE \`id\`=?`
    for (const c of cities) {
      await conn.query(sql, [c.enabled ? 1 : 0, c.usableAsPickup ? 1 : 0, c.usableAsReturn ? 1 : 0, c.id])
    }
    await conn.commit()
    console.log(`→ MySQL city_dict 已更新 ${cities.length} 条`)
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

async function main() {
  const live = await loadFromMysql()
  const yards = live?.yards?.length ? live.yards : yardsSeed
  // 种子始终以 city-dict.seed 为城市全集，保证写出完整；标志按堆场计算
  const baseCities = cityDictSeed
  console.log(`→ 堆场来源：${live?.yards?.length ? "MySQL" : "seed"}（${yards.length} 条）`)
  console.log(`→ 城市字典：${baseCities.length} 条`)

  const { next, enabledNames, disabledCount } = applyCityFlagsByYards(baseCities, yards)
  console.log(`→ 启用（有堆场）${enabledNames.length} 城：`, enabledNames.join("、"))
  console.log(`→ 停用 ${disabledCount} 城`)

  writeSeed(next)
  if (live?.cities?.length) {
    const liveNext = applyCityFlagsByYards(live.cities, yards)
    await syncMysql(liveNext.next)
  } else {
    console.warn("! MySQL 未连接或无城市数据，仅更新了种子文件")
  }
  console.log("完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
