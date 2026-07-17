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
  patchContainerOnReturn,
} from "@/lib/domain/dispatch-ops"
import { buildDamageFeeBill, buildOverdueFeeBill } from "@/lib/domain/order-ops"
import { getSetting } from "@/lib/settings"
import { SETTING_KEYS } from "@/lib/settings-keys"
import { ensureCustomerIdColumns } from "@/lib/ensure-customer-id-schema"
import type { Bill, ContainerMaster, InventoryRow, UseBoxOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

const RETURNABLE_STATUSES = new Set(["提箱中", "已提箱", "还箱中"])

async function hasBillOfType(orderNo: string, type: Bill["type"]) {
  const bills = (await list("bills")) as Bill[]
  return bills.some((b) => b.relatedOrderNo === orderNo && b.type === type)
}

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

  await ensureCustomerIdColumns()

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
      containerNo: order.containerNos?.[0] || `PEND-${order.orderNo.slice(-6)}`,
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

    let damageBillNo: string | undefined
    try {
      if (!(await hasBillOfType(order.orderNo, "箱损费账单"))) {
        const defaultFee = await getSetting<number>(SETTING_KEYS.useboxDamageDefaultFee, 2000)
        const bill = buildDamageFeeBill(order, {
          amount: defaultFee,
          note: conditionNote || "还箱箱况异常（现场判定）",
        })
        const created = (await create("bills", bill)) as Bill
        damageBillNo = created.billNo
        await create("notifications", {
          id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
          type: "账单",
          level: "重要",
          title: `箱损费账单待确认 · ${order.orderNo}`,
          desc: `默认箱损费 ¥${bill.amount.toLocaleString()}（${created.billNo}），箱管可在账单页按异议调整。`,
          module: "M01 提还箱作业",
          href: "/customer/bills",
          roles: ["R01", "R03"],
          actionable: true,
          read: false,
          createdAt: actedAt,
        })
      }
    } catch (e) {
      console.warn("[v0] confirm-return damage bill skipped:", (e as Error).message)
    }

    await create("notifications", {
      id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      type: "系统",
      level: "紧急",
      title: `还箱箱况异常 · ${order.orderNo}`,
      desc: `${actedBy} 现场判定箱况异常：${conditionNote || "—"}，已挂修箱工单${
        damageBillNo ? `，已出默认箱损费 ${damageBillNo}` : ""
      }；箱管可在账单页按异议调整金额。`,
      module: "M01 提还箱作业",
      href: "/customer/bills",
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
      detail: damageBillNo
        ? `现场确认还箱：箱况异常，已挂修箱工单并出箱损费 ${damageBillNo}`
        : "现场确认还箱：箱况异常，已挂修箱工单",
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, conditionCheck, orderStatus: order.status, damageBillNo })
  }

  const yard = order.returnYard || `${order.returnCity}堆场`
  const city = cityFromPlace(yard, yards as { name: string; city: string }[]) || order.returnCity
  const inventory = (await list("inventory")) as InventoryRow[]
  const inv = findInventoryRow(inventory, { yard, city })
  if (inv) {
    await update("inventory", inventoryId(inv), applyReturnInventory(inv, order.quantity))
  }

  const containers = (await list("containers")) as ContainerMaster[]
  const returnNos =
    order.containerNos && order.containerNos.length > 0
      ? order.containerNos
      : [`USEBOX${order.orderNo.slice(-6)}x${order.quantity}`]

  for (const no of returnNos) {
    const master = containers.find((c) => c.containerNo === no)
    await create(
      "gate",
      buildUseBoxGate(order, "进场", yard, city, master?.ownership || "自有箱", no),
    )
    if (master) {
      await update("containers", master.containerNo, patchContainerOnReturn(master, yard, city))
    }
  }

  await update("orders", order.id, {
    status: "已完成",
    conditionCheck: "通过",
    conditionNote,
    returnGateBy: actedBy,
    returnGateAt: actedAt,
  })

  let overdueBillNo: string | undefined
  try {
    if (!(await hasBillOfType(order.orderNo, "超期费账单"))) {
      const freeDays = await getSetting<number>(SETTING_KEYS.useboxFreeDays, 7)
      const dailyRate = await getSetting<number>(SETTING_KEYS.useboxOverdueDailyRate, 50)
      const bill = buildOverdueFeeBill(order, { freeDays, dailyRate })
      if (bill) {
        const created = (await create("bills", bill)) as Bill
        overdueBillNo = created.billNo
        await create("notifications", {
          id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
          type: "账单",
          level: "重要",
          title: `超期费账单待确认 · ${order.orderNo}`,
          desc: `超期 ${bill.items.find((i) => i.label === "超期天数")?.value ?? "—"} 天，金额 ¥${bill.amount.toLocaleString()}（${created.billNo}）。`,
          module: "M01 提还箱作业",
          href: "/customer/bills",
          roles: ["R01", "R03"],
          actionable: true,
          read: false,
          createdAt: actedAt,
        })
      }
    }
  } catch (e) {
    console.warn("[v0] confirm-return overdue bill skipped:", (e as Error).message)
  }

  await create("notifications", {
    id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: "任务",
    level: "普通",
    title: `已确认收箱 · ${order.orderNo}`,
    desc: `${yard} · ${actedBy} 确认收箱，订单已完成${
      overdueBillNo ? `，已出超期费 ${overdueBillNo}` : ""
    }。`,
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
    detail: overdueBillNo
      ? `现场确认收箱（${yard}），库存联动进场，已出超期费 ${overdueBillNo}`
      : `现场确认收箱（${yard}），库存联动进场`,
    ip: clientIp(req),
  })

  return NextResponse.json({ ok: true, conditionCheck, actedBy, actedAt, overdueBillNo })
}
