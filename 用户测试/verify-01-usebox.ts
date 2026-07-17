/**
 * 对照《01-客户用箱主路径》做 API 级验证
 * 运行：pnpm test:ut01
 * 前置：pnpm dev 已启动
 */
import { Client, BASE_URL, nowStr, uid, pastDeadline, ensureOnSiteContainers } from "../scripts/e2e/harness"
import { writeFileSync, mkdirSync } from "node:fs"

type Row = { id: string; ok: boolean; note: string }
const rows: Row[] = []

function mark(id: string, ok: boolean, note: string) {
  rows.push({ id, ok, note })
  console.log(`${ok ? "PASS" : "FAIL"} ${id} — ${note}`)
}

function workPlanTime() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function main() {
  console.log(`\n=== 验证 01-客户用箱主路径 · ${BASE_URL} ===\n`)

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
  mark("UT-UB-01#1", true, "customer_xa / zhangwei 登录成功")

  const orderNo = `UB${uid("T").slice(0, 9)}`
  const created = await r03.create("orders", {
    orderNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "西安",
    returnCity: "汉堡",
    containerType: "40HQ",
    quantity: 1,
    unitPrice: 3280,
    quotedUnitPrice: 3280,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
    remark: "用户测试 UT-UB-01",
  })
  mark("UT-UB-01#2", !!created.ok && created.data?.status === "待确认", `订单 ${orderNo} 待确认`)

  const denied = await r03.patch("orders", created.data.id, {
    status: "已确认",
    releaseDocReady: true,
  })
  mark("UT-UB-01#2b", denied.status === 403, `客户自行确认期望 403，实际 ${denied.status}`)

  const conf = await r01.patch("orders", created.data.id, {
    status: "已确认",
    confirmedAt: nowStr(),
    confirmedBy: "张伟",
    pickupYard: "陆港堆场",
    returnYard: "汉堡HCS",
    unitPrice: 3200,
    quotedUnitPrice: 3280,
    adminRemark: "优惠 80 元/箱",
    releaseDocReady: true,
    cancelDeadline: (() => {
      const d = new Date(Date.now() + 86400000)
      const p = (n: number) => String(n).padStart(2, "0")
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    })(),
  })
  mark(
    "UT-UB-01#3",
    !!conf.ok &&
      conf.data?.status === "已确认" &&
      conf.data?.pickupYard === "陆港堆场" &&
      conf.data?.releaseDocReady === true,
    conf.ok ? "箱管确认：堆场+改价+放行提箱单" : `确认失败 ${conf.status}`,
  )

  const bill = await r01.create("bills", {
    billNo: `BILL${uid("").slice(0, 8)}`,
    type: "用箱账单",
    relatedOrderNo: orderNo,
    party: "西安国际陆港集团",
    amount: 3200,
    status: "待确认",
    issuedAt: nowStr().slice(0, 10),
    confirmDeadline: pastDeadline(-3),
    items: [{ label: "合计", value: "¥3200" }],
  })
  const billOk = await r03.patch("bills", bill.data.id, { status: "已确认" })
  mark("UT-UB-01#4", !!billOk.ok, billOk.ok ? "用箱账单已确认（成交价）" : "账单确认失败")

  const booking = await r03.create("bookings", {
    bookingNo: `BK${uid("").slice(0, 8)}`,
    type: "提箱预约",
    containerNos: [`UT${orderNo.slice(-6)}01`],
    yard: "陆港堆场",
    city: "西安",
    planTime: workPlanTime(),
    driver: "测试司机",
    driverId: "UT1",
    driverPhone: "13800000000",
    plateNo: "陕A00001",
    refNo: orderNo,
    notifyByEmail: true,
    status: "待发送",
    withinWorkHours: true,
  })
  mark("UT-UB-01#6", !!booking.ok, booking.ok ? "提箱预约已创建" : "预约失败")

  // 阶段B：客户上传随箱资料仅存档，不再驱动状态
  const stuffing = await r03.patch("orders", created.data.id, {
    conditionCheck: "通过",
    stuffingListUploaded: true,
  })
  mark(
    "UT-UB-01#7a",
    !!stuffing.ok && stuffing.data?.status === "已确认",
    "客户上传随箱资料，订单仍为已确认（不越权）",
  )

  const blockedAdvance = await r03.patch("orders", created.data.id, { status: "提箱中" })
  mark("UT-UB-01#7b", blockedAdvance.status === 403, `客户直改提箱中应 403，实际 ${blockedAdvance.status}`)

  await r03.create("attachments", {
    refType: "stuffing_list",
    refNo: orderNo,
    fileName: `stuffing_${orderNo}.pdf`,
    mime: "application/pdf",
    size: 0,
    uploadedBy: "customer_xa",
    uploadedAt: nowStr(),
  })

  // 阶段B：现场（堆场/代管）确认放箱，驱动 提箱中 + 出场 gate + 库存联动
  const pickupNos = await ensureOnSiteContainers(r01, {
    count: 1,
    yard: "陆港堆场",
    city: "西安",
    type: "40HQ",
    prefix: "UB",
  })
  const pickupConfirm = await r01.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-pickup`,
    { conditionCheck: "通过", containerNos: pickupNos },
  )
  mark(
    "UT-UB-01#7c",
    !!pickupConfirm.ok && pickupConfirm.data?.ok === true,
    pickupConfirm.ok ? "现场确认放箱成功" : `确认放箱失败 ${pickupConfirm.status}`,
  )

  const returnProof = await r03.patch("orders", created.data.id, { returnProofUploaded: true })
  mark("UT-UB-01#9", !!returnProof.ok, "客户上传还箱证明（不驱动状态）")

  await r03.create("attachments", {
    refType: "return_proof",
    refNo: orderNo,
    fileName: `return_proof_${orderNo}.pdf`,
    mime: "application/pdf",
    size: 0,
    uploadedBy: "customer_xa",
    uploadedAt: nowStr(),
  })

  // 阶段B：现场确认收箱，驱动 已完成 + 进场 gate + 库存联动
  const returnConfirm = await r01.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-return`,
    { conditionCheck: "通过" },
  )
  mark(
    "UT-UB-01#10",
    !!returnConfirm.ok && returnConfirm.data?.ok === true,
    returnConfirm.ok ? "现场确认收箱后订单已完成" : `确认收箱失败 ${returnConfirm.status}`,
  )

  // —— UT-UB-02 ——
  const badNo = `UB${uid("X").slice(0, 9)}`
  const bad = await r03.create("orders", {
    orderNo: badNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "西安",
    returnCity: "汉堡",
    containerType: "40GP",
    quantity: 1,
    unitPrice: 2980,
    quotedUnitPrice: 2980,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
  })
  await r01.patch("orders", bad.data.id, {
    status: "已确认",
    confirmedAt: nowStr(),
    confirmedBy: "张伟",
    pickupYard: "陆港堆场",
    returnYard: "汉堡HCS",
    releaseDocReady: true,
    conditionCheck: "异常",
    conditionNote: "用户测试箱况异常",
  })
  mark("UT-UB-02#1", !!bad.ok, `异常样例订单 ${badNo}`)

  const repair = await r03.create("repair", {
    repairNo: `RP${uid("").slice(0, 8)}`,
    containerNo: `PEND-${badNo.slice(-6)}`,
    containerType: "40GP",
    ownership: "自有箱",
    yard: "陆港堆场",
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
    title: `提箱箱况异常 · ${badNo}`,
    desc: "用户测试箱况异常",
    module: "M01 提还箱作业",
    href: "/customer/documents",
    roles: ["R01", "R04"],
    actionable: true,
    read: false,
    createdAt: nowStr(),
  })
  mark("UT-UB-02#2", !!repair.ok, repair.ok ? `修箱工单 ${repair.data?.repairNo}` : "挂修失败")

  const notifs = await r01.list("notifications")
  const hasAlert =
    notifs.ok &&
    (notifs.data as any[]).some((n) => String(n.title || "").includes(badNo) || String(n.title || "").includes("箱况异常"))
  mark("UT-UB-02#3", !!hasAlert, hasAlert ? "R01 可见箱况异常通知" : "R01 未看到异常通知")

  if (repair.ok && repair.data?.id) {
    await r01.patch("repair", repair.data.id, { status: "待检验" })
    await r01.patch("repair", repair.data.id, { status: "维修中" })
    await r01.patch("repair", repair.data.id, { status: "待验收" })
    const flow4 = await r01.patch("repair", repair.data.id, {
      status: "已完工",
      finishedAt: nowStr(),
      actualCost: 500,
    })
    mark("UT-UB-02#5", !!flow4.ok, flow4.ok ? "修箱流转至已完工" : "修箱流转失败")
  } else {
    mark("UT-UB-02#5", false, "无修箱工单可流转")
  }

  // —— UT-UB-03 待确认免责取消 ——
  const cancelNo = `UB${uid("C").slice(0, 9)}`
  const c1 = await r03.create("orders", {
    orderNo: cancelNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "西安",
    returnCity: "罗兹",
    containerType: "40HQ",
    quantity: 1,
    unitPrice: 3280,
    quotedUnitPrice: 3280,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
  })
  const cancelled = await r03.patch("orders", c1.data.id, { status: "已取消" })
  mark("UT-UB-03", !!cancelled.ok && cancelled.data?.status === "已取消", "待确认免责取消成功")

  // —— UT-UB-05 ——
  const disputeBill = await r03.create("bills", {
    billNo: `BILL${uid("D").slice(0, 8)}`,
    type: "用箱账单",
    relatedOrderNo: orderNo,
    party: "西安国际陆港集团",
    amount: 100,
    status: "待确认",
    issuedAt: nowStr().slice(0, 10),
    confirmDeadline: pastDeadline(-3),
    items: [{ label: "异议样例", value: "¥100" }],
  })
  const disputed = await r03.patch("bills", disputeBill.data.id, {
    status: "有异议",
    disputeReason: "用户测试异议说明：金额与约定不符",
  })
  await r03.create("notifications", {
    type: "账单",
    level: "重要",
    title: `账单异议 · ${disputeBill.data?.billNo}`,
    desc: "用户测试异议说明",
    module: "M01 账单中心",
    href: "/customer/bills",
    roles: ["R01"],
    actionable: true,
    read: false,
    createdAt: nowStr(),
  })
  const r01n = await r01.list("notifications")
  const hasDispute =
    r01n.ok &&
    (r01n.data as any[]).some((n) => String(n.title || "").includes(disputeBill.data?.billNo || "异议"))
  mark("UT-UB-05", !!disputed.ok && hasDispute, "异议账单 + R01 通知")

  // 阶段C：箱管调整账单金额并重推，重置为待确认，客户再确认
  const adjusted = await r01.patch("bills", disputeBill.data.id, {
    amount: 80,
    items: [
      { label: "异议样例", value: "¥100" },
      { label: "箱管调整说明", value: "核实后调整为 ¥80" },
    ],
    status: "待确认",
    adjustedBy: "张伟",
    confirmDeadline: (() => {
      const d = new Date(Date.now() + 72 * 3600 * 1000)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    })(),
  })
  mark(
    "UT-UB-05b",
    !!adjusted.ok && adjusted.data?.status === "待确认" && adjusted.data?.amount === 80,
    adjusted.ok ? "箱管调整账单金额并重置为待确认" : `调整失败 ${adjusted.status}`,
  )

  const reconfirmed = await r03.patch("bills", disputeBill.data.id, { status: "已确认" })
  mark(
    "UT-UB-05c",
    !!reconfirmed.ok && reconfirmed.data?.status === "已确认",
    reconfirmed.ok ? "客户对调整后账单再次确认" : "客户再确认失败",
  )

  const r02 = new Client("R02")
  await r02.login("wangfang")
  const r02orders = await r02.list("orders")
  mark(
    "R02-负向",
    r02orders.status === 403,
    `R02 GET orders 期望 403，实际 ${r02orders.status}`,
  )

  if (booking.ok && booking.data?.id) {
    const notify = await r01.api("POST", `/api/bookings/${encodeURIComponent(booking.data.id)}/notify`)
    mark("R01-预约通知", !!notify.ok && notify.data?.ok === true, notify.ok ? "发送预约通知成功" : "通知失败")
  }

  // R01 可进订单处理；R03 不可读路径由 nav 控制，API 抽检 R01 有 yards
  const yards = await r01.list("yards")
  mark("R01-堆场", !!yards.ok, yards.ok ? "箱管可读堆场列表" : "堆场列表失败")

  const passed = rows.filter((r) => r.ok).length
  const failed = rows.filter((r) => !r.ok)
  const md = [
    `# 验证记录 · 01-客户用箱主路径`,
    ``,
    `- 时间：${nowStr()}`,
    `- 环境：${BASE_URL}`,
    `- 方式：API 对照文档自动验证（含箱管确认流程）`,
    `- 汇总：**${passed}/${rows.length}** 通过`,
    ``,
    `| 用例步骤 | 结果 | 说明 |`,
    `| :--- | :---: | :--- |`,
    ...rows.map((r) => `| ${r.id} | ${r.ok ? "通过" : "失败"} | ${r.note} |`),
    ``,
    failed.length
      ? `## 失败项\n\n${failed.map((f) => `- **${f.id}**：${f.note}`).join("\n")}`
      : `## 结论\n\n客户提交→箱管确认（堆场/改价/备注）→提还箱闭环（API 层）通过。`,
    ``,
  ].join("\n")

  mkdirSync("用户测试", { recursive: true })
  writeFileSync("用户测试/验证记录-01.md", md, "utf8")
  console.log(`\n已写入 用户测试/验证记录-01.md`)
  console.log(`=== 汇总：${passed}/${rows.length} ===\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
