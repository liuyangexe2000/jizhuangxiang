/**
 * 供应计划类型 ↔ 供应商种类 / 合同号前缀
 */

import type { SupplierType, SupplyPlanType } from "../types"

export function supplierTypeForPlan(planType: SupplyPlanType): SupplierType {
  if (planType === "采购") return "制造商"
  if (planType === "租赁") return "租赁商"
  return "调运供应商"
}

export function contractPrefixForPlan(planType: SupplyPlanType): string {
  if (planType === "采购") return "PC"
  if (planType === "租赁") return "LC"
  return "DC"
}

export function planTypeLabel(planType: SupplyPlanType): string {
  return planType
}
