"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarClock, CheckCircle2, FileText, MapPin, MoreHorizontal, Printer, Search, Upload, Wrench } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { OrderPickupDocument, OrderReturnDocument } from "@/components/order-document"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useResource, revalidateResource } from "@/lib/api"
import { getFieldValue, useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import { usePublicSettings } from "@/lib/settings-client"
import { buildOrderBooking, returnProofOverdueList, shouldReleaseDoc } from "@/lib/domain/order-ops"
import { isWithinWorkHours } from "@/lib/domain/booking-ops"
import { cityFromPlace, findInventoryRow, inventoryId, nowLocalStr, relocateIncoming, relocateReserved } from "@/lib/domain/dispatch-ops"
import { pushNotification } from "@/lib/domain/notify"
import type { AttachmentMeta, Booking, DocTemplate, InventoryRow, Notification, RepairOrder, UseBoxOrder } from "@/lib/types"

type Phase = "pickup" | "return"
const pickupStates = ["已确认", "提箱中", "已提箱", "还箱中", "已完成"]
const returnStates = ["提箱中", "已提箱", "还箱中", "已完成"]

function includesKeyword(order: UseBoxOrder, keyword: string) {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  return [order.orderNo, order.customer, order.pickupCity, order.returnCity, order.pickupYard, order.returnYard]
    .filter(Boolean)
    .some((item) => item!.toLowerCase().includes(q))
}

function toInputTime(time: string) {
  return time.replace(" ", "T").slice(0, 16)
}

export default function DocumentsPage() {
  const { roleId } = useRole()
  const isYardAdmin = roleId === "R01" || roleId === "R00"
  const canExecuteGate = roleId === "R00" || roleId === "R01" || roleId === "R04" || roleId === "R06"
  const { settings } = usePublicSettings()
  const { data: orders, update: updateOrder } = useResource<UseBoxOrder>("orders")
  const { data: bookings, create: createBooking } = useResource<Booking>("bookings")
  const { data: notifications, create: createNotification } = useResource<Notification>("notifications")
  const { data: templates } = useResource<DocTemplate>("templates")
  const { data: attachments, create: createAttachment } = useResource<AttachmentMeta>("attachments")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { create: createRepair } = useResource<RepairOrder>("repair")

  const [keyword, setKeyword] = useState("")
  const [conditionTarget, setConditionTarget] = useState<{ order: UseBoxOrder; phase: Phase } | null>(null)
  const [conditionCheck, setConditionCheck] = useState<"通过" | "异常">("通过")
  const [conditionNote, setConditionNote] = useState("")
  const [yardTarget, setYardTarget] = useState<UseBoxOrder | null>(null)
  const [pickupYard, setPickupYard] = useState("")
  const [returnYard, setReturnYard] = useState("")
  const [printTarget, setPrintTarget] = useState<{ order: UseBoxOrder; phase: Phase } | null>(null)
  const [bookingTarget, setBookingTarget] = useState<{ order: UseBoxOrder; phase: Phase } | null>(null)
  const [bookingTime, setBookingTime] = useState(toInputTime(nowLocalStr()))

  const overdueProofs = useMemo(
    () => returnProofOverdueList(orders, settings?.returnProofOverdueDays ?? 3),
    [orders, settings?.returnProofOverdueDays],
  )

  useEffect(() => {
    const notified = new Set(notifications.map((n) => n.title))
    const pending = overdueProofs.filter((order) => !notified.has("还箱证明逾期 · " + order.orderNo))
    if (!pending.length) return
    void Promise.all(
      pending.map((order) =>
        pushNotification(createNotification, {
          type: "时限提醒",
          level: "重要",
          title: "还箱证明逾期 · " + order.orderNo,
          desc: "该订单还箱证明已超期未上传，请尽快补传。",
          module: "M01 提还箱作业",
          href: "/customer/documents",
          roles: ["R01", "R03"],
        }),
      ),
    ).then(() => void revalidateResource("notifications"))
  }, [overdueProofs, notifications, createNotification])

  const pickupRows = useMemo(
    () => orders.filter((o) => pickupStates.includes(o.status) && includesKeyword(o, keyword)),
    [orders, keyword],
  )
  const returnRows = useMemo(
    () => orders.filter((o) => returnStates.includes(o.status) && includesKeyword(o, keyword)),
    [orders, keyword],
  )
  const pickupList = useListQuery({
    data: pickupRows,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
    getSortValue: (o, key) => getFieldValue(o, key),
  })
  const returnList = useListQuery({
    data: returnRows,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
    getSortValue: (o, key) => getFieldValue(o, key),
  })

  function openCondition(order: UseBoxOrder, phase: Phase) {
    setConditionTarget({ order, phase })
    setConditionCheck("通过")
    setConditionNote("")
  }

  async function markStuffingAfterCondition(order: UseBoxOrder, failed: boolean) {
    try {
      if (failed) {
        await updateOrder(order.id, {
          conditionCheck: "异常",
          conditionNote: conditionNote || "提箱箱况异常",
          __auditAction: "修改",
          __auditDetail: order.orderNo + " 箱况异常",
        })
        await createRepair({
          repairNo: "RP" + Date.now().toString().slice(-8),
          containerNo: "PEND-" + order.orderNo.slice(-6),
          containerType: order.containerType,
          ownership: "自有箱",
          yard: order.pickupYard || order.pickupCity + "堆场",
          city: order.pickupCity,
          damageDesc: conditionNote || "提箱箱况异常",
          level: "小修",
          vendor: "待指派",
          estCost: 0,
          reportedBy: "现场确认",
          reportedAt: nowLocalStr(),
          status: "待报修",
          __auditAction: "新增",
          __auditDetail: order.orderNo + " 箱况异常挂修",
        })
        await pushNotification(createNotification, {
          type: "系统",
          level: "紧急",
          title: "提箱箱况异常 · " + order.orderNo,
          desc: "现场反馈箱况异常，请跟进。",
          module: "M01 提还箱作业",
          href: "/repair/orders",
          roles: ["R01", "R04"],
        })
        toast.warning("已记录箱况异常并创建修箱工单")
      } else {
        await updateOrder(order.id, {
          conditionCheck: "通过",
          conditionNote: conditionNote || undefined,
          stuffingListUploaded: true,
          __auditAction: "修改",
          __auditDetail: order.orderNo + " 随箱资料已上传",
        })
        await createAttachment({
          refType: "stuffing_list",
          refNo: order.orderNo,
          fileName: "stuffing_" + order.orderNo + ".pdf",
          mime: "application/pdf",
          size: 0,
          uploadedBy: "当前用户",
          uploadedAt: nowLocalStr(),
          __auditAction: "新增",
          __auditDetail: order.orderNo + " stuffing list",
        })
        toast.success("随箱资料已登记，请等待现场确认放箱")
      }
      await Promise.all([
        revalidateResource("orders"),
        revalidateResource("repair"),
        revalidateResource("notifications"),
        revalidateResource("attachments"),
      ])
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function markReturnProof(order: UseBoxOrder) {
    try {
      await createAttachment({
        refType: "return_proof",
        refNo: order.orderNo,
        fileName: "return_proof_" + order.orderNo + ".pdf",
        mime: "application/pdf",
        size: 0,
        uploadedBy: "当前用户",
        uploadedAt: nowLocalStr(),
        __auditAction: "新增",
        __auditDetail: order.orderNo + " 还箱证明",
      })
      await updateOrder(order.id, {
        returnProofUploaded: true,
        __auditAction: "修改",
        __auditDetail: order.orderNo + " 还箱证明已上传",
      })
      await Promise.all([revalidateResource("attachments"), revalidateResource("orders")])
      toast.success("还箱证明已登记，请等待现场确认收箱")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function submitGateConfirm() {
    if (!conditionTarget) return
    const { order, phase } = conditionTarget
    try {
      const path = phase === "pickup" ? "confirm-pickup" : "confirm-return"
      const response = await fetch(
        "/api/orders/" + encodeURIComponent(order.id) + "/" + path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conditionCheck, conditionNote: conditionNote || undefined }),
        },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "确认失败")
      await Promise.all([
        revalidateResource("orders"),
        revalidateResource("inventory"),
        revalidateResource("gate"),
        revalidateResource("repair"),
        revalidateResource("notifications"),
      ])
      toast.success(phase === "pickup" ? "已确认放箱" : "已确认收箱")
      setConditionTarget(null)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  function openYardDialog(order: UseBoxOrder) {
    setYardTarget(order)
    setPickupYard(order.pickupYard || order.pickupCity + "堆场")
    setReturnYard(order.returnYard || order.returnCity + "堆场")
  }

  async function saveOrderYard() {
    if (!yardTarget || !pickupYard.trim() || !returnYard.trim()) {
      toast.error("提还箱堆场不能为空")
      return
    }
    const order = yardTarget
    try {
      const openQty = ["已确认", "提箱中"].includes(order.status) && !order.stuffingListUploaded ? order.quantity : 0
      const transitQty = ["提箱中", "已提箱", "还箱中"].includes(order.status) ? order.quantity : 0
      const oldPickup = findInventoryRow(inventory, { yard: order.pickupYard, city: order.pickupCity })
      const newPickup = findInventoryRow(inventory, { yard: pickupYard, city: cityFromPlace(pickupYard) })
      if (oldPickup && newPickup && inventoryId(oldPickup) !== inventoryId(newPickup) && openQty) {
        const move = relocateReserved(oldPickup, newPickup, openQty)
        await updateInventory(inventoryId(oldPickup), { ...move.fromPatch, __auditAction: "修改", __auditDetail: "BR-16 提箱堆场迁出" })
        await updateInventory(inventoryId(newPickup), { ...move.toPatch, __auditAction: "修改", __auditDetail: "BR-16 提箱堆场迁入" })
      }
      const oldReturn = findInventoryRow(inventory, { yard: order.returnYard, city: order.returnCity })
      const newReturn = findInventoryRow(inventory, { yard: returnYard, city: cityFromPlace(returnYard) })
      if (oldReturn && newReturn && inventoryId(oldReturn) !== inventoryId(newReturn) && transitQty) {
        const move = relocateIncoming(oldReturn, newReturn, transitQty)
        await updateInventory(inventoryId(oldReturn), { ...move.fromPatch, __auditAction: "修改", __auditDetail: "BR-16 还箱堆场迁出" })
        await updateInventory(inventoryId(newReturn), { ...move.toPatch, __auditAction: "修改", __auditDetail: "BR-16 还箱堆场迁入" })
      }
      await updateOrder(order.id, {
        pickupYard: pickupYard.trim(),
        returnYard: returnYard.trim(),
        pickupCity: cityFromPlace(pickupYard) || order.pickupCity,
        returnCity: cityFromPlace(returnYard) || order.returnCity,
        __auditAction: "修改",
        __auditDetail: "BR-16 订单改堆场 " + order.orderNo,
      })
      await Promise.all([revalidateResource("orders"), revalidateResource("inventory")])
      setYardTarget(null)
      toast.success("堆场已更新并联动库存")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function bookYard() {
    if (!bookingTarget) return
    const { order, phase } = bookingTarget
    const planTime = bookingTime.replace("T", " ")
    if (!isWithinWorkHours(planTime, settings?.workHours)) {
      toast.error("计划时间不在堆场工作时段")
      return
    }
    const planned = Date.parse(planTime.replace(/-/g, "/"))
    if (phase === "return" && planned - Date.now() < (settings?.returnBookingLeadHours ?? 24) * 3600000) {
      toast.error("还箱预约须至少提前 24 小时")
      return
    }
    const type = phase === "pickup" ? "提箱预约" : "还箱预约"
    if (bookings.some((b) => b.refNo === order.orderNo && b.type === type)) {
      toast.info("该订单已有" + type + "记录")
      return
    }
    try {
      const draft = buildOrderBooking(order)
      const yard =
        phase === "pickup"
          ? order.pickupYard || order.pickupCity + "堆场"
          : order.returnYard || order.returnCity + "堆场"
      await createBooking({
        ...draft,
        type,
        yard,
        city: phase === "pickup" ? order.pickupCity : order.returnCity,
        planTime,
        withinWorkHours: true,
        status: "待发送",
        __auditAction: "新增",
        __auditDetail: type + " " + order.orderNo,
      })
      await revalidateResource("bookings")
      setBookingTarget(null)
      toast.success("堆场预约已创建")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const pickupTemplate = templates.find((t) => t.enabled && (t.code === "RELEASE_ORDER" || t.name.includes("提箱") || t.scene.includes("提箱")))
  const returnTemplate = templates.find((t) => t.enabled && (t.code === "REDELIVERY_ORDER" || t.name.includes("还箱") || t.scene.includes("还箱")))
  const attachmentCount = (order: UseBoxOrder) => attachments.filter((a) => a.refNo === order.orderNo).length

  return (
    <div className="space-y-6">
      <PageHeader
        module="M01 · 客户服务与订舱协同门户"
        title="提还箱作业"
        description="提还箱单据、堆场预约、现场确认与还箱证明协同。"
      />
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索订单号 / 客户 / 城市 / 堆场"
            />
          </div>
        </CardContent>
      </Card>
      <Tabs defaultValue="pickup">
        <TabsList>
          <TabsTrigger value="pickup">提箱作业（{pickupList.total}）</TabsTrigger>
          <TabsTrigger value="return">还箱作业（{returnList.total}）</TabsTrigger>
        </TabsList>
        <TabsContent value="pickup">
          <StepCards phase="pickup" />
          <WorkTable
            phase="pickup"
            rows={pickupList.rows}
            list={pickupList}
            attachmentCount={attachmentCount}
            canExecuteGate={canExecuteGate}
            isYardAdmin={isYardAdmin}
            onCondition={openCondition}
            onBook={(o) => {
              setBookingTarget({ order: o, phase: "pickup" })
              setBookingTime(toInputTime(nowLocalStr()))
            }}
            onYard={openYardDialog}
            onPrint={(o) => setPrintTarget({ order: o, phase: "pickup" })}
            onProof={markStuffingAfterCondition}
          />
        </TabsContent>
        <TabsContent value="return">
          <StepCards phase="return" />
          <WorkTable
            phase="return"
            rows={returnList.rows}
            list={returnList}
            attachmentCount={attachmentCount}
            canExecuteGate={canExecuteGate}
            isYardAdmin={isYardAdmin}
            onCondition={openCondition}
            onBook={(o) => {
              setBookingTarget({ order: o, phase: "return" })
              setBookingTime(toInputTime(nowLocalStr()))
            }}
            onYard={openYardDialog}
            onPrint={(o) => setPrintTarget({ order: o, phase: "return" })}
            onReturnProof={markReturnProof}
            overdue={overdueProofs}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!conditionTarget} onOpenChange={(open) => !open && setConditionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{conditionTarget?.phase === "pickup" ? "现场确认放箱" : "现场确认收箱"}</DialogTitle>
            <DialogDescription>仅堆场、代管或管理角色可执行现场确认。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>箱况结果</Label>
            <div className="flex gap-2">
              <Button variant={conditionCheck === "通过" ? "default" : "outline"} onClick={() => setConditionCheck("通过")}>通过</Button>
              <Button variant={conditionCheck === "异常" ? "destructive" : "outline"} onClick={() => setConditionCheck("异常")}>异常</Button>
            </div>
            <Textarea value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} placeholder="箱况备注（可选）" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConditionTarget(null)}>取消</Button>
            <Button onClick={submitGateConfirm}>提交现场确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!yardTarget} onOpenChange={(open) => !open && setYardTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>变更提还箱堆场</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>提箱堆场</Label>
            <Input value={pickupYard} onChange={(e) => setPickupYard(e.target.value)} />
            <Label>还箱堆场</Label>
            <Input value={returnYard} onChange={(e) => setReturnYard(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYardTarget(null)}>取消</Button>
            <Button onClick={saveOrderYard}>保存变更</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bookingTarget} onOpenChange={(open) => !open && setBookingTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bookingTarget?.phase === "pickup" ? "提箱预约" : "还箱预约"}</DialogTitle>
            <DialogDescription>需在堆场工作时段内预约；还箱需提前 24 小时。</DialogDescription>
          </DialogHeader>
          <Input type="datetime-local" value={bookingTime} onChange={(e) => setBookingTime(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingTarget(null)}>取消</Button>
            <Button onClick={bookYard}>提交预约</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!printTarget} onOpenChange={(open) => !open && setPrintTarget(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>单据预览</DialogTitle>
          </DialogHeader>
          {printTarget &&
            (printTarget.phase === "pickup" ? (
              <OrderPickupDocument order={printTarget.order} templateName={pickupTemplate?.name} />
            ) : (
              <OrderReturnDocument order={printTarget.order} templateName={returnTemplate?.name} />
            ))}
          <DialogFooter>
            <Button onClick={() => window.print()}>
              <Printer className="mr-1 size-4" />
              打印
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StepCards({ phase }: { phase: Phase }) {
  const pickup = phase === "pickup"
  const steps = pickup
    ? ["打印提箱单", "预约堆场", "上传随箱资料", "现场确认放箱"]
    : ["打印还箱单", "预约还箱堆场", "上传还箱证明", "现场确认收箱"]
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-4">
      {steps.map((step, index) => (
        <Card key={step}>
          <CardContent className="p-3 text-sm">
            <span className="mr-2 text-primary">{index + 1}</span>
            {step}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

type List = ReturnType<typeof useListQuery<UseBoxOrder>>

function WorkTable(props: {
  phase: Phase
  rows: UseBoxOrder[]
  list: List
  attachmentCount: (o: UseBoxOrder) => number
  canExecuteGate: boolean
  isYardAdmin: boolean
  overdue?: UseBoxOrder[]
  onCondition: (o: UseBoxOrder, p: Phase) => void
  onBook: (o: UseBoxOrder) => void
  onYard: (o: UseBoxOrder) => void
  onPrint: (o: UseBoxOrder) => void
  onProof?: (o: UseBoxOrder, failed: boolean) => void
  onReturnProof?: (o: UseBoxOrder) => void
}) {
  const pickup = props.phase === "pickup"
  return (
    <Card>
      <CardHeader>
        <CardTitle>{pickup ? "可提箱订单" : "待还箱 / 已还箱订单"}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortableTableHead label="订单号" columnKey="orderNo" sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <SortableTableHead label="客户" columnKey="customer" sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <SortableTableHead label={pickup ? "提箱堆场" : "还箱堆场"} columnKey={pickup ? "pickupYard" : "returnYard"} sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <SortableTableHead label="状态" columnKey="status" sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <SortableTableHead label="创建时间" columnKey="createdAt" sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <th className="p-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((order) => (
                <tr key={order.id} className="border-t">
                  <td className="whitespace-nowrap p-3 font-mono text-xs">{order.orderNo}</td>
                  <td className="whitespace-nowrap p-3">{order.customer}</td>
                  <td className="whitespace-nowrap p-3">{pickup ? order.pickupYard || "待确认" : order.returnYard || "待确认"}</td>
                  <td className="whitespace-nowrap p-3"><StatusBadge status={order.status} /></td>
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{order.createdAt}</td>
                  <td className="p-3 text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-1">
                      {props.canExecuteGate && (
                        <Button size="sm" onClick={() => props.onCondition(order, props.phase)}>
                          <CheckCircle2 className="mr-1 size-3" />
                          确认{pickup ? "放箱" : "收箱"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => props.onBook(order)}>
                        <CalendarClock className="mr-1 size-3" />
                        预约
                      </Button>
                      <Button size="sm" variant="outline" disabled={pickup && !shouldReleaseDoc(order)} onClick={() => props.onPrint(order)}>
                        <Printer className="mr-1 size-3" />
                        打印
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="gap-1 px-2" />}>
                          更多
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40">
                          {props.isYardAdmin && (
                            <DropdownMenuItem onClick={() => props.onYard(order)}>
                              <MapPin className="size-3.5" />
                              变更堆场
                            </DropdownMenuItem>
                          )}
                          {pickup && props.onProof && (
                            <>
                              <DropdownMenuItem onClick={() => props.onProof!(order, false)}>
                                <Upload className="size-3.5" />
                                随箱资料
                              </DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onClick={() => props.onProof!(order, true)}>
                                <Wrench className="size-3.5" />
                                异常
                              </DropdownMenuItem>
                            </>
                          )}
                          {!pickup && props.onReturnProof && (
                            <DropdownMenuItem onClick={() => props.onReturnProof!(order)}>
                              <FileText className="size-3.5" />
                              还箱证明
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled className="text-muted-foreground">
                            附件 {props.attachmentCount(order)}
                            {props.overdue?.some((o) => o.id === order.id) ? " · 证明逾期" : ""}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
              {props.list.total === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    未找到匹配订单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ListPagination
          page={props.list.page}
          pageSize={props.list.pageSize}
          total={props.list.total}
          totalPages={props.list.totalPages}
          onPageChange={props.list.setPage}
          onPageSizeChange={props.list.setPageSize}
        />
      </CardContent>
    </Card>
  )
}
