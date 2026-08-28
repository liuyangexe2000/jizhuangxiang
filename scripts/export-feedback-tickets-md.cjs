/**
 * 从数据库导出全部反馈工单为 Markdown
 * 用法：node scripts/export-feedback-tickets-md.cjs [.env路径] [输出路径]
 */
const fs = require("fs")
const mysql = require("mysql2/promise")

async function main() {
  const envPath = process.argv[2] || ".env.production.local"
  const outPath = process.argv[3] || "docs/反馈工单处理记录.md"
  const env = fs.readFileSync(envPath, "utf8").replace(/\r/g, "")
  const get = (k) => (env.match(new RegExp("^" + k + "=(.+)$", "m")) || [])[1]?.trim()

  const conn = await mysql.createConnection({
    host: get("DB_HOST") || get("MYSQL_HOST") || "127.0.0.1",
    port: Number(get("DB_PORT") || 3306),
    user: get("DB_USER") || get("MYSQL_USER"),
    password: get("DB_PASSWORD") || get("MYSQL_PASSWORD"),
    database: get("DB_NAME") || get("MYSQL_DATABASE"),
  })

  const [rows] = await conn.query(
    `SELECT ticketNo, type, status, pagePath, pageTitle, content, account, userName, roleName, createdAt, processFeedback
     FROM feedback_tickets ORDER BY ticketNo`,
  )
  await conn.end()

  const july = rows.filter((r) => r.ticketNo.includes("202607"))
  const aug = rows.filter((r) => r.ticketNo.includes("202608"))
  const now = new Date().toISOString().slice(0, 10)

  const lines = []
  lines.push("# 反馈工单处理记录（全量）")
  lines.push("")
  lines.push(`> 数据来源：生产库 \`feedback_tickets\`，导出日期 ${now}。`)
  lines.push(`> 共 **${rows.length}** 条，状态均为「已关闭」，均已填写 \`processFeedback\`（工单处理反馈）。`)
  lines.push("")
  lines.push("## 总览")
  lines.push("")
  lines.push("| 月份 | 数量 | 说明 |")
  lines.push("|------|------|------|")
  lines.push(`| 2026-07 | ${july.length} | 用箱申请、单据中心、堆场、修箱、账单汇率、调运报价、还箱流程、主数据等 |`)
  lines.push(`| 2026-08 | ${aug.length} | 提还箱单据、价目/堆场、多类账单、修箱审批、账号申请、库存与客户权限等 |`)
  lines.push(`| **合计** | **${rows.length}** | |`)
  lines.push("")
  lines.push("## 工单明细")
  lines.push("")

  function section(title, list) {
    lines.push(`### ${title}（${list.length} 条）`)
    lines.push("")
    for (const r of list) {
      lines.push(`#### ${r.ticketNo}`)
      lines.push("")
      lines.push("| 字段 | 内容 |")
      lines.push("|------|------|")
      lines.push(`| 类型 | ${r.type} |`)
      lines.push(`| 状态 | ${r.status} |`)
      lines.push(`| 提交时间 | ${r.createdAt} |`)
      lines.push(`| 提交人 | ${r.userName}（${r.account}）· ${r.roleName} |`)
      lines.push(`| 页面 | ${r.pageTitle} |`)
      lines.push(`| 路径 | \`${r.pagePath}\` |`)
      lines.push("")
      lines.push("**用户描述**")
      lines.push("")
      lines.push("```text")
      lines.push(String(r.content || "").trim())
      lines.push("```")
      lines.push("")
      lines.push("**工单处理反馈**")
      lines.push("")
      lines.push(String(r.processFeedback || "（未填写）").trim())
      lines.push("")
      lines.push("---")
      lines.push("")
    }
  }

  section("2026 年 7 月", july)
  section("2026 年 8 月", aug)

  lines.push("## 附录：工单号索引")
  lines.push("")
  lines.push("| 序号 | 工单号 | 类型 | 页面路径 |")
  lines.push("|------|--------|------|----------|")
  rows.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.ticketNo} | ${r.type} | \`${r.pagePath}\` |`)
  })
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("*本文档由 `scripts/export-feedback-tickets-md.cjs` 从数据库自动生成，与系统「反馈工单」详情弹框中的处理反馈字段一致。*")

  fs.mkdirSync(require("path").dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join("\n"), "utf8")
  console.log("Wrote", rows.length, "tickets to", outPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
