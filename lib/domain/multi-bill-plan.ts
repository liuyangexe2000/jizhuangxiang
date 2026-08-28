/**
 * 多类型账单扩展 — Batch D 计划骨架
 * 在现有 BillType 之外规划：维修费、上下车费、异常费。
 * 正式落库前勿改 lib/types.ts 的 BillType 联合类型。
 */

import type { Bill } from "../types"

/** 计划扩展账单类型（尚未并入正式 BillType） */
export type ExtendedBillType = "维修费账单" | "上下车费账单" | "异常费账单"

export type PlannedBillType = Bill["type"] | ExtendedBillType

export type GenerateBillInput = {
  relatedOrderNo?: string
  party?: string
  amount?: number
  currency?: string
  items?: { label: string; value: string }[]
}

/**
 * TODO: 维修完工确认后生成维修费账单
 */
export function generateRepairBill(_input: GenerateBillInput): Omit<Bill, "id"> | null {
  // TODO: 对接维修审批报价合计 → Bill(type: 维修费账单)
  return null
}

/**
 * TODO: 堆场上下车费（boardingFee / alightingFee）核算后出账
 */
export function generateBoardingAlightingBill(
  _input: GenerateBillInput,
): Omit<Bill, "id"> | null {
  // TODO: 按堆场费用字段与作业记录生成上下车费账单
  return null
}

/**
 * TODO: 异常场景（箱损外补扣、争议调整等）生成异常费账单
 */
export function generateAbnormalBill(_input: GenerateBillInput): Omit<Bill, "id"> | null {
  // TODO: 异常费规则与审批通过后出账
  return null
}
