/**
 * 调运主路径联动辅助（客户端编排用）
 * 提箱 / 还箱 / 映射时复用时间格式与库存匹配逻辑。
 */

import type { Booking, ContainerMaster, DispatchOrder, GateRecord, InventoryRow } from "../types"
import { nowLocalStr } from "../now-local"

export { nowLocalStr }

/** 从提箱地/堆场名推断城市；可传入堆场列表做精确匹配 */
export function cityFromPlace(place: string, yards?: { name: string; city: string }[]) {
  if (yards?.length) {
    const hit = yards.find((y) => y.name === place)
    if (hit?.city) return hit.city
  }
  return place.replace(/(港|中央)?堆场$/, "").trim() || place
}

/** 按堆场或城市匹配库存行 */
export function findInventoryRow(
  rows: InventoryRow[],
  opts: { yard?: string; city?: string },
): InventoryRow | undefined {
  if (opts.yard) {
    const byYard = rows.find((r) => r.yard === opts.yard)
    if (byYard) return byYard
    // 模糊：短名 ↔ 全名（如历史别名）
    const fuzzy = rows.find(
      (r) =>
        r.yard.includes(opts.yard!) ||
        opts.yard!.includes(r.yard) ||
        (opts.city && r.city === opts.city),
    )
    if (fuzzy) return fuzzy
  }
  if (opts.city) {
    return rows.find((r) => r.city === opts.city || opts.city!.includes(r.city) || r.city.includes(opts.city!))
  }
  return undefined
}

export function inventoryId(row: InventoryRow) {
  return row.id ?? `${row.yard}_${row.city}`
}

/** 出场：在场/可用减少，预计进场(已提未还)增加 */
export function applyPickupInventory(row: InventoryRow, qty: number): Partial<InventoryRow> {
  const onSite = Math.max(0, row.onSite - qty)
  const available = Math.max(0, row.available - qty)
  const reserved = Math.max(0, row.reserved - Math.min(qty, row.reserved))
  return {
    onSite,
    available: Math.min(available, onSite),
    reserved,
    incoming: row.incoming + qty,
  }
}

/** 进场还箱：在场/可用增加，预计进场减少 */
export function applyReturnInventory(row: InventoryRow, qty: number): Partial<InventoryRow> {
  return {
    onSite: row.onSite + qty,
    available: row.available + qty,
    incoming: Math.max(0, row.incoming - qty),
  }
}

/** 用箱订单确认时按分配堆场预占：仅锁定可用量，不动在场/在途（阶段B） */
export function applyReserveInventory(row: InventoryRow, qty: number): Partial<InventoryRow> {
  return {
    reserved: row.reserved + qty,
    available: Math.max(0, row.available - qty),
  }
}

/** 释放预占（订单在提箱前取消） */
export function applyReleaseReserveInventory(row: InventoryRow, qty: number): Partial<InventoryRow> {
  return {
    reserved: Math.max(0, row.reserved - qty),
    available: row.available + qty,
  }
}

/** 用箱订单现场确认放箱/收箱生成的进出场记录 */
export function buildUseBoxGate(
  o: { orderNo: string; quantity: number },
  type: GateRecord["type"],
  yard: string,
  city: string,
  ownership: GateRecord["ownership"] = "自有箱",
  containerNo?: string,
): Omit<GateRecord, "id"> {
  return {
    containerNo: containerNo || `USEBOX${o.orderNo.slice(-6)}x${o.quantity}`,
    type,
    time: nowLocalStr(),
    yard,
    city,
    source: "系统放箱/调运订单",
    relatedOrderNo: o.orderNo,
    mappingStatus: "已映射",
    ownership,
  }
}

/** 提箱堆场可用真实箱（在场、箱型匹配） */
export function listAvailableUseboxContainers(
  containers: ContainerMaster[],
  opts: { yard: string; city: string; containerType: string },
): ContainerMaster[] {
  return containers.filter(
    (c) =>
      !c.deleted &&
      c.status === "在场" &&
      c.type === opts.containerType &&
      (c.currentYard === opts.yard || c.currentCity === opts.city),
  )
}

