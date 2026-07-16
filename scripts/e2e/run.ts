/**
 * 全角色业务闭环 E2E 入口
 * 前置：pnpm db:init（可选）+ pnpm dev 已启动
 * 用法：pnpm test:e2e
 */

import { BASE_URL, runScenario } from "./harness"
import {
  l1M01UseBox,
  l2M02Dispatch,
  l3M03Inventory,
  l4M04BookingNotify,
  l5M05Supply,
  l6M06Repair,
  l7TenantIsolation,
  l8Admin,
  l9GapFill,
  l10AdminConfig,
} from "./scenarios/all"

async function ping() {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, { cache: "no-store" })
    return res.status < 500
  } catch {
    return false
  }
}

async function main() {
  console.log(`\n=== E2E 业务闭环 · ${BASE_URL} ===\n`)
  if (!(await ping())) {
    console.error(`无法连接 ${BASE_URL}，请先启动：pnpm dev`)
    process.exit(1)
  }

  const scenarios = [
    ["L1 M01 用箱闭环", l1M01UseBox],
    ["L2 M02 调运闭环", l2M02Dispatch],
    ["L3 M03 库存闭环", l3M03Inventory],
    ["L4 M04 预约通知", l4M04BookingNotify],
    ["L5 M05 供应闭环", l5M05Supply],
    ["L6 M06 修箱闭环", l6M06Repair],
    ["L7 租户隔离", l7TenantIsolation],
    ["L8 管理与集成", l8Admin],
    ["L9 缺口补齐", l9GapFill],
    ["L10 管理配置", l10AdminConfig],
  ] as const

  const results = []
  for (const [name, fn] of scenarios) {
    process.stdout.write(`▶ ${name} ... `)
    const r = await runScenario(name, fn)
    results.push(r)
    if (r.ok) {
      console.log("PASS")
      for (const n of r.notes) console.log(`    ${n}`)
    } else {
      console.log("FAIL")
      for (const f of r.fails) console.log(`    ✗ ${f}`)
      for (const n of r.notes) console.log(`    ${n}`)
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== 汇总：${results.length - failed.length}/${results.length} 通过 ===`)
  if (failed.length) {
    console.log("\n失败清单：")
    for (const f of failed) {
      console.log(`\n[${f.name}]`)
      for (const m of f.fails) console.log(`  - ${m}`)
    }
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
