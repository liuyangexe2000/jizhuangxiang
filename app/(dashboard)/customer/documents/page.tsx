"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  PackageOpen,
  Printer,
  Search,
  Upload,
  Wrench,
} from "lucide-react"
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
import {
  findPickupDoc,
  issuePickupDocSlip,
  latestPickupDoc,
  listPickupDocs,
  sumPickupDocQuantity,
} from "@/lib/domain/pickup-doc"
import {
  findReturnDoc,
  issueReturnDocSlip,
  latestReturnDoc,
  listReturnDocs,
  sumReturnDocQuantity,
} from "@/lib/domain/return-doc"
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
import {
  downloadPrintAreaAs,
  printPrintArea,
  type PrintDownloadFormat,
} from "@/lib/print-document"
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

function fromInputTime(time: string) {
  const t = time.trim()
  if (!t) return nowLocalStr()
  return t.replace("T", " ").slice(0, 16)
}

/** 解析放箱清单：一行一个箱号，兼容逗号/分号分隔；忽略 # 注释行 */
function parseContainerNoLines(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n\r]+/)
        .flatMap((line) => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith("#")) return []
          return trimmed.split(/[,;，；\t]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
        }),
    ),
  )
}

export default function DocumentsPage() {
  const { roleId, user } = useRole()
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
  const [workPhase, setWorkPhase] = useState<"pickup" | "return">("pickup")
  const [conditionTarget, setConditionTarget] = useState<{ order: UseBoxOrder; phase: Phase } | null>(null)
  const [conditionCheck, setConditionCheck] = useState<"通过" | "异常">("通过")
  const [conditionNote, setConditionNote] = useState("")
  const [registerTarget, setRegisterTarget] = useState<UseBoxOrder | null>(null)
  const [registerPickupAt, setRegisterPickupAt] = useState(toInputTime(nowLocalStr()))
  const [returnGateAt, setReturnGateAt] = useState(toInputTime(nowLocalStr()))
  const [selectedContainerNos, setSelectedContainerNos] = useState<string[]>([])
  const [containerPaste, setContainerPaste] = useState("")
  const [containerSearch, setContainerSearch] = useState("")
  const [pickupSelectTab, setPickupSelectTab] = useState<"paste" | "search">("paste")
  const [submittingRegister, setSubmittingRegister] = useState(false)
  const [yardTarget, setYardTarget] = useState<UseBoxOrder | null>(null)
  const [pickupYard, setPickupYard] = useState("")
  const [returnYard, setReturnYard] = useState("")
  const [printTarget, setPrintTarget] = useState<{ order: UseBoxOrder; phase: Phase; docNo?: string } | null>(null)
  const [printTemplateId, setPrintTemplateId] = useState("")
  const [printDocNo, setPrintDocNo] = useState("")
  const [issueQty, setIssueQty] = useState("")
  const [downloadTarget, setDownloadTarget] = useState<{
    order: UseBoxOrder
    phase: Phase
    format: PrintDownloadFormat
    docNo?: string
  } | null>(null)
  const [downloadingDoc, setDownloadingDoc] = useState(false)
  const downloadRootRef = useRef<HTMLDivElement>(null)
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
    if (phase === "return") {
      setReturnGateAt(toInputTime(order.returnGateAt || nowLocalStr()))
    }
  }

  function openRegisterContainers(order: UseBoxOrder) {
    setRegisterTarget(order)
    setRegisterPickupAt(toInputTime(order.pickupGateAt || nowLocalStr()))
    setSelectedContainerNos([])
    setContainerPaste("")
    setContainerSearch("")
    setPickupSelectTab("paste")
  }

  const pickupCandidateContainers = useMemo(() => {
    if (!registerTarget) return []
    const order = registerTarget
    const yard = order.pickupYard || `${order.pickupCity}堆场`
    const city = cityFromPlace(yard, yards) || order.pickupCity
    return listAvailableUseboxContainers(containers, {
      yard,
      city,
      containerType: order.containerType,
    })
  }, [registerTarget, containers, yards])

  const pickupAvailSet = useMemo(
    () => new Set(pickupCandidateContainers.map((c) => c.containerNo.toUpperCase())),
    [pickupCandidateContainers],
  )

  const filteredPickupCandidates = useMemo(() => {
    const q = containerSearch.trim().toUpperCase()
    if (!q) return pickupCandidateContainers
    return pickupCandidateContainers.filter(
      (c) =>
        c.containerNo.toUpperCase().includes(q) ||
        c.currentYard?.toUpperCase().includes(q) ||
        c.ownership?.toUpperCase().includes(q),
    )
  }, [pickupCandidateContainers, containerSearch])

  const pickupInvalidNos = useMemo(
    () => selectedContainerNos.filter((no) => !pickupAvailSet.has(no.toUpperCase())),
    [selectedContainerNos, pickupAvailSet],
  )

  function applyPickupContainerNos(nos: string[]) {
    if (!registerTarget) return
    const qty = registerTarget.quantity
    const next = nos.slice(0, qty)
    setSelectedContainerNos(next)
    setContainerPaste(next.join("\n"))
  }

  function onContainerPasteChange(text: string) {
    setContainerPaste(text)
    if (!registerTarget) return
    const qty = registerTarget.quantity
    setSelectedContainerNos(parseContainerNoLines(text).slice(0, qty))
  }

  function togglePickupContainer(no: string) {
    if (!registerTarget) return
    const qty = registerTarget.quantity
    const upper = no.toUpperCase()
    setSelectedContainerNos((prev) => {
      const exists = prev.some((x) => x.toUpperCase() === upper)
      const next = exists
        ? prev.filter((x) => x.toUpperCase() !== upper)
        : prev.length >= qty
          ? prev
          : [...prev, no]
      setContainerPaste(next.join("\n"))
      return next
    })
  }

  async function onPickContainerListFile(file: File | null) {
    if (!file) return
    const name = file.name.toLowerCase()
    if (!name.endsWith(".txt") && !name.endsWith(".csv") && !name.endsWith(".text")) {
      toast.error("请上传 txt 或 csv 清单（一行一个箱号）")
      return
    }
    if (file.size > 200 * 1024) {
      toast.error("清单文件过大（上限 200KB）")
      return
    }
    try {
      const text = await file.text()
      onContainerPasteChange(text)
      setPickupSelectTab("paste")
      toast.success("已导入箱号清单")
    } catch {
      toast.error("读取清单失败")
    }
  }

  function downloadContainerListTemplate() {
    const qty = conditionTarget?.order.quantity ?? 1
    const samples = Array.from({ length: Math.max(1, qty) }, (_, i) => `MSCU${String(i + 1).padStart(7, "0")}`)
    const content = [
      "# 放箱箱号清单模板",
      "# 规则：一行一个箱号；以 # 开头的行为说明，上传时忽略",
      "# 也可使用英文逗号或中文逗号分隔",
      ...samples,
      "",
    ].join("\n")
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "放箱箱号清单模板.txt"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("已下载清单模板")
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
            ...(phase === "return" ? { returnGateAt: fromInputTime(returnGateAt) } : {}),
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
      toast.success(
        phase === "pickup"
          ? conditionCheck === "通过"
            ? "已确认放箱；请堆场事后登记提箱箱号与时间"
            : "已记录箱况异常"
          : "已确认收箱",
      )
      setConditionTarget(null)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function submitRegisterContainers() {
    if (!registerTarget) return
    const order = registerTarget
    if (selectedContainerNos.length !== order.quantity) {
      toast.error(`请录入恰好 ${order.quantity} 个提箱箱号（当前 ${selectedContainerNos.length} 个）`)
      return
    }
    if (pickupInvalidNos.length > 0) {
      toast.error("存在不可用箱号", {
        description: pickupInvalidNos.slice(0, 5).join("、") + (pickupInvalidNos.length > 5 ? "…" : ""),
      })
      return
    }
    setSubmittingRegister(true)
    try {
      const response = await fetch(
        "/api/orders/" + encodeURIComponent(order.id) + "/register-pickup-containers",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            containerNos: selectedContainerNos,
            pickupGateAt: fromInputTime(registerPickupAt),
          }),
        },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "登记失败")
      await Promise.all([
        revalidateResource("orders"),
        revalidateResource("gate"),
        revalidateResource("containers"),
        revalidateResource("notifications"),
        revalidateResource("bills"),
      ])
      toast.success(
        data.useBoxBillNo
          ? `已登记箱号，并生成用箱账单 ${data.useBoxBillNo}`
          : "已登记提箱箱号与时间",
      )
      setRegisterTarget(null)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSubmittingRegister(false)
    }
  }

  function closeYardDialog() {
    setYardTarget(null)
    // 不在关闭时清空 Select value，避免关闭动画期间受控→非受控切换报错；下次 openYardDialog 会重写
  }

  function openYardDialog(order: UseBoxOrder) {
    if (!canChangeYard(order)) {
      toast.error("仅「已确认」且尚未登记箱号的订单可变更堆场")
      return
    }
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
  const activeDownloadTemplate =
    downloadTarget?.phase === "return" ? returnTemplate : pickupTemplate

  const printOrderLive = useMemo(() => {
    if (!printTarget) return null
    return orders.find((o) => o.id === printTarget.order.id) ?? printTarget.order
  }, [orders, printTarget])

  const printPickupDocs = useMemo(
    () => (printOrderLive && printTarget?.phase === "pickup" ? listPickupDocs(printOrderLive) : []),
    [printOrderLive, printTarget],
  )

  const activePrintDocNo =
    printTarget?.phase === "pickup"
      ? printDocNo || printTarget.docNo || latestPickupDoc(printOrderLive || printTarget.order)?.docNo || ""
      : ""

  const pickupDocExtras = useMemo(() => {
    if (!printOrderLive || printTarget?.phase !== "pickup") return undefined
    const slip = findPickupDoc(printOrderLive, activePrintDocNo)
    if (!slip) return { pickupDocNo: "—" }
    return {
      pickupDocNo: slip.docNo,
      quantity: `${slip.quantity} 箱`,
      confirmedAt: slip.issuedAt,
    }
  }, [printOrderLive, printTarget, activePrintDocNo])

  const downloadDocExtras = useMemo(() => {
    if (!downloadTarget) return undefined
    const order = orders.find((o) => o.id === downloadTarget.order.id) ?? downloadTarget.order
    if (downloadTarget.phase === "pickup") {
      const slip = findPickupDoc(order, downloadTarget.docNo)
      if (!slip) return { pickupDocNo: "—" }
      return {
        pickupDocNo: slip.docNo,
        quantity: `${slip.quantity} 箱`,
        confirmedAt: slip.issuedAt,
      }
    }
    const slip = findReturnDoc(order, downloadTarget.docNo)
    if (!slip) return { returnDocNo: "—" }
    return {
      returnDocNo: slip.docNo,
      quantity: `${slip.quantity} 箱`,
      confirmedAt: slip.issuedAt,
    }
  }, [downloadTarget, orders])

  const returnDocExtras = useMemo(() => {
    if (!printOrderLive || printTarget?.phase !== "return") return undefined
    const slip = findReturnDoc(printOrderLive, printTarget.docNo)
    if (!slip) return { returnDocNo: "—" }
    return {
      returnDocNo: slip.docNo,
      quantity: `${slip.quantity} 箱`,
      confirmedAt: slip.issuedAt,
    }
  }, [printOrderLive, printTarget])

  async function ensurePickupDocs(order: UseBoxOrder): Promise<{ order: UseBoxOrder; docNo: string }> {
    const existing = listPickupDocs(order)
    if (existing.length > 0) {
      return { order, docNo: existing[existing.length - 1]!.docNo }
    }
    const issuedBy = user?.name || user?.account || "系统"
    const slip = issuePickupDocSlip({
      orderNo: order.orderNo,
      existing: [],
      quantity: order.quantity,
      issuedBy,
      issuedAt: nowLocalStr(),
      remark: "首次开具提箱单",
    })
    const pickupDocs = [slip]
    await updateOrder(order.id, {
      pickupDocs,
      releaseDocReady: true,
      __auditAction: "修改",
      __auditDetail: `开具提箱单 ${slip.docNo}`,
    })
    await revalidateResource("orders")
    return { order: { ...order, pickupDocs, releaseDocReady: true }, docNo: slip.docNo }
  }

  async function ensureReturnDocs(order: UseBoxOrder): Promise<{ order: UseBoxOrder; docNo: string }> {
    const existing = listReturnDocs(order)
    if (existing.length > 0) {
      return { order, docNo: existing[existing.length - 1]!.docNo }
    }
    const issuedBy = user?.name || user?.account || "系统"
    const slip = issueReturnDocSlip({
      orderNo: order.orderNo,
      existing: [],
      quantity: order.quantity,
      issuedBy,
      issuedAt: nowLocalStr(),
      remark: "首次开具还箱单",
    })
    const returnDocs = [slip]
    await updateOrder(order.id, {
      returnDocs,
      __auditAction: "修改",
      __auditDetail: `开具还箱单 ${slip.docNo}`,
    })
    await revalidateResource("orders")
    return { order: { ...order, returnDocs }, docNo: slip.docNo }
  }

  async function openPickupPrint(order: UseBoxOrder) {
    if (!shouldReleaseDoc(order)) {
      toast.error("提箱单尚未放行，请先由箱管确认订单")
      return
    }
    try {
      const ensured = await ensurePickupDocs(order)
      setPrintTemplateId(pickupTemplate?.id || "")
      setPrintDocNo(ensured.docNo)
      setIssueQty(String(Math.max(1, order.quantity - sumPickupDocQuantity(ensured.order)) || order.quantity))
      setPrintTarget({ order: ensured.order, phase: "pickup", docNo: ensured.docNo })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function openPickupDownload(order: UseBoxOrder, format: PrintDownloadFormat) {
    if (!shouldReleaseDoc(order)) {
      toast.error("提箱单尚未放行，请先由箱管确认订单")
      return
    }
    try {
      const ensured = await ensurePickupDocs(order)
      setDownloadTarget({ order: ensured.order, phase: "pickup", format, docNo: ensured.docNo })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function openReturnPrint(order: UseBoxOrder) {
    try {
      const ensured = await ensureReturnDocs(order)
      setPrintTemplateId(returnTemplate?.id || "")
      setPrintTarget({ order: ensured.order, phase: "return", docNo: ensured.docNo })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function openReturnDownload(order: UseBoxOrder, format: PrintDownloadFormat) {
    try {
      const ensured = await ensureReturnDocs(order)
      setDownloadTarget({ order: ensured.order, phase: "return", format, docNo: ensured.docNo })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function issueAnotherPickupDoc() {
    if (!printOrderLive || printTarget?.phase !== "pickup") return
    const qty = Number(issueQty)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("请填写本张提箱单的箱量")
      return
    }
    const existing = listPickupDocs(printOrderLive)
    const slip = issuePickupDocSlip({
      orderNo: printOrderLive.orderNo,
      existing,
      quantity: qty,
      issuedBy: user?.name || user?.account || "系统",
      issuedAt: nowLocalStr(),
    })
    const pickupDocs = [...existing, slip]
    try {
      await updateOrder(printOrderLive.id, {
        pickupDocs,
        releaseDocReady: true,
        __auditAction: "修改",
        __auditDetail: `开具提箱单 ${slip.docNo}（${qty} 箱）`,
      })
      await revalidateResource("orders")
      setPrintDocNo(slip.docNo)
      setPrintTarget((t) => (t ? { ...t, order: { ...printOrderLive, pickupDocs }, docNo: slip.docNo } : t))
      setIssueQty("1")
      toast.success(`已开具提箱单 ${slip.docNo}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    if (!downloadTarget) return
    const live = orders.find((o) => o.id === downloadTarget.order.id) ?? downloadTarget.order
    const slip =
      downloadTarget.phase === "pickup"
        ? findPickupDoc(live, downloadTarget.docNo)
        : findReturnDoc(live, downloadTarget.docNo)
    const title =
      downloadTarget.phase === "pickup"
        ? `提箱单-${slip?.docNo || live.orderNo}`
        : `还箱单-${slip?.docNo || live.orderNo}`
    const format = downloadTarget.format
    let cancelled = false
    const run = async () => {
      setDownloadingDoc(true)
      try {
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        if (cancelled) return
        const ok = await downloadPrintAreaAs(format, {
          root: downloadRootRef.current,
          title,
          filename: title,
        })
        if (cancelled) return
        if (ok) toast.success(format === "pdf" ? "已开始下载 PDF" : "已开始下载 HTML")
        else toast.error("下载失败，请稍后重试")
      } finally {
        if (!cancelled) {
          setDownloadTarget(null)
          setDownloadingDoc(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [downloadTarget, orders])

  const attachmentCount = (order: UseBoxOrder) => attachments.filter((a) => a.refNo === order.orderNo).length

  return (
    <div className="space-y-6">
      <PageHeader
        module="M01 · 客户服务与订舱协同门户"
        title="提还箱作业"
        description="提还箱单据、堆场预约、现场确认与还箱证明协同。提箱为随机出场：确认放箱后由堆场登记箱号与时间。提箱与还箱请使用下方「作业阶段切换」。"
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
      <Tabs value={workPhase} onValueChange={(v) => setWorkPhase(v as "pickup" | "return")} className="gap-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">作业阶段切换</p>
              <p className="text-xs text-muted-foreground">
                提箱与还箱分两步办理；需要还箱时请切换到「还箱作业」
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="tablist" aria-label="作业阶段">
              <button
                type="button"
                role="tab"
                aria-selected={workPhase === "pickup"}
                onClick={() => setWorkPhase("pickup")}
                className={
                  workPhase === "pickup"
                    ? "flex w-full flex-col gap-1 rounded-xl border-2 border-primary bg-primary px-4 py-3.5 text-left text-primary-foreground shadow-sm transition-colors"
                    : "flex w-full flex-col gap-1 rounded-xl border-2 border-border bg-card px-4 py-3.5 text-left text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40"
                }
              >
                <span className="flex w-full items-center gap-2">
                  <PackageOpen className="size-5 shrink-0" />
                  <span className="text-base font-semibold">提箱作业</span>
                  <span
                    className={
                      workPhase === "pickup"
                        ? "ml-auto rounded-md bg-primary-foreground/20 px-2 py-0.5 text-xs font-semibold tabular-nums"
                        : "ml-auto rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground"
                    }
                  >
                    {pickupList.total}
                  </span>
                </span>
                <span
                  className={
                    workPhase === "pickup"
                      ? "pl-7 text-xs text-primary-foreground/85"
                      : "pl-7 text-xs text-muted-foreground"
                  }
                >
                  打印提箱单 · 预约堆场 · 确认放箱 · 登记箱号
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workPhase === "return"}
                onClick={() => setWorkPhase("return")}
                className={
                  workPhase === "return"
                    ? "flex w-full flex-col gap-1 rounded-xl border-2 border-primary bg-primary px-4 py-3.5 text-left text-primary-foreground shadow-sm transition-colors"
                    : "flex w-full flex-col gap-1 rounded-xl border-2 border-border bg-card px-4 py-3.5 text-left text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40"
                }
              >
                <span className="flex w-full items-center gap-2">
                  <PackageCheck className="size-5 shrink-0" />
                  <span className="text-base font-semibold">还箱作业</span>
                  <span
                    className={
                      workPhase === "return"
                        ? "ml-auto rounded-md bg-primary-foreground/20 px-2 py-0.5 text-xs font-semibold tabular-nums"
                        : "ml-auto rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground"
                    }
                  >
                    {returnList.total}
                  </span>
                </span>
                <span
                  className={
                    workPhase === "return"
                      ? "pl-7 text-xs text-primary-foreground/85"
                      : "pl-7 text-xs text-muted-foreground"
                  }
                >
                  打印还箱单 · 预约还箱 · 现场确认收箱
                </span>
              </button>
            </div>
          </CardContent>
        </Card>
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
            onRegisterContainers={openRegisterContainers}
            onBook={(o) => {
              setBookingTarget({ order: o, phase: "pickup" })
              setBookingTime(toInputTime(nowLocalStr()))
            }}
            onYard={openYardDialog}
            onPrint={(o) => void openPickupPrint(o)}
            onDownload={(o, format) => void openPickupDownload(o, format)}
            downloading={downloadingDoc}
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
            onPrint={(o) => void openReturnPrint(o)}
            onDownload={(o, format) => void openReturnDownload(o, format)}
            downloading={downloadingDoc}
            onReturnProof={openReturnProofDialog}
            overdue={overdueProofs}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!conditionTarget} onOpenChange={(open) => !open && setConditionTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{conditionTarget?.phase === "pickup" ? "现场确认放箱" : "现场确认收箱"}</DialogTitle>
            <DialogDescription>
              {conditionTarget?.phase === "pickup"
                ? "确认车辆已完成提箱（随机出场）。箱号与精确提箱时间请在放箱后通过「登记箱号」补录。"
                : "仅堆场、代管或管理角色可执行现场确认。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>箱况结果</Label>
            <div className="flex gap-2">
              <Button variant={conditionCheck === "通过" ? "default" : "outline"} onClick={() => setConditionCheck("通过")}>通过</Button>
              <Button variant={conditionCheck === "异常" ? "destructive" : "outline"} onClick={() => setConditionCheck("异常")}>异常</Button>
            </div>
            {conditionTarget?.phase === "pickup" && conditionCheck === "通过" && (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                确认后订单进入「提箱中」并按量扣减库存；不在此环节选箱。提箱完成后请使用「登记箱号」上传实际出场箱号与时间，系统再生成用箱账单。
              </p>
            )}
            {conditionTarget?.phase === "return" && (conditionTarget.order.containerNos?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                还箱箱号：{conditionTarget.order.containerNos!.join("、")}
              </p>
            )}
            {conditionTarget?.phase === "return" && (
              <div className="space-y-1.5">
                <Label>实际还箱时间</Label>
                <Input
                  type="datetime-local"
                  value={returnGateAt}
                  onChange={(e) => setReturnGateAt(e.target.value)}
                />
              </div>
            )}
            <Textarea value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} placeholder="箱况备注（可选）" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConditionTarget(null)}>取消</Button>
            <Button onClick={submitGateConfirm}>提交现场确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!registerTarget} onOpenChange={(open) => !open && setRegisterTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>登记提箱箱号</DialogTitle>
            <DialogDescription>
              订单 {registerTarget?.orderNo} · 随机出场完成后，由堆场补录实际箱号与提箱时间（须录满{" "}
              {registerTarget?.quantity ?? 0} 个）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>提箱时间</Label>
              <Input
                type="datetime-local"
                value={registerPickupAt}
                onChange={(e) => setRegisterPickupAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  提箱箱号（须录 {registerTarget?.quantity ?? 0} 个，已录 {selectedContainerNos.length}）
                </Label>
                {selectedContainerNos.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => applyPickupContainerNos([])}
                  >
                    清空
                  </Button>
                ) : null}
              </div>
              {pickupCandidateContainers.length === 0 ? (
                <p className="text-sm text-destructive">
                  提箱堆场「{registerTarget?.pickupYard || `${registerTarget?.pickupCity ?? ""}堆场`}」暂无在场的{" "}
                  {registerTarget?.containerType} 可用箱，请核对主档后再登记。
                </p>
              ) : (
                <Tabs
                  value={pickupSelectTab}
                  onValueChange={(v) => setPickupSelectTab(v as "paste" | "search")}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="paste">粘贴 / 上传清单</TabsTrigger>
                    <TabsTrigger value="search">搜索勾选</TabsTrigger>
                  </TabsList>
                  <TabsContent value="paste" className="space-y-2">
                    <Textarea
                      value={containerPaste}
                      onChange={(e) => onContainerPasteChange(e.target.value)}
                      placeholder={"一行一个箱号，也可逗号分隔\n例如：\nMSCU1234567\nTGHU7654321"}
                      className="min-h-28 font-mono text-xs"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={downloadContainerListTemplate}
                      >
                        <Download className="size-3.5" />
                        下载模板
                      </Button>
                      <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted">
                        <Upload className="size-3.5" />
                        上传清单
                        <input
                          type="file"
                          accept=".txt,.csv,.text,text/plain,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            void onPickContainerListFile(e.target.files?.[0] ?? null)
                            e.target.value = ""
                          }}
                        />
                      </label>
                      <span className="text-xs text-muted-foreground">
                        支持 txt/csv；堆场可用 {pickupCandidateContainers.length} 箱
                      </span>
                    </div>
                  </TabsContent>
                  <TabsContent value="search" className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={containerSearch}
                        onChange={(e) => setContainerSearch(e.target.value)}
                        placeholder="搜索箱号 / 堆场"
                        className="pl-8"
                      />
                    </div>
                    <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-2">
                      {filteredPickupCandidates.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">无匹配可用箱</p>
                      ) : (
                        filteredPickupCandidates.map((c) => {
                          const checked = selectedContainerNos.some(
                            (x) => x.toUpperCase() === c.containerNo.toUpperCase(),
                          )
                          return (
                            <label key={c.containerNo} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePickupContainer(c.containerNo)}
                              />
                              <span className="font-mono text-xs">{c.containerNo}</span>
                              <span className="text-muted-foreground">
                                {c.currentYard} · {c.ownership}
                              </span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
              {selectedContainerNos.length > 0 ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">
                    已确认 {selectedContainerNos.length}/{registerTarget?.quantity ?? 0}：
                    {selectedContainerNos.join("、")}
                  </div>
                  {pickupInvalidNos.length > 0 ? (
                    <div className="mt-1 text-destructive">
                      不可用（非本堆场在场同箱型）：{pickupInvalidNos.join("、")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterTarget(null)} disabled={submittingRegister}>
              取消
            </Button>
            <Button onClick={() => void submitRegisterContainers()} disabled={submittingRegister}>
              {submittingRegister ? "登记中…" : "提交登记"}
            </Button>
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

      {downloadTarget && (
        <div
          ref={downloadRootRef}
          aria-hidden
          className="pointer-events-none fixed top-0 left-[-10000px] w-[760px] opacity-0"
        >
          {downloadTarget.phase === "pickup" ? (
            <OrderPickupDocument
              order={orders.find((o) => o.id === downloadTarget.order.id) ?? downloadTarget.order}
              template={activeDownloadTemplate}
              extras={downloadDocExtras}
            />
          ) : (
            <OrderReturnDocument
              order={orders.find((o) => o.id === downloadTarget.order.id) ?? downloadTarget.order}
              template={activeDownloadTemplate}
              extras={downloadDocExtras}
            />
          )}
        </div>
      )}

      <Dialog open={!!printTarget} onOpenChange={(open) => !open && setPrintTarget(null)}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] overflow-y-auto sm:max-w-4xl print:static print:max-h-none print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none print:ring-0"
        >
          <DialogHeader className="no-print">
            <DialogTitle>单据预览</DialogTitle>
            <DialogDescription>
              {printTarget?.phase === "pickup"
                ? "一单可开具多张提箱单（分批/多车次）；请选择提箱单号后打印或下载。"
                : "可切换已启用模板，打印或下载电子版均带电子章。"}
            </DialogDescription>
          </DialogHeader>
          {printTarget?.phase === "pickup" && printOrderLive && (
            <div className="no-print space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">提箱单号</Label>
                  <Select value={activePrintDocNo} onValueChange={(v) => setPrintDocNo(v ?? "")}>
                    <SelectTrigger className="min-w-[16rem]">
                      <SelectValue placeholder="选择提箱单号" />
                    </SelectTrigger>
                    <SelectContent>
                      {printPickupDocs.map((d) => (
                        <SelectItem key={d.docNo} value={d.docNo}>
                          {d.docNo} · {d.quantity} 箱 · {d.issuedAt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">新开具箱量</Label>
                  <Input
                    className="w-24"
                    type="number"
                    min={1}
                    value={issueQty}
                    onChange={(e) => setIssueQty(e.target.value)}
                  />
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => void issueAnotherPickupDoc()}>
                  开具新提箱单
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                订单 {printOrderLive.orderNo} 共 {printOrderLive.quantity} 箱 · 已开具{" "}
                {sumPickupDocQuantity(printOrderLive)} 箱 / {printPickupDocs.length} 张单
              </p>
            </div>
          )}
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
              <OrderPickupDocument
                order={printOrderLive || printTarget.order}
                template={activePrintTemplate}
                extras={pickupDocExtras}
              />
            ) : (
              <OrderReturnDocument
                order={printOrderLive || printTarget.order}
                template={activePrintTemplate}
                extras={returnDocExtras}
              />
            ))}
          <DialogFooter className="no-print">
            <Button variant="outline" onClick={() => setPrintTarget(null)}>
              关闭
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline" disabled={downloadingDoc}>
                    <Download className="mr-1 size-4" />
                    {downloadingDoc ? "下载中…" : "下载电子版"}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuItem
                  disabled={downloadingDoc}
                  onClick={async () => {
                    const live = printOrderLive || printTarget?.order
                    const slip =
                      printTarget?.phase === "pickup" && live
                        ? findPickupDoc(live, activePrintDocNo)
                        : printTarget?.phase === "return" && live
                          ? findReturnDoc(live, printTarget.docNo)
                          : null
                    const title = printTarget
                      ? printTarget.phase === "pickup"
                        ? `提箱单-${slip?.docNo || live?.orderNo}`
                        : `还箱单-${slip?.docNo || live?.orderNo}`
                      : "单据"
                    setDownloadingDoc(true)
                    try {
                      const ok = await downloadPrintAreaAs("html", { title, filename: title })
                      if (ok) toast.success("已开始下载 HTML")
                      else toast.error("未找到可下载的单据内容")
                    } finally {
                      setDownloadingDoc(false)
                    }
                  }}
                >
                  下载 HTML
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={downloadingDoc}
                  onClick={async () => {
                    const live = printOrderLive || printTarget?.order
                    const slip =
                      printTarget?.phase === "pickup" && live
                        ? findPickupDoc(live, activePrintDocNo)
                        : printTarget?.phase === "return" && live
                          ? findReturnDoc(live, printTarget.docNo)
                          : null
                    const title = printTarget
                      ? printTarget.phase === "pickup"
                        ? `提箱单-${slip?.docNo || live?.orderNo}`
                        : `还箱单-${slip?.docNo || live?.orderNo}`
                      : "单据"
                    setDownloadingDoc(true)
                    try {
                      const ok = await downloadPrintAreaAs("pdf", { title, filename: title })
                      if (ok) toast.success("已开始下载 PDF")
                      else toast.error("PDF 生成失败，请稍后重试")
                    } finally {
                      setDownloadingDoc(false)
                    }
                  }}
                >
                  下载 PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              onClick={() => {
                const live = printOrderLive || printTarget?.order
                const slip =
                  printTarget?.phase === "pickup" && live
                    ? findPickupDoc(live, activePrintDocNo)
                    : printTarget?.phase === "return" && live
                      ? findReturnDoc(live, printTarget.docNo)
                      : null
                printPrintArea({
                  title: printTarget
                    ? printTarget.phase === "pickup"
                      ? `提箱单-${slip?.docNo || live?.orderNo}`
                      : `还箱单-${slip?.docNo || live?.orderNo}`
                    : "打印单据",
                })
              }}
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
    ? ["打印提箱单", "预约堆场", "现场确认放箱", "登记箱号"]
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

function needsPickupContainerRegister(order: UseBoxOrder) {
  return (
    (order.status === "提箱中" || order.status === "已提箱") &&
    !(order.containerNos && order.containerNos.length > 0)
  )
}

function canChangeYard(o: UseBoxOrder) {
  return o.status === "已确认" && !(o.containerNos?.length)
}

function WorkTable(props: {
  phase: Phase
  rows: UseBoxOrder[]
  list: List
  attachmentCount: (o: UseBoxOrder) => number
  canExecuteGate: boolean
  isYardAdmin: boolean
  overdue?: UseBoxOrder[]
  onCondition: (o: UseBoxOrder, p: Phase) => void
  onRegisterContainers?: (o: UseBoxOrder) => void
  onBook: (o: UseBoxOrder) => void
  onYard: (o: UseBoxOrder) => void
  onPrint: (o: UseBoxOrder) => void
  onDownload: (o: UseBoxOrder, format: PrintDownloadFormat) => void
  downloading?: boolean
  onStuffing?: (o: UseBoxOrder) => void
  onException?: (o: UseBoxOrder) => void
  onReturnProof?: (o: UseBoxOrder) => void
}) {
  const pickup = props.phase === "pickup"
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
                {pickup && <th className="p-3 text-left">提箱单号</th>}
                {pickup && <th className="p-3 text-left">柜数</th>}
                <SortableTableHead label="客户" columnKey="customer" sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <SortableTableHead label={pickup ? "提箱堆场" : "还箱堆场"} columnKey={pickup ? "pickupYard" : "returnYard"} sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <SortableTableHead label="状态" columnKey="status" sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <SortableTableHead label="创建时间" columnKey="createdAt" sortKey={props.list.sortKey} sortDir={props.list.sortDir} onSort={props.list.toggleSort} />
                <th className="p-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((order) => {
                const docs = listPickupDocs(order)
                const latest = latestPickupDoc(order)
                const released = sumPickupDocQuantity(order)
                const picked = order.containerNos?.length ?? 0
                const pending = Math.max(0, order.quantity - picked)
                const expanded = expandedIds.has(order.id)
                const showConfirm =
                  props.canExecuteGate &&
                  (pickup ? order.status === "已确认" : order.status === "提箱中" || order.status === "已提箱" || order.status === "还箱中")
                const showRegister =
                  pickup && props.canExecuteGate && props.onRegisterContainers && needsPickupContainerRegister(order)
                return (
                <Fragment key={order.id}>
                <tr className="border-t">
                  <td className="whitespace-nowrap p-3 font-mono text-xs">{order.orderNo}</td>
                  {pickup && (
                    <td className="max-w-[12rem] p-3 text-xs">
                      {latest ? (
                        <div className="space-y-0.5">
                          <div className="font-mono font-medium">{latest.docNo}</div>
                          {docs.length > 1 && (
                            <div className="text-muted-foreground">共 {docs.length} 张</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">未开具</span>
                      )}
                    </td>
                  )}
                  {pickup && (
                    <td className="whitespace-nowrap p-3 text-xs">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-muted"
                          onClick={() => toggleExpanded(order.id)}
                          aria-expanded={expanded}
                          aria-label={expanded ? "收起提箱单明细" : "展开提箱单明细"}
                        >
                          {expanded ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <span className="tabular-nums">
                          放{released}/提{picked}/待{pending}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="whitespace-nowrap p-3">{order.customer}</td>
                  <td className="whitespace-nowrap p-3">{pickup ? order.pickupYard || "待确认" : order.returnYard || "待确认"}</td>
                  <td className="whitespace-nowrap p-3">
                    <div className="space-y-0.5">
                      <StatusBadge status={order.status} />
                      {showRegister && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400">待登记箱号</div>
                      )}
                      {pickup && (order.containerNos?.length ?? 0) > 0 && (
                        <div className="max-w-[10rem] truncate font-mono text-[11px] text-muted-foreground" title={order.containerNos!.join("、")}>
                          {order.containerNos!.join("、")}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{order.createdAt}</td>
                  <td className="p-3 text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-1">
                      {showConfirm && (
                        <Button size="sm" onClick={() => props.onCondition(order, props.phase)}>
                          <CheckCircle2 className="mr-1 size-3" />
                          确认{pickup ? "放箱" : "收箱"}
                        </Button>
                      )}
                      {showRegister && (
                        <Button size="sm" variant="secondary" onClick={() => props.onRegisterContainers!(order)}>
                          <PackageOpen className="mr-1 size-3" />
                          登记箱号
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
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={(pickup && !shouldReleaseDoc(order)) || !!props.downloading}
                              title="下载提箱单/还箱单电子版"
                            />
                          }
                        >
                          <Download className="mr-1 size-3" />
                          {props.downloading ? "下载中…" : "下载"}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-36">
                          <DropdownMenuItem
                            disabled={!!props.downloading}
                            onClick={() => props.onDownload(order, "html")}
                          >
                            下载 HTML
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!!props.downloading}
                            onClick={() => props.onDownload(order, "pdf")}
                          >
                            下载 PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="gap-1 px-2" />}>
                          更多
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40">
                          {props.isYardAdmin && canChangeYard(order) && (
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
                {pickup && expanded && (
                  <tr className="border-t bg-muted/20">
                    <td colSpan={8} className="p-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">提箱单明细</p>
                        {docs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">暂无提箱单</p>
                        ) : (
                          docs.map((d) => (
                            <div key={d.docNo} className="flex flex-wrap gap-x-3 text-xs">
                              <span className="font-mono font-medium">{d.docNo}</span>
                              <span className="text-muted-foreground">
                                {d.quantity} 箱 · {d.issuedAt}
                              </span>
                              <span className="font-mono text-muted-foreground">
                                箱号：
                                {(order.containerNos?.length ?? 0) > 0
                                  ? order.containerNos!.join("、")
                                  : "—"}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )})}
              {props.list.total === 0 && (
                <tr>
                  <td colSpan={pickup ? 8 : 6} className="p-10 text-center text-muted-foreground">
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
