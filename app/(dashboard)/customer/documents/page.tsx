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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useResource, revalidateResource } from "@/lib/api"
import { getFieldValue, useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import { usePublicSettings } from "@/lib/settings-client"
import { buildOrderBooking, returnProofOverdueList, shouldReleaseDoc } from "@/lib/domain/order-ops"
import { isWithinWorkHours } from "@/lib/domain/booking-ops"
import {
  cityFromPlace,
  findInventoryRow,
  inventoryId,
  listAvailableUseboxContainers,
  nowLocalStr,
  relocateIncoming,
  relocateReserved,
} from "@/lib/domain/dispatch-ops"
import { pushNotification } from "@/lib/domain/notify"
import { printPrintArea } from "@/lib/print-document"
import { DOC_UPLOAD_ACCEPT, validateDocUploadFile } from "@/lib/doc-upload"
import type {
  AttachmentMeta,
  Booking,
  ContainerMaster,
  DocTemplate,
  InventoryRow,
  Notification,
  RepairOrder,
  UseBoxOrder,
  Yard,
} from "@/lib/types"

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
  const { data: attachments } = useResource<AttachmentMeta>("attachments")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { data: yards } = useResource<Yard>("yards")
  const { data: containers } = useResource<ContainerMaster>("containers")
  const { create: createRepair } = useResource<RepairOrder>("repair")

  const [keyword, setKeyword] = useState("")
  const [conditionTarget, setConditionTarget] = useState<{ order: UseBoxOrder; phase: Phase } | null>(null)
  const [conditionCheck, setConditionCheck] = useState<"通过" | "异常">("通过")
  const [conditionNote, setConditionNote] = useState("")
  const [selectedContainerNos, setSelectedContainerNos] = useState<string[]>([])
  const [yardTarget, setYardTarget] = useState<UseBoxOrder | null>(null)
  const [pickupYard, setPickupYard] = useState("")
  const [returnYard, setReturnYard] = useState("")
  const [printTarget, setPrintTarget] = useState<{ order: UseBoxOrder; phase: Phase } | null>(null)
  const [printTemplateId, setPrintTemplateId] = useState("")
  const [bookingTarget, setBookingTarget] = useState<{ order: UseBoxOrder; phase: Phase } | null>(null)
  const [bookingTime, setBookingTime] = useState(toInputTime(nowLocalStr()))
  const [stuffingTarget, setStuffingTarget] = useState<UseBoxOrder | null>(null)
  const [stuffingFileName, setStuffingFileName] = useState("")
  const [stuffingNote, setStuffingNote] = useState("")
  const [stuffingFile, setStuffingFile] = useState<File | null>(null)
  const [exceptionTarget, setExceptionTarget] = useState<UseBoxOrder | null>(null)
  const [exceptionNote, setExceptionNote] = useState("")
  const [exceptionLevel, setExceptionLevel] = useState<"小修" | "中修" | "大修">("小修")
  const [returnProofTarget, setReturnProofTarget] = useState<UseBoxOrder | null>(null)
  const [returnProofFileName, setReturnProofFileName] = useState("")
  const [returnProofFile, setReturnProofFile] = useState<File | null>(null)
  const [submittingProof, setSubmittingProof] = useState(false)

  const overdueProofs = useMemo(
    () => returnProofOverdueList(orders, settings?.returnProofOverdueDays ?? 3),
    [orders, settings?.returnProofOverdueDays],
  )

  /** 仅返回与订单城市对应的启用堆场（不回退到全部堆场） */
  function yardsForCity(city: string) {
    const c = city.trim()
    if (!c) return []
    return yards.filter(
      (y) =>
        y.enabled &&
        !y.deleted &&
        (y.city === c || y.city.includes(c) || c.includes(y.city)),
    )
  }

  const yardChangePickupOptions = useMemo(
    () => (yardTarget ? yardsForCity(yardTarget.pickupCity) : []),
    [yards, yardTarget],
  )
  const yardChangeReturnOptions = useMemo(
    () => (yardTarget ? yardsForCity(yardTarget.returnCity) : []),
    [yards, yardTarget],
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
    if (phase === "pickup") {
      const yard = order.pickupYard || `${order.pickupCity}堆场`
      const city = cityFromPlace(yard, yards) || order.pickupCity
      const pool = listAvailableUseboxContainers(containers, {
        yard,
        city,
        containerType: order.containerType,
      })
      setSelectedContainerNos(pool.slice(0, order.quantity).map((c) => c.containerNo))
    } else {
      setSelectedContainerNos(order.containerNos || [])
    }
  }

  const pickupCandidateContainers = useMemo(() => {
    if (!conditionTarget || conditionTarget.phase !== "pickup") return []
    const order = conditionTarget.order
    const yard = order.pickupYard || `${order.pickupCity}堆场`
    const city = cityFromPlace(yard, yards) || order.pickupCity
    return listAvailableUseboxContainers(containers, {
      yard,
      city,
      containerType: order.containerType,
    })
  }, [conditionTarget, containers, yards])

  function togglePickupContainer(no: string) {
    if (!conditionTarget) return
    const qty = conditionTarget.order.quantity
    setSelectedContainerNos((prev) => {
      if (prev.includes(no)) return prev.filter((x) => x !== no)
      if (prev.length >= qty) return prev
      return [...prev, no]
    })
  }

  function openStuffingDialog(order: UseBoxOrder) {
    setStuffingTarget(order)
    setStuffingFileName("")
    setStuffingNote("")
    setStuffingFile(null)
  }

  function openExceptionDialog(order: UseBoxOrder) {
    setExceptionTarget(order)
    setExceptionNote("")
    setExceptionLevel("小修")
  }

  function openReturnProofDialog(order: UseBoxOrder) {
    setReturnProofTarget(order)
    setReturnProofFileName("")
    setReturnProofFile(null)
  }

  async function onPickStuffingFile(file: File | null) {
    if (!file) {
      setStuffingFile(null)
      setStuffingFileName("")
      return
    }
    const err = validateDocUploadFile(file)
    if (err) {
      toast.error(err)
      return
    }
    setStuffingFile(file)
    setStuffingFileName(file.name)
  }

  async function onPickReturnProofFile(file: File | null) {
    if (!file) {
      setReturnProofFile(null)
      setReturnProofFileName("")
      return
    }
    const err = validateDocUploadFile(file)
    if (err) {
      toast.error(err)
      return
    }
    setReturnProofFile(file)
    setReturnProofFileName(file.name)
  }

  async function submitStuffing() {
    if (!stuffingTarget) return
    if (!stuffingFile) {
      toast.error("请先选择要上传的随箱资料文件")
      return
    }
    setSubmittingProof(true)
    try {
      const order = stuffingTarget
      const form = new FormData()
      form.set("kind", "stuffing_list")
      form.set("note", stuffingNote.trim())
      form.set("file", stuffingFile, stuffingFileName.trim() || stuffingFile.name)
      const response = await fetch(
        "/api/orders/" + encodeURIComponent(order.id) + "/upload-doc",
        { method: "POST", body: form },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "上传失败")
      await Promise.all([revalidateResource("orders"), revalidateResource("attachments")])
      toast.success("随箱资料已上传，请等待现场确认放箱")
      setStuffingTarget(null)
      setStuffingFile(null)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSubmittingProof(false)
    }
  }

  async function submitException() {
    if (!exceptionTarget) return
    const note = exceptionNote.trim()
    if (!note) {
      toast.error("请填写箱况异常说明")
      return
    }
    setSubmittingProof(true)
    try {
      const order = exceptionTarget
      await updateOrder(order.id, {
        conditionCheck: "异常",
        conditionNote: note,
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
        damageDesc: note,
        level: exceptionLevel,
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
        desc: note,
        module: "M01 提还箱作业",
        href: "/repair/orders",
        roles: ["R01", "R04"],
      })
      await Promise.all([
        revalidateResource("orders"),
        revalidateResource("repair"),
        revalidateResource("notifications"),
      ])
      toast.warning("已记录箱况异常并创建修箱工单")
      setExceptionTarget(null)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSubmittingProof(false)
    }
  }

  async function submitReturnProof() {
    if (!returnProofTarget) return
    if (!returnProofFile) {
      toast.error("请先选择要上传的还箱证明文件")
      return
    }
    setSubmittingProof(true)
    try {
      const order = returnProofTarget
      const form = new FormData()
      form.set("kind", "return_proof")
      form.set("file", returnProofFile, returnProofFileName.trim() || returnProofFile.name)
      const response = await fetch(
        "/api/orders/" + encodeURIComponent(order.id) + "/upload-doc",
        { method: "POST", body: form },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "上传失败")
      await Promise.all([revalidateResource("attachments"), revalidateResource("orders")])
      toast.success("还箱证明已上传，请等待现场确认收箱")
      setReturnProofTarget(null)
      setReturnProofFile(null)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSubmittingProof(false)
    }
  }

  async function submitGateConfirm() {
    if (!conditionTarget) return
    const { order, phase } = conditionTarget
    if (phase === "pickup" && conditionCheck === "通过") {
      if (selectedContainerNos.length !== order.quantity) {
        toast.error(`请选择恰好 ${order.quantity} 个真实箱号`)
        return
      }
    }
    try {
      const path = phase === "pickup" ? "confirm-pickup" : "confirm-return"
      const response = await fetch(
        "/api/orders/" + encodeURIComponent(order.id) + "/" + path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conditionCheck,
            conditionNote: conditionNote || undefined,
            ...(phase === "pickup" && conditionCheck === "通过"
              ? { containerNos: selectedContainerNos }
              : {}),
          }),
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
        revalidateResource("containers"),
        revalidateResource("bills"),
      ])
      toast.success(phase === "pickup" ? "已确认放箱" : "已确认收箱")
      setConditionTarget(null)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  function closeYardDialog() {
    setYardTarget(null)
    // 不在关闭时清空 Select value，避免关闭动画期间受控→非受控切换报错；下次 openYardDialog 会重写
  }

  function openYardDialog(order: UseBoxOrder) {
    const pickupOptions = yardsForCity(order.pickupCity)
    const returnOptions = yardsForCity(order.returnCity)
    const pickup =
      (order.pickupYard && pickupOptions.some((y) => y.name === order.pickupYard)
        ? order.pickupYard
        : pickupOptions[0]?.name) || ""
    const ret =
      (order.returnYard && returnOptions.some((y) => y.name === order.returnYard)
        ? order.returnYard
        : returnOptions[0]?.name) || ""
    setYardTarget(order)
    setPickupYard(pickup)
    setReturnYard(ret)
    if (pickupOptions.length === 0 || returnOptions.length === 0) {
      toast.warning(
        `提箱城市「${order.pickupCity}」可选堆场 ${pickupOptions.length} 个，还箱城市「${order.returnCity}」可选堆场 ${returnOptions.length} 个`,
      )
    }
  }

  async function saveOrderYard() {
    if (!yardTarget || !pickupYard.trim() || !returnYard.trim()) {
      toast.error("请选择提箱堆场与还箱堆场")
      return
    }
    const pickupOk = yardChangePickupOptions.some((y) => y.name === pickupYard)
    const returnOk = yardChangeReturnOptions.some((y) => y.name === returnYard)
    if (!pickupOk || !returnOk) {
      toast.error("所选堆场须与订单提箱/还箱城市对应")
      return
    }
    const order = yardTarget
    try {
      const openQty = ["已确认", "提箱中"].includes(order.status) && !order.stuffingListUploaded ? order.quantity : 0
      const transitQty = ["提箱中", "已提箱", "还箱中"].includes(order.status) ? order.quantity : 0
      const oldPickup = findInventoryRow(inventory, { yard: order.pickupYard, city: order.pickupCity })
      const newPickupCity = cityFromPlace(pickupYard, yards) || order.pickupCity
      const newPickup = findInventoryRow(inventory, { yard: pickupYard, city: newPickupCity })
      if (oldPickup && newPickup && inventoryId(oldPickup) !== inventoryId(newPickup) && openQty) {
        const move = relocateReserved(oldPickup, newPickup, openQty)
        await updateInventory(inventoryId(oldPickup), { ...move.fromPatch, __auditAction: "修改", __auditDetail: "BR-16 提箱堆场迁出" })
        await updateInventory(inventoryId(newPickup), { ...move.toPatch, __auditAction: "修改", __auditDetail: "BR-16 提箱堆场迁入" })
      }
      const oldReturn = findInventoryRow(inventory, { yard: order.returnYard, city: order.returnCity })
      const newReturnCity = cityFromPlace(returnYard, yards) || order.returnCity
      const newReturn = findInventoryRow(inventory, { yard: returnYard, city: newReturnCity })
      if (oldReturn && newReturn && inventoryId(oldReturn) !== inventoryId(newReturn) && transitQty) {
        const move = relocateIncoming(oldReturn, newReturn, transitQty)
        await updateInventory(inventoryId(oldReturn), { ...move.fromPatch, __auditAction: "修改", __auditDetail: "BR-16 还箱堆场迁出" })
        await updateInventory(inventoryId(newReturn), { ...move.toPatch, __auditAction: "修改", __auditDetail: "BR-16 还箱堆场迁入" })
      }
      await updateOrder(order.id, {
        pickupYard: pickupYard.trim(),
        returnYard: returnYard.trim(),
        pickupCity: order.pickupCity,
        returnCity: order.returnCity,
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

  const pickupTemplates = templates.filter(
    (t) =>
      t.enabled &&
      (t.docKind === "pickup" || t.code?.startsWith("RELEASE_ORDER") || t.name.includes("提箱")),
  )
  const returnTemplates = templates.filter(
    (t) =>
      t.enabled &&
      (t.docKind === "return" || t.code?.startsWith("REDELIVERY_ORDER") || t.name.includes("还箱")),
  )
  const pickupTemplate = pickupTemplates.find((t) => t.code === "RELEASE_ORDER") || pickupTemplates[0]
  const returnTemplate = returnTemplates.find((t) => t.code === "REDELIVERY_ORDER") || returnTemplates[0]
  const activePrintTemplates = printTarget?.phase === "return" ? returnTemplates : pickupTemplates
  const activePrintTemplate =
    activePrintTemplates.find((t) => t.id === printTemplateId) ||
    (printTarget?.phase === "return" ? returnTemplate : pickupTemplate) ||
    activePrintTemplates[0]

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
            onPrint={(o) => { setPrintTemplateId(pickupTemplate?.id || ""); setPrintTarget({ order: o, phase: "pickup" }); }}
            onStuffing={openStuffingDialog}
            onException={openExceptionDialog}
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
            onPrint={(o) => { setPrintTemplateId(returnTemplate?.id || ""); setPrintTarget({ order: o, phase: "return" }); }}
            onReturnProof={openReturnProofDialog}
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
            {conditionTarget?.phase === "pickup" && conditionCheck === "通过" && (
              <div className="space-y-2">
                <Label>
                  选择放箱箱号（须选 {conditionTarget.order.quantity} 个，已选 {selectedContainerNos.length}）
                </Label>
                {pickupCandidateContainers.length === 0 ? (
                  <p className="text-sm text-destructive">
                    提箱堆场「{conditionTarget.order.pickupYard || `${conditionTarget.order.pickupCity}堆场`}」暂无在场的{" "}
                    {conditionTarget.order.containerType} 可用箱，请先补库存主档后再放箱。
                  </p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                    {pickupCandidateContainers.map((c) => (
                      <label key={c.containerNo} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedContainerNos.includes(c.containerNo)}
                          onCheckedChange={() => togglePickupContainer(c.containerNo)}
                        />
                        <span className="font-mono text-xs">{c.containerNo}</span>
                        <span className="text-muted-foreground">
                          {c.currentYard} · {c.ownership}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {conditionTarget?.phase === "return" && (conditionTarget.order.containerNos?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                还箱箱号：{conditionTarget.order.containerNos!.join("、")}
              </p>
            )}
            <Textarea value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} placeholder="箱况备注（可选）" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConditionTarget(null)}>取消</Button>
            <Button onClick={submitGateConfirm}>提交现场确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!yardTarget}
        onOpenChange={(open) => {
          if (!open) closeYardDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>变更提还箱堆场</DialogTitle>
            <DialogDescription>
              订单 {yardTarget?.orderNo} · 提箱城市「{yardTarget?.pickupCity}」/ 还箱城市「{yardTarget?.returnCity}」，仅可选择对应城市下的堆场。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>提箱堆场（{yardTarget?.pickupCity}）</Label>
              <Select
                value={pickupYard}
                onValueChange={(v) => setPickupYard(v ?? "")}
                disabled={yardChangePickupOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      yardChangePickupOptions.length === 0
                        ? `「${yardTarget?.pickupCity ?? ""}」暂无可用堆场`
                        : "选择提箱堆场"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {yardChangePickupOptions.map((y) => (
                    <SelectItem key={y.id} value={y.name}>
                      {y.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>还箱堆场（{yardTarget?.returnCity}）</Label>
              <Select
                value={returnYard}
                onValueChange={(v) => setReturnYard(v ?? "")}
                disabled={yardChangeReturnOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      yardChangeReturnOptions.length === 0
                        ? `「${yardTarget?.returnCity ?? ""}」暂无可用堆场`
                        : "选择还箱堆场"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {yardChangeReturnOptions.map((y) => (
                    <SelectItem key={y.id} value={y.name}>
                      {y.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeYardDialog}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void saveOrderYard()}
              disabled={!pickupYard || !returnYard}
            >
              保存变更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stuffingTarget} onOpenChange={(open) => !open && setStuffingTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传随箱资料</DialogTitle>
            <DialogDescription>
              订单 {stuffingTarget?.orderNo} · 请选择 stuffing list 文件（PDF/图片/Word，最大 8MB）后提交。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>选择文件 *</Label>
              <Input
                type="file"
                accept={DOC_UPLOAD_ACCEPT}
                onChange={(e) => void onPickStuffingFile(e.target.files?.[0] ?? null)}
              />
              {stuffingFile && (
                <p className="text-xs text-muted-foreground">
                  已选：{stuffingFileName || stuffingFile.name}（{(stuffingFile.size / 1024).toFixed(1)} KB）
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                value={stuffingNote}
                onChange={(e) => setStuffingNote(e.target.value)}
                placeholder="可选：箱况简述、箱号清单说明等"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStuffingTarget(null)}>
              取消
            </Button>
            <Button type="button" onClick={() => void submitStuffing()} disabled={submittingProof || !stuffingFile}>
              {submittingProof ? "上传中…" : "确认上传"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!exceptionTarget} onOpenChange={(open) => !open && setExceptionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>登记箱况异常</DialogTitle>
            <DialogDescription>
              订单 {exceptionTarget?.orderNo} · 须填写异常说明，系统将创建修箱工单并通知相关角色。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>异常说明 *</Label>
              <Textarea
                value={exceptionNote}
                onChange={(e) => setExceptionNote(e.target.value)}
                placeholder="请描述箱损位置、程度、现场情况等"
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>预估维修等级</Label>
              <div className="flex gap-2">
                {(["小修", "中修", "大修"] as const).map((level) => (
                  <Button
                    key={level}
                    type="button"
                    size="sm"
                    variant={exceptionLevel === level ? "default" : "outline"}
                    onClick={() => setExceptionLevel(level)}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={submitException} disabled={submittingProof}>
              {submittingProof ? "提交中…" : "确认登记异常"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!returnProofTarget} onOpenChange={(open) => !open && setReturnProofTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传还箱证明</DialogTitle>
            <DialogDescription>
              订单 {returnProofTarget?.orderNo} · 请选择还箱证明文件（PDF/图片/Word，最大 8MB）后提交。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>选择文件 *</Label>
              <Input
                type="file"
                accept={DOC_UPLOAD_ACCEPT}
                onChange={(e) => void onPickReturnProofFile(e.target.files?.[0] ?? null)}
              />
              {returnProofFile && (
                <p className="text-xs text-muted-foreground">
                  已选：{returnProofFileName || returnProofFile.name}（{(returnProofFile.size / 1024).toFixed(1)} KB）
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReturnProofTarget(null)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void submitReturnProof()}
              disabled={submittingProof || !returnProofFile}
            >
              {submittingProof ? "上传中…" : "确认上传"}
            </Button>
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
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] overflow-y-auto sm:max-w-4xl print:static print:max-h-none print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none print:ring-0"
        >
          <DialogHeader className="no-print">
            <DialogTitle>单据预览</DialogTitle>
            <DialogDescription>
              提箱单不含用箱价格；可切换已启用模板，打印时带电子章。
            </DialogDescription>
          </DialogHeader>
          {activePrintTemplates.length > 1 && (
            <div className="no-print flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">打印模板</Label>
              <select
                className="flex h-9 min-w-[12rem] rounded-md border bg-background px-2 text-sm"
                value={activePrintTemplate?.id || ""}
                onChange={(e) => setPrintTemplateId(e.target.value)}
              >
                {activePrintTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.builtIn ? "（内置）" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {printTarget &&
            (printTarget.phase === "pickup" ? (
              <OrderPickupDocument order={printTarget.order} template={activePrintTemplate} />
            ) : (
              <OrderReturnDocument order={printTarget.order} template={activePrintTemplate} />
            ))}
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={() => setPrintTarget(null)}>
              关闭
            </Button>
            <Button
              type="button"
              onClick={() =>
                printPrintArea({
                  title: printTarget
                    ? `${printTarget.phase === "pickup" ? "提箱单" : "还箱单"}-${printTarget.order.orderNo}`
                    : "打印单据",
                })
              }
            >
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
  onStuffing?: (o: UseBoxOrder) => void
  onException?: (o: UseBoxOrder) => void
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
                          {pickup && props.onStuffing && (
                            <DropdownMenuItem onClick={() => props.onStuffing!(order)}>
                              <Upload className="size-3.5" />
                              随箱资料
                            </DropdownMenuItem>
                          )}
                          {pickup && props.onException && (
                            <DropdownMenuItem variant="destructive" onClick={() => props.onException!(order)}>
                              <Wrench className="size-3.5" />
                              异常
                            </DropdownMenuItem>
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
