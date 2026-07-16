/**
 * 数据库初始化脚本
 * 1. 执行 scripts/sql/schema.sql 建库建表
 * 2. 从 lib/mock-data.ts 导入全部种子数据
 * 3. 为每个用户生成默认密码（可用 SEED_PASSWORD 覆盖，默认 Passw0rd!）
 *
 * 运行： pnpm db:init   （等价于 tsx scripts/init-db.ts）
 */
import { config as loadEnv } from "dotenv"
import { existsSync, readFileSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import { RESOURCES, type ResourceConfig } from "../lib/resources"
import { hashPassword } from "../lib/password"
import * as mock from "../lib/mock-data"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

// 与 Next.js 一致：优先加载 .env.development.local，再回退 .env.local / .env
for (const name of [".env.development.local", ".env.local", ".env"]) {
  const p = join(root, name)
  if (existsSync(p)) {
    loadEnv({ path: p })
    break
  }
}

const DB_NAME = process.env.DB_NAME ?? "container_biz"
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!"

function baseConfig() {
  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
  }
}

async function runSchema() {
  const sql = readFileSync(join(__dirname, "sql", "schema.sql"), "utf8")
  const conn = await mysql.createConnection({ ...baseConfig(), multipleStatements: true })
  console.log("→ 执行建表脚本 schema.sql ...")
  await conn.query(sql)
  await conn.end()
  console.log("  建表完成")
}

function toRow(cfg: ResourceConfig, item: Record<string, any>, index: number) {
  const row: Record<string, any> = { ...item }
  // 无 id 的资源（库存台账）生成主键
  if (cfg.id === "id" && row.id == null) row.id = `${cfg.table}_${index + 1}`
  // JSON 字段序列化
  for (const f of cfg.json) {
    if (row[f] !== undefined && row[f] !== null) row[f] = JSON.stringify(row[f])
  }
  // 布尔 -> 0/1
  for (const f of cfg.bool) {
    if (typeof row[f] === "boolean") row[f] = row[f] ? 1 : 0
  }
  return row
}

async function seedResource(conn: mysql.Connection, key: string, cfg: ResourceConfig) {
  const arr = (mock as Record<string, any>)[cfg.seed] as any[] | undefined
  if (!arr || !Array.isArray(arr)) {
    console.warn(`  ! 跳过 ${key}：未找到种子导出 ${cfg.seed}`)
    return
  }
  const rows = arr.map((it, i) => toRow(cfg, it, i))
  // users 追加密码哈希
  if (key === "users") {
    for (const r of rows) r.passwordHash = hashPassword(DEFAULT_PASSWORD)
  }
  if (rows.length === 0) return
  // 以所有行的键并集作为列
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const placeholders = `(${cols.map(() => "?").join(", ")})`
  const colList = cols.map((c) => `\`${c}\``).join(", ")
  await conn.query(`DELETE FROM \`${cfg.table}\``)
  for (const r of rows) {
    const values = cols.map((c) => (r[c] === undefined ? null : r[c]))
    await conn.query(`INSERT INTO \`${cfg.table}\` (${colList}) VALUES ${placeholders}`, values)
  }
  console.log(`  ✓ ${key.padEnd(16)} 导入 ${rows.length} 行 -> ${cfg.table}`)
}

async function main() {
  await runSchema()
  const conn = await mysql.createConnection({ ...baseConfig(), database: DB_NAME })
  console.log("→ 导入种子数据 ...")
  for (const [key, cfg] of Object.entries(RESOURCES)) {
    await seedResource(conn, key, cfg as ResourceConfig)
  }
  await conn.end()
  console.log("\n✅ 数据库初始化完成")
  console.log(`   默认登录密码：${DEFAULT_PASSWORD}`)
  console.log(`   管理员账号：admin`)
}

main().catch((err) => {
  console.error("\n❌ 初始化失败：", err.message)
  process.exit(1)
})
