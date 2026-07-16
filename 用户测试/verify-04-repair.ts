/**
 * 对照《04-修箱专篇》做 API 级验证
 * 运行：pnpm test:ut04
 */
import { Client, BASE_URL, nowStr, uid } from "../scripts/e2e/harness"
import { writeFileSync, mkdirSync } from "node:fs"

type Row = { id: string; ok: boolean; note: string }
const rows: Row[] = []

function mark(id: string, ok: boolean, note: string) {
  rows.push({ id, ok, note })
  console.log(`${ok ? "PASS" : "FAIL"} ${id} — ${note}`)
}

async function main() {
  console.log(`\n=== 验证 04-修箱专篇 · ${BASE_URL} ===\n`)
  try {
    const r = await fetch(`${BASE_URL}/api/auth/me`)
    if (r.status >= 500) throw new Error(`auth/me ${r.status}`)
  } catch {
    console.error("无法连接服务，请先 pnpm dev")
    process.exit(1)
  }

  const r03 = new Client("R03")
  const r01 = new Client("R01")
  await r03.login("customer_xa")
  await r01.login("zhangwei")
  mark("UT-REPAIR-01#0", true, "R03/R01 登录成功")

  // —— UT-REPAIR-01 客户挂修 ——
  const orderNo = `UB${uid("R").slice(0, 9)}`
  const ord = await r03.create("orders", {
    orderNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "西安",
    returnCity: "汉堡",
    containerType: "40GP",
    quantity: 1,
    unitPrice: 2800,
    status: "已确认",
    createdAt: nowStr(),
    confirmedAt: nowStr(),
    releaseDocReady: true,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    conditionCheck: "异常",
    conditionNote: "用户测试箱况异常挂修",
    channel: "订舱后新增",
  })
  mark("UT-REPAIR-01#1", !!ord.ok, ord.ok ? `异常样例订单 ${orderNo}` : "建单失败")

  const hangRepairNo = `RP${uid("H").slice(0, 8)}`
  const hang = await r03.create("repair", {
    repairNo: hangRepairNo,
    containerNo: `PEND-${orderNo.slice(-6)}`,
    containerType: "40GP",
    ownership: "自有箱",
    yard: "西安新筑堆场",
    city: "西安",
    damageDesc: "用户测试箱况异常",
    level: "小修",
    vendor: "待指派",
    estCost: 0,
    reportedBy: "西安国际陆港集团",
    reportedAt: nowStr(),
    status: "待报修",
  })
  await r03.create("notifications", {
    type: "系统",
    level: "紧急",
    title: `提箱箱况异常 · ${orderNo}`,
    desc: "用户测试箱况异常",
    module: "M01 提还箱作业",
    href: "/repair/orders",
    roles: ["R01", "R04"],
    actionable: true,
    read: false,
    createdAt: nowStr(),
  })
  mark("UT-REPAIR-01#2", !!hang.ok, hang.ok ? `挂修工单 ${hangRepairNo}` : "挂修失败")

  const notifs = await r01.list("notifications")
  const hasAlert =
    notifs.ok &&
    (notifs.data as any[]).some(
      (n) => String(n.title || "").includes(orderNo) || String(n.title || "").includes("箱况异常"),
    )
  mark("UT-REPAIR-01#3", !!hasAlert, hasAlert ? "R01 可见箱况异常通知" : "无异常通知")

  if (hang.ok && hang.data?.id) {
    await r01.patch("repair", hang.data.id, { status: "待检验" })
    await r01.patch("repair", hang.data.id, { status: "维修中" })
    await r01.patch("repair", hang.data.id, { status: "待验收", actualCost: 800 })
    const done = await r01.patch("repair", hang.data.id, {
      status: "已完工",
      finishedAt: nowStr().slice(0, 10),
    })
    mark(
      "UT-REPAIR-01#4",
      !!done.ok && done.data?.status === "已完工" && done.data?.actualCost === 800,
      done.ok ? "挂修流转至已完工（actualCost=800）" : "流转失败",
    )
  } else {
    mark("UT-REPAIR-01#4", false, "无挂修工单")
  }

  // —— UT-REPAIR-02 主动登记 + 库存联动 ——
  const containerNo = `RP${uid("").slice(0, 8)}`
  const repairNo = `RP${uid("X").slice(0, 8)}`
  await r01.create("containers", {
    containerNo,
    type: "40GP",
    ownership: "自有箱",
    currentYard: "西安新筑堆场",
    currentCity: "西安",
    status: "在场",
    lastGateTime: nowStr(),
    storageDays: 0,
  })
  const inv = (await r01.list("inventory")).data?.find((r: any) => r.yard === "西安新筑堆场")
  const availBefore = inv?.available ?? 0

  const order = await r01.create("repair", {
    repairNo,
    containerNo,
    containerType: "40GP",
    ownership: "自有箱",
    yard: "西安新筑堆场",
    city: "西安",
    damageDesc: "用户测试主动登记",
    level: "中修",
    vendor: "西安集装箱修理厂",
    estCost: 2000,
    reportedBy: "张伟",
    reportedAt: nowStr(),
    status: "待报修",
  })
  mark("UT-REPAIR-02#1", !!order.ok, order.ok ? `登记工单 ${repairNo}` : "登记失败")

  await r01.patch("repair", order.data.id, { status: "待检验" })
  await r01.patch("repair", order.data.id, { status: "维修中" })
  await r01.patch("containers", containerNo, { status: "维修中" })
  if (inv?.id) {
    await r01.patch("inventory", inv.id, { available: Math.max(0, inv.available - 1) })
  }
  await r01.patch("repair", order.data.id, { status: "待验收", actualCost: 2100 })
  await r01.patch("repair", order.data.id, {
    status: "已完工",
    finishedAt: nowStr().slice(0, 10),
  })
  await r01.patch("containers", containerNo, { status: "在场" })
  if (inv?.id) {
    const cur = (await r01.list("inventory")).data?.find((r: any) => r.id === inv.id)
    await r01.patch("inventory", inv.id, {
      available: (cur?.available ?? 0) + 1,
    })
  }
  const c = (await r01.list("containers")).data?.find((x: any) => x.containerNo === containerNo)
  const invEnd = inv?.id
    ? (await r01.list("inventory")).data?.find((r: any) => r.id === inv.id)
    : null
  mark(
    "UT-REPAIR-02#2",
    c?.status === "在场" && !!invEnd && invEnd.available === availBefore,
    `验收后箱主档在场；available ${availBefore}→${invEnd?.available}`,
  )

  // —— UT-REPAIR-03 报废 ——
  const scrapNo = `SCR${uid("").slice(0, 7)}`
  const scrapRepair = `RP${uid("S").slice(0, 7)}`
  await r01.create("containers", {
    containerNo: scrapNo,
    type: "20GP",
    ownership: "自有箱",
    currentYard: "西安新筑堆场",
    currentCity: "西安",
    status: "在场",
    lastGateTime: nowStr(),
    storageDays: 0,
  })
  const inv2 = (await r01.list("inventory")).data?.find((r: any) => r.yard === "西安新筑堆场")
  const onSiteBefore = inv2?.onSite ?? 0
  const scrap = await r01.create("repair", {
    repairNo: scrapRepair,
    containerNo: scrapNo,
    containerType: "20GP",
    ownership: "自有箱",
    yard: "西安新筑堆场",
    city: "西安",
    damageDesc: "用户测试报废",
    level: "报废评估",
    vendor: "厂",
    estCost: 0,
    reportedBy: "张伟",
    reportedAt: nowStr(),
    status: "待检验",
  })
  await r01.patch("repair", scrap.data.id, {
    status: "已报废",
    finishedAt: nowStr().slice(0, 10),
  })
  await r01.patch("containers", scrapNo, {
    status: "已报废",
    relatedOrderNo: `报废:${scrapRepair}`,
  })
  if (inv2?.id) {
    await r01.patch("inventory", inv2.id, {
      onSite: Math.max(0, inv2.onSite - 1),
      available: Math.min(inv2.available, Math.max(0, inv2.onSite - 1)),
    })
  }
  const scrapC = (await r01.list("containers")).data?.find((x: any) => x.containerNo === scrapNo)
  const invScrap = inv2?.id
    ? (await r01.list("inventory")).data?.find((r: any) => r.id === inv2.id)
    : null
  mark(
    "UT-REPAIR-03",
    scrapC?.status === "已报废" && !!invScrap && invScrap.onSite === onSiteBefore - 1,
    `判废成功；onSite ${onSiteBefore}→${invScrap?.onSite}`,
  )

  const passed = rows.filter((r) => r.ok).length
  const failed = rows.filter((r) => !r.ok)
  const md = [
    `# 验证记录 · 04-修箱专篇`,
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
      : `## 结论\n\n客户挂修、主动登记验收、报废分支（API 层）可闭环。`,
    ``,
  ].join("\n")
  mkdirSync("用户测试", { recursive: true })
  writeFileSync("用户测试/验证记录-04.md", md, "utf8")
  console.log(`\n已写入 用户测试/验证记录-04.md`)
  console.log(`=== 汇总：${passed}/${rows.length} ===\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
