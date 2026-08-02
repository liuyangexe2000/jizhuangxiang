/**
 * 增量建表 + 空表时导入用箱价目种子
 * 运行：pnpm exec tsx scripts/alter-usebox-price-rules.ts
 */
import { config as loadEnv } from "dotenv"
import { existsSync, readFileSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import { useBoxPriceRules } from "../lib/mock-data"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

for (const name of [".env.development.local", ".env.local", ".env"]) {
  const p = join(root, name)
  if (existsSync(p)) {
    loadEnv({ path: p })
    console.log(`→ 已加载 ${name}`)
    break
  }
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "container_biz",
    multipleStatements: true,
  })

  const sql = readFileSync(join(__dirname, "sql", "alter-usebox-price-rules.sql"), "utf8")
  await pool.query(sql)
  console.log("✓ use_box_price_rules 表已就绪")

  const [countRows] = await pool.query("SELECT COUNT(*) AS c FROM `use_box_price_rules`")
  const count = Number((countRows as Array<{ c: number }>)[0]?.c ?? 0)
  if (count === 0) {
    for (const r of useBoxPriceRules) {
      await pool.query(
        `INSERT INTO \`use_box_price_rules\`
          (\`id\`, \`pickupCity\`, \`returnCity\`, \`containerType\`, \`unitPrice\`, \`enabled\`)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [r.id, r.pickupCity, r.returnCity, r.containerType, r.unitPrice, r.enabled ? 1 : 0],
      )
    }
    console.log(`✓ 已导入种子 ${useBoxPriceRules.length} 行`)
  } else {
    console.log(`· 表已有 ${count} 行，跳过种子导入`)
  }

  await pool.end()
  console.log("✅ 完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
