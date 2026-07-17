import type {
  AttachmentMeta,
  Bill,
  Booking,
  Customer,
  GateRecord,
  SystemUser,
  UseBoxOrder,
} from "@/lib/types"
import {
  type LifecycleEvent,
  latestEventAt,
  sortEventsDesc,
} from "@/lib/domain/lifecycle-types"

const ACTIVE_ORDER: UseBoxOrder["status"][] = [
  "待确认",
  "已确认",
  "提箱中",
  "已提箱",
  "还箱中",
]

export type CustomerLifecycleInput = {
  customer: Customer
  orders: UseBoxOrder[]
  bills: Bill[]
  bookings: Booking[]
  gate: GateRecord[]
  attachments: AttachmentMeta[]
  users?: SystemUser[]
}

export type CustomerLifecycleSummary = {
  orderCount: number
  activeOrderCount: number
  completedOrderCount: number
  pendingBillAmount: number
  lastActivityAt?: string
}

export type CustomerLifecycle = {
  customer: Customer
  nameKeys: string[]
  orders: UseBoxOrder[]
  bills: Bill[]
  bookings: Booking[]
  gate: GateRecord[]
  attachments: AttachmentMeta[]
  events: LifecycleEvent[]
  summary: CustomerLifecycleSummary
}

/** 用于匹配订单 customer / 账单 party 的名称集合 */
export function customerNameKeys(customer: Customer, users: SystemUser[] = []): string[] {
  const keys = new Set<string>()
  const name = customer.name?.trim()
  const abbr = customer.abbreviation?.trim()
  if (name) keys.add(name)
  if (abbr) keys.add(abbr)

  for (const u of users) {
    if (u.roleId !== "R03") continue
    const org = u.org?.trim()
    if (!org) continue
    if (keys.has(org)) continue
    if (
      (name && (org === name || name.includes(org))) ||
      (abbr && (org === abbr || org.includes(abbr) || abbr.includes(org)))
    ) {
      keys.add(org)
    }
  }
  return Array.from(keys)
}

export function customerMatchesOrg(customer: Customer, org: string | null | undefined): boolean {
  if (!org?.trim()) return false
  const keys = customerNameKeys(customer)
  const o = org.trim()
  return keys.some((k) => k === o || k.includes(o) || o.includes(k))
}

function inKeys(value: string | undefined, keys: Set<string>): boolean {
  if (!value) return false
  return keys.has(value.trim())
}

