/**
 * 用箱订单还箱单号：类比提箱单 pickupDocs。
 */

import type { UseBoxOrder } from "../types"

export interface ReturnDocSlip {
  /** 还箱单号，如 RET-UB202607020001-01 */
  docNo: string
  issuedAt: string
  issuedBy: string
  quantity: number
  remark?: string
}

export function listReturnDocs(order: Pick<UseBoxOrder, "returnDocs">): ReturnDocSlip[] {
  return Array.isArray(order.returnDocs) ? order.returnDocs : []
}

export function latestReturnDoc(order: Pick<UseBoxOrder, "returnDocs">): ReturnDocSlip | null {
  const docs = listReturnDocs(order)
  return docs.length > 0 ? docs[docs.length - 1]! : null
}

export function sumReturnDocQuantity(order: Pick<UseBoxOrder, "returnDocs">): number {
  return listReturnDocs(order).reduce((s, d) => s + (Number(d.quantity) || 0), 0)
}

export function nextReturnDocNo(orderNo: string, existing: ReturnDocSlip[]): string {
  const seq = existing.length + 1
  const base = orderNo.trim() || "ORDER"
  return `RET-${base}-${String(seq).padStart(2, "0")}`
}

export function issueReturnDocSlip(input: {
  orderNo: string
  existing: ReturnDocSlip[]
  quantity: number
  issuedBy: string
  issuedAt: string
  remark?: string
}): ReturnDocSlip {
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1))
  return {
    docNo: nextReturnDocNo(input.orderNo, input.existing),
    issuedAt: input.issuedAt,
    issuedBy: input.issuedBy,
    quantity: qty,
    remark: input.remark?.trim() || undefined,
  }
}

export function findReturnDoc(
  order: Pick<UseBoxOrder, "returnDocs">,
  docNo: string | undefined | null,
): ReturnDocSlip | null {
  if (!docNo) return latestReturnDoc(order)
  return listReturnDocs(order).find((d) => d.docNo === docNo) ?? latestReturnDoc(order)
}
