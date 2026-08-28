/**
 * 为全部反馈工单写入 processFeedback（幂等：仅当为空时更新）
 * 用法：node scripts/backfill-feedback-process-feedback.cjs [.env路径]
 */
const fs = require("fs")
const mysql = require("mysql2/promise")

/** @type {Record<string, string>} */
const FEEDBACK_BY_TICKET = {
  // —— 七月（16）——
  FB202607231541700:
    "已修正用箱申请页堆场/库存匹配：按提还箱城市关联启用堆场与可用库存校验，租赁箱下单不再误报「堆场无库存」。",
  FB202607231622882:
    "现场确认放箱改为「粘贴批量 / 搜索勾选」登记箱号，不再逐箱点选；符合堆场现场批量操作习惯。",
  FB202607231624885:
    "单据中心增加「提箱作业 / 还箱作业」阶段切换；还箱预约、上传证明、现场确认收箱均在还箱 Tab 完成。",
  FB202607231633272:
    "管理中枢「数据导出」及各业务列表已支持 CSV 台账下载（用箱订单、账单、库存等），便于小组核对归档。",
  FB202607231634873:
    "堆场维护页已增加「新增堆场」，可创建堆场并同步初始化对应库存维度。",
  FB202607231637582:
    "单据中心支持按提箱单号打印/下载提箱单电子版（PDF 或图片），堆场与客户均可留存。",
  FB202607241013750:
    "已修正客户申请页堆场可用性判断：按城市匹配启用堆场（提示与库存台账解耦），有堆场配置即可正常下单。",
  FB202607241015312:
    "修箱登记强制 ISO6346 箱号格式，且须为所选堆场在场箱；不可随意填写未在场箱号，重复未完结工单会拦截。",
  FB202607241055827:
    "账单列表/明细/打印均展示币种、汇率与折合人民币；外币账单高亮，CNY 显示本币说明，明细行含汇率信息。",
  FB202607271627184:
    "工作台 M02 区增加「调运价目维护」快捷入口；调运申请页链至价目维护，选堆场后可见报价方案与单价。",
  FB202607271628398:
    "调运申请页展示「调运报价方案（还箱城市 + 单价）」卡片，并链至 /config/dispatch-prices；可完成调运全流程测试。",
  FB202607281045608:
    "客户主档增加用箱合同起止日期；到期或停用客户提交用箱申请时拦截并提示维护合同有效期。",
  FB202607281046991:
    "还箱 Tab 增加角色「下一步」引导与协作说明；上传还箱证明后进入「还箱中」；管理侧可见还箱待办统计。",
  FB202607281050931:
    "供应商台账增加「自有集装箱档案」入口，链至库存总表按自有箱筛选，可查看自有箱档案信息。",
  FB202607311531583:
    "城市字典支持 CSV 模板下载、导出与批量导入，表头与校验规则已统一，导入错误行汇总提示。",
  FB202607311532561:
    "供应商种类已扩展「调运供应商」，供应合同与调运业务可选用该类型供应商。",

  // —— 八月（27）——
  FB202608030946751:
    "提箱单打印模板已去除还箱城市字段，提箱作业单据仅保留提箱相关信息。",
  FB202608030947134:
    "一单可开具多张提箱单，每张独立提箱单号；列表、打印与下载均可按单号选择。",
  FB202608030949338:
    "用箱账单改为堆场登记提箱箱号后自动生成（非放箱即出账）；明细含提箱单号、箱号与提箱时间。",
  FB202608030951688:
    "提箱流程调整为随机出场：现场确认放箱不选箱号，放箱后由堆场通过「登记箱号」补录实际箱号与时间，再触发出账。",
  FB202608030955855:
    "订单处理列表增加「提箱城市」「还箱城市」列，便于按线路统计与筛选。",
  FB202608031524915:
    "用箱申请/订单支持箱源（自有箱/租赁箱）；确认可改箱源；登记箱号按箱属过滤候选库存，各列表展示箱源。",
  FB202608031532569:
    "修复用箱价目新增失败问题；页内支持 CSV 批量导入/导出价目规则。",
  FB202608031535323:
    "修复调运价目维护保存失败（缺表幂等补齐），现可正常新增与编辑调运价格。",
  FB202608031538999:
    "「我的订单」详情展示下单时锁定的币种与汇率，便于客户核对计价依据。",
  FB202608031542752:
    "修复代管公司新增失败问题，代管关系可正常创建与维护。",
  FB202608031545389:
    "账单扩展维修费/上下车费/异常费类型；分别在修箱审批通过、确认还箱、异常进出场节点触发生成。",
  FB202608031603651:
    "反馈工单管理页已支持导出 CSV（含工单号、类型、内容、处理反馈等），便于查重与全面性核对。",
  FB202608031616997:
    "公开 /signup 提交账号申请；系统管理「账号申请审批」支持管理员通过开通 R03 客户账号或驳回。",
  FB202608031618876:
    "修箱工单支持报价明细行与箱管审批（提交/通过/驳回）；审批通过自动生成维修费账单。",
  FB202608031620814:
    "异常进出场登记增加「进出场时间」字段（非默认提交时间），可录入实际发生时间；批量导入能力持续完善中。",
  FB202608031625293:
    "「我的订单」支持提箱后取消：按规则收取变更费并生成账单，同时释放库存占用。",
  FB202608031630667:
    "还箱预约与登记支持填写「实际还箱时间」，堆场滞后录入时可补录真实还箱时点。",
  FB202608031632597:
    "还箱单独立还箱单号（类比提箱单）；打印模板默认不展示原提箱城市，避免与历史记录混淆。",
  FB202608031637205:
    "堆场台账支持日堆存费、免堆天数、上下车费、二次搬移费维护；提供 CSV 模板导出与按名称/编码导入。",
  FB202608031643646:
    "提箱单/还箱单打印模板默认隐藏客户信息，仅保留堆场与作业所需字段。",
  FB202608041530988:
    "五维库存「集装箱总表」增加全部/在场/已出场 Tab，含已出场箱的全生命周期动态记录。",
  FB202608041531642:
    "提箱列表「柜数」列展示放箱/已提/待提数量（放×/提×/待×），直观反映提箱进度。",
  FB202608041532432:
    "提箱 Tab 支持按订单展开提箱单明细，逐级对应提箱单号与登记箱号。",
  FB202608041543826:
    "工作台对客户角色隐藏在场库存统计与无关待办，仅展示与本角色相关的通知与入口。",
  FB202608041545460:
    "用箱价目「回程箱贴」不可为负值，保存前表单校验拦截。",
  FB202608041638708:
    "「变更堆场」限制为已确认且尚未登记箱号（提箱前）的订单；提箱后不可变更并给出提示。",
  FB202608041642477:
    "用箱价目表单与列表已增加「用箱期（天）」「超期费（元/箱/天）」字段，报价要素已补齐。",
}