export function getCustomerLifecycle(input: CustomerLifecycleInput): CustomerLifecycle {
  const { customer, users = [] } = input
  const nameKeys = customerNameKeys(customer, users)
  const keySet = new Set(nameKeys)

  const orders = input.orders.filter(
    (o) => o.customerId === customer.id || inKeys(o.customer, keySet),
  )
  const orderNos = new Set(orders.map((o) => o.orderNo))

  const bills = input.bills.filter(
    (b) =>
      b.customerId === customer.id ||
      inKeys(b.party, keySet) ||
      (b.relatedOrderNo && orderNos.has(b.relatedOrderNo)),
  )
  const bookings = input.bookings.filter((b) => orderNos.has(b.refNo))
  const gate = input.gate.filter((g) => g.relatedOrderNo && orderNos.has(g.relatedOrderNo))
  const attachments = input.attachments.filter((a) => orderNos.has(a.refNo))

  const events: LifecycleEvent[] = []

  for (const o of orders) {
    events.push({
      id: `order-created-${o.id}`,
      at: o.createdAt,
      kind: "ORDER_CREATED",
      title: "用箱申请提交",
      summary: `${o.orderNo} · ${o.containerType} × ${o.quantity} · ${o.pickupCity}→${o.returnCity}`,
      href: "/operations/usebox",
      refNo: o.orderNo,
      meta: { status: o.status, customer: o.customer },
    })
    if (o.confirmedAt) {
      events.push({
        id: `order-confirmed-${o.id}`,
        at: o.confirmedAt,
        kind: "ORDER_CONFIRMED",
        title: "用箱申请已确认",
        summary: `${o.orderNo}${o.confirmedBy ? ` · 确认人 ${o.confirmedBy}` : ""}`,
        href: "/operations/usebox",
        refNo: o.orderNo,
      })
    }
    if (o.status === "已取消" || o.status === "超时取消") {
      events.push({
        id: `order-cancelled-${o.id}`,
        at: o.confirmedAt || o.createdAt,
        kind: "ORDER_CANCELLED",
        title: o.status === "超时取消" ? "订单超时取消" : "订单已取消",
        summary: o.orderNo,
        href: "/customer/orders",
        refNo: o.orderNo,
      })
    }
    if (o.pickupGateAt) {
      events.push({
        id: `order-pickup-gate-${o.id}`,
        at: o.pickupGateAt,
        kind: "ORDER_PICKUP_GATE",
        title: "现场确认放箱",
        summary: `${o.orderNo}${o.pickupGateBy ? ` · ${o.pickupGateBy}` : ""}${o.pickupYard ? ` · ${o.pickupYard}` : ""}`,
        href: "/customer/documents",
        refNo: o.orderNo,
      })
    }
    if (o.returnGateAt) {
      events.push({
        id: `order-return-gate-${o.id}`,
        at: o.returnGateAt,
        kind: "ORDER_RETURN_GATE",
        title: "现场确认收箱",
        summary: `${o.orderNo}${o.returnGateBy ? ` · ${o.returnGateBy}` : ""}${o.returnYard ? ` · ${o.returnYard}` : ""}`,
        href: "/customer/documents",
        refNo: o.orderNo,
      })
    }
  }

  for (const b of bills) {
    events.push({
      id: `bill-${b.id}`,
      at: b.issuedAt,
      kind: "BILL_ISSUED",
      title: `${b.type}开立`,
      summary: `${b.billNo} · ¥${b.amount.toLocaleString()} · ${b.status}`,
      href: "/customer/bills",
      refNo: b.billNo,
      meta: { relatedOrderNo: b.relatedOrderNo, status: b.status },
    })
  }

  for (const bk of bookings) {
    events.push({
      id: `booking-${bk.id}`,
      at: bk.confirmedAt || bk.planTime,
      kind: bk.type === "提箱预约" ? "BOOKING_PICKUP" : "BOOKING_RETURN",
      title: bk.type,
      summary: `${bk.bookingNo} · ${bk.yard} · ${bk.status} · 计划 ${bk.planTime}`,
      href: "/yard/bookings",
      refNo: bk.bookingNo,
      meta: { refNo: bk.refNo },
    })
  }

  for (const g of gate) {
    events.push({
      id: `gate-${g.id}`,
      at: g.time,
      kind: g.type === "出场" ? "GATE_OUT" : "GATE_IN",
      title: `进出场${g.type}`,
      summary: `${g.containerNo} · ${g.city} ${g.yard}${g.relatedOrderNo ? ` · ${g.relatedOrderNo}` : ""}`,
      href: "/inventory/gate",
      refNo: g.containerNo,
      meta: { mappingStatus: g.mappingStatus },
    })
  }

  for (const a of attachments) {
    events.push({
      id: `att-${a.id}`,
      at: a.uploadedAt,
      kind: "ATTACHMENT",
      title: "单据附件上传",
      summary: `${a.fileName} · ${a.refType} · ${a.refNo}`,
      href: "/customer/documents",
      refNo: a.refNo,
    })
  }

  const sorted = sortEventsDesc(events)
  const pendingBillAmount = bills
    .filter((b) => b.status === "待确认" || b.status === "有异议")
    .reduce((s, b) => s + b.amount, 0)

  return {
    customer,
    nameKeys,
    orders,
    bills,
    bookings,
    gate,
    attachments,
    events: sorted,
    summary: {
      orderCount: orders.length,
      activeOrderCount: orders.filter((o) => ACTIVE_ORDER.includes(o.status)).length,
      completedOrderCount: orders.filter((o) => o.status === "已完成").length,
      pendingBillAmount,
      lastActivityAt: latestEventAt(sorted),
    },
  }
}
