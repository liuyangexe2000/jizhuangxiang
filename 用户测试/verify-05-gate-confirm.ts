/**
 * 对照《05-提还箱现场执行与异常》做 API 级验证
 * 运行：pnpm test:ut05
 * 前置：pnpm dev 已启动
 */
import { Client, BASE_URL, nowStr, uid, ensureOnSiteContainers } from "../scripts/e2e/harness"
import { applyReserveInventory, findInventoryRow, inventoryId } from "../lib/domain/dispatch-ops"
import { writeFileSync, mkdirSync } from "node:fs"

type Row = { id: string; ok: boolean; note: string }
const rows: Row[] = []

function mark(id: string, ok: boolean, note: string) {
  rows.push({ id, ok, note })
  console.log(`${ok ? "PASS" : "FAIL"} ${id} — ${note}`)
}

function cancelDeadline() {
  const d = new Date(Date.now() + 86400000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function confirmOrder(
  r01: Client,
  orderId: string,
  orderNo: string,
  pickupYard: string,
  returnYard: string,
) {
  return r01.patch("orders", orderId, {
    status: "已确认",
    confirmedAt: nowStr(),
    confirmedBy: "张伟",
    pickupYard,
    returnYard,
    unitPrice: 3100,
    quotedUnitPrice: 3100,
    adminRemark: "UT-GATE 用户测试",
    releaseDocReady: true,
    cancelDeadline: cancelDeadline(),
  })
}

async function main() {
  console.log(`\n=== 验证 05-提还箱现场执行与异常 · ${BASE_URL} ===\n`)
  try {
    const r = await fetch(`${BASE_URL}/api/auth/me`)
    if (r.status >= 500) throw new Error(`auth/me ${r.status}`)
  } catch {
    console.error("无法连接服务，请先 pnpm dev")
    process.exit(1)
  }

  const r00 = new Client("R00")
  const r01 = new Client("R01")
  const r03 = new Client("R03")
  const r04 = new Client("R04")
  await r00.login("admin")
  await r01.login("zhangwei")
  await r03.login("customer_xa")
  await r04.login("agent_de")
  mark("UT-GATE-00", true, "admin/zhangwei/customer_xa/agent_de 登录成功")

  // 确保 yard_ham（R06，汉堡HCS）已启用
  const users = await r00.list("users")
  const yardUser = (users.data as any[] | null)?.find((u) => u.account === "yard_ham")
  if (yardUser && yardUser.status !== "启用") {
    await r00.patch("users", yardUser.id, { status: "启用" })
  }
  const r06 = new Client("R06")
  await r06.login("yard_ham")

  // —— UT-GATE-01：正常闭环（R04 代管覆盖汉堡港/杜伊斯堡两堆场） ——
  const orderNo = `UB${uid("G").slice(0, 9)}`
  const created = await r03.create("orders", {
    orderNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "汉堡",
    returnCity: "杜伊斯堡",
    containerType: "40GP",
    quantity: 2,
    unitPrice: 3100,
    quotedUnitPrice: 3100,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
    remark: "UT-GATE-01",
  })
  mark("UT-GATE-01#1", !!created.ok, `订单 ${orderNo} 已创建`)

  const conf = await confirmOrder(r01, created.data.id, orderNo, "汉堡HCS", "杜堡dit")
  mark("UT-GATE-01#2", !!conf.ok && conf.data?.status === "已确认", "箱管确认并分配堆场")

  // 模拟「订单处理」确认时的库存预占（与 operations/usebox 页一致）
  const invBefore = await r04.list("inventory")
  const pickupInv = findInventoryRow(invBefore.data as any[], { yard: "汉堡HCS", city: "汉堡" })
  if (pickupInv) {
    await r04.patch("inventory", inventoryId(pickupInv), applyReserveInventory(pickupInv, 2))
  }

  // 客户直改执行态应被拒绝
  const blocked = await r03.patch("orders", created.data.id, { status: "提箱中" })
  mark("UT-GATE-01#3", blocked.status === 403, `客户直改提箱中应 403，实际 ${blocked.status}`)

  const pickupResBad = await r03.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-pickup`,
    { conditionCheck: "通过" },
  )
  mark("UT-GATE-01#4", pickupResBad.status === 403, `R03 确认放箱应 403，实际 ${pickupResBad.status}`)

  const invBeforePickup = (await r04.list("inventory")).data as any[]
  const invPickBefore = findInventoryRow(invBeforePickup, { yard: "汉堡HCS", city: "汉堡" })!

  const pickupNos = await ensureOnSiteContainers(r01, {
    count: 2,
    yard: "汉堡HCS",
    city: "汉堡",
    type: "40GP",
    prefix: "G1",
  })
  const pickupRes = await r04.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-pickup`,
    { conditionCheck: "通过", containerNos: pickupNos },
  )
  mark("UT-GATE-01#5", !!pickupRes.ok && pickupRes.data?.ok === true, pickupRes.ok ? "R04 现场确认放箱成功" : `失败 ${pickupRes.status}`)

  const afterPickupOrders = await r04.list("orders")
  const pickedOrder = (afterPickupOrders.data as any[] | null)?.find((o) => o.id === created.data.id)
  mark(
    "UT-GATE-01#6",
    pickedOrder?.status === "提箱中" && !!pickedOrder?.pickupGateBy,
    `订单状态=${pickedOrder?.status}，pickupGateBy=${pickedOrder?.pickupGateBy}`,
  )

  const gateList = await r04.list("gate")
  const pickupGate = (gateList.data as any[] | null)?.find(
    (g) => g.relatedOrderNo === orderNo && g.type === "出场",
  )
  mark("UT-GATE-01#7", !!pickupGate, pickupGate ? `出场 gate ${pickupGate.containerNo}` : "未生成出场 gate")

  const invAfterPickup = (await r04.list("inventory")).data as any[]
  const invPickAfter = findInventoryRow(invAfterPickup, { yard: "汉堡HCS", city: "汉堡" })!
  mark(
    "UT-GATE-01#8",
    invPickAfter.onSite === invPickBefore.onSite - 2 && invPickAfter.incoming === invPickBefore.incoming + 2,
    `确认放箱后 onSite ${invPickBefore.onSite}→${invPickAfter.onSite}，incoming ${invPickBefore.incoming}→${invPickAfter.incoming}`,
  )

  const invBeforeReturn = findInventoryRow((await r04.list("inventory")).data as any[], {
    yard: "杜堡dit",
    city: "杜伊斯堡",
  })!
  const returnRes = await r04.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-return`,
    { conditionCheck: "通过" },
  )
  mark("UT-GATE-01#9", !!returnRes.ok && returnRes.data?.ok === true, returnRes.ok ? "R04 现场确认收箱成功" : `失败 ${returnRes.status}`)

  const afterReturnOrders = await r04.list("orders")
  const returnedOrder = (afterReturnOrders.data as any[] | null)?.find((o) => o.id === created.data.id)
  mark(
    "UT-GATE-01#10",
    returnedOrder?.status === "已完成" && !!returnedOrder?.returnGateBy,
    `订单状态=${returnedOrder?.status}，returnGateBy=${returnedOrder?.returnGateBy}`,
  )

  const invAfterReturn = findInventoryRow((await r04.list("inventory")).data as any[], {
    yard: "杜堡dit",
    city: "杜伊斯堡",
  })!
  mark(
    "UT-GATE-01#11",
    invAfterReturn.onSite === invBeforeReturn.onSite + 2,
    `确认收箱后 onSite ${invBeforeReturn.onSite}→${invAfterReturn.onSite}`,
  )

  const returnGate = ((await r04.list("gate")).data as any[] | null)?.find(
    (g) => g.relatedOrderNo === orderNo && g.type === "进场",
  )
  mark("UT-GATE-01#12", !!returnGate, returnGate ? `进场 gate ${returnGate.containerNo}` : "未生成进场 gate")

  // 重复确认应被状态前置校验拦截
  const repeatPickup = await r04.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-pickup`,
    { conditionCheck: "通过" },
  )
  mark("UT-GATE-04#1", repeatPickup.status === 400, `已完成订单再确认放箱应 400，实际 ${repeatPickup.status}`)

  // —— UT-GATE-02：箱况异常 → 挂修，不改状态 ——
  const badNo = `UB${uid("H").slice(0, 9)}`
  const bad = await r03.create("orders", {
    orderNo: badNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "汉堡",
    returnCity: "杜伊斯堡",
    containerType: "40GP",
    quantity: 1,
    unitPrice: 3100,
    quotedUnitPrice: 3100,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
  })
  await confirmOrder(r01, bad.data.id, badNo, "汉堡HCS", "杜堡dit")
  const abnormalRes = await r04.api(
    "POST",
    `/api/orders/${encodeURIComponent(bad.data.id)}/confirm-pickup`,
    { conditionCheck: "异常", conditionNote: "UT-GATE 箱况异常" },
  )
  mark("UT-GATE-02#1", !!abnormalRes.ok, abnormalRes.ok ? "现场判定箱况异常已记录" : `失败 ${abnormalRes.status}`)

  const badOrder = ((await r04.list("orders")).data as any[] | null)?.find((o) => o.id === bad.data.id)
  mark(
    "UT-GATE-02#2",
    badOrder?.status === "已确认" && badOrder?.conditionCheck === "异常",
    `异常分支订单状态保持 ${badOrder?.status}（不越权推进）`,
  )

  const repairList = await r01.list("repair")
  const hasRepair = (repairList.data as any[] | null)?.some((r) => r.damageDesc?.includes("UT-GATE 箱况异常"))
  mark("UT-GATE-02#3", !!hasRepair, hasRepair ? "已生成修箱工单" : "未生成修箱工单")

  const notifs = await r01.list("notifications")
  const hasAlert = (notifs.data as any[] | null)?.some(
    (n) => String(n.title || "").includes(badNo) || String(n.desc || "").includes("UT-GATE 箱况异常"),
  )
  mark("UT-GATE-02#4", !!hasAlert, hasAlert ? "R01 可见异常通知" : "R01 未见异常通知")

  // —— UT-GATE-03：租户隔离负向（R06 yard_ham 仅覆盖汉堡HCS） ——
  const foreignNo = `UB${uid("F").slice(0, 9)}`
  const foreign = await r03.create("orders", {
    orderNo: foreignNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "杜伊斯堡",
    returnCity: "杜伊斯堡",
    containerType: "40GP",
    quantity: 1,
    unitPrice: 3100,
    quotedUnitPrice: 3100,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
  })
  await confirmOrder(r01, foreign.data.id, foreignNo, "杜堡dit", "杜堡dit")
  const r06Denied = await r06.api(
    "POST",
    `/api/orders/${encodeURIComponent(foreign.data.id)}/confirm-pickup`,
    { conditionCheck: "通过" },
  )
  mark(
    "UT-GATE-03#1",
    r06Denied.status === 403,
    `R06(汉堡HCS) 确认杜堡dit订单应 403，实际 ${r06Denied.status}`,
  )

  const hamNo = `UB${uid("Y").slice(0, 9)}`
  const ham = await r03.create("orders", {
    orderNo: hamNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "汉堡",
    returnCity: "汉堡",
    containerType: "40GP",
    quantity: 1,
    unitPrice: 3100,
    quotedUnitPrice: 3100,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
  })
  await confirmOrder(r01, ham.data.id, hamNo, "汉堡HCS", "汉堡HCS")
  const hamNos = await ensureOnSiteContainers(r01, {
    count: 1,
    yard: "汉堡HCS",
    city: "汉堡",
    type: "40GP",
    prefix: "G3",
  })
  const r06Allowed = await r06.api(
    "POST",
    `/api/orders/${encodeURIComponent(ham.data.id)}/confirm-pickup`,
    { conditionCheck: "通过", containerNos: hamNos },
  )
  mark(
    "UT-GATE-03#2",
    !!r06Allowed.ok,
    r06Allowed.ok ? "R06(汉堡HCS) 确认本堆场订单成功" : `失败 ${r06Allowed.status}`,
  )

  // —— UT-GATE-04：状态前置校验 ——
  const pendingNo = `UB${uid("P").slice(0, 9)}`
  const pending = await r03.create("orders", {
    orderNo: pendingNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "汉堡",
    returnCity: "汉堡",
    containerType: "40GP",
    quantity: 1,
    unitPrice: 3100,
    quotedUnitPrice: 3100,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
  })
  // 用 R01（内部角色，不受堆场归属限制）单独验证「状态前置校验」，避免与租户归属校验混淆
  const earlyPickup = await r01.api(
    "POST",
    `/api/orders/${encodeURIComponent(pending.data.id)}/confirm-pickup`,
    { conditionCheck: "通过" },
  )
  mark("UT-GATE-04#2", earlyPickup.status === 400, `待确认订单确认放箱应 400，实际 ${earlyPickup.status}`)

  const passed = rows.filter((r) => r.ok).length
  const failed = rows.filter((r) => !r.ok)
  const md = [
    `# 验证记录 · 05-提还箱现场执行与异常`,
    ``,
    `- 时间：${nowStr()}`,
    `- 环境：${BASE_URL}`,
    `- 方式：API 对照文档自动验证（现场放箱/收箱确认、异常挂修、租户隔离、状态前置校验）`,
    `- 汇总：**${passed}/${rows.length}** 通过`,
    ``,
    `| 用例步骤 | 结果 | 说明 |`,
    `| :--- | :---: | :--- |`,
    ...rows.map((r) => `| ${r.id} | ${r.ok ? "通过" : "失败"} | ${r.note} |`),
    ``,
    failed.length
      ? `## 失败项\n\n${failed.map((f) => `- **${f.id}**：${f.note}`).join("\n")}`
      : `## 结论\n\n提箱/还箱现场确认驱动状态迁移 + gate/库存联动 + 异常挂修 + 租户隔离 + 状态前置校验（API 层）通过。`,
    ``,
  ].join("\n")

  mkdirSync("用户测试", { recursive: true })
  writeFileSync("用户测试/验证记录-05.md", md, "utf8")
  console.log(`\n已写入 用户测试/验证记录-05.md`)
  console.log(`=== 汇总：${passed}/${rows.length} ===\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
