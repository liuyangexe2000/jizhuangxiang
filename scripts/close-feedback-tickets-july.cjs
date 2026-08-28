/**
 * 七月待完成反馈工单关单（生产/开发均可）
 *
 * 默认关闭 4 条：账单汇率、调运报价×2、还箱流程引导
 *
 * 用法：
 *   node scripts/close-feedback-tickets-july.cjs [.env路径] [--dry-run]
 *   node scripts/close-feedback-tickets-july.cjs .env.production.local
 *   node scripts/close-feedback-tickets-july.cjs .env.production.local --refresh-feedback
 *
 * 幂等：已是「已关闭」且 processFeedback 已填则跳过；否则补齐 status + processFeedback
 */
const fs = require("fs")
const mysql = require("mysql2/promise")

/** @type {Record<string, string>} */
const JULY_CLOSURE = {
  FB202607241055827:
    "账单中心列表/明细/打印均展示币种、汇率与折合人民币；支持外币账单筛选，CNY 显示本币说明，明细行含汇率信息（commit a309b07 及后续）。",
  FB202607271627184:
    "工作台 M02 区增加「调运价目维护」快捷入口；调运申请页链至价目维护，选堆场后可见「调运报价方案」与单价（commit a309b07）。",
  FB202607271628398:
    "调运申请页展示「调运报价方案（还箱城市 + 单价）」卡片并链至 /config/dispatch-prices；R02 可在 M02 侧栏只读查看价目（commit a309b07、1a9be8b）。",
  FB202607281046991:
    "还箱 Tab 增加角色「下一步」引导与协作说明；upload-doc 上传还箱证明后进入「还箱中」；管理中枢与订单处理页可见还箱待办统计（commit a309b07、1a9be8b）。",
}

const TARGET_STATUS = "已关闭"

function loadEnv(envPath) {
  const env = fs.readFileSync(envPath, "utf8").replace(/\r/g, "")
  const get = (k) => (env.match(new RegExp("^" + k + "=(.+)$", "m")) || [])[1]?.trim()
  return {
    host: get("DB_HOST") || get("MYSQL_HOST") || "127.0.0.1",
    port: Number(get("DB_PORT") || 3306),
    user: get("DB_USER") || get("MYSQL_USER"),
    password: get("DB_PASSWORD") || get("MYSQL_PASSWORD"),
    database: get("DB_NAME") || get("MYSQL_DATABASE"),
  }
}

async function ensureProcessFeedbackColumn(conn, dryRun) {
  const [colRows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_tickets' AND COLUMN_NAME = 'processFeedback'`,
  )
  if (Number(colRows[0].c) === 0) {
    console.log("Adding column processFeedback …")
    if (!dryRun) {
      await conn.query(
        "ALTER TABLE `feedback_tickets` ADD COLUMN `processFeedback` TEXT NULL AFTER `status`",
      )
    }
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run")
  const dryRun = process.argv.includes("--dry-run")
  const refreshFeedback = process.argv.includes("--refresh-feedback")
  const envPath = args[0] || ".env.production.local"
  const ticketNos = Object.keys(JULY_CLOSURE)

  console.log("Env:", envPath, dryRun ? "(dry-run)" : "")
  const cfg = loadEnv(envPath)
  const conn = await mysql.createConnection(cfg)
  await ensureProcessFeedbackColumn(conn, dryRun)

  const placeholders = ticketNos.map(() => "?").join(",")
  const [rows] = await conn.query(
    `SELECT ticketNo, type, status, pagePath, content, processFeedback
     FROM feedback_tickets WHERE ticketNo IN (${placeholders}) ORDER BY ticketNo`,
    ticketNos,
  )

  const found = new Set(rows.map((r) => r.ticketNo))
  const missing = ticketNos.filter((no) => !found.has(no))
  if (missing.length) {
    console.error("DB 中未找到工单:", missing.join(", "))
    process.exitCode = 1
  }

  console.log("\n关单前状态：")
  for (const r of rows) {
    const fb = (r.processFeedback || "").trim()
    console.log(
      `  ${r.ticketNo} | ${r.status} | ${r.pagePath} | feedback=${fb ? "有" : "无"}`,
    )
  }

  let closed = 0
  let skipped = 0
  for (const r of rows) {
    const text = JULY_CLOSURE[r.ticketNo]
    const hasFeedback = Boolean((r.processFeedback || "").trim())
    const sameFeedback = (r.processFeedback || "").trim() === text.trim()
    const alreadyClosed = r.status === TARGET_STATUS && hasFeedback && !refreshFeedback
    if (alreadyClosed) {
      skipped++
      console.log("\n[skip]", r.ticketNo, "已是已关闭且已有处理反馈")
      continue
    }
    if (r.status === TARGET_STATUS && sameFeedback) {
      skipped++
      console.log("\n[skip]", r.ticketNo, "已是已关闭且反馈一致")
      continue
    }

    if (dryRun) {
      console.log("\n[dry-run]", r.ticketNo, "→", TARGET_STATUS)
      console.log("  feedback:", text.slice(0, 80) + "…")
      closed++
      continue
    }

    const [res] = await conn.execute(
      `UPDATE feedback_tickets
       SET status = ?, processFeedback = ?
       WHERE ticketNo = ?`,
      [TARGET_STATUS, text, r.ticketNo],
    )
    if (res.affectedRows) {
      closed++
      console.log("\n[closed]", r.ticketNo)
    }
  }

  const [after] = await conn.query(
    `SELECT ticketNo, status, LEFT(processFeedback, 60) AS fbPreview
     FROM feedback_tickets WHERE ticketNo IN (${placeholders}) ORDER BY ticketNo`,
    ticketNos,
  )

  console.log("\n关单后：")
  for (const r of after) {
    console.log(`  ${r.ticketNo} | ${r.status} | ${r.fbPreview || "—"}…`)
  }

  const [summary] = await conn.query(
    "SELECT status, COUNT(*) AS c FROM feedback_tickets GROUP BY status ORDER BY status",
  )
  console.log("\n全库工单状态分布:", summary.map((s) => `${s.status}:${s.c}`).join(", "))
  console.log("\n本次关闭/将关闭:", closed, "跳过:", skipped)

  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
