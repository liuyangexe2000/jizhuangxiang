import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canWriteRow } from "@/lib/tenant"
import { writeAudit } from "@/lib/audit"
import {
  applyReturnInventory,
  buildUseBoxGate,
  cityFromPlace,
  findInventoryRow,
  inventoryId,
  nowLocalStr,
} from "@/lib/domain/dispatch-ops"
import type { InventoryRow, UseBoxOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

const RETURNABLE_STATUSES = new Set(["提箱中", "已提箱", "还箱中"])

/** 现场角色（堆场/代管）确认收箱：验箱 + 进场Gate + 库存联动，驱动订单->已完成；异常则挂修箱不改状态 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!["R00", "R01", "R04", "R06"].includes(session.roleId)) {
    return NextResponse.json({ error: "还箱确认须由堆场/代管现场角色执行" }, { status: 403 })
  }

  const order = (await get("orders", decodeURIComponent(id))) as UseBoxOrder | null
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 })

  const yards = await list("yards")
  if (!canWriteRow("orders", order as unknown as Record<string, unknown>, session, { yards })) {
    return NextResponse.json({ error: "无权处理该订单（堆场归属不匹配）" }, { status: 403 })
  }
  if (!RETURNABLE_STATUSES.has(order.status)) {
    return NextResponse.json({ error: "订单须处于提箱中/还箱中才能确认收箱" }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const conditionCheck: "通过" | "异常" = body?.conditionCheck === "异常" ? "异常" : "通过"
  const conditionNote: string | undefined =
    typeof body?.conditionNote === "string" && body.conditionNote ? body.conditionNote : undefined
  const actedBy = session.name || session.account
  const actedAt = nowLocalStr()

  if (conditionCheck === "异常") {
    await update("orders", order.id, {
      conditionCheck: "异常",
      conditionNote: conditionNote || "还箱箱况异常（现场判定）",
    })
    await create("repair", {
      repairNo: `RP${Date.now().toString().slice(-8)}`,
      containerNo: `PEND-${order.orderNo.slice(-6)}`,
      containerType: order.containerType,
      ownership: "自有箱",
      yard: order.returnYard || `${order.returnCity}堆场`,
      city: order.returnCity,
      damageDesc: conditionNote || "还箱箱况异常（现场判定）",
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
      title: `还箱箱况异常 · ${order.orderNo}`,
      desc: `${actedBy} 现场判定箱况异常：${conditionNote || "—"}，已挂修箱工单，属客户责任的箱损费需箱管核算。`,
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
      detail: "现场确认还箱：箱况异常，已挂修箱工单",
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, conditionCheck, orderStatus: order.status })
  }

  const yard = order.returnYard || `${order.returnCity}堆场`
  const city = cityFromPlace(yard) || order.returnCity
  const inventory = (await list("inventory")) as InventoryRow[]
  const inv = findInventoryRow(inventory, { yard, city })
  if (inv) {
    await update("inventory", inventoryId(inv), applyReturnInventory(inv, order.quantity))
  }

  await create("gate", buildUseBoxGate(order, "进场", yard, city))

  await update("orders", order.id, {
    status: "已完成",
    conditionCheck: "通过",
    conditionNote,
    returnGateBy: actedBy,
    returnGateAt: actedAt,
  })

  await create("notifications", {
    id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: "任务",
    level: "普通",
    title: `已确认收箱 · ${order.orderNo}`,
    desc: `${yard} · ${actedBy} 确认收箱，订单已完成。`,
    module: "M01 提还箱作业",
    href: "/customer/documents",
    roles: ["R01", "R03"],
    actionable: false,
    read: false,
    createdAt: actedAt,
  })

  await writeAudit({
    session,
    action: "修改",
    module: "M01 提还箱作业",
    target: order.orderNo,
    detail: `现场确认收箱（${yard}），库存联动进场`,
    ip: clientIp(req),
  })

  return NextResponse.json({ ok: true, conditionCheck, actedBy, actedAt })
}
