import mysql from "mysql2/promise"
import dotenv from "dotenv"

dotenv.config({ path: ".env.development.local" })

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  const cols = [
    "`quotedUnitPrice` DECIMAL(12,2) NULL",
    "`confirmedBy` VARCHAR(120) NULL",
    "`adminRemark` VARCHAR(255) NULL",
  ]
  for (const c of cols) {
    const name = c.split("`")[1]
    try {
      await pool.execute(`ALTER TABLE \`use_box_orders\` ADD COLUMN ${c}`)
      console.log("added", name)
    } catch (e) {
      console.log(name, (e as Error).message.slice(0, 100))
    }
  }
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
