/**
 * 1) 纠正 lib/mock-data.ts 中演示箱号为合法 ISO 6346
 * 2) 同步纠正本机库中非法箱号（修箱/进出场/主档占位等）
 *
 * 运行： npx tsx scripts/fix-demo-container-nos.ts
 */
import { config as loadEnv } from "dotenv"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import {
  coerceToIso6346ContainerNo,
  normalizeContainerNo,
  validateIso6346ContainerNo,
} from "../lib/domain/container-no"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

for (const name of [".env.development.local", ".env.production.local", ".env.local", ".env"]) {
  const p = join(root, name)
  if (existsSync(p)) {
    loadEnv({ path: p })
    break
  }
}

/** mock 演示箱号显式映射（保持互不碰撞） */
const MOCK_MAP: [string, string][] = [
  ["CCLU7845121", "CCLU7845130"],
  ["CCLU7845120", "CCLU7845125"],
  ["TCLU3421101", "TCLU3421125"],
  ["TCLU3421100", "TCLU3421104"],
  ["TCLU3421099", "TCLU3421090"],
  ["TCLU3421088", "TCLU3421085"],
  ["TCLU3421111", "TCLU3421130"],
  ["BEAU4590233", "BEAU4590237"],
  ["BEAU4590210", "BEAU4590216"],
  ["FCIU8812345", "FCIU8812340"],
  ["FCIU8812301", "FCIU8812309"],
  ["FCIU8812350", "FCIU8812356"],
  ["MSKU1122334", "MSKU1122333"],
  ["SEGU5510042", "SEGU5510048"],
  ["TCLU3400011", "TCLU3400014"],
  ["UNKNOWN00921", "HLCU9009218"],
  ["TEMP99920021", "TEMU9920026"],
]

function fixMockFile() {
  const file = join(root, "lib", "mock-data.ts")
  let text = readFileSync(file, "utf8")
  for (const [from, to] of MOCK_MAP) {
    const n = text.split(from).length - 1
    if (!n) console.warn(`  ! mock 未找到 ${from}`)
    else console.log(`  mock ${from} → ${to} ×${n}`)
    text = text.split(from).join(to)
  }

  text = text.replace(
    /repairNo: "RP2026070001", containerNo: "MSKU1122333", containerType: "40HQ", ownership: "租赁箱"/,
    'repairNo: "RP2026070001", containerNo: "XAGU6047865", containerType: "40HQ", ownership: "自有箱"',
  )
  text = text.replace(
    /repairNo: "RP2026070002", containerNo: "CCLU7845130", containerType: "40GP", ownership: "租赁箱"/,
    'repairNo: "RP2026070002", containerNo: "XAGU6028119", containerType: "40HQ", ownership: "自有箱"',
  )
  text = text.replace(
    /repairNo: "RP2026070004", containerNo: "BEAU4590216", containerType: "40GP", ownership: "自有箱"/,
    'repairNo: "RP2026070004", containerNo: "XAGU6017120", containerType: "40HQ", ownership: "自有箱"',
  )

  writeFileSync(file, text, "utf8")
  console.log("→ 已写入 lib/mock-data.ts")
}

function remapNo(oldNo: string): string {
  const key = normalizeContainerNo(oldNo)
  for (const [from, to] of MOCK_MAP) {
    if (normalizeContainerNo(from) === key) return to
  }
  // 修箱演示专用：截图中常见占位前缀 → 稳定合法号
  if (key.startsWith("PEND") || key.startsWith("RPM") || key.startsWith("SCR") || key.startsWith("RP")) {
    return coerceToIso6346ContainerNo(key)
  }
  return coerceToIso6346ContainerNo(key)
}

