/**
 * 账单增加币种 / 汇率 / 折合人民币，并回填演示数据。
 * 运行： npx tsx scripts/alter-bill-fx.ts
 */
import { config as loadEnv } from "dotenv"
import { existsSync } from "node:fs"
import { join } from "node:path"
import mysql from "mysql2/promise"

for (const name of [".env.development.local", ".env.production.local", ".env.local", ".env"]) {
  if (existsSync(join(process.cwd(), name))) {
    loadEnv({ path: name })
    break
  }
}

async function ensureColumn(conn: mysql.Connection, column: string, ddl: string) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bills' AND COLUMN_NAME = ?`,
    [column],
  )
  if (Number((rows as { c: number }[])[0]?.c ?? 0) === 0) {
    await conn.query(ddl)
    console.log("added", column)
  } else {
    console.log("exists", column)
  }
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "container_biz",
  })

  await ensureColumn(
    conn,
    "currency",
    "ALTER TABLE `bills` ADD COLUMN `currency` VARCHAR(4) NOT NULL DEFAULT 'CNY' AFTER `amount`",
  )
  await ensureColumn(
    conn,
    "exchangeRate",
    "ALTER TABLE `bills` ADD COLUMN `exchangeRate` DECIMAL(12,6) NOT NULL DEFAULT 1 AFTER `currency`",
  )
  await ensureColumn(
    conn,
    "amountCny",
    "ALTER TABLE `bills` ADD COLUMN `amountCny` DECIMAL(12,2) NULL AFTER `exchangeRate`",
  )

  await conn.query(
    "UPDATE `bills` SET `currency` = COALESCE(NULLIF(`currency`, ''), 'CNY'), `exchangeRate` = COALESCE(`exchangeRate`, 1), `amountCny` = COALESCE(`amountCny`, `amount`)",
  )

  // 演示种子对齐 mock-data（外币账单）
  await conn.query(
    `UPDATE bills SET amount=713.38, currency='EUR', exchangeRate=7.85, amountCny=5600.03,
      items=? WHERE id='b2'`,
    [
      JSON.stringify([
        { label: "超期天数", value: "7 天" },
        { label: "超期费标准", value: "€12.74/箱/天" },
        { label: "涉及箱量", value: "8 箱" },
        { label: "币种", value: "EUR" },
        { label: "汇率（对人民币）", value: "1 EUR = 7.8500 CNY" },
        { label: "折合人民币", value: "¥5,600.03" },
        { label: "合计", value: "€713.38" },
      ]),
    ],
  )
  await conn.query(
    `UPDATE bills SET amount=250, currency='USD', exchangeRate=7.2, amountCny=1800,
      items=? WHERE id='b4'`,
    [
      JSON.stringify([
        { label: "变更项", value: "还箱城市变更" },
        { label: "变更费", value: "$250.00" },
        { label: "币种", value: "USD" },
        { label: "汇率（对人民币）", value: "1 USD = 7.2000 CNY" },
        { label: "折合人民币", value: "¥1,800.00" },
      ]),
    ],
  )
  await conn.query(
    `UPDATE bills SET currency='CNY', exchangeRate=1, amountCny=amount WHERE id IN ('b1','b3')`,
  )

  const [rows] = await conn.query(
    "SELECT id, billNo, amount, currency, exchangeRate, amountCny, status FROM bills ORDER BY issuedAt DESC LIMIT 12",
  )
  console.table(rows)
  await conn.end()
  console.log("done")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
