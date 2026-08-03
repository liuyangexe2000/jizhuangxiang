/**
 * 增量建表 + 从堆场 agent 去重导入代管公司，并回填 yards.proxyCompanyId
 * 运行：pnpm exec tsx scripts/alter-proxy-companies.ts
 */
import { config as loadEnv } from "dotenv"
import { existsSync, readFileSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import { proxyCompanies } from "../lib/mock-data"

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

  const sql = readFileSync(join(__dirname, "sql", "alter-proxy-companies.sql"), "utf8")
  await pool.query(sql)
  console.log("✓ proxy_companies 表已就绪")

  const [countRows] = await pool.query("SELECT COUNT(*) AS c FROM `proxy_companies`")
  const count = Number((countRows as Array<{ c: number }>)[0]?.c ?? 0)

  if (count === 0) {
    // 优先从现有堆场去重；若堆场为空则用种子
    const [yardAgents] = await pool.query(
      `SELECT agent AS name,
              MAX(contactUser) AS contactUser,
              MAX(phone) AS phone,
              MAX(email) AS email
       FROM yards
       WHERE TRIM(agent) <> ''
       GROUP BY agent`,
    )
    const fromYards = yardAgents as Array<{
      name: string
      contactUser: string
      phone: string
      email: string
    }>
    const source =
      fromYards.length > 0
        ? fromYards.map((r, i) => ({
            id: `pc_${i + 1}`,
            name: r.name,
            contactUser: r.contactUser || "",
            phone: r.phone || "",
            email: r.email || "",
            enabled: 1,
          }))
        : proxyCompanies.map((r) => ({
            id: r.id,
            name: r.name,
            contactUser: r.contactUser,
            phone: r.phone,
            email: r.email,
            enabled: r.enabled ? 1 : 0,
          }))

    for (const r of source) {
      await pool.query(
        `INSERT INTO \`proxy_companies\` (\`id\`, \`name\`, \`contactUser\`, \`phone\`, \`email\`, \`enabled\`)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`)`,
        [r.id, r.name, r.contactUser, r.phone, r.email, r.enabled],
      )
    }
    console.log(`✓ 已导入代管公司 ${source.length} 家`)
  } else {
    console.log(`· 表已有 ${count} 行，跳过种子导入`)
  }

  // 空值，或旧 UUID 不在主档中时，按公司名回填为新主档 id
  const [upd] = await pool.query(
    `UPDATE yards y
     INNER JOIN proxy_companies p ON TRIM(p.name) = TRIM(y.agent)
     SET y.proxyCompanyId = p.id
     WHERE TRIM(IFNULL(y.agent,'')) <> ''
       AND (
         y.proxyCompanyId IS NULL
         OR y.proxyCompanyId = ''
         OR NOT EXISTS (SELECT 1 FROM proxy_companies p2 WHERE p2.id = y.proxyCompanyId)
       )`,
  )
  const affected = Number((upd as { affectedRows?: number }).affectedRows ?? 0)
  console.log(`✓ 已回填/校正堆场 proxyCompanyId ${affected} 行`)

  await pool.end()
  console.log("✅ 完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
