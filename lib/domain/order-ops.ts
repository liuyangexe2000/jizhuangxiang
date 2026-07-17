import type { Bill, Booking, UseBoxOrder } from "../types"
import { nowLocalStr } from "./dispatch-ops"

export function fmtDeadline(from = new Date(), hours = 24) {
  const d = new Date(from.getTime() + hours * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function parseBizTime(s?: string) {
  if (!s) return NaN
  return Date.parse(s.replace(/-/g, "/"))
}

/**
 * 提箱单放行：须箱管确认后写入 releaseDocReady，
 * 或已确认且已分配提/还箱堆场（兼容历史数据）。
 */
export function shouldReleaseDoc(o: UseBoxOrder) {
  if (o.releaseDocReady) return true
  const confirmedLike =
    o.status === "已确认" ||
    o.status === "提箱中" ||
    o.status === "已提箱" ||
    o.status === "还箱中" ||
    o.status === "已完成"
  if (confirmedLike && o.pickupYard && o.returnYard) return true
  return false
}

export function buildUseBoxBill(o: UseBoxOrder): Omit<Bill, "id"> {
  const amount = o.unitPrice * o.quantity
  const issuedAt = nowLocalStr().slice(0, 10)
  return {
    billNo: `BILL${Date.now().toString().slice(-8)}`,
    type: "用箱账单",
    relatedOrderNo: o.orderNo,
    party: o.customer,
    customerId: o.customerId,
    amount,
    status: "待确认",
    issuedAt,
    confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
    items: [
      { label: "箱型", value: o.containerType },
      { label: "数量", value: String(o.quantity) },
      { label: "单价", value: `¥${o.unitPrice}` },
      { label: "线路", value: `${o.pickupCity}→${o.returnCity}` },
    ],
  }
}

export function buildCancelFeeBill(o: UseBoxOrder): Omit<Bill, "id"> {
  const amount = Math.round(o.unitPrice * o.quantity * 0.2)
  const issuedAt = nowLocalStr().slice(0, 10)
  return {
    billNo: `BILL${Date.now().toString().slice(-8)}`,
    type: "用箱变更费账单",
    relatedOrderNo: o.orderNo,
    party: o.customer,
    customerId: o.customerId,
    amount,
    status: "待确认",
    issuedAt,
    confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
    items: [
      { label: "费用类型", value: "超时取消取消费（20%）" },
      { label: "关联订单", value: o.orderNo },
      { label: "原金额", value: `¥${o.unitPrice * o.quantity}` },
    ],
  }
}

/** 用箱天数（自提箱/确认日起算），不足一天按一天 */
export function calcUseboxUsedDays(o: UseBoxOrder, asOf = new Date()): number {
  const start = parseBizTime(o.pickupGateAt || o.confirmedAt || o.createdAt)
  if (!Number.isFinite(start)) return 0
  const ms = asOf.getTime() - start
  if (ms <= 0) return 0
  return Math.max(1, Math.ceil(ms / (24 * 3600 * 1000)))
}

export function calcUseboxOverdueDays(o: UseBoxOrder, freeDays: number, asOf = new Date()): number {
  return Math.max(0, calcUseboxUsedDays(o, asOf) - Math.max(0, freeDays))
}

export function buildOverdueFeeBill(
  o: UseBoxOrder,
  opts: { freeDays: number; dailyRate: number; days?: number },
): Omit<Bill, "id"> | null {
  const days = opts.days ?? calcUseboxOverdueDays(o, opts.freeDays)
  if (days <= 0 || opts.dailyRate <= 0) return null
  const amount = Math.round(days * opts.dailyRate * o.quantity)
  const issuedAt = nowLocalStr().slice(0, 10)
  return {
    billNo: `BILL${Date.now().toString().slice(-8)}`,
    type: "超期费账单",
    relatedOrderNo: o.orderNo,
    party: o.customer,
    customerId: o.customerId,
    amount,
    status: "待确认",
    issuedAt,
    confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
    items: [
      { label: "费用类型", value: "用箱超期费" },
      { label: "免租天数", value: String(opts.freeDays) },
      { label: "超期天数", value: String(days) },
      { label: "日费率", value: `¥${opts.dailyRate}/箱/天` },
      { label: "箱量", value: String(o.quantity) },
      { label: "关联订单", value: o.orderNo },
    ],
  }
}

export function buildDamageFeeBill(
  o: UseBoxOrder,
  opts: { amount: number; note?: string },
): Omit<Bill, "id"> {
  const amount = Math.max(0, Math.round(opts.amount))
  const issuedAt = nowLocalStr().slice(0, 10)
  return {
    billNo: `BILL${Date.now().toString().slice(-8)}`,
    type: "箱损费账单",
    relatedOrderNo: o.orderNo,
    party: o.customer,
    customerId: o.customerId,
    amount,
    status: "待确认",
    issuedAt,
    confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
    items: [
      { label: "费用类型", value: "箱损费" },
      { label: "关联订单", value: o.orderNo },
      { label: "箱型×量", value: `${o.containerType}×${o.quantity}` },
      ...(opts.note ? [{ label: "异常说明", value: opts.note }] : []),
    ],
  }
}

export function buildOrderBooking(o: UseBoxOrder): Omit<Booking, "id"> {
  const nos = Array.from({ length: o.quantity }, (_, i) => `ORD${o.orderNo.slice(-6)}${String(i + 1).padStart(2, "0")}`)
  return {
    bookingNo: `BK${Date.now().toString().slice(-8)}`,
    type: "提箱预约",
    containerNos: nos,
    yard: o.pickupYard || `${o.pickupCity}堆场`,
    city: o.pickupCity,
    planTime: nowLocalStr(),
    driver: "待指派",
    driverId: "-",
    driverPhone: "-",
    plateNo: "-",
    refNo: o.orderNo,
    notifyByEmail: true,
    status: "待发送",
    withinWorkHours: true,
  }
}

export function isBillOverdue(b: Bill) {
  if (b.status !== "待确认") return false
  const ms = parseBizTime(b.confirmDeadline.length === 10 ? `${b.confirmDeadline} 23:59` : b.confirmDeadline)
  return Number.isFinite(ms) && Date.now() > ms
}

/** 已提箱/还箱中且还箱证明超 3 天未传 */
export function isReturnProofOverdue(o: UseBoxOrder, days = 3): boolean {
  if (o.returnProofUploaded) return false
  if (!["提箱中", "已提箱", "还箱中"].includes(o.status)) return false
  const base = parseBizTime(o.confirmedAt || o.createdAt)
  if (!Number.isFinite(base)) return false
  return Date.now() - base >= days * 24 * 3600 * 1000
}

export function returnProofOverdueList(orders: UseBoxOrder[], days = 3) {
  return orders.filter((o) => isReturnProofOverdue(o, days))
}
