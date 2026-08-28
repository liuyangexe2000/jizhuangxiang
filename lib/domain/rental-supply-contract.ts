/**
 * 租赁箱源 ↔ 供应合同（type=租赁）余量校验
 */
import type { ContainerType, SupplyContract } from "../types"
import { boxSourceLabel } from "./box-source"

export function rentalContractRemaining(c: SupplyContract): number {
  return Math.max(0, Number(c.quantity) - Number(c.deliveredQty ?? 0))
}

function todayStr(asOf = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${asOf.getFullYear()}-${p(asOf.getMonth() + 1)}-${p(asOf.getDate())}`
}

/** 履行中且在有效期内的租赁合同 */
export function isActiveRentalContract(c: SupplyContract, asOf = new Date()): boolean {
  if (c.type !== "租赁") return false
  if (c.status !== "履行中") return false
  const day = todayStr(asOf)
  const start = (c.startDate || "").slice(0, 10)
  const end = (c.endDate || "").slice(0, 10)
  if (!start || !end) return false
  return start <= day && day <= end
}

export function findRentalSupplyContract(
  contracts: SupplyContract[],
  opts: { containerType: ContainerType; quantity: number; asOf?: Date },
): SupplyContract | undefined {
  const qty = Math.max(1, Math.floor(opts.quantity))
  const hits = contracts.filter(
    (c) =>
      isActiveRentalContract(c, opts.asOf) &&
      c.containerType === opts.containerType &&
      rentalContractRemaining(c) >= qty,
  )
  hits.sort((a, b) => rentalContractRemaining(b) - rentalContractRemaining(a))
  return hits[0]
}

export function assertRentalSupplyForOrder(
  contracts: SupplyContract[],
  order: { boxSource?: string | null; containerType: ContainerType; quantity: number },
): { ok: true; contractNo: string } | { ok: false; message: string } {
  if (boxSourceLabel(order.boxSource) !== "租赁箱") return { ok: true, contractNo: "" }
  const qty = Math.max(1, Math.floor(order.quantity))
  const hit = findRentalSupplyContract(contracts, {
    containerType: order.containerType,
    quantity: qty,
  })
  if (!hit) {
    return {
      ok: false,
      message: `租赁箱订单须匹配有效供应合同：${order.containerType} × ${qty} 无履行中且余量足够的租赁合同，请先在「供应合同」维护或改选自有箱/不限箱源`,
    }
  }
  return { ok: true, contractNo: hit.contractNo }
}
