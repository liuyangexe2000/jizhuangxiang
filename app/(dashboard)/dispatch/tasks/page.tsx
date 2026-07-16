"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { CitySearchSelect } from "@/components/city-search-select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useResource, revalidateResource } from "@/lib/api"
import { useDictionary } from "@/lib/dictionary-context"
import type {
  Booking,
  ContainerMaster,
  DispatchOrder,
  GateRecord,
  InventoryRow,
  ReturnApplication,
} from "@/lib/types"
import {
  applyPickupInventory,
  bookedQtyForDispatch,
  buildBatchBooking,
  buildPickupGate,
  cityFromPlace,
  findInventoryRow,
  inventoryId,
  nowLocalStr,
  patchContainerOnPickup,
  relocateIncoming,
  relocateReserved,
} from "@/lib/domain/dispatch-ops"
import { isWithinWorkHours } from "@/lib/domain/booking-ops"
import { Truck, PackageOpen, CalendarClock, CheckCircle2, PackageCheck, MapPin } from "lucide-react"

function parseReturnScope(scope: string) {
  const first = scope.split(/[/／,，]/).map((s) => s.trim()).filter(Boolean)[0] || scope
  const city = first.replace(/（.*?）/g, "").replace(/(港|中央)?堆场$/, "").trim() || first
  return { city, yard: `${city}堆场` }
}

/** 提箱箱号：优先预约箱号 → 堆场在场箱 → TMP */
function resolvePickupNos(
  o: DispatchOrder,
  delta: number,
  bookings: Booking[],
  containers: ContainerMaster[],
): string[] {
  const city = cityFromPlace(o.pickupPlace)
  const used = new Set(
    containers.filter((c) => c.relatedOrderNo === o.dispatchNo).map((c) => c.containerNo),
  )
  const bookedNos = bookings
    .filter((b) => b.refNo === o.dispatchNo && b.type === "提箱预约" && b.status !== "超时")
    .flatMap((b) => b.containerNos || [])
    .filter((no) => !used.has(no))

  const freeNos = containers
    .filter(
      (c) =>
        c.status === "在场" &&
        !used.has(c.containerNo) &&
        (c.currentYard === o.pickupPlace || c.currentCity === city),
    )
    .map((c) => c.containerNo)

  const selected: string[] = []
  const pool = [...bookedNos, ...freeNos.filter((n) => !bookedNos.includes(n))]
  for (let i = 0; i < delta; i++) {
    if (pool[i]) {
      selected.push(pool[i])
    } else {
      selected.push(`TMP${o.dispatchNo.slice(-6)}${String(o.pickedCount + i + 1).padStart(2, "0")}`)
    }
  }
  return selected
}

type ReturnCandidate = { containerNo: string; dispatchNo: string }

function collectReturnCandidates(
  tasks: DispatchOrder[],
  carrier: string,
  bookings: Booking[],
  containers: ContainerMaster[],
): ReturnCandidate[] {
  const sameCarrier = tasks.filter(
    (o) =>
      o.carrier === carrier &&
      (o.status === "还箱中" || (o.pickedCount > 0 && o.status !== "已结束")),
  )
  const list: ReturnCandidate[] = []
  const seen = new Set<string>()
  for (const o of sameCarrier) {
    const related = containers
      .filter((c) => c.relatedOrderNo === o.dispatchNo && c.status === "已提未还")
      .map((c) => c.containerNo)
    const booked = bookings
      .filter((b) => b.refNo === o.dispatchNo && b.status !== "超时")
      .flatMap((b) => b.containerNos || [])
    const need = Math.max(0, o.pickedCount - o.returnedCount)
    const pool = [...new Set([...related, ...booked])]
    const selected = pool.slice(0, need)
    while (selected.length < need) {
      selected.push(`TMP${o.dispatchNo.slice(-6)}R${String(selected.length + 1).padStart(2, "0")}`)
    }
    for (const no of selected) {
      if (seen.has(no)) continue
      seen.add(no)
      list.push({ containerNo: no, dispatchNo: o.dispatchNo })
    }
  }
  return list
}

