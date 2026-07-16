/**
 * 对照《03-调运供应审批主路径》做 API 级验证
 * 运行：pnpm test:ut03
 */
import { Client, BASE_URL, nowStr, uid, pastDeadline } from "../scripts/e2e/harness"
import { writeFileSync, mkdirSync } from "node:fs"

type Row = { id: string; ok: boolean; note: string }
const rows: Row[] = []

function mark(id: string, ok: boolean, note: string) {
  rows.push({ id, ok, note })
  console.log(`${ok ? "PASS" : "FAIL"} ${id} — ${note}`)
}

async function main() {
  console.log(`\n=== 验证 03-调运供应审批 · ${BASE_URL} ===\n`)
  try {
    const r = await fetch(`${BASE_URL}/api/auth/me`)
    if (r.status >= 500) throw new Error(`auth/me ${r.status}`)
  } catch {
    console.error("无法连接服务，请先 pnpm dev")
    process.exit(1)
  }

  const r01 = new Client("R01")
  const r02 = new Client("R02")
  const r05 = new Client("R05")
  await r01.login("zhangwei")
  await r02.login("wangfang")
  await r05.login("carrier_pl")
  mark("UT-DISP-01#0", true, "R01/R02/R05 登录成功")

  // —— UT-DISP-01 ——
  const dispatchNo = `DP${uid("").slice(0, 10)}`
  const qty = 2
  const unitPrice = 500
  const totalPrice = qty * unitPrice
  const approvals = [
    { level: 1, role: "调运专员", approver: "张伟", status: "待审批" },
    { level: 2, role: "财务专员", approver: "王芳", status: "未开始" },
  ]
  const created = await r01.create("dispatch", {
    dispatchNo,
    planTime: nowStr(),
    pickupPlace: "汉堡HCS",
    returnScope: "不来梅 / 汉诺威",
    reason: "用户测试 UT-DISP-01",
    unitPrice,
    overdueStandard: "¥100/箱/天",
    useTerm: 21,
    quantity: qty,
    carrier: "波兰联运物流",
    totalPrice,
    status: "审批中",
    createdBy: "张伟",
    createdAt: nowStr(),
    approvals,
    pickedCount: 0,
    returnedCount: 0,
  })
  mark("UT-DISP-01#1", !!created.ok, created.ok ? `调运单 ${dispatchNo} 审批中` : "创建失败")

  const id = created.data.id
  let a1 = [
    { ...approvals[0], status: "通过", time: nowStr(), comment: "UT一级通过" },
    { ...approvals[1], status: "待审批" },
  ]
  const p1 = await r01.patch("dispatch", id, { approvals: a1, status: "审批中" })
  mark("UT-DISP-01#2", !!p1.ok, "R01 一级审批通过")

  const a2 = [a1[0], { ...a1[1], status: "通过", time: nowStr(), comment: "UT财务通过" }]
  const p2 = await r02.patch("dispatch", id, { approvals: a2, status: "已下发" })
  mark("UT-DISP-01#3", !!p2.ok && p2.data?.status === "已下发", "R02 二级通过→已下发")

  await r01.create("notifications", {
    type: "任务",
    level: "重要",
    title: `调运任务已下发 · ${dispatchNo}`,
    desc: "用户测试",
    module: "M02",
    href: "/dispatch/tasks",
    roles: ["R01", "R05"],
    actionable: true,
    read: false,
    createdAt: nowStr(),
  })

  const dispList = await r05.list("dispatch")
  const visible =
    dispList.ok && (dispList.data as any[]).some((d) => d.dispatchNo === dispatchNo)
  mark("UT-DISP-01#4", !!visible, visible ? "R05 可见本承运商调运单" : "R05 不可见")

  const invRes = await r05.list("inventory")
  const inv = (invRes.data as any[] | null)?.find((r) => r.yard === "汉堡HCS" || r.city === "汉堡")
  const beforeOnSite = inv?.onSite ?? 0
  await r05.patch("dispatch", id, { pickedCount: qty, status: "提箱中" })
  if (inv?.id) {
    await r05.patch("inventory", inv.id, {
      onSite: Math.max(0, inv.onSite - qty),
      available: Math.max(0, inv.available - qty),
      incoming: inv.incoming + qty,
    })
  }
  const containerNos: string[] = []
  for (let i = 1; i <= qty; i++) {
    const no = `UT${dispatchNo.slice(-6)}${String(i).padStart(2, "0")}`
    containerNos.push(no)
    await r05.create("gate", {
      containerNo: no,
      type: "出场",
      time: nowStr(),
      yard: "汉堡HCS",
      city: "汉堡",
      source: "系统放箱/调运订单",
      relatedOrderNo: dispatchNo,
      mappingStatus: "已映射",
      ownership: "自有箱",
    })
  }
  const invAfter = inv?.id
    ? (await r05.list("inventory")).data?.find((r: any) => r.id === inv.id)
    : null
  mark(
    "UT-DISP-01#5",
    !!inv && invAfter && invAfter.onSite === beforeOnSite - qty,
    inv ? `提箱后 onSite ${beforeOnSite}→${invAfter?.onSite}` : "未找到汉堡库存",
  )

  await r05.patch("dispatch", id, { status: "还箱中" })
  const applyNo = `RA${uid("").slice(0, 8)}`
  const ret = await r05.create("returns", {
    applyNo,
    carrier: "波兰联运物流",
    containerNos,
    returnYard: "华沙pkpcc",
    returnCity: "华沙",
    relatedDispatchNos: [dispatchNo],
    appliedAt: nowStr(),
    status: "待审核",
  })
  mark("UT-DISP-01#6", !!ret.ok, ret.ok ? `还箱申请 ${applyNo}` : "发起还箱失败")

  await r01.patch("returns", ret.data.id, {
    status: "已通过",
    reviewer: "张伟(调运专员)",
  })
  await r01.patch("dispatch", id, { returnedCount: qty, status: "已结束" })
  const warsaw = (await r01.list("inventory")).data?.find((r: any) => r.yard === "华沙pkpcc")
  if (warsaw?.id) {
    await r01.patch("inventory", warsaw.id, {
      onSite: warsaw.onSite + qty,
      available: warsaw.available + qty,
      incoming: Math.max(0, warsaw.incoming - qty),
    })
  }
  for (const no of containerNos) {
    await r01.create("gate", {
      containerNo: no,
      type: "进场",
      time: nowStr(),
      yard: "华沙pkpcc",
      city: "华沙",
      source: "系统放箱/调运订单",
      relatedOrderNo: dispatchNo,
      mappingStatus: "已映射",
      ownership: "自有箱",
    })
  }
  const ended = (await r01.list("dispatch")).data?.find((d: any) => d.id === id)
  mark("UT-DISP-01#7", ended?.status === "已结束", "还箱审核通过→已结束")

  const bill = await r01.create("bills", {
    billNo: `BILL-DISP-${uid("").slice(0, 6)}`,
    type: "调运费账单",
    relatedOrderNo: dispatchNo,
    party: "波兰联运物流",
    amount: totalPrice,
    status: "待确认",
    issuedAt: nowStr().slice(0, 10),
    confirmDeadline: pastDeadline(-3),
    items: [{ label: "调运费", value: `¥${totalPrice}` }],
  })
  const paid = await r05.patch("bills", bill.data.id, { status: "已支付" })
  mark("UT-DISP-01#8", !!bill.ok && !!paid.ok, "调运费账单已核销")

  // —— UT-DISP-02 驳回 ——
  const rejectNo = `DP${uid("R").slice(0, 9)}`
  const rejApprovals = [
    { level: 1, role: "调运专员", approver: "张伟", status: "通过", time: nowStr(), comment: "ok" },
    { level: 2, role: "财务专员", approver: "王芳", status: "待审批" },
  ]
  const rej = await r01.create("dispatch", {
    dispatchNo: rejectNo,
    planTime: nowStr(),
    pickupPlace: "汉堡HCS",
    returnScope: "华沙",
    reason: "用户测试驳回",
    unitPrice: 400,
    overdueStandard: "¥100/箱/天",
    useTerm: 14,
    quantity: 1,
    carrier: "波兰联运物流",
    totalPrice: 400,
    status: "审批中",
    createdBy: "张伟",
    createdAt: nowStr(),
    approvals: rejApprovals,
    pickedCount: 0,
    returnedCount: 0,
  })
  const rejected = await r02.patch("dispatch", rej.data.id, {
    approvals: [
      rejApprovals[0],
      { ...rejApprovals[1], status: "驳回", time: nowStr(), comment: "UT驳回" },
    ],
    status: "已驳回",
  })
  mark("UT-DISP-02", !!rejected.ok && rejected.data?.status === "已驳回", "R02 驳回成功")

  // —— UT-SUPPLY-01 ——
  const planNo = `SP${uid("").slice(0, 10)}`
  const plan = await r01.create("supplyPlans", {
    planNo,
    type: "采购",
    containerType: "40HQ",
    quantity: 5,
    estUnitPrice: 20000,
    estAmount: 100000,
    demandCity: "西安",
    expectArrival: "2026-12-31",
    reason: "用户测试供应",
    status: "审批中",
    createdBy: "张伟",
    createdAt: nowStr(),
  })
  mark("UT-SUPPLY-01#1", !!plan.ok, plan.ok ? `供应计划 ${planNo} 审批中` : "创建计划失败")

  await r01.create("notifications", {
    type: "审批",
    level: "重要",
    title: `供应计划待审批 · ${planNo}`,
    desc: "用户测试",
    module: "M05",
    href: "/supply/plans",
    roles: ["R02"],
    actionable: true,
    read: false,
    createdAt: nowStr(),
  })

  // 供应计划 ACL：仅 R00/R01 可写；R02 收通知，R01 在计划页批准
  const r02n = await r02.list("notifications")
  const hasPlanN =
    r02n.ok &&
    (r02n.data as any[]).some((n) => String(n.title || "").includes(planNo))
  mark("UT-SUPPLY-01#2a", !!hasPlanN, hasPlanN ? "R02 inbox 可见供应待审批通知" : "R02 无供应通知")

  const approved = await r01.patch("supplyPlans", plan.data.id, { status: "已批准" })
  mark("UT-SUPPLY-01#2", !!approved.ok && approved.data?.status === "已批准", "R01 批准供应计划")

  // 负向：R02 不可写供应计划
  const denied = await r02.patch("supplyPlans", plan.data.id, { status: "执行中" })
  mark(
    "UT-SUPPLY-01#2b",
    denied.status === 403,
    `R02 PATCH supplyPlans 期望 403，实际 ${denied.status}`,
  )
  const contractNo = `SC${uid("").slice(0, 10)}`
  const contract = await r01.create("supplyContracts", {
    contractNo,
    type: "采购",
    supplier: "中集集团（CIMC）",
    containerType: "40HQ",
    quantity: 5,
    unitPrice: 20000,
    currency: "CNY",
    amount: 100000,
    relatedPlanNo: planNo,
    signedAt: nowStr().slice(0, 10),
    startDate: nowStr().slice(0, 10),
    endDate: "2027-12-31",
    deliveredQty: 0,
    status: "履行中",
  })
  await r01.patch("supplyPlans", plan.data.id, { status: "执行中" })
  mark("UT-SUPPLY-01#3", !!contract.ok, contract.ok ? `转合同 ${contractNo}` : "转合同失败")

  const invList = await r01.list("inventory")
  const xian = (invList.data as any[] | null)?.find((r) => r.city === "西安")
  const before = xian?.onSite ?? 0
  const increment = 2
  await r01.patch("supplyContracts", contract.data.id, { deliveredQty: increment })
  if (xian?.id) {
    for (let i = 1; i <= increment; i++) {
      const no = `SUP${contractNo.slice(-6)}${String(i).padStart(2, "0")}`
      await r01.create("gate", {
        containerNo: no,
        type: "进场",
        time: nowStr(),
        yard: xian.yard,
        city: xian.city,
        source: "系统放箱/调运订单",
        relatedOrderNo: contractNo,
        mappingStatus: "已映射",
        ownership: "自有箱",
      })
      await r01.create("containers", {
        containerNo: no,
        type: "40HQ",
        ownership: "自有箱",
        currentYard: xian.yard,
        currentCity: xian.city,
        status: "在场",
        lastGateTime: nowStr(),
        storageDays: 0,
        relatedOrderNo: contractNo,
      })
    }
    await r01.patch("inventory", xian.id, {
      onSite: before + increment,
      available: xian.available + increment,
    })
  }
  const after = xian?.id
    ? (await r01.list("inventory")).data?.find((r: any) => r.id === xian.id)
    : null
  mark(
    "UT-SUPPLY-01#4",
    !!xian && after?.onSite === before + increment,
    xian ? `到箱后西安库存 ${before}→${after?.onSite}` : "无西安库存行",
  )

  const passed = rows.filter((r) => r.ok).length
  const failed = rows.filter((r) => !r.ok)
  const md = [
    `# 验证记录 · 03-调运供应审批主路径`,
    ``,
    `- 时间：${nowStr()}`,
    `- 环境：${BASE_URL}`,
    `- 方式：API 对照文档自动验证`,
    `- 汇总：**${passed}/${rows.length}** 通过`,
    ``,
    `| 用例步骤 | 结果 | 说明 |`,
    `| :--- | :---: | :--- |`,
    ...rows.map((r) => `| ${r.id} | ${r.ok ? "通过" : "失败"} | ${r.note} |`),
    ``,
    failed.length
      ? `## 失败项\n\n${failed.map((f) => `- **${f.id}**：${f.note}`).join("\n")}`
      : `## 结论\n\n调运二级审批闭环、驳回分支、供应批准转合同到箱（API 层）可闭环。`,
    ``,
  ].join("\n")
  mkdirSync("用户测试", { recursive: true })
  writeFileSync("用户测试/验证记录-03.md", md, "utf8")
  console.log(`\n已写入 用户测试/验证记录-03.md`)
  console.log(`=== 汇总：${passed}/${rows.length} ===\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