async function fixDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "container_biz",
  })

  try {
    // 1) repair_orders.containerNo
    const [repairs] = await conn.query<{ id: string; containerNo: string }[]>(
      "SELECT id, containerNo FROM repair_orders",
    )
    let repairFixed = 0
    for (const row of repairs as any[]) {
      const oldNo = String(row.containerNo || "")
      if (validateIso6346ContainerNo(oldNo).ok) continue
      const next = remapNo(oldNo)
      await conn.query("UPDATE repair_orders SET containerNo = ? WHERE id = ?", [next, row.id])
      console.log(`  repair ${row.id}: ${oldNo} → ${next}`)
      repairFixed++
    }

    // 2) gate_records.containerNo
    const [gates] = await conn.query("SELECT id, containerNo FROM gate_records")
    let gateFixed = 0
    for (const row of gates as any[]) {
      const oldNo = String(row.containerNo || "")
      if (validateIso6346ContainerNo(oldNo).ok) continue
      const next = remapNo(oldNo)
      await conn.query("UPDATE gate_records SET containerNo = ? WHERE id = ?", [next, row.id])
      console.log(`  gate ${row.id}: ${oldNo} → ${next}`)
      gateFixed++
    }

    // 3) container_masters 非法主键：改号（若目标已存在则删占位行）
    const [masters] = await conn.query("SELECT containerNo FROM container_masters")
    let masterFixed = 0
    for (const row of masters as any[]) {
      const oldNo = String(row.containerNo || "")
      if (validateIso6346ContainerNo(oldNo).ok) continue
      const next = remapNo(oldNo)
      const [exists] = await conn.query("SELECT containerNo FROM container_masters WHERE containerNo = ? LIMIT 1", [
        next,
      ])
      if ((exists as any[]).length) {
        await conn.query("DELETE FROM container_masters WHERE containerNo = ?", [oldNo])
        console.log(`  master delete placeholder ${oldNo} (target ${next} exists)`)
      } else {
        await conn.query("UPDATE container_masters SET containerNo = ? WHERE containerNo = ?", [next, oldNo])
        console.log(`  master ${oldNo} → ${next}`)
      }
      masterFixed++
    }

    // 4) JSON 数组字段：bookings / return_applications / use_box_orders
    async function fixJsonArray(table: string, col: string) {
      const [rows] = await conn.query(`SELECT id, \`${col}\` AS payload FROM \`${table}\``)
      let n = 0
      for (const row of rows as any[]) {
        let arr: string[] = []
        try {
          arr = typeof row.payload === "string" ? JSON.parse(row.payload || "[]") : row.payload || []
        } catch {
          continue
        }
        if (!Array.isArray(arr) || !arr.length) continue
        let changed = false
        const next = arr.map((item) => {
          const s = String(item || "")
          if (validateIso6346ContainerNo(s).ok) return normalizeContainerNo(s)
          changed = true
          return remapNo(s)
        })
        if (!changed) continue
        await conn.query(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE id = ?`, [JSON.stringify(next), row.id])
        console.log(`  ${table}.${col} ${row.id}: ${JSON.stringify(arr)} → ${JSON.stringify(next)}`)
        n++
      }
      return n
    }

    const bookingFixed = await fixJsonArray("bookings", "containerNos")
    const returnFixed = await fixJsonArray("return_applications", "containerNos")
    const orderFixed = await fixJsonArray("use_box_orders", "containerNos")

    // 5) bills.items 中的箱损箱号文案
    const [bills] = await conn.query("SELECT id, items FROM bills")
    let billFixed = 0
    for (const row of bills as any[]) {
      let items: any[] = []
      try {
        items = typeof row.items === "string" ? JSON.parse(row.items || "[]") : row.items || []
      } catch {
        continue
      }
      let changed = false
      const nextItems = items.map((it) => {
        if (!it || typeof it.value !== "string") return it
        const v = it.value
        if (validateIso6346ContainerNo(v).ok) return it
        // 仅当看起来像箱号字段时改
        if (String(it.label || "").includes("箱") || /^[A-Z0-9-]{6,}$/i.test(v)) {
          changed = true
          return { ...it, value: remapNo(v) }
        }
        return it
      })
      if (!changed) continue
      await conn.query("UPDATE bills SET items = ? WHERE id = ?", [JSON.stringify(nextItems), row.id])
      billFixed++
    }

    // 6) 修箱种子行对齐真实在场箱（陆港 / 汉堡）
    const seedRepairs: [string, string, string, string][] = [
      ["rp1", "XAGU6047865", "40HQ", "自有箱"],
      ["rp2", "XAGU6028119", "40HQ", "自有箱"],
      ["rp5", "XAGU6017120", "40HQ", "自有箱"],
    ]
    for (const [id, no, type, own] of seedRepairs) {
      await conn.query(
        "UPDATE repair_orders SET containerNo = ?, containerType = ?, ownership = ? WHERE id = ?",
        [no, type, own, id],
      )
      console.log(`  seed repair ${id} → ${no}`)
    }

    console.log(
      `→ 数据库已纠正：repair=${repairFixed} gate=${gateFixed} master=${masterFixed} booking=${bookingFixed} return=${returnFixed} order=${orderFixed} bill=${billFixed}`,
    )
  } finally {
    await conn.end()
  }
}

async function main() {
  console.log("→ 纠正演示种子 mock-data …")
  fixMockFile()
  console.log("→ 纠正本机数据库非法箱号 …")
  await fixDatabase()
  console.log("完成")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
