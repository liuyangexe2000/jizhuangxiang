import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canWriteRow } from "@/lib/tenant"
import { writeAudit } from "@/lib/audit"
import {
  applyPickupInventory,
  buildUseBoxGate,
  cityFromPlace,
  findInventoryRow,
  inventoryId,
  listAvailableUseboxContainers,
  nowLocalStr,
  patchContainerOnPickup,
} from "@/lib/domain/dispatch-ops"
import { ensureOrdersContainerNosColumn } from "@/lib/ensure-orders-schema"
import { buildUseBoxBill } from "@/lib/domain/order-ops"
import { parseOptionalContainerNos } from "@/lib/domain/pickup-containers"
import type { Bill, ContainerMaster, InventoryRow, UseBoxOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

async function hasBillOfType(orderNo: string, type: Bill["type"]) {
  const bills = (await list("bills")) as Bill[]
  return bills.some((b) => b.relatedOrderNo === orderNo && b.type === type)
}

/**
 * 现场确认放箱：验箱通过后订单→提箱中、库存按量出场。
 * 业务上箱号随机出场，默认事后由堆场「登记箱号」补录；若一并传入箱号则立即联动主档/gate/账单（兼容路径）。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!["R00", "R01", "R04", "R06"].includes(session.roleId)) {
    return NextResponse.json({ error: "提箱确认须由堆场/代管现场角色执行" }, { status: 403 })
  }

  const order = (await get("orders", decodeURIComponent(id))) as UseBoxOrder | null
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 })

  const yards = await list("yards")
  if (!canWriteRow("orders", order as unknown as Record<string, unknown>, session, { yards })) {
    return NextResponse.json({ error: "无权处理该订单（堆场归属不匹配）" }, { status: 403 })
  }
  if (order.status !== "已确认") {
    return NextResponse.json({ error: "订单须处于「已确认」状态才能确认放箱" }, { status: 400 })
  }

  await ensureOrdersContainerNosColumn()

  const body = await req.json().catch(() => ({}))
  const conditionCheck: "通过" | "异常" = body?.conditionCheck === "异常" ? "异常" : "通过"
  const conditionNote: string | undefined =
    typeof body?.conditionNote === "string" && body.conditionNote ? body.conditionNote : undefined
  const actedBy = session.name || session.account
  const actedAt = nowLocalStr()

  if (conditionCheck === "异常") {
    await update("orders", order.id, {
      conditionCheck: "异常",
      conditionNote: conditionNote || "提箱箱况异常（现场判定）",
    })
    await create("repair", {
      repairNo: `RP${Date.now().toString().slice(-8)}`,
      containerNo: `PEND-${order.orderNo.slice(-6)}`,
      containerType: order.containerType,
      ownership: "自有箱",
      yard: order.pickupYard || `${order.pickupCity}堆场`,
      city: order.pickupCity,
      damageDesc: conditionNote || "提箱箱况异常（现场判定）",
      level: "小修",
      vendor: "待指派",
      estCost: 0,
      reportedBy: actedBy,
      reportedAt: actedAt,
      status: "待报修",
    })
    await create("notifications", {
      id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      type: "系统",
      level: "紧急",
      title: `提箱箱况异常 · ${order.orderNo}`,
      desc: `${actedBy} 现场判定箱况异常：${conditionNote || "—"}，已挂修箱工单。`,
      module: "M01 提还箱作业",
      href: "/customer/documents",
      roles: ["R01", "R04"],
      actionable: true,
      read: false,
      createdAt: actedAt,
    })
    await writeAudit({
      session,
      action: "修改",
      module: "M01 提还箱作业",
      target: order.orderNo,
      detail: "现场确认提箱：箱况异常，已挂修箱工单",
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, conditionCheck, orderStatus: order.status })
  }

  const parsed = parseOptionalContainerNos(body, order.quantity)
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const containerNos = parsed

  const yard = order.pickupYard || `${order.pickupCity}堆场`
  const city = cityFromPlace(yard, yards as { name: string; city: string }[]) || order.pickupCity
  const containers = (await list("containers")) as ContainerMaster[]

  let resolvedNos: string[] | undefined
  if (containerNos) {
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
    resolvedNos = containerNos.map(
      (no) => containers.find((c) => c.containerNo.toUpperCase() === no)!.containerNo,
    )
  }

  const inventory = (await list("inventory")) as InventoryRow[]
  const inv = findInventoryRow(inventory, { yard, city })
  if (inv) {
    await update("inventory", inventoryId(inv), applyPickupInventory(inv, order.quantity))
  }

  if (resolvedNos) {
    for (const no of resolvedNos) {
      const master = containers.find((c) => c.containerNo === no)!
      await create(
        "gate",
        buildUseBoxGate(order, "出场", yard, city, master.ownership || "自有箱", master.containerNo),
      )
      await update("containers", master.containerNo, patchContainerOnPickup(master, order.orderNo))
    }
  }

  const orderPatch: Partial<UseBoxOrder> = {
    status: "提箱中",
    conditionCheck: "通过",
    conditionNote,
    pickupGateBy: actedBy,
    pickupGateAt: actedAt,
    ...(resolvedNos ? { containerNos: resolvedNos } : {}),
  }
  await update("orders", order.id, orderPatch)

  let useBoxBillNo: string | undefined
  if (resolvedNos) {
    try {
      if (!(await hasBillOfType(order.orderNo, "用箱账单"))) {
        const bill = buildUseBoxBill({ ...order, ...orderPatch, containerNos: resolvedNos })
        const created = (await create("bills", bill)) as Bill
        useBoxBillNo = created.billNo
        await create("notifications", {
          id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
          type: "账单",
          level: "重要",
          title: `用箱账单待确认 · ${order.orderNo}`,
          desc: `现场已完成提箱并登记箱号，账单 ${created.billNo} 金额 ${bill.amount.toLocaleString()}，请核对确认。`,
          module: "M01 提还箱作业",
          href: "/customer/bills",
          roles: ["R01", "R03"],
          actionable: true,
          read: false,
          createdAt: actedAt,
        })
      }
    } catch (e) {
      console.warn("[v0] confirm-pickup usebox bill skipped:", (e as Error).message)
    }
  }

  await create("notifications", {
    id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: "任务",
    level: "普通",
    title: `已确认放箱 · ${order.orderNo}`,
    desc: resolvedNos
      ? `${yard} · ${actedBy} 确认放箱（${resolvedNos.join("、")}），订单进入提箱中${
          useBoxBillNo ? `，已生成用箱账单 ${useBoxBillNo}` : ""
        }。`
      : `${yard} · ${actedBy} 确认放箱，订单进入提箱中；箱号随机出场，请堆场事后登记提箱箱号与时间。`,
    module: "M01 提还箱作业",
    href: "/customer/documents",
    roles: ["R01", "R03", "R04", "R06"],
    actionable: !resolvedNos,
    read: false,
    createdAt: actedAt,
  })

  await writeAudit({
    session,
    action: "修改",
    module: "M01 提还箱作业",
    target: order.orderNo,
    detail: resolvedNos
      ? `现场确认放箱（${yard}），箱号 ${resolvedNos.join(",")}，库存联动出场${
          useBoxBillNo ? `，生成用箱账单 ${useBoxBillNo}` : ""
        }`
      : `现场确认放箱（${yard}），库存按量出场；箱号待事后登记`,
    ip: clientIp(req),
  })

  return NextResponse.json({
    ok: true,
    conditionCheck,
    actedBy,
    actedAt,
    containerNos: resolvedNos ?? [],
    pendingContainerRegister: !resolvedNos,
    useBoxBillNo,
  })
}
