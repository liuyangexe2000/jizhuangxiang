import {
  Client,
  assert,
  expectOk,
  nowStr,
  pastDeadline,
  uid,
  BASE_URL,
  ensureOnSiteContainers,
  type ScenarioFn,
} from "../harness"

/** L1: R03 申请 → R01 确认出账 → 单据推进；超时取消出取消费 */
export const l1M01UseBox: ScenarioFn = async ({ fail, pass }) => {
  const r03 = new Client("R03")
  const r01 = new Client("R01")
  await r03.login("customer_xa")
  await r01.login("zhangwei")
  const orderNo = `UB${uid("").slice(0, 10)}`
  const created = await r03.create("orders", {
    orderNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "西安",
    returnCity: "汉堡",
    containerType: "40HQ",
    quantity: 2,
    unitPrice: 3000,
    quotedUnitPrice: 3000,
    status: "待确认",
    createdAt: nowStr(),
    releaseDocReady: false,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱后新增",
    remark: "E2E L1",
  })
  await expectOk("创建用箱订单", created, fail)
  assert(created.data?.customer === "西安国际陆港集团", "租户戳记应强制 customer=org", fail)

  // R03 不可自行确认
  const denied = await r03.patch("orders", created.data.id, {
    status: "已确认",
    releaseDocReady: true,
  })
  assert(denied.status === 403, `R03 确认应 403，实际 ${denied.status}`, fail)

  const confirmedAt = nowStr()
  const conf = await r01.patch("orders", created.data.id, {
    status: "已确认",
    confirmedAt,
    confirmedBy: "张伟",
    pickupYard: "陆港堆场",
    returnYard: "汉堡HCS",
    unitPrice: 3000,
    quotedUnitPrice: 3000,
    adminRemark: "E2E 箱管确认",
    releaseDocReady: true,
    cancelDeadline: (() => {
      const d = new Date(Date.now() + 86400000)
      const p = (n: number) => String(n).padStart(2, "0")
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    })(),
  })
  await expectOk("R01 确认订单", conf, fail)

  const bill = await r03.create("bills", {
    billNo: `BILL${uid("").slice(0, 8)}`,
    type: "用箱账单",
    relatedOrderNo: orderNo,
    party: "西安国际陆港集团",
    amount: 6000,
    status: "待确认",
    issuedAt: nowStr().slice(0, 10),
    confirmDeadline: pastDeadline(-3),
    items: [{ label: "合计", value: "¥6000" }],
  })
  await expectOk("确认出账", bill, fail)

  const bills = await r03.list("bills")
  assert(
    bills.ok && (bills.data as any[]).some((b) => b.relatedOrderNo === orderNo && b.type === "用箱账单"),
    "账单列表应含本单用箱账单",
    fail,
  )

  // 阶段B：客户上传随箱资料仅存档，不驱动状态；执行态须由堆场/代管现场「确认放箱/收箱」驱动
  const stuffing = await r03.patch("orders", created.data.id, { stuffingListUploaded: true })
  await expectOk("客户上传 stuffing 资料（不驱动状态）", stuffing, fail)
  assert(stuffing.data?.status === "已确认", "客户上传资料不应改变订单状态", fail)

  const blockedAdvance = await r03.patch("orders", created.data.id, { status: "提箱中" })
  assert(blockedAdvance.status === 403, `客户直改执行态应 403，实际 ${blockedAdvance.status}`, fail)

  const pickupNos = await ensureOnSiteContainers(r01, {
    count: 2,
    yard: "陆港堆场",
    city: "西安",
    type: "40HQ",
    prefix: "E2E",
  })
  const pickupConfirm = await r01.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-pickup`,
    { conditionCheck: "通过", containerNos: pickupNos },
  )
  await expectOk("现场（R01代）确认放箱", pickupConfirm, fail)

  const afterPickup = await r01.list("orders")
  const pickedOrder = (afterPickup.data as any[] | null)?.find((o) => o.id === created.data.id)
  assert(pickedOrder?.status === "提箱中", "确认放箱后订单应进入提箱中", fail)
  assert(!!pickedOrder?.pickupGateBy, "应记录放箱确认人 pickupGateBy", fail)

  const gateAfterPickup = await r01.list("gate")
  assert(
    (gateAfterPickup.data as any[] | null)?.some((g) => g.relatedOrderNo === orderNo && g.type === "出场"),
    "应生成出场 gate 记录",
    fail,
  )

  const returnProof = await r03.patch("orders", created.data.id, { returnProofUploaded: true })
  await expectOk("客户上传还箱证明（不驱动状态）", returnProof, fail)
  assert(returnProof.data?.status === "提箱中", "客户上传还箱证明不应改变订单状态", fail)

  const returnConfirm = await r01.api(
    "POST",
    `/api/orders/${encodeURIComponent(created.data.id)}/confirm-return`,
    { conditionCheck: "通过" },
  )
  await expectOk("现场（R01代）确认收箱", returnConfirm, fail)

  const afterReturn = await r01.list("orders")
  const done = (afterReturn.data as any[] | null)?.find((o) => o.id === created.data.id)
  assert(done?.status === "已完成", "确认收箱后订单应已完成", fail)
  assert(!!done?.returnGateBy, "应记录收箱确认人 returnGateBy", fail)

  // 超时取消路径：R01 建已确认单供 R03 取消
  const cancelNo = `UB${uid("C").slice(0, 9)}`
  const o2 = await r01.create("orders", {
    orderNo: cancelNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "西安",
    returnCity: "罗兹",
    containerType: "40GP",
    quantity: 1,
    unitPrice: 2800,
    quotedUnitPrice: 2800,
    status: "已确认",
    createdAt: nowStr(),
    confirmedAt: nowStr(),
    confirmedBy: "张伟",
    pickupYard: "陆港堆场",
    returnYard: "马拉ADAMPOL",
    cancelDeadline: pastDeadline(2),
    releaseDocReady: true,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    channel: "订舱勾选",
  })
  await expectOk("创建超时取消样例单", o2, fail)
  await r03.patch("orders", o2.data.id, { status: "超时取消" })
  const fee = await r03.create("bills", {
    billNo: `BILL${uid("F").slice(0, 8)}`,
    type: "用箱变更费账单",
    relatedOrderNo: cancelNo,
    party: "西安国际陆港集团",
    amount: 560,
    status: "待确认",
    issuedAt: nowStr().slice(0, 10),
    confirmDeadline: pastDeadline(-3),
    items: [{ label: "取消费", value: "20%" }],
  })
  await expectOk("超时取消取消费账单", fee, fail)
  pass("M01 申请→箱管确认出账→状态推进→取消费")
}

/** L2: R01 申请 → R02 审批下发 → R05 提箱/还箱 → R01 审核与台账 */
export const l2M02Dispatch: ScenarioFn = async ({ fail, pass }) => {
  const r01 = new Client("R01")
  const r02 = new Client("R02")
  const r05 = new Client("R05")
  await r01.login("zhangwei")
  await r02.login("wangfang")
  await r05.login("carrier_pl")

  const dispatchNo = `DP${uid("").slice(0, 10)}`
  const qty = 2
  const unitPrice = 500
  const totalPrice = qty * unitPrice // < 20000 → 2 级审批
  const approvals = [
    { level: 1, role: "调运专员", approver: "张伟", status: "待审批" },
    { level: 2, role: "财务专员", approver: "王芳", status: "未开始" },
  ]
  const created = await r01.create("dispatch", {
    dispatchNo,
    planTime: nowStr(),
    pickupPlace: "汉堡HCS",
    returnScope: "不来梅 / 汉诺威",
    reason: "E2E 调运闭环",
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
  await expectOk("创建调运单", created, fail)
  const id = created.data.id

  // R01 通过一级
  let a1 = [
    { ...approvals[0], status: "通过", time: nowStr(), comment: "E2E通过" },
    { ...approvals[1], status: "待审批" },
  ]
  await expectOk(
    "一级审批",
    await r01.patch("dispatch", id, { approvals: a1, status: "审批中" }),
    fail,
  )

  // R02 通过二级 → 已下发
  const a2 = [
    a1[0],
    { ...a1[1], status: "通过", time: nowStr(), comment: "E2E财务通过" },
  ]
  await expectOk(
    "二级审批下发",
    await r02.patch("dispatch", id, { approvals: a2, status: "已下发" }),
    fail,
  )
  await r01.create("notifications", {
    type: "任务",
    level: "重要",
    title: `调运任务已下发 · ${dispatchNo}`,
    desc: "E2E",
    module: "M02",
    href: "/dispatch/tasks",
    roles: ["R01", "R05"],
    actionable: true,
    read: false,
    createdAt: nowStr(),
  })

  // R05 可见该单
  const dispList = await r05.list("dispatch")
  assert(
    dispList.ok && (dispList.data as any[]).some((d) => d.dispatchNo === dispatchNo),
    "R05 应可见本承运商调运单",
    fail,
  )

  // 提箱：改库存 + gate + dispatch
  const invRes = await r05.list("inventory")
  const inv = (invRes.data as any[]).find((r) => r.yard === "汉堡HCS" || r.city === "汉堡")
  assert(inv?.id, "应找到汉堡HCS库存行", fail)
  const beforeOnSite = inv.onSite
  const pickDelta = qty
  await expectOk(
    "提箱更新调运",
    await r05.patch("dispatch", id, {
      pickedCount: qty,
      status: "提箱中",
    }),
    fail,
  )
  await expectOk(
    "提箱扣库存",
    await r05.patch("inventory", inv.id, {
      onSite: Math.max(0, inv.onSite - pickDelta),
      available: Math.max(0, inv.available - pickDelta),
      incoming: inv.incoming + pickDelta,
    }),
    fail,
  )
  const containerNos: string[] = []
  for (let i = 1; i <= qty; i++) {
    const no = `E2E${dispatchNo.slice(-6)}${String(i).padStart(2, "0")}`
    containerNos.push(no)
    await expectOk(
      `提箱出场 gate ${no}`,
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
      }),
      fail,
    )
  }
  const invAfter = await r05.list("inventory")
  const inv2 = (invAfter.data as any[]).find((r) => r.id === inv.id)
  assert(inv2 && inv2.onSite === beforeOnSite - pickDelta, `提箱后 onSite 应为 ${beforeOnSite - pickDelta}`, fail)

  // 预约
  const bk = await r05.create("bookings", {
    bookingNo: `BK${uid("").slice(0, 8)}`,
    type: "还箱预约",
    containerNos,
    yard: "华沙pkpcc",
    city: "华沙",
    planTime: nowStr(),
    driver: "E2E司机",
    driverId: "D1",
    driverPhone: "100",
    plateNo: "E2E001",
    refNo: dispatchNo,
    notifyByEmail: true,
    status: "待发送",
    withinWorkHours: true,
  })
  await expectOk("创建还箱预约", bk, fail)

  // 发起还箱
  await expectOk(
    "状态还箱中",
    await r05.patch("dispatch", id, { status: "还箱中" }),
    fail,
  )
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
  await expectOk("发起还箱申请", ret, fail)

  // R01 审核通过 + 回写
  const retId = ret.data.id
  await expectOk(
    "还箱审核通过",
    await r01.patch("returns", retId, {
      status: "已通过",
      reviewer: "张伟(调运专员)",
    }),
    fail,
  )
  await expectOk(
    "还箱回写调运",
    await r01.patch("dispatch", id, {
      returnedCount: qty,
      status: "已结束",
    }),
    fail,
  )
  const warsaw = (await r01.list("inventory")).data.find((r: any) => r.yard === "华沙pkpcc")
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

  // 台账出账核销
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
  await expectOk("生成调运费账单", bill, fail)
  await expectOk(
    "核销账单",
    await r05.patch("bills", bill.data.id, { status: "已支付" }),
    fail,
  )
  pass("M02 审批下发→提箱改库存→还箱审核→台账核销")
}

/** L3: R04 gate 映射 + 差异修正回写库存 */
export const l3M03Inventory: ScenarioFn = async ({ fail, pass }) => {
  const r04 = new Client("R04")
  await r04.login("agent_de")

  const gateNo = `E2EGATE${uid("").slice(0, 6)}`
  const g = await r04.create("gate", {
    containerNo: gateNo,
    type: "进场",
    time: nowStr(),
    yard: "杜堡dit",
    city: "杜伊斯堡",
    source: "代管公司上传",
    mappingStatus: "未映射",
    ownership: "自有箱",
  })
  await expectOk("创建未映射进场", g, fail)

  // 自动匹配：挂调运单号 + 已映射 + 回补库存
  const disp = (await r04.list("dispatch")).data?.[0]
  await expectOk(
    "自动匹配",
    await r04.patch("gate", g.data.id, {
      mappingStatus: "已映射",
      relatedOrderNo: disp?.dispatchNo ?? "E2E-MAP",
    }),
    fail,
  )

  const invList = await r04.list("inventory")
  const inv = (invList.data as any[]).find((r) => r.yard === "杜堡dit")
  assert(inv?.id, "DE 代管应可见杜伊斯堡库存", fail)
  const before = inv.onSite

  const discs = await r04.list("discrepancy")
  let row = (discs.data as any[]).find((d) => d.yard === "杜堡dit")
  if (!row) {
    const created = await r04.create("discrepancy", {
      yard: "杜堡dit",
      city: "杜伊斯堡",
      systemCount: before,
      agentCount: before + 3,
      diff: 3,
      checkedAt: nowStr(),
      status: "待核对",
    })
    await expectOk("创建差异行", created, fail)
    row = created.data
  }

  const target = row.agentCount ?? before + 2
  await expectOk(
    "差异修正",
    await r04.patch("discrepancy", row.id, {
      status: "已修正",
      systemCount: target,
      diff: 0,
      checkedAt: nowStr().slice(0, 10),
    }),
    fail,
  )
  await expectOk(
    "差异回写库存",
    await r04.patch("inventory", inv.id, {
      onSite: target,
      available: Math.max(0, inv.available + (target - before)),
    }),
    fail,
  )
  const after = (await r04.list("inventory")).data.find((r: any) => r.id === inv.id)
  assert(after?.onSite === target, `修正后 onSite 应为 ${target}`, fail)
  pass("M03 gate 映射 + 差异回写库存")
}

/** L4: 预约通知（无 SMTP 仍站内成功） */
export const l4M04BookingNotify: ScenarioFn = async ({ fail, pass }) => {
  const r00 = new Client("R00")
  await r00.login("admin")
  // 临时启用 R06
  const users = await r00.list("users")
  const yardUser = (users.data as any[]).find((u) => u.account === "yard_ham")
  if (yardUser) {
    await r00.patch("users", yardUser.id, { status: "启用" })
  }

  const r01 = new Client("R01")
  await r01.login("zhangwei")
  const bookingNo = `BK${uid("").slice(0, 8)}`
  // 保证工作日 10:00，避免工作时段强校验失败
  const workPlan = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    const p = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  })()
  const bk = await r01.create("bookings", {
    bookingNo,
    type: "提箱预约",
    containerNos: ["E2ENOTIFY01"],
    yard: "汉堡HCS",
    city: "汉堡",
    planTime: workPlan,
    driver: "Notify",
    driverId: "N1",
    driverPhone: "1",
    plateNo: "N001",
    refNo: "E2E-NOTIFY",
    notifyByEmail: true,
    status: "待发送",
    withinWorkHours: true,
  })
  await expectOk("创建预约", bk, fail)

  const notify = await r01.api("POST", `/api/bookings/${encodeURIComponent(bk.data.id)}/notify`)
  await expectOk("发送预约通知 API", notify, fail)
  assert(notify.data?.ok === true, "notify 应返回 ok", fail)

  const list = await r01.list("bookings")
  const updated = (list.data as any[]).find((b) => b.id === bk.data.id)
  assert(updated?.status === "已通知", "预约状态应为已通知", fail)

  const notifs = await r01.list("notifications")
  assert(
    notifs.ok &&
      (notifs.data as any[]).some((n) => String(n.title || "").includes(bookingNo) || String(n.desc || "").includes("汉堡")),
    "应产生站内通知",
    fail,
  )
  pass(`M04 预约通知（mailSent=${notify.data?.mailSent} mailError=${notify.data?.mailError ?? "无"}）`)
}

/** L5: 供应转合同 + 到箱入库存 */
export const l5M05Supply: ScenarioFn = async ({ fail, pass }) => {
  const r01 = new Client("R01")
  await r01.login("zhangwei")
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
    reason: "E2E供应",
    status: "已批准",
    createdBy: "张伟",
    createdAt: nowStr(),
  })
  await expectOk("创建供应计划", plan, fail)

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
  await expectOk("转合同创建", contract, fail)
  await r01.patch("supplyPlans", plan.data.id, { status: "执行中" })

  const increment = 2
  const invList = await r01.list("inventory")
  const inv = (invList.data as any[]).find((r) => r.city === "西安")
  assert(inv?.id, "应有西安库存", fail)
  const before = inv.onSite

  await expectOk(
    "到箱登记",
    await r01.patch("supplyContracts", contract.data.id, {
      deliveredQty: increment,
    }),
    fail,
  )
  for (let i = 1; i <= increment; i++) {
    const no = `SUP${contractNo.slice(-6)}${String(i).padStart(2, "0")}`
    await r01.create("gate", {
      containerNo: no,
      type: "进场",
      time: nowStr(),
      yard: inv.yard,
      city: inv.city,
      source: "系统放箱/调运订单",
      relatedOrderNo: contractNo,
      mappingStatus: "已映射",
      ownership: "自有箱",
    })
    await r01.create("containers", {
      containerNo: no,
      type: "40HQ",
      ownership: "自有箱",
      currentYard: inv.yard,
      currentCity: inv.city,
      status: "在场",
      lastGateTime: nowStr(),
      storageDays: 0,
      relatedOrderNo: contractNo,
    })
  }
  await r01.patch("inventory", inv.id, {
    onSite: before + increment,
    available: inv.available + increment,
  })
  const after = (await r01.list("inventory")).data.find((r: any) => r.id === inv.id)
  assert(after?.onSite === before + increment, "到箱后库存应增加", fail)
  const contracts = await r01.list("supplyContracts")
  assert(
    (contracts.data as any[]).some((c) => c.relatedPlanNo === planNo),
    "合同应关联计划号",
    fail,
  )
  pass("M05 转合同 + 到箱入库存")
}

/** L6: 修箱派修/验收/报废 */
export const l6M06Repair: ScenarioFn = async ({ fail, pass }) => {
  const r01 = new Client("R01")
  await r01.login("zhangwei")
  const containerNo = `RP${uid("").slice(0, 8)}`
  const repairNo = `RP${uid("X").slice(0, 8)}`

  await expectOk(
    "建箱主档",
    await r01.create("containers", {
      containerNo,
      type: "40GP",
      ownership: "自有箱",
      currentYard: "陆港堆场",
      currentCity: "西安",
      status: "在场",
      lastGateTime: nowStr(),
      storageDays: 0,
    }),
    fail,
  )

  const inv = (await r01.list("inventory")).data.find((r: any) => r.yard === "陆港堆场")
  assert(inv?.id, "陆港堆场库存存在", fail)

  const order = await r01.create("repair", {
    repairNo,
    containerNo,
    containerType: "40GP",
    ownership: "自有箱",
    yard: "陆港堆场",
    city: "西安",
    damageDesc: "E2E 箱门变形",
    level: "中修",
    vendor: "西安集装箱修理厂",
    estCost: 2000,
    reportedBy: "E2E",
    reportedAt: nowStr(),
    status: "待报修",
  })
  await expectOk("登记修箱", order, fail)

  await r01.patch("repair", order.data.id, { status: "待检验" })
  await r01.patch("repair", order.data.id, { status: "维修中" })
  await expectOk(
    "箱况维修中",
    await r01.patch("containers", containerNo, { status: "维修中" }),
    fail,
  )
  await r01.patch("inventory", inv.id, {
    available: Math.max(0, inv.available - 1),
  })

  await r01.patch("repair", order.data.id, { status: "待验收", actualCost: 2100 })
  await r01.patch("repair", order.data.id, {
    status: "已完工",
    finishedAt: nowStr().slice(0, 10),
  })
  await expectOk(
    "验收恢复在场",
    await r01.patch("containers", containerNo, { status: "在场" }),
    fail,
  )
  await r01.patch("inventory", inv.id, {
    available: ((await r01.list("inventory")).data.find((r: any) => r.id === inv.id)?.available ?? 0) + 1,
  })

  // 报废路径
  const scrapNo = `SCR${uid("").slice(0, 7)}`
  const scrapRepair = `RP${uid("S").slice(0, 7)}`
  await r01.create("containers", {
    containerNo: scrapNo,
    type: "20GP",
    ownership: "自有箱",
    currentYard: "陆港堆场",
    currentCity: "西安",
    status: "在场",
    lastGateTime: nowStr(),
    storageDays: 0,
  })
  const inv2 = (await r01.list("inventory")).data.find((r: any) => r.yard === "陆港堆场")
  const scrap = await r01.create("repair", {
    repairNo: scrapRepair,
    containerNo: scrapNo,
    containerType: "20GP",
    ownership: "自有箱",
    yard: "陆港堆场",
    city: "西安",
    damageDesc: "E2E 报废",
    level: "报废评估",
    vendor: "厂",
    estCost: 0,
    reportedBy: "E2E",
    reportedAt: nowStr(),
    status: "待检验",
  })
  await r01.patch("repair", scrap.data.id, { status: "已报废", finishedAt: nowStr().slice(0, 10) })
  await expectOk(
    "报废状态",
    await r01.patch("containers", scrapNo, {
      status: "已报废",
      relatedOrderNo: `报废:${scrapRepair}`,
    }),
    fail,
  )
  await r01.patch("inventory", inv2.id, {
    onSite: Math.max(0, inv2.onSite - 1),
    available: Math.min(inv2.available, Math.max(0, inv2.onSite - 1)),
  })
  const c = (await r01.list("containers")).data.find((x: any) => x.containerNo === scrapNo)
  assert(c?.status === "已报废", "报废箱主档应为已报废", fail)
  pass("M06 派修→验收在场；报废→已报废")
}

/** L7: 租户隔离 R03 仅见本 org */
export const l7TenantIsolation: ScenarioFn = async ({ fail, pass }) => {
  const r03 = new Client("R03")
  const r00 = new Client("R00")
  await r03.login("customer_xa")
  await r00.login("admin")

  const all = await r00.list("orders")
  const mine = await r03.list("orders")
  assert(all.ok && mine.ok, "双方均可列订单", fail)
  const foreign = (mine.data as any[]).filter((o) => o.customer !== "西安国际陆港集团")
  assert(foreign.length === 0, `R03 不应看到他方订单，实际 ${foreign.length} 条`, fail)
  assert(
    (mine.data as any[]).every((o) => o.customer === "西安国际陆港集团"),
    "R03 订单 customer 应全为本 org",
    fail,
  )

  const bills = await r03.list("bills")
  const badBills = (bills.data as any[]).filter((b) => b.party !== "西安国际陆港集团")
  assert(badBills.length === 0, "R03 账单 party 应全为本 org", fail)

  // R03 不可读 users 全表（仅自己）
  const users = await r03.list("users")
  if (users.ok) {
    assert(
      (users.data as any[]).length <= 1 &&
        ((users.data as any[])[0]?.account === "customer_xa" || (users.data as any[]).length === 0),
      "R03 用户列表应仅自己",
      fail,
    )
  }
  pass("租户隔离：R03 仅本 org 订单/账单")
}

/** L8: 管理 ACL / 订舱同步 / 审计 */
export const l8Admin: ScenarioFn = async ({ fail, pass }) => {
  const r03 = new Client("R03")
  await r03.login("customer_xa")
  const forbidden = await r03.list("integrations")
  assert(forbidden.status === 403 || (forbidden.ok && Array.isArray(forbidden.data) && forbidden.data.length === 0), "R03 不应读写 integrations（403 或空）", fail)
  // ACL 对 list 返回 403
  assert(forbidden.status === 403, `R03 GET integrations 期望 403，实际 ${forbidden.status}`, fail)

  const r00 = new Client("R00")
  await r00.login("admin")
  const audit = await r00.list("audit")
  assert(audit.ok && (audit.data as any[]).some((a) => a.action === "登录"), "审计应有登录记录", fail)

  const ints = await r00.list("integrations")
  const booking = (ints.data as any[]).find((i) => i.category === "订舱平台")
  assert(booking?.id, "应有订舱平台集成", fail)
  const beforeOrders = (await r00.list("orders")).data as any[]
  const sync = await r00.api("POST", `/api/integrations/${encodeURIComponent(booking.id)}/sync`)
  if (!sync.ok) {
    fail(`订舱同步失败: ${JSON.stringify(sync.data)?.slice(0, 200)}`)
  } else {
    pass(`订舱同步 created=${sync.data?.result?.created ?? "?"}`)
    const after = (await r00.list("orders")).data as any[]
    if ((sync.data?.result?.created ?? 0) > 0) {
      assert(after.length >= beforeOrders.length + 1, "同步新建后订单数应增加", fail)
    }
  }
  pass("R00 管理：ACL403 + 审计 + 订舱同步")
}

/** L9: 出站队列、跨单还箱、预约 24h、箱况异常通知 */
export const l9GapFill: ScenarioFn = async ({ fail, pass }) => {
  const r03 = new Client("R03")
  await r03.login("customer_xa")

  // 账单确认 → outbound_events
  const billNo = `BILL${uid("").slice(0, 8)}`
  const bill = await r03.create("bills", {
    billNo,
    type: "用箱账单",
    relatedOrderNo: `UB${uid("O").slice(0, 8)}`,
    party: "西安国际陆港集团",
    amount: 1000,
    status: "待确认",
    issuedAt: nowStr().slice(0, 10),
    confirmDeadline: pastDeadline(-3),
    items: [{ label: "合计", value: "¥1000" }],
  })
  await expectOk("创建账单", bill, fail)
  await expectOk(
    "确认账单",
    await r03.patch("bills", bill.data.id, { status: "已确认" }),
    fail,
  )
  // 出站事件由页面 enqueue；E2E 直接写队列验证资源可用
  const oe = await r03.create("outboundEvents", {
    type: "booking_bill_push",
    relatedNo: billNo,
    payload: { billNo, amount: 1000 },
    status: "pending",
    createdAt: nowStr(),
  })
  await expectOk("写出站事件", oe, fail)

  const r00 = new Client("R00")
  await r00.login("admin")
  await expectOk(
    "标记已投递",
    await r00.patch("outboundEvents", oe.data.id, {
      status: "delivered",
      deliveredAt: nowStr(),
    }),
    fail,
  )

  // 跨单还箱：同一承运商两调运单箱号
  const r01 = new Client("R01")
  await r01.login("zhangwei")
  const d1 = `DP${uid("A").slice(0, 8)}`
  const d2 = `DP${uid("B").slice(0, 8)}`
  for (const [no, picked] of [
    [d1, 2],
    [d2, 1],
  ] as const) {
    await expectOk(
      `创建调运 ${no}`,
      await r01.create("dispatch", {
        dispatchNo: no,
        planTime: nowStr().slice(0, 10),
        pickupPlace: "汉堡HCS",
        returnScope: "华沙 / 罗兹",
        reason: "E2E跨单还箱",
        unitPrice: 500,
        overdueStandard: "¥100/箱/天",
        quantity: picked,
        useTerm: 21,
        carrier: "波兰联运物流",
        totalPrice: 500 * picked,
        status: "还箱中",
        pickedCount: picked,
        returnedCount: 0,
        approvals: [],
        createdBy: "张伟",
        createdAt: nowStr(),
      }),
      fail,
    )
  }

  const r05 = new Client("R05")
  await r05.login("carrier_pl")
  const ra = await r05.create("returns", {
    applyNo: `RA${uid("").slice(0, 10)}`,
    carrier: "波兰联运物流",
    containerNos: ["E2EX1", "E2EX2", "E2EX3"],
    relatedDispatchNos: [d1, d2],
    returnCity: "华沙",
    returnYard: "华沙堆场",
    appliedAt: nowStr(),
    status: "待审核",
  })
  await expectOk("跨单还箱申请", ra, fail)
  assert(
    Array.isArray(ra.data?.relatedDispatchNos) && ra.data.relatedDispatchNos.length === 2,
    "还箱申请应关联 2 个调运单",
    fail,
  )

  // 还箱预约 <24h 通知应拒绝（工作时段内 +3h）
  const shortEta = (() => {
    const d = new Date(Date.now() + 3 * 3600 * 1000)
    if (d.getDay() === 0 || d.getDay() === 6) {
      // 周末无法同时满足工作时段与 <24h：用固定字符串触发 24h 校验前的路径
      // 改为：工作日 10:00 但用「当前时刻+2h」若周末则仅断言资源创建成功并跳过 400
      return null as string | null
    }
    if (d.getHours() < 8 || d.getHours() >= 18) {
      d.setHours(Math.min(16, Math.max(9, new Date().getHours() + 2)), 0, 0, 0)
    }
    if (d.getTime() >= Date.now() + 24 * 3600 * 1000) return null
    const p = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  })()

  if (shortEta) {
    const bk = await r01.create("bookings", {
      bookingNo: `BK${uid("R").slice(0, 7)}`,
      type: "还箱预约",
      containerNos: ["E2ERET01"],
      yard: "汉堡HCS",
      city: "汉堡",
      planTime: shortEta,
      driver: "短提前",
      driverId: "X",
      driverPhone: "1",
      plateNo: "X001",
      refNo: "E2E-RET-24H",
      notifyByEmail: false,
      status: "待发送",
      withinWorkHours: true,
    })
    await expectOk("创建还箱预约(短提前)", bk, fail)
    const notify = await r01.api("POST", `/api/bookings/${encodeURIComponent(bk.data.id)}/notify`)
    assert(notify.status === 400, `还箱预约不足 24h 应 400，实际 ${notify.status}`, fail)
  } else {
    pass("周末跳过 24h 预约拒绝用例")
  }

  // 箱况异常：写订单 + 通知 + 附件
  const orderNo = `UB${uid("C").slice(0, 8)}`
  const ord = await r03.create("orders", {
    orderNo,
    customer: "西安国际陆港集团",
    customerType: "班列客户",
    pickupCity: "西安",
    returnCity: "汉堡",
    containerType: "40HQ",
    quantity: 1,
    unitPrice: 3000,
    status: "已确认",
    createdAt: nowStr(),
    confirmedAt: nowStr(),
    releaseDocReady: true,
    stuffingListUploaded: false,
    returnProofUploaded: false,
    conditionCheck: "异常",
    conditionNote: "E2E 箱况异常",
    channel: "订舱后新增",
  })
  await expectOk("箱况异常订单", ord, fail)
  const att = await r03.create("attachments", {
    refType: "stuffing_list",
    refNo: orderNo,
    fileName: `stuffing_${orderNo}.pdf`,
    mime: "application/pdf",
    size: 0,
    uploadedBy: "e2e",
    uploadedAt: nowStr(),
  })
  await expectOk("附件元数据", att, fail)
  const notif = await r03.create("notifications", {
    type: "系统",
    level: "紧急",
    title: `提箱箱况异常 · ${orderNo}`,
    desc: "E2E 箱况异常",
    module: "M01 提还箱作业",
    href: "/customer/documents",
    roles: ["R01", "R04"],
    actionable: true,
    read: false,
    createdAt: nowStr(),
  })
  await expectOk("箱况异常通知", notif, fail)

  pass("L9 出站/跨单还箱/预约24h拒绝/箱况与附件")
}

/** L10: 系统设置公开 API + R00 改演示开关与菜单策略 */
export const l10AdminConfig: ScenarioFn = async ({ fail, pass }) => {
  const pub0 = await fetch(`${BASE_URL}/api/settings/public`)
  assert(pub0.ok, "公开设置 API 应可匿名访问", fail)
  const pubJson = await pub0.json()
  assert(typeof pubJson.showDemoAccounts === "boolean", "应含 showDemoAccounts", fail)

  const r00 = new Client("R00")
  await r00.login("admin")

  const patch = await r00.api("PATCH", "/api/settings", {
    "login.showDemoAccounts": false,
    "nav.showUnauthorizedMenus": {
      R00: true,
      R01: true,
      R02: true,
      R03: false,
      R04: true,
      R05: true,
      R06: true,
    },
    "biz.returnBookingLeadHours": 24,
  })
  await expectOk("R00 更新系统设置", patch, fail)

  const pub1 = await fetch(`${BASE_URL}/api/settings/public`)
  const after = await pub1.json()
  assert(after.showDemoAccounts === false, "关闭演示账号后公开配置应为 false", fail)
  assert(after.showUnauthorizedMenus?.R03 === false, "R03 应隐藏无权限菜单", fail)

  // 仅恢复演示账号开关，勿改动菜单灰显策略（避免冲掉本地手工配置）
  await r00.api("PATCH", "/api/settings", {
    "login.showDemoAccounts": true,
  })

  const settingsList = await r00.list("settings")
  assert(settingsList.ok, "R00 应可读 settings 资源", fail)

  pass("L10 系统参数：公开 API + 演示开关 + 菜单策略")
}