export function buildPickupGate(
  o: DispatchOrder,
  index: number,
  ownership: GateRecord["ownership"] = "自有箱",
): Omit<GateRecord, "id"> {
  const city = cityFromPlace(o.pickupPlace)
  return {
    containerNo: `TMP${o.dispatchNo.slice(-6)}${String(index).padStart(2, "0")}`,
    type: "出场",
    time: nowLocalStr(),
    yard: o.pickupPlace,
    city,
    source: "系统放箱/调运订单",
    relatedOrderNo: o.dispatchNo,
    mappingStatus: "已映射",
    ownership,
  }
}

export function buildReturnGate(
  containerNo: string,
  app: { returnYard: string; returnCity: string; relatedDispatchNos: string[] },
  ownership: GateRecord["ownership"] = "自有箱",
): Omit<GateRecord, "id"> {
  return {
    containerNo,
    type: "进场",
    time: nowLocalStr(),
    yard: app.returnYard,
    city: app.returnCity,
    source: "系统放箱/调运订单",
    relatedOrderNo: app.relatedDispatchNos[0],
    mappingStatus: "已映射",
    ownership,
  }
}

/** 统计某调运单已预约箱量（提箱预约，用 containerNos 长度或 refNo 关联） */
export function bookedQtyForDispatch(bookings: Booking[], dispatchNo: string) {
  return bookings
    .filter((b) => b.type === "提箱预约" && b.refNo === dispatchNo && b.status !== "超时")
    .reduce((s, b) => s + (b.containerNos?.length || 0), 0)
}

export function buildBatchBooking(
  o: DispatchOrder,
  fromCount: number,
  toCount: number,
): Omit<Booking, "id"> {
  const nos = Array.from({ length: toCount - fromCount }, (_, i) => `RSV${o.dispatchNo.slice(-6)}${String(fromCount + i + 1).padStart(2, "0")}`)
  return {
    bookingNo: `BK${Date.now().toString().slice(-8)}`,
    type: "提箱预约",
    containerNos: nos,
    yard: o.pickupPlace,
    city: cityFromPlace(o.pickupPlace),
    planTime: o.planTime || nowLocalStr(),
    driver: "待指派",
    driverId: "-",
    driverPhone: "-",
    plateNo: "-",
    refNo: o.dispatchNo,
    notifyByEmail: true,
    status: "已通知",
    withinWorkHours: true,
  }
}

export function patchContainerOnPickup(
  c: ContainerMaster,
  orderNo: string,
): Partial<ContainerMaster> {
  return {
    status: "已提未还",
    lastGateTime: nowLocalStr(),
    relatedOrderNo: orderNo,
    storageDays: 0,
  }
}

export function patchContainerOnReturn(
  c: ContainerMaster,
  yard: string,
  city: string,
): Partial<ContainerMaster> {
  return {
    status: "在场",
    currentYard: yard,
    currentCity: city,
    lastGateTime: nowLocalStr(),
    relatedOrderNo: undefined,
  }
}

/** BR-16：改提箱堆场时迁移 reserved */
export function relocateReserved(
  from: InventoryRow,
  to: InventoryRow,
  qty: number,
): { fromPatch: Partial<InventoryRow>; toPatch: Partial<InventoryRow> } {
  const n = Math.max(0, qty)
  return {
    fromPatch: { reserved: Math.max(0, from.reserved - n) },
    toPatch: { reserved: to.reserved + n },
  }
}

/** BR-16：改还箱堆场时迁移 incoming（已提未还口径） */
export function relocateIncoming(
  from: InventoryRow,
  to: InventoryRow,
  qty: number,
): { fromPatch: Partial<InventoryRow>; toPatch: Partial<InventoryRow> } {
  const n = Math.max(0, qty)
  return {
    fromPatch: { incoming: Math.max(0, from.incoming - n) },
    toPatch: { incoming: to.incoming + n },
  }
}
