import type {
  Booking,
  ContainerMaster,
  DispatchOrder,
  GateRecord,
  RepairOrder,
  ReturnApplication,
  SupplyContract,
  UseBoxOrder,
} from "@/lib/types"
import {
  type LifecycleEvent,
  latestEventAt,
  sortEventsDesc,
} from "@/lib/domain/lifecycle-types"

export type ContainerLifecycleInput = {
  containerNo: string
  master?: ContainerMaster | null
  gate: GateRecord[]
  repair: RepairOrder[]
  returns: ReturnApplication[]
  bookings: Booking[]
  dispatch: DispatchOrder[]
  orders: UseBoxOrder[]
  supplyContracts: SupplyContract[]
}

export type RelatedDoc = {
  kind: "dispatch" | "order" | "supply" | "repair" | "return"
  no: string
  label: string
  href: string
  status?: string
}

export type ContainerLifecycle = {
  containerNo: string
  master: ContainerMaster | null
  isPlaceholder: boolean
  placeholderNote?: string
  gate: GateRecord[]
  repair: RepairOrder[]
  returns: ReturnApplication[]
  bookings: Booking[]
  relatedDocs: RelatedDoc[]
  events: LifecycleEvent[]
  lastActivityAt?: string
}

function isUseboxPlaceholder(no: string): boolean {
  const u = no.toUpperCase()
  return u.startsWith("USEBOX") || u.startsWith("PEND-") || u.startsWith("ORD") || u.startsWith("RSV")
}

