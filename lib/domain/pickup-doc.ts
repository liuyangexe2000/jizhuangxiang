/**
 * 用箱订单提箱单号：一单可开具多张提箱单（分批提箱 / 多车次）。
 */

import type { UseBoxOrder } from "../types"

export interface PickupDocSlip {
  /** 提箱单号，如 REL-UB202607020001-01 */
  docNo: string
  issuedAt: string
  issuedBy: string
  /** 本提箱单覆盖箱量 */
  quantity: number
  remark?: string
}

export function listPickupDocs(order: Pick<UseBoxOrder, "pickupDocs">): PickupDocSlip[] {
  return Array.isArray(order.pickupDocs) ? order.pickupDocs : []
}

export function latestPickupDoc(order: Pick<UseBoxOrder, "pickupDocs">): PickupDocSlip | null {
  const docs = listPickupDocs(order)
  return docs.length > 0 ? docs[docs.length - 1]! : null
}

export function sumPickupDocQuantity(order: Pick<UseBoxOrder, "pickupDocs">): number {
  return listPickupDocs(order).reduce((s, d) => s + (Number(d.quantity) || 0), 0)
}

/** 本单下一张提箱单号（订单内唯一递增） */
export function nextPickupDocNo(orderNo: string, existing: PickupDocSlip[]): string {
  const seq = existing.length + 1
  const base = orderNo.trim() || "ORDER"
  return `REL-${base}-${String(seq).padStart(2, "0")}`
}

export function issuePickupDocSlip(input: {
  orderNo: string
  existing: PickupDocSlip[]
  quantity: number
  issuedBy: string
  issuedAt: string
  remark?: string
}): PickupDocSlip {
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1))
  return {
    docNo: nextPickupDocNo(input.orderNo, input.existing),
    issuedAt: input.issuedAt,
    issuedBy: input.issuedBy,
    quantity: qty,
    remark: input.remark?.trim() || undefined,
  }
}

export function findPickupDoc(
  order: Pick<UseBoxOrder, "pickupDocs">,
  docNo: string | undefined | null,
): PickupDocSlip | null {
  if (!docNo) return latestPickupDoc(order)
  return listPickupDocs(order).find((d) => d.docNo === docNo) ?? latestPickupDoc(order)
}
