import "server-only"
import { list, update } from "@/lib/repo"
import {
  assertRentalSupplyForOrder,
  findRentalSupplyContract,
  rentalContractRemaining,
} from "@/lib/domain/rental-supply-contract"
import type { ContainerType, SupplyContract, UseBoxOrder } from "@/lib/types"
import { boxSourceLabel } from "@/lib/domain/box-source"

/** 服务端：租赁箱订单须匹配有效供应合同余量 */
export async function assertOrderRentalSupply(
  order: Pick<UseBoxOrder, "boxSource" | "containerType" | "quantity">,
): Promise<{ ok: true; contractNo?: string } | { ok: false; message: string }> {
  if (boxSourceLabel(order.boxSource) !== "租赁箱") return { ok: true }
  const contracts = (await list("supplyContracts")) as SupplyContract[]
  const r = assertRentalSupplyForOrder(contracts, {
    boxSource: order.boxSource,
    containerType: order.containerType as ContainerType,
    quantity: order.quantity,
  })
  if (!r.ok) return r
  return { ok: true, contractNo: r.contractNo }
}

function contractByNo(contracts: SupplyContract[], contractNo: string) {
  return contracts.find((c) => c.contractNo === contractNo)
}

/**
 * 箱管确认订单时：扣减租赁合同 deliveredQty 并返回 contractNo 写入订单。
 * 幂等：订单已有 supplyContractNo 则不再扣减。
 */
export async function reserveRentalContractOnConfirm(
  order: Pick<UseBoxOrder, "boxSource" | "containerType" | "quantity" | "supplyContractNo">,
): Promise<{ ok: true; contractNo: string } | { ok: false; message: string }> {
  if (boxSourceLabel(order.boxSource) !== "租赁箱") {
    return { ok: true, contractNo: order.supplyContractNo || "" }
  }
  if (order.supplyContractNo) {
    return { ok: true, contractNo: order.supplyContractNo }
  }

  const contracts = (await list("supplyContracts")) as SupplyContract[]
  const qty = Math.max(1, Math.floor(order.quantity))
  const hit = findRentalSupplyContract(contracts, {
    containerType: order.containerType as ContainerType,
    quantity: qty,
  })
  if (!hit) {
    return {
      ok: false,
      message: `确认失败：租赁箱 ${order.containerType} × ${qty} 无足够合同余量，请维护供应合同或改选箱源`,
    }
  }

  const fresh = contractByNo(contracts, hit.contractNo)!
  const nextDelivered = Number(fresh.deliveredQty ?? 0) + qty
  const patch: Partial<SupplyContract> = {
    deliveredQty: nextDelivered,
  }
  if (nextDelivered >= fresh.quantity) {
    patch.status = "已完成"
  }
  await update("supplyContracts", fresh.id, patch)
  return { ok: true, contractNo: hit.contractNo }
}

/** 取消已确认/提箱中租赁订单时：回滚合同 deliveredQty */
export async function releaseRentalContractOnCancel(order: UseBoxOrder): Promise<boolean> {
  const contractNo = order.supplyContractNo
  if (!contractNo || boxSourceLabel(order.boxSource) !== "租赁箱") return false
  if (!["已确认", "提箱中"].includes(order.status)) return false

  const contracts = (await list("supplyContracts")) as SupplyContract[]
  const c = contractByNo(contracts, contractNo)
  if (!c) return false

  const qty = Math.max(1, Math.floor(order.quantity))
  const nextDelivered = Math.max(0, Number(c.deliveredQty ?? 0) - qty)
  const patch: Partial<SupplyContract> = {
    deliveredQty: nextDelivered,
  }
  if (c.status === "已完成" && nextDelivered < c.quantity) {
    patch.status = "履行中"
  }
  await update("supplyContracts", c.id, patch)
  return true
}

/** 确认前预览将绑定的合同（只读） */
export async function previewRentalContractNo(
  order: Pick<UseBoxOrder, "boxSource" | "containerType" | "quantity">,
): Promise<string | null> {
  if (boxSourceLabel(order.boxSource) !== "租赁箱") return null
  const contracts = (await list("supplyContracts")) as SupplyContract[]
  const hit = findRentalSupplyContract(contracts, {
    containerType: order.containerType as ContainerType,
    quantity: order.quantity,
  })
  return hit?.contractNo ?? null
}