export function getContainerLifecycle(input: ContainerLifecycleInput): ContainerLifecycle {
  const containerNo = input.containerNo.trim()
  const master = input.master ?? null
  const isPlaceholder = !master && isUseboxPlaceholder(containerNo)

  const gate = input.gate.filter((g) => g.containerNo === containerNo)
  const repair = input.repair.filter((r) => r.containerNo === containerNo)
  const returns = input.returns.filter((r) => r.containerNos.includes(containerNo))
  const bookings = input.bookings.filter((b) => b.containerNos.includes(containerNo))

  const relatedNos = new Set<string>()
  if (master?.relatedOrderNo) relatedNos.add(master.relatedOrderNo)
  for (const g of gate) {
    if (g.relatedOrderNo) relatedNos.add(g.relatedOrderNo)
  }
  for (const o of input.orders) {
    if (o.containerNos?.some((n) => n === containerNo)) relatedNos.add(o.orderNo)
  }
  for (const r of returns) {
    for (const d of r.relatedDispatchNos) relatedNos.add(d)
  }
  for (const b of bookings) {
    if (b.refNo) relatedNos.add(b.refNo)
  }
  for (const r of repair) {
    relatedNos.add(r.repairNo)
  }

  const relatedDocs: RelatedDoc[] = []
  const seen = new Set<string>()

  function pushDoc(doc: RelatedDoc) {
    const key = `${doc.kind}:${doc.no}`
    if (seen.has(key)) return
    seen.add(key)
    relatedDocs.push(doc)
  }

  for (const no of relatedNos) {
    const d = input.dispatch.find((x) => x.dispatchNo === no)
    if (d) {
      pushDoc({
        kind: "dispatch",
        no: d.dispatchNo,
        label: `调运 ${d.pickupPlace}→${d.returnScope}`,
        href: "/dispatch/tasks",
        status: d.status,
      })
    }
    const o = input.orders.find((x) => x.orderNo === no)
    if (o) {
      pushDoc({
        kind: "order",
        no: o.orderNo,
        label: `用箱 ${o.customer} · ${o.containerType}×${o.quantity}`,
        href: "/operations/usebox",
        status: o.status,
      })
    }
    const s = input.supplyContracts.find((x) => x.contractNo === no)
    if (s) {
      pushDoc({
        kind: "supply",
        no: s.contractNo,
        label: `供应合同 ${s.supplier} · ${s.type}`,
        href: "/supply/contracts",
        status: s.status,
      })
    }
  }

  for (const r of repair) {
    pushDoc({
      kind: "repair",
      no: r.repairNo,
      label: `修箱 ${r.level} · ${r.yard}`,
      href: "/repair/orders",
      status: r.status,
    })
  }
  for (const r of returns) {
    pushDoc({
      kind: "return",
      no: r.applyNo,
      label: `还箱申请 → ${r.returnCity} ${r.returnYard}`,
      href: "/dispatch/returns",
      status: r.status,
    })
  }

  const events: LifecycleEvent[] = []

  for (const g of gate) {
    const supplyHit = g.relatedOrderNo
      ? input.supplyContracts.find((x) => x.contractNo === g.relatedOrderNo)
      : undefined
    if (g.type === "进场" && supplyHit) {
      events.push({
        id: `supply-in-${g.id}`,
        at: g.time,
        kind: "SUPPLY_IN",
        title: "供应到箱进场",
        summary: `${g.city} ${g.yard} · 合同 ${supplyHit.contractNo}`,
        href: "/supply/contracts",
        refNo: supplyHit.contractNo,
      })
    } else {
      events.push({
        id: `gate-${g.id}`,
        at: g.time,
        kind: g.type === "出场" ? "GATE_OUT" : "GATE_IN",
        title: g.type === "出场" ? "出场" : "进场",
        summary: `${g.city} ${g.yard} · ${g.source}${g.relatedOrderNo ? ` · ${g.relatedOrderNo}` : ""} · ${g.mappingStatus}`,
        href: "/inventory/gate",
        refNo: g.relatedOrderNo,
      })
    }
  }

  for (const r of repair) {
    events.push({
      id: `repair-open-${r.id}`,
      at: r.reportedAt,
      kind: "REPAIR_OPEN",
      title: "修箱工单开立",
      summary: `${r.repairNo} · ${r.level} · ${r.status} · ${r.damageDesc}`,
      href: "/repair/orders",
      refNo: r.repairNo,
    })
    if (r.finishedAt) {
      events.push({
        id: `repair-done-${r.id}`,
        at: r.finishedAt,
        kind: r.status === "已报废" ? "SCRAP" : "REPAIR_DONE",
        title: r.status === "已报废" ? "集装箱报废" : "修箱完工/验收",
        summary: `${r.repairNo} · ${r.status}${r.actualCost != null ? ` · 费用 ¥${r.actualCost}` : ""}`,
        href: "/repair/orders",
        refNo: r.repairNo,
      })
    }
  }

  for (const r of returns) {
    events.push({
      id: `return-apply-${r.id}`,
      at: r.appliedAt,
      kind: "RETURN_APPLY",
      title: "还箱申请",
      summary: `${r.applyNo} · ${r.returnCity} ${r.returnYard} · ${r.status}`,
      href: "/dispatch/returns",
      refNo: r.applyNo,
    })
    if (r.status === "已通过" || r.status === "已驳回") {
      events.push({
        id: `return-review-${r.id}`,
        at: r.appliedAt,
        kind: r.status === "已通过" ? "RETURN_APPROVED" : "RETURN_REJECTED",
        title: r.status === "已通过" ? "还箱申请通过" : "还箱申请驳回",
        summary: `${r.applyNo}${r.reviewer ? ` · 审核人 ${r.reviewer}` : ""}${r.rejectReason ? ` · ${r.rejectReason}` : ""}`,
        href: "/dispatch/returns",
        refNo: r.applyNo,
      })
    }
  }

  for (const b of bookings) {
    events.push({
      id: `booking-${b.id}`,
      at: b.confirmedAt || b.planTime,
      kind: b.type === "提箱预约" ? "BOOKING_PICKUP" : "BOOKING_RETURN",
      title: b.type,
      summary: `${b.bookingNo} · ${b.yard} · ${b.status} · 计划 ${b.planTime}`,
      href: "/yard/bookings",
      refNo: b.bookingNo,
    })
  }

  if (master?.createTime) {
    events.push({
      id: `master-create-${master.containerNo}`,
      at: master.createTime,
      kind: "MASTER_CREATED",
      title: "集装箱主档建档",
      summary: `${master.type} · ${master.ownership} · ${master.currentCity} ${master.currentYard}`,
      href: `/inventory/containers/${encodeURIComponent(master.containerNo)}`,
      refNo: master.containerNo,
    })
  }

  const sorted = sortEventsDesc(events)

  return {
    containerNo,
    master,
    isPlaceholder,
    placeholderNote: isPlaceholder
      ? "当前箱号为用箱/预约占位箱号，非实体集装箱主档；轨迹仅来自进出场等关联记录。"
      : undefined,
    gate,
    repair,
    returns,
    bookings,
    relatedDocs,
    events: sorted,
    lastActivityAt: latestEventAt(sorted) || master?.lastGateTime,
  }
}
