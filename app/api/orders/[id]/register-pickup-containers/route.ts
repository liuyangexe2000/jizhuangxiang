import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canWriteRow } from "@/lib/tenant"
import { writeAudit } from "@/lib/audit"
import {
  buildUseBoxGate,
  cityFromPlace,
  listAvailableUseboxContainers,
  nowLocalStr,
  patchContainerOnPickup,
} from "@/lib/domain/dispatch-ops"
import { ensureOrdersContainerNosColumn } from "@/lib/ensure-orders-schema"
import { buildUseBoxBill } from "@/lib/domain/order-ops"
import {
  parseOptionalPickupGateAt,
  parseRequiredContainerNos,
} from "@/lib/domain/pickup-containers"
import type { Bill, ContainerMaster, UseBoxOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

async function hasBillOfType(orderNo: string, type: Bill["type"]) {
  const bills = (await list("bills")) as Bill[]
  return bills.some((b) => b.relatedOrderNo === orderNo && b.type === type)
}

const REGISTERABLE = new Set(["提箱中", "已提箱"])

/**
 * 提箱完成后由堆场登记真实箱号与提箱时间：联动出场 gate / 箱主档，并生成用箱账单。
 * 适用于随机出场、事后补录场景。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!["R00", "R01", "R04", "R06"].includes(session.roleId)) {
    return NextResponse.json({ error: "登记提箱箱号须由堆场/代管现场角色执行" }, { status: 403 })
  }

  const order = (await get("orders", decodeURIComponent(id))) as UseBoxOrder | null
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 })

  const yards = await list("yards")
  if (!canWriteRow("orders", order as unknown as Record<string, unknown>, session, { yards })) {
    return NextResponse.json({ error: "无权处理该订单（堆场归属不匹配）" }, { status: 403 })
  }
  if (!REGISTERABLE.has(order.status)) {
    return NextResponse.json({ error: "订单须处于提箱中才能登记箱号" }, { status: 400 })
  }
  if ((order.containerNos?.length ?? 0) > 0) {
    return NextResponse.json({ error: "本单已登记提箱箱号，勿重复提交" }, { status: 400 })
  }

  await ensureOrdersContainerNosColumn()

  const body = await req.json().catch(() => ({}))
  const parsed = parseRequiredContainerNos(body, order.quantity)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const containerNos = parsed
  const pickupGateAt = parseOptionalPickupGateAt(body) || order.pickupGateAt || nowLocalStr()
  const actedBy = session.name || session.account
  const actedAt = nowLocalStr()

  const yard = order.pickupYard || `${order.pickupCity}堆场`
  const city = cityFromPlace(yard, yards as { name: string; city: string }[]) || order.pickupCity
  const containers = (await list("containers")) as ContainerMaster[]
  const available = listAvailableUseboxContainers(containers, {
    yard,
    city,
    containerType: order.containerType,
  })
  const availSet = new Set(available.map((c) => c.containerNo.toUpperCase()))
  for (const no of containerNos) {
    if (!availSet.has(no)) {
      return NextResponse.json(
        { error: `箱号 ${no} 不可用：须为提箱堆场「${yard}」在场且箱型 ${order.containerType}` },
        { status: 400 },
      )
    }
  }

  const resolvedNos = containerNos.map(
    (no) => containers.find((c) => c.containerNo.toUpperCase() === no)!.containerNo,
  )

  for (const no of resolvedNos) {
    const master = containers.find((c) => c.containerNo === no)!
    await create(
      "gate",
      buildUseBoxGate(order, "出场", yard, city, master.ownership || "自有箱", master.containerNo),
    )
    await update("containers", master.containerNo, {
      ...patchContainerOnPickup(master, order.orderNo),
      lastGateTime: pickupGateAt,
    })
  }

  await update("orders", order.id, {
    containerNos: resolvedNos,
    pickupGateAt,
    pickupGateBy: order.pickupGateBy || actedBy,
  })

  let useBoxBillNo: string | undefined
  try {
    if (!(await hasBillOfType(order.orderNo, "用箱账单"))) {
      const bill = buildUseBoxBill({
        ...order,
        containerNos: resolvedNos,
        pickupGateAt,
        pickupGateBy: order.pickupGateBy || actedBy,
      })
      const created = (await create("bills", bill)) as Bill
      useBoxBillNo = created.billNo
      await create("notifications", {
        id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        type: "账单",
        level: "重要",
        title: `用箱账单待确认 · ${order.orderNo}`,
        desc: `堆场已登记提箱箱号，账单 ${created.billNo} 金额 ${bill.amount.toLocaleString()}（含箱号/提箱时间），请核对确认。`,
        module: "M01 提还箱作业",
        href: "/customer/bills",
        roles: ["R01", "R03"],
        actionable: true,
        read: false,
        createdAt: actedAt,
      })
    }
  } catch (e) {
    console.warn("[v0] register-pickup-containers bill skipped:", (e as Error).message)
  }

  await create("notifications", {
    id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: "任务",
    level: "普通",
    title: `已登记提箱箱号 · ${order.orderNo}`,
    desc: `${actedBy} 登记箱号 ${resolvedNos.join("、")}，提箱时间 ${pickupGateAt}${
      useBoxBillNo ? `，已生成用箱账单 ${useBoxBillNo}` : ""
    }。`,
    module: "M01 提还箱作业",
    href: "/customer/bills",
    roles: ["R01", "R03"],
    actionable: !!useBoxBillNo,
    read: false,
    createdAt: actedAt,
  })

  await writeAudit({
    session,
    action: "修改",
    module: "M01 提还箱作业",
    target: order.orderNo,
    detail: `登记提箱箱号 ${resolvedNos.join(",")}，提箱时间 ${pickupGateAt}${
      useBoxBillNo ? `，生成用箱账单 ${useBoxBillNo}` : ""
    }`,
    ip: clientIp(req),
  })

  return NextResponse.json({
    ok: true,
    containerNos: resolvedNos,
    pickupGateAt,
    useBoxBillNo,
  })
}