async function main() {
  const envPath = process.argv[2] || ".env.production.local"
  const dryRun = process.argv.includes("--dry-run")
  const env = fs.readFileSync(envPath, "utf8").replace(/\r/g, "")
  const get = (k) => (env.match(new RegExp("^" + k + "=(.+)$", "m")) || [])[1]?.trim()

  const conn = await mysql.createConnection({
    host: get("DB_HOST") || get("MYSQL_HOST") || "127.0.0.1",
    port: Number(get("DB_PORT") || 3306),
    user: get("DB_USER") || get("MYSQL_USER"),
    password: get("DB_PASSWORD") || get("MYSQL_PASSWORD"),
    database: get("DB_NAME") || get("MYSQL_DATABASE"),
  })

  // 确保列存在
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

  const [all] = await conn.query(
    "SELECT ticketNo, processFeedback FROM feedback_tickets ORDER BY ticketNo",
  )
  console.log("DB total:", all.length)
  console.log("Map total:", Object.keys(FEEDBACK_BY_TICKET).length)

  const missingInMap = all.filter((r) => !FEEDBACK_BY_TICKET[r.ticketNo]).map((r) => r.ticketNo)
  const extraInMap = Object.keys(FEEDBACK_BY_TICKET).filter(
    (no) => !all.some((r) => r.ticketNo === no),
  )
  if (missingInMap.length) {
    console.error("Missing feedback mapping for:", missingInMap.join(", "))
    process.exitCode = 1
  }
  if (extraInMap.length) console.warn("Extra mapping (not in DB):", extraInMap.join(", "))

  let updated = 0
  let skipped = 0
  for (const row of all) {
    const text = FEEDBACK_BY_TICKET[row.ticketNo]
    if (!text) continue
    if (row.processFeedback && row.processFeedback.trim()) {
      skipped++
      continue
    }
    if (dryRun) {
      console.log("[dry-run]", row.ticketNo, text.slice(0, 60) + "…")
      updated++
      continue
    }
    const [r] = await conn.execute(
      "UPDATE feedback_tickets SET processFeedback = ? WHERE ticketNo = ? AND (processFeedback IS NULL OR TRIM(processFeedback) = '')",
      [text, row.ticketNo],
    )
    if (r.affectedRows) updated++
  }

  console.log("Updated:", updated, "Skipped (already filled):", skipped)
  const [check] = await conn.query(
    "SELECT COUNT(*) AS filled FROM feedback_tickets WHERE processFeedback IS NOT NULL AND TRIM(processFeedback) <> ''",
  )
  console.log("Filled total:", check[0].filled, "/", all.length)
  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
