import "server-only"
import { list } from "@/lib/repo"
import { assertRentalSupplyForOrder } from "@/lib/domain/rental-supply-contract"
import type { ContainerType, SupplyContract, UseBoxOrder } from "@/lib/types"
import { boxSourceLabel } from "@/lib/domain/box-source"

/** 服务端：租赁箱订单须匹配有效供应合同余量 */
export async function assertOrderRentalSupply(
  order: Pick<UseBoxOrder, "boxSource" | "containerType" | "quantity">,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (boxSourceLabel(order.boxSource) !== "租赁箱") return { ok: true }
  const contracts = (await list("supplyContracts")) as SupplyContract[]
  const r = assertRentalSupplyForOrder(contracts, {
    boxSource: order.boxSource,
    containerType: order.containerType as ContainerType,
    quantity: order.quantity,
  })
  if (!r.ok) return r
  return { ok: true }
}