export default function TasksPage() {
  const { returnCities } = useDictionary()
  const { data: orders, update } = useResource<DispatchOrder>("dispatch")
  const { data: bookings, create: createBooking } = useResource<Booking>("bookings")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { create: createGate } = useResource<GateRecord>("gate")
  const { data: containers, update: updateContainer } = useResource<ContainerMaster>("containers")
  const { create: createReturn } = useResource<ReturnApplication>("returns")

  const [returnOpen, setReturnOpen] = useState(false)
  const [returnCarrier, setReturnCarrier] = useState("")
  const [returnCity, setReturnCity] = useState("")
  const [returnYard, setReturnYard] = useState("")
  const [selectedNos, setSelectedNos] = useState<Set<string>>(new Set())

  const [yardTarget, setYardTarget] = useState<DispatchOrder | null>(null)
  const [pickupYardEdit, setPickupYardEdit] = useState("")
  const [returnYardEdit, setReturnYardEdit] = useState("")

  const tasks = orders.filter((o) =>
    ["已下发", "提箱中", "还箱中", "已结束"].includes(o.status),
  )

  const active = tasks.filter((o) => o.status !== "已结束").length
  const totalBoxes = tasks.reduce((s, o) => s + o.quantity, 0)
  const pickedBoxes = tasks.reduce((s, o) => s + o.pickedCount, 0)

  const bookedOf = (o: DispatchOrder) => Math.max(bookedQtyForDispatch(bookings, o.dispatchNo), o.pickedCount)

  const returnCandidates = useMemo(
    () => (returnCarrier ? collectReturnCandidates(tasks, returnCarrier, bookings, containers) : []),
    [returnCarrier, tasks, bookings, containers],
  )

  function openReturnDialog(o: DispatchOrder) {
    const { city, yard } = parseReturnScope(o.returnScope)
    setReturnCarrier(o.carrier)
    setReturnCity(city)
    setReturnYard(yard)
    const cands = collectReturnCandidates(tasks, o.carrier, bookings, containers)
    const mine = cands.filter((c) => c.dispatchNo === o.dispatchNo).map((c) => c.containerNo)
    setSelectedNos(new Set(mine))
    setReturnOpen(true)
  }

  function toggleNo(no: string) {
    setSelectedNos((prev) => {
      const next = new Set(prev)
      if (next.has(no)) next.delete(no)
      else next.add(no)
      return next
    })
  }

  async function submitReturn() {
    const nos = [...selectedNos]
    if (!returnCity.trim() || !returnYard.trim()) {
      toast.error("请填写还箱城市与堆场")
      return
    }
    if (nos.length === 0) {
      toast.error("请至少勾选一个还箱箱号")
      return
    }
    const relatedDispatchNos = [
      ...new Set(
        returnCandidates.filter((c) => selectedNos.has(c.containerNo)).map((c) => c.dispatchNo),
      ),
    ]
    const applyNo = `RA${nowLocalStr().replace(/\D/g, "").slice(0, 12)}`
    try {
      await createReturn({
        applyNo,
        carrier: returnCarrier,
        containerNos: nos,
        relatedDispatchNos,
        returnCity: returnCity.trim(),
        returnYard: returnYard.trim(),
        appliedAt: nowLocalStr(),
        status: "待审核",
        __auditAction: "新增",
        __auditDetail: `跨单还箱申请 ${applyNo} · ${relatedDispatchNos.join(",")}`,
      })
      await revalidateResource("returns")
      toast.success(`还箱申请 ${applyNo} 已提交（${relatedDispatchNos.length} 个调运单）`)
      setReturnOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function bookBatch(o: DispatchOrder) {
    const cur = bookedOf(o)
    if (cur >= o.quantity) {
      toast.info(`${o.dispatchNo} 已完成全部预约`)
      return
    }
    const next = Math.min(cur + Math.ceil(o.quantity / 3), o.quantity)
    try {
      const draft = buildBatchBooking(o, cur, next)
      const within = isWithinWorkHours(draft.planTime)
      await createBooking({
        ...draft,
        withinWorkHours: within,
        __auditAction: "新增",
        __auditDetail: `分批预约 ${o.dispatchNo}：${cur}→${next} 箱`,
      })
      await revalidateResource("bookings")
      toast.success(
        next >= o.quantity
          ? `${o.dispatchNo} 已完成全部 ${o.quantity} 箱预约，可执行提箱`
          : `${o.dispatchNo} 已预约 ${next}/${o.quantity} 箱（支持继续分批预约）`,
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function pickOne(o: DispatchOrder) {
    if (bookedOf(o) < o.quantity) {
      toast.error(`${o.dispatchNo} 尚未完成全部集装箱预约，无法提箱（BR-13）`)
      return
    }
    const delta = 1
    const picked = Math.min(o.quantity, o.pickedCount + delta)
    const status: DispatchOrder["status"] = picked >= o.quantity ? "还箱中" : "提箱中"
    const nos = resolvePickupNos(o, delta, bookings, containers)
    try {
      await update(o.id, {
        pickedCount: picked,
        status,
        __auditAction: "修改",
        __auditDetail: `提箱进度 ${o.dispatchNo} → ${picked}/${o.quantity}`,
      })
      for (let i = 0; i < nos.length; i++) {
        const gate = buildPickupGate(o, o.pickedCount + i + 1)
        await createGate({
          ...gate,
          containerNo: nos[i],
          __auditAction: "新增",
          __auditDetail: `调运出场 ${nos[i]}`,
        })
        const master = containers.find((c) => c.containerNo === nos[i])
        if (master) {
          await updateContainer(master.containerNo, {
            ...patchContainerOnPickup(master, o.dispatchNo),
            __auditAction: "修改",
            __auditDetail: `提箱占用 ${nos[i]}`,
          })
        }
      }
      const inv = findInventoryRow(inventory, { yard: o.pickupPlace, city: cityFromPlace(o.pickupPlace) })
      if (inv) {
        await updateInventory(inventoryId(inv), {
          ...applyPickupInventory(inv, delta),
          __auditAction: "修改",
          __auditDetail: `提箱扣减库存 ${o.pickupPlace}`,
        })
      } else {
        toast.warning(`未找到提箱地「${o.pickupPlace}」对应库存台账，已记出场未扣库存`)
      }
      await Promise.all([
        revalidateResource("dispatch"),
        revalidateResource("gate"),
        revalidateResource("inventory"),
        revalidateResource("containers"),
      ])
      toast.success(`${o.dispatchNo} 提箱进度已更新，并同步出场与库存`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function openYardDialog(o: DispatchOrder) {
    setYardTarget(o)
    setPickupYardEdit(o.pickupPlace)
    const { yard } = parseReturnScope(o.returnScope)
    setReturnYardEdit(yard)
  }

  async function saveYardChange() {
    if (!yardTarget) return
    const o = yardTarget
    const newPickup = pickupYardEdit.trim()
    const newReturnYard = returnYardEdit.trim()
    if (!newPickup || !newReturnYard) {
      toast.error("提箱堆场与还箱堆场不能为空")
      return
    }
    try {
      const qtyOpen = Math.max(0, o.quantity - o.pickedCount)
      const qtyInTransit = Math.max(0, o.pickedCount - o.returnedCount)

      if (newPickup !== o.pickupPlace && qtyOpen > 0) {
        const from = findInventoryRow(inventory, { yard: o.pickupPlace, city: cityFromPlace(o.pickupPlace) })
        const to = findInventoryRow(inventory, { yard: newPickup, city: cityFromPlace(newPickup) })
        if (from && to && inventoryId(from) !== inventoryId(to)) {
          const { fromPatch, toPatch } = relocateReserved(from, to, qtyOpen)
          await updateInventory(inventoryId(from), {
            ...fromPatch,
            __auditAction: "修改",
            __auditDetail: `改提箱堆场迁出 reserved ${o.dispatchNo}`,
          })
          await updateInventory(inventoryId(to), {
            ...toPatch,
            __auditAction: "修改",
            __auditDetail: `改提箱堆场迁入 reserved ${o.dispatchNo}`,
          })
        }
      }

      const oldReturn = parseReturnScope(o.returnScope).yard
      if (newReturnYard !== oldReturn && qtyInTransit > 0) {
        const from = findInventoryRow(inventory, { yard: oldReturn, city: cityFromPlace(oldReturn) })
        const to = findInventoryRow(inventory, { yard: newReturnYard, city: cityFromPlace(newReturnYard) })
        if (from && to && inventoryId(from) !== inventoryId(to)) {
          const { fromPatch, toPatch } = relocateIncoming(from, to, qtyInTransit)
          await updateInventory(inventoryId(from), {
            ...fromPatch,
            __auditAction: "修改",
            __auditDetail: `改还箱堆场迁出 incoming ${o.dispatchNo}`,
          })
          await updateInventory(inventoryId(to), {
            ...toPatch,
            __auditAction: "修改",
            __auditDetail: `改还箱堆场迁入 incoming ${o.dispatchNo}`,
          })
        }
      }

      await update(o.id, {
        pickupPlace: newPickup,
        returnScope: newReturnYard.includes("/") ? o.returnScope : newReturnYard,
        __auditAction: "修改",
        __auditDetail: `BR-16 改堆场 ${o.dispatchNo}：提 ${newPickup} / 还 ${newReturnYard}`,
      })
      await Promise.all([revalidateResource("dispatch"), revalidateResource("inventory")])
      toast.success("堆场已更新并联动库存分桶")
      setYardTarget(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const canApplyReturn = (o: DispatchOrder) =>
    o.status === "还箱中" || (o.pickedCount >= o.quantity && o.status !== "已结束" && o.pickedCount > 0)

  return (
    <>
      <PageHeader
        module="M02 · 核心业务与调运管理系统"
        title="承运任务"
        description="M02-F03 任务下发与提箱执行 — 支持跨调运单勾选还箱；执行中可改提还箱堆场并联动库存。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="执行中任务" value={active} icon={Truck} tone="primary" />
        <StatCard label="调运总箱量" value={totalBoxes} unit="箱" icon={PackageOpen} tone="warning" />
        <StatCard
          label="已提箱进度"
          value={`${totalBoxes ? Math.round((pickedBoxes / totalBoxes) * 100) : 0}%`}
          icon={CheckCircle2}
          tone="success"
          hint={`${pickedBoxes}/${totalBoxes} 箱`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {tasks.map((o) => {
          const pct = Math.round((o.pickedCount / o.quantity) * 100)
          const bk = bookedOf(o)
          const bkPct = Math.round((bk / o.quantity) * 100)
          const fullyBooked = bk >= o.quantity
          return (
            <Card key={o.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="font-mono">{o.dispatchNo}</span>
                    <StatusBadge status={o.status} />
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{o.carrier}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="提箱地" value={o.pickupPlace} />
                  <Info label="还箱范围" value={o.returnScope} />
                  <Info label="计划时间" value={o.planTime} />
                  <Info label="用箱期" value={`${o.useTerm} 天`} />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">预约进度（BR-13 需全部预约）</span>
                    <span className="font-medium">
                      {bk}/{o.quantity} 箱 · {bkPct}%
                      {fullyBooked && <span className="ml-1 text-success">已满额</span>}
                    </span>
                  </div>
                  <Progress value={bkPct} />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">提箱进度</span>
                    <span className="font-medium">{o.pickedCount}/{o.quantity} 箱 · {pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  {o.status !== "已结束" && !fullyBooked && (
                    <Button size="sm" variant="outline" onClick={() => bookBatch(o)}>
                      <CalendarClock className="mr-1 size-3.5" />
                      分批预约
                    </Button>
                  )}
                  {o.status !== "已结束" && (
                    <Button size="sm" variant="outline" onClick={() => openYardDialog(o)}>
                      <MapPin className="mr-1 size-3.5" />
                      改堆场
                    </Button>
                  )}
                  {o.status !== "已结束" && o.pickedCount < o.quantity && (
                    <Button size="sm" disabled={!fullyBooked} onClick={() => pickOne(o)}>
                      <PackageOpen className="mr-1 size-3.5" />
                      更新提箱
                    </Button>
                  )}
                  {canApplyReturn(o) && (
                    <Button size="sm" variant="secondary" onClick={() => openReturnDialog(o)}>
                      <PackageCheck className="mr-1 size-3.5" />
                      发起还箱申请
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={returnOpen} onOpenChange={(open) => !open && setReturnOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>发起还箱申请（可跨调运单）</DialogTitle>
            <DialogDescription>
              承运商 {returnCarrier} · 勾选同承运商下已提未还箱号
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="returnCity">还箱城市</Label>
              <CitySearchSelect
                id="returnCity"
                value={returnCity}
                onValueChange={setReturnCity}
                cities={returnCities}
                placeholder="选择还箱城市"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="returnYard">还箱堆场</Label>
              <Input id="returnYard" value={returnYard} onChange={(e) => setReturnYard(e.target.value)} />
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
              {returnCandidates.map((c) => (
                <label key={`${c.dispatchNo}-${c.containerNo}`} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedNos.has(c.containerNo)}
                    onCheckedChange={() => toggleNo(c.containerNo)}
                  />
                  <span className="font-mono text-xs">{c.containerNo}</span>
                  <span className="text-xs text-muted-foreground">{c.dispatchNo}</span>
                </label>
              ))}
              {returnCandidates.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">暂无可还箱号</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>
              取消
            </Button>
            <Button onClick={submitReturn}>提交申请</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!yardTarget} onOpenChange={(open) => !open && setYardTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>变更提还箱堆场（BR-16）</DialogTitle>
            <DialogDescription>调运单 {yardTarget?.dispatchNo} · 将同步调整库存 reserved/incoming</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>提箱堆场</Label>
              <Input value={pickupYardEdit} onChange={(e) => setPickupYardEdit(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>还箱堆场</Label>
              <Input value={returnYardEdit} onChange={(e) => setReturnYardEdit(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYardTarget(null)}>
              取消
            </Button>
            <Button onClick={saveYardChange}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  )
}
