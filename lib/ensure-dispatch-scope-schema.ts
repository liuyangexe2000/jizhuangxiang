import "server-only"
import { pool } from "@/lib/db"
import { clearColumnCache } from "@/lib/repo"
import { formatScopeCities, parseScopeCities } from "@/lib/domain/dispatch-scope"

let ensured = false

async function ensureColumn(table: string, column: string, ddl: string): Promise<void> {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column],
  )
  const count = Number((rows as { c: number }[])[0]?.c ?? 0)
  if (count === 0) {
    await pool.query(ddl)
    clearColumnCache(table)
    console.log(`[v0] ${table}.${column} column added`)
  }
}

/** 调运价目/订单还箱城市结构化字段（幂等） */
export async function ensureDispatchScopeColumns(): Promise<void> {
  if (ensured) return
  try {
    await ensureColumn(
      "dispatch_price_rules",
      "returnCities",
      "ALTER TABLE `dispatch_price_rules` ADD COLUMN `returnCities` JSON NULL AFTER `scope`",
    )
    await ensureColumn(
      "dispatch_orders",
      "returnCities",
      "ALTER TABLE `dispatch_orders` ADD COLUMN `returnCities` JSON NULL AFTER `returnScope`",
    )
    await ensureColumn(
      "dispatch_orders",
      "priceRuleId",
      "ALTER TABLE `dispatch_orders` ADD COLUMN `priceRuleId` VARCHAR(32) NULL AFTER `returnCities`",
    )

    // 回填价目
    const [rules] = await pool.query("SELECT id, scope, returnCities FROM dispatch_price_rules")
    for (const row of rules as { id: string; scope: string; returnCities: unknown }[]) {
      let cities: string[] = []
      if (typeof row.returnCities === "string") {
        try {
          cities = JSON.parse(row.returnCities)
        } catch {
          cities = []
        }
      } else if (Array.isArray(row.returnCities)) {
        cities = row.returnCities as string[]
      }
      if (cities.length === 0) {
        cities = parseScopeCities(row.scope)
        await pool.query("UPDATE dispatch_price_rules SET returnCities = ?, scope = ? WHERE id = ?", [
          JSON.stringify(cities),
          formatScopeCities(cities) || row.scope,
          row.id,
        ])
      }
    }

    // 回填订单
    const [orders] = await pool.query("SELECT id, returnScope, returnCities FROM dispatch_orders")
    for (const row of orders as { id: string; returnScope: string; returnCities: unknown }[]) {
      let cities: string[] = []
      if (typeof row.returnCities === "string") {
        try {
          cities = JSON.parse(row.returnCities)
        } catch {
          cities = []
        }
      } else if (Array.isArray(row.returnCities)) {
        cities = row.returnCities as string[]
      }
      if (cities.length === 0) {
        cities = parseScopeCities(row.returnScope)
        if (cities.length) {
          await pool.query("UPDATE dispatch_orders SET returnCities = ?, returnScope = ? WHERE id = ?", [
            JSON.stringify(cities),
            formatScopeCities(cities) || row.returnScope,
            row.id,
          ])
        }
      }
    }

    ensured = true
  } catch (e) {
    console.warn("[v0] ensureDispatchScopeColumns skipped:", (e as Error).message)
  }
}
