/**
 * 多类型账单扩展 — 维修费、上下车费、异常费
 */

import type { Bill, BillType, RepairOrder, UseBoxOrder, Yard } from "../types"
import { fmtDeadline } from "./order-ops"
import { nowLocalStr } from "./dispatch-ops"
import { attachBillFx, formatMoney } from "./money"

export type GenerateBillInput = {
  relatedOrderNo?: string
  party?: string
  amount?: number
  currency?: Bill["currency"]
  customerId?: string
  items?: { label: string; value: string }[]
}

export function hasBillOfType(
  bills: Bill[],
  relatedOrderNo: string,
  type: BillType,
): boolean {
  return bills.some((b) => b.relatedOrderNo === relatedOrderNo && b.type === type)
}

/** 维修报价审批通过后生成维修费账单 */
export function generateRepairBill(
  repair: RepairOrder,
  input: Pick<GenerateBillInput, "party" | "customerId"> = {},
): Omit<Bill, "id"> | null {
  const total = repair.quoteTotal ?? 0
  if (total <= 0) return null
  const fx = attachBillFx({ amount: total, currency: "CNY" })
  const issuedAt = nowLocalStr().slice(0, 10)
  return {
    billNo: `BILL${Date.now().toString().slice(-8)}`,
    type: "维修费账单",
    relatedOrderNo: repair.repairNo,
    party: input.party || repair.vendor || "维修结算",
    customerId: input.customerId,
    ...fx,
    status: "待确认",
    issuedAt,
    confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
    items: [
      { label: "修箱工单", value: repair.repairNo },
      { label: "箱号", value: repair.containerNo },
      { label: "堆场", value: `${repair.yard} · ${repair.city}` },
      { label: "维修厂", value: repair.vendor || "—" },
      { label: "报价合计", value: formatMoney(total, "CNY") },
      ...(repair.quoteLines || []).map((line, i) => ({
        label: `明细${i + 1}`,
        value: `${line.label} ×${line.qty} @${line.unitPrice}`,
      })),
    ],
  }
}

export type BoardingAlightingInput = {
  order: UseBoxOrder
  yard: Yard | null
  /** 默认还箱时一并收取上下车费 */
  includeBoarding?: boolean
  includeAlighting?: boolean
}

/** 堆场上下车费核算后出账（默认还箱节点，上车+下车各 × 箱量） */
export function generateBoardingAlightingBill(
  input: BoardingAlightingInput,
): Omit<Bill, "id"> | null {
  const { order, yard } = input
  const includeBoarding = input.includeBoarding !== false
  const includeAlighting = input.includeAlighting !== false
  const qty = order.quantity || 1
  const boarding = includeBoarding ? Number(yard?.boardingFee ?? 0) : 0
  const alighting = includeAlighting ? Number(yard?.alightingFee ?? 0) : 0
  const amount = boarding * qty + alighting * qty
  if (amount <= 0) return null

  const fx = attachBillFx({ amount, currency: "CNY" })
  const issuedAt = nowLocalStr().slice(0, 10)
  const yardName = yard?.name || order.returnYard || order.pickupYard || "—"
  const items: { label: string; value: string }[] = [
    { label: "堆场", value: yardName },
    { label: "箱量", value: String(qty) },
  ]
  if (boarding > 0) {
    items.push({ label: "上车费单价", value: formatMoney(boarding, "CNY") })
    items.push({ label: "上车费小计", value: formatMoney(boarding * qty, "CNY") })
  }
  if (alighting > 0) {
    items.push({ label: "下车费单价", value: formatMoney(alighting, "CNY") })
    items.push({ label: "下车费小计", value: formatMoney(alighting * qty, "CNY") })
  }

  return {
    billNo: `BILL${Date.now().toString().slice(-8)}`,
    type: "上下车费账单",
    relatedOrderNo: order.orderNo,
    party: order.customer,
    customerId: order.customerId,
    ...fx,
    status: "待确认",
    issuedAt,
    confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
    items,
  }
}

/** 异常进出场手工确认计费后出账 */
export function generateAbnormalBill(input: GenerateBillInput): Omit<Bill, "id"> | null {
  const amount = Number(input.amount ?? 0)
  if (amount <= 0 || !input.relatedOrderNo) return null
  const fx = attachBillFx({ amount, currency: input.currency || "CNY" })
  const issuedAt = nowLocalStr().slice(0, 10)
  return {
    billNo: `BILL${Date.now().toString().slice(-8)}`,
    type: "异常费账单",
    relatedOrderNo: input.relatedOrderNo,
    party: input.party || "异常结算",
    customerId: input.customerId,
    ...fx,
    status: "待确认",
    issuedAt,
    confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
    items: input.items?.length
      ? input.items
      : [{ label: "说明", value: "异常进出场计费" }],
  }
}
