/**
 * 根据集装箱主档重算五维库存台账（inventory_rows）：
 * - 在场 onSite = 状态「在场」+「维修中」（物理在场）
 * - 可用 available = 状态「在场」（维修中不可用；尚无订单预占时 reserved=0）
 * - 已放待提 reserved = 0（需订单/放箱预占，主档无法推算）
 * - 预计进场 incoming = 状态「在途」（挂在当前所属堆场）
 * - 已报废不计入
 *
 * 堆场 region/agent 优先按 factoryId / 名称匹配 yards。
 *
 * 运行：pnpm db:rebuild-inventory
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import mysql from "mysql2/promise"
import dotenv from "dotenv"
import type { ContainerMaster, InventoryRow, Yard } from "../lib/types"
import { containerMastersSeed } from "../lib/data/containers.seed"
import { yardsSeed } from "../lib/data/yards.seed"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
dotenv.config({ path: path.join(root, ".env.development.local") })

type Acc = {
  yard: string
  city: string
  region: string
  agent: string
  factoryId: string
  onSite: number
  available: number
  reserved: number
  incoming: number
}

function resolveYardMeta(
  c: ContainerMaster,
  byFactoryId: Map<string, Yard>,
  byName: Map<string, Yard>,
): Yard | undefined {
  if (c.factoryId) {
    const hit = byFactoryId.get(c.factoryId)
    if (hit) return hit
  }
  if (c.currentYard) return byName.get(c.currentYard)
  return undefined
}

export function buildInventoryFromContainers(
  containers: ContainerMaster[],
  yards: Yard[],
): InventoryRow[] {
  const byFactoryId = new Map<string, Yard>()
  const byName = new Map<string, Yard>()
  for (const y of yards) {
    if (y.deleted) continue
    if (y.factoryId) byFactoryId.set(y.factoryId, y)
    if (y.name) byName.set(y.name, y)
  }

  const map = new Map<string, Acc>()

  for (const c of containers) {
    if (c.deleted) continue
    if (c.status === "已报废") continue

    const meta = resolveYardMeta(c, byFactoryId, byName)
    const yard = c.currentYard || meta?.name || "未分配堆场"
    const city = c.currentCity || meta?.city || "—"
    const key = `${yard}\0${city}`

    let acc = map.get(key)
    if (!acc) {
      const foreignHints = [
        "汉堡",
        "杜伊斯堡",
        "马拉",
        "华沙",
        "布达佩斯",
        "维也纳",
        "纽伦堡",
        "慕尼黑",
        "柏林",
        "罗兹",
        "不来梅",
      ]
      const guessedForeign = foreignHints.some((h) => city.includes(h) || yard.includes(h))
      acc = {
        yard,
        city,
        region: meta?.region || (guessedForeign ? "境外" : "境内"),
        agent: meta?.agent || "",
        factoryId: c.factoryId || meta?.factoryId || "",
        onSite: 0,
        available: 0,
        reserved: 0,
        incoming: 0,
      }
      map.set(key, acc)
    }

    if (c.status === "在场") {
      acc.onSite += 1
      acc.available += 1
    } else if (c.status === "维修中") {
      acc.onSite += 1
    } else if (c.status === "在途") {
      acc.incoming += 1
    } else if (c.status === "已提未还") {
      acc.incoming += 1
    }
  }

  const rows = Array.from(map.values())
    .sort((a, b) => {
      if (a.region !== b.region) return a.region.localeCompare(b.region, "zh")
      if (a.city !== b.city) return a.city.localeCompare(b.city, "zh")
      return a.yard.localeCompare(b.yard, "zh")
    })
    .map((r, i) => ({
      id: `inv_${i + 1}`,
      region: r.region,
      city: r.city,
      yard: r.yard,
      agent: r.agent,
      onSite: r.onSite,
      available: r.available,
      reserved: r.reserved,
      incoming: r.incoming,
    }))

  return rows
}

function writeSeed(rows: InventoryRow[]) {
  const outPath = path.join(root, "lib", "data", "inventory-rows.seed.ts")
  const body = `/**
 * 由 scripts/rebuild-inventory-from-containers.ts 根据集装箱主档汇总生成
 * 请勿手工大段编辑；集装箱变更后请重新跑 pnpm db:rebuild-inventory。
 *
 * 口径：onSite=在场+维修中；available=在场；reserved=0；incoming=在途。
 */
import type { InventoryRow } from "../types"

export const inventoryRowsSeed: InventoryRow[] = ${JSON.stringify(rows, null, 2)}
`
  fs.writeFileSync(outPath, body, "utf8")
  console.log(`→ 已写入种子 ${outPath}（${rows.length} 条）`)
}

async function syncMysql(rows: InventoryRow[], yards: Yard[], containers: ContainerMaster[]) {
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
    await conn.beginTransaction()
    await conn.query("DELETE FROM `inventory_rows`")
    const sql = `INSERT INTO \`inventory_rows\`
      (\`id\`, \`region\`, \`city\`, \`yard\`, \`agent\`, \`onSite\`, \`available\`, \`reserved\`, \`incoming\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    for (const r of rows) {
      await conn.query(sql, [
        r.id,
        r.region,
        r.city,
        r.yard,
        r.agent,
        r.onSite,
        r.available,
        r.reserved,
        r.incoming,
      ])
    }

    // 同步堆场 current = 该堆场在场箱量（按 factoryId / 名称）
    const onSiteByFactory = new Map<string, number>()
    const onSiteByName = new Map<string, number>()
    for (const r of rows) {
      onSiteByName.set(r.yard, (onSiteByName.get(r.yard) ?? 0) + r.onSite)
    }
    for (const c of containers) {
      if (c.deleted || c.status === "已报废" || c.status === "在途" || c.status === "已提未还") continue
      if (!c.factoryId) continue
      onSiteByFactory.set(c.factoryId, (onSiteByFactory.get(c.factoryId) ?? 0) + 1)
    }
    for (const y of yards) {
      const current = onSiteByFactory.get(y.factoryId) ?? onSiteByName.get(y.name) ?? 0
      await conn.query("UPDATE `yards` SET `current` = ? WHERE `id` = ?", [current, y.id])
    }

    await conn.commit()
    console.log(`→ MySQL inventory_rows 已更新 ${rows.length} 条，并回写 yards.current`)
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
    await pool.end()
  }
}

async function main() {
  const containers = containerMastersSeed
  const yards = yardsSeed
  console.log(`→ 集装箱 ${containers.length} 条，堆场 ${yards.length} 条`)
  const rows = buildInventoryFromContainers(containers, yards)
  const sum = rows.reduce(
    (a, r) => ({
      onSite: a.onSite + r.onSite,
      available: a.available + r.available,
      reserved: a.reserved + r.reserved,
      incoming: a.incoming + r.incoming,
    }),
    { onSite: 0, available: 0, reserved: 0, incoming: 0 },
  )
  console.log(`→ 汇总 ${rows.length} 个堆场：`, sum)
  writeSeed(rows)
  await syncMysql(rows, yards, containers)
  console.log("完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
