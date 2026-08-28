/**
 * 用箱订单取消（服务端闭环）：状态、库存回滚、变更费账单、通知。
 */
import "server-only"
import { list, update, create } from "@/lib/repo"
import type { Bill, ContainerMaster, InventoryRow, UseBoxOrder } from "@/lib/types"
import {
  applyReleaseReserveInventory,
  applyRevertPickupInventory,
  cityFromPlace,
  findInventoryRow,
  inventoryId,
  nowLocalStr,
  patchContainerOnCancelPickup,
} from "@/lib/domain/dispatch-ops"
import {
  buildCancelFeeBill,
  buildPostPickupCancelFeeBill,
  computeCancelOutcome,
} from "@/lib/domain/order-ops"
import { getSetting } from "@/lib/settings"
import { SETTING_KEYS } from "@/lib/settings-keys"

export type CancelOrderResult = {
  ok: true
  status: "已取消" | "超时取消"
  withinFree: boolean
  feeBillNo?: string
  inventoryReverted: boolean
  containersReverted: number
}

export async function cancelUseBoxOrder(
  order: UseBoxOrder,
  yards: { name: string; city: string }[],
  opts?: { feeRate?: number },
): Promise<CancelOrderResult> {
  const preview = computeCancelOutcome(order)
  if (!preview.canCancel) {
    throw new Error("当前状态不可取消")
  }
  const { withinFree, nextStatus, isPostPickup } = preview
  const feeRate =
    typeof opts?.feeRate === "number" && Number.isFinite(opts.feeRate)
      ? Math.max(0, Math.min(1, opts.feeRate))
      : (await getSetting<number>(SETTING_KEYS.postPickupCancelFeeRate, 0.2)) ?? 0.2

  let inventoryReverted = false
  let containersReverted = 0

  if (order.status === "已确认" && order.pickupYard) {
    const inventory = (await list("inventory")) as InventoryRow[]
    const inv = findInventoryRow(inventory, {
      yard: order.pickupYard,
      city: cityFromPlace(order.pickupYard, yards),
    })
    if (inv) {
      await update("inventory", inventoryId(inv), applyReleaseReserveInventory(inv, order.quantity))
      inventoryReverted = true
    }
  }

  if (order.status === "提箱中") {
    const yard = order.pickupYard || `${order.pickupCity}堆场`
    const city = cityFromPlace(yard, yards) || order.pickupCity
    const inventory = (await list("inventory")) as InventoryRow[]
    const inv = findInventoryRow(inventory, { yard, city })
    if (inv) {
      await update("inventory", inventoryId(inv), applyRevertPickupInventory(inv, order.quantity))
      inventoryReverted = true
    }

    const containerNos = (order.containerNos || []).filter(Boolean)
    if (containerNos.length > 0) {
      const containers = (await list("containers")) as ContainerMaster[]
      for (const no of containerNos) {
        const master = containers.find((c) => c.containerNo === no)
        if (master) {
          await update("containers", master.containerNo, patchContainerOnCancelPickup(master, yard, city))
          containersReverted += 1
        }
      }
      const gates = (await list("gate")) as { id: string; containerNo: string; relatedOrderNo?: string }[]
      for (const g of gates.filter(
        (r) => r.relatedOrderNo === order.orderNo && containerNos.includes(r.containerNo),
      )) {
        await update("gate", g.id, {
          mappingStatus: "异常",
          source: "订单取消回滚",
        })
      }
    }
  }

  await update("orders", order.id, {
    status: nextStatus,
    containerNos: order.status === "提箱中" ? [] : order.containerNos,
  })

  let feeBillNo: string | undefined
  if (!withinFree) {
    const feeBill = isPostPickup
      ? buildPostPickupCancelFeeBill(order, feeRate)
      : buildCancelFeeBill(order)
    const created = (await create("bills", feeBill)) as Bill
    feeBillNo = created.billNo
    const actedAt = nowLocalStr()
    await create("notifications", {
      id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      type: "账单",
      level: "重要",
      title: isPostPickup ? `提箱后取消变更费 · ${order.orderNo}` : `取消费账单 · ${order.orderNo}`,
      desc: isPostPickup
        ? `订单提箱中取消，已生成 ${Math.round(feeRate * 100)}% 变更费账单。`
        : "订单超时取消，已生成变更费账单。",
      module: "M01 账单中心",
      href: "/customer/bills",
      roles: ["R01", "R03"],
      actionable: true,
      read: false,
      createdAt: actedAt,
    })
  }

  return {
    ok: true,
    status: nextStatus,
    withinFree,
    feeBillNo,
    inventoryReverted,
    containersReverted,
  }
}
