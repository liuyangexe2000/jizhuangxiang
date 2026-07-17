"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CircleDollarSign, ClipboardList, Eye, Plus, Search, Trash2, Wrench, X } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { CitySearchSelect } from "@/components/city-search-select"
import { useResource, revalidateResource } from "@/lib/api"
import { CONTAINER_TYPES } from "@/lib/container-types"
import { findInventoryRow, inventoryId, nowLocalStr } from "@/lib/domain/dispatch-ops"
import { compressImageToMaxWidth, revokePreviewUrls } from "@/lib/image-compress"
import { useDictionary } from "@/lib/dictionary-context"
import { getFieldValue, useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import { solidTone } from "@/lib/ui-tone"
import type {
  AttachmentMeta,
  ContainerMaster,
  InventoryRow,
  RepairLevel,
  RepairOrder,
  RepairProcessLogEntry,
  RepairStatus,
  Yard,
} from "@/lib/types"

const STATUS_TABS: Array<RepairStatus | "all"> = ["all", "待报修", "待检验", "维修中", "待验收", "已完工", "已报废"]
const LEVELS: RepairLevel[] = ["小修", "中修", "大修", "报废评估"]
const NEXT_STEP: Partial<Record<RepairStatus, { status: RepairStatus; label: string }>> = {
  "待报修": { status: "待检验", label: "提交报修" },
  "待检验": { status: "维修中", label: "检验通过·派修" },
  "维修中": { status: "待验收", label: "完工报验" },
  "待验收": { status: "已完工", label: "验收通过" },
}
const LEVEL_TONE: Record<RepairLevel, keyof typeof solidTone> = {
  "小修": "success",
  "中修": "warning",
  "大修": "danger",
  "报废评估": "muted",
}
const initialForm = {
  containerNo: "",
  containerType: CONTAINER_TYPES[0],
  ownership: "自有箱",
  yard: "",
  city: "",
  damageDesc: "",
  level: "小修" as RepairLevel,
  vendor: "",
  estCost: "",
  reportedBy: "",
}

type PhotoDraft = { blob: Blob; previewUrl: string; name: string; width: number; height: number }

type AdvanceFormState = {
  note: string
  inspectResult: string
  level: RepairLevel
  vendor: string
  estCost: string
  actualCost: string
  repairSummary: string
  acceptResult: string
}

const emptyAdvanceForm = (order?: RepairOrder | null): AdvanceFormState => ({
  note: "",
  inspectResult: "",
  level: order?.level ?? "小修",
  vendor: order?.vendor ?? "",
  estCost: order?.estCost?.toString() ?? "",
  actualCost: order?.actualCost?.toString() ?? "",
  repairSummary: "",
  acceptResult: "合格",
})

export default function RepairOrdersPage() {
  const { user } = useRole()
  const { pickupCities } = useDictionary()
  const actor = user?.name || user?.account || "系统用户"
  const { data: orders, create: createRepair, update: updateRepair } = useResource<RepairOrder>("repair")
  const { data: yards } = useResource<Yard>("yards")
  const { data: containers, create: createContainer, update: updateContainer } = useResource<ContainerMaster>("containers")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { data: attachments } = useResource<AttachmentMeta>("attachments")
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState<RepairStatus | "all">("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [advanceTarget, setAdvanceTarget] = useState<RepairOrder | null>(null)
  const [advanceForm, setAdvanceForm] = useState<AdvanceFormState>(emptyAdvanceForm())
  const [scrapTarget, setScrapTarget] = useState<RepairOrder | null>(null)
  const [scrapReason, setScrapReason] = useState("")
  const [detailTarget, setDetailTarget] = useState<RepairOrder | null>(null)
  const [form, setForm] = useState(initialForm)
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [uploading, setUploading] = useState(false)

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    return orders.filter((order) => {
      const matchesKeyword =
        !needle ||
        [order.repairNo, order.containerNo, order.yard, order.city, order.vendor, order.reportedBy, order.damageDesc].some((value) =>
          value.toLowerCase().includes(needle),
        )
      return matchesKeyword && (status === "all" || order.status === status)
    })
  }, [orders, keyword, status])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "reportedAt",
    defaultSortDir: "desc",
    getSortValue: (order, key) => {
      if (key === "location") return order.yard + order.city
      if (key === "cost") return order.actualCost ?? order.estCost
      return getFieldValue(order, key)
    },
  })

  const stats = useMemo(
    () => ({
      repairing: orders.filter((item) => item.status === "维修中").length,
      pending: orders.filter((item) => ["待报修", "待检验", "待验收"].includes(item.status)).length,
      scrapped: orders.filter((item) => item.status === "已报废").length,
      cost: orders.reduce((sum, item) => sum + (item.actualCost ?? 0), 0),
    }),
    [orders],
  )

  const detailPhotos = useMemo(() => {
    if (!detailTarget) return []
    return attachments.filter((item) => item.refType === "repair_photo" && item.refNo === detailTarget.repairNo)
  }, [attachments, detailTarget])

  const enabledYards = useMemo(
    () => yards.filter((item) => item.enabled && !item.deleted),
    [yards],
  )

  const yardsInCity = useMemo(
    () => (form.city ? enabledYards.filter((yard) => yard.city === form.city) : []),
    [enabledYards, form.city],
  )

  async function refresh() {
    await Promise.all([
      revalidateResource("repair"),
      revalidateResource("containers"),
      revalidateResource("inventory"),
      revalidateResource("attachments"),
    ])
  }

  function clearPhotos() {
    revokePreviewUrls(photos.map((p) => p.previewUrl))
    setPhotos([])
  }

  async function onPickPhotos(files: FileList | null) {
    if (!files?.length) return
    const next: PhotoDraft[] = []
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} 不是图片文件`)
          continue
        }
        const compressed = await compressImageToMaxWidth(file, 1440)
        next.push({
          blob: compressed.blob,
          previewUrl: compressed.previewUrl,
          name: file.name.replace(/\.\w+$/, "") + ".jpg",
          width: compressed.width,
          height: compressed.height,
        })
      }
      if (next.length) setPhotos((prev) => [...prev, ...next])
    } catch (error) {
      toast.error((error as Error).message || "图片压缩失败")
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index]
      if (target) revokePreviewUrls([target.previewUrl])
      return prev.filter((_, i) => i !== index)
    })
  }

  async function uploadPhotos(repairId: string, drafts: PhotoDraft[]) {
    for (const photo of drafts) {
      const body = new FormData()
      body.append("file", photo.blob, photo.name)
      const res = await fetch(`/api/repair/${encodeURIComponent(repairId)}/upload-photo`, {
        method: "POST",
        body,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `上传失败：${photo.name}`)
      }
    }
  }

  function buildLog(
    order: RepairOrder,
    toStatus: RepairStatus,
    action: string,
    note: string | undefined,
    fields: { label: string; value: string }[],
  ): RepairProcessLogEntry {
    return {
      at: nowLocalStr(),
      by: actor,
      fromStatus: order.status,
      toStatus,
      action,
      note: note?.trim() || undefined,
      fields: fields.filter((f) => f.value.trim()),
    }
  }

  async function enterRepair(order: Pick<RepairOrder, "repairNo" | "containerNo" | "containerType" | "ownership" | "yard" | "city">) {
    const container = containers.find((item) => item.containerNo === order.containerNo)
    const wasInRepair = container?.status === "维修中" && container.relatedOrderNo === order.repairNo
    if (container) {
      await updateContainer(container.containerNo, {
        status: "维修中",
        currentYard: order.yard,
        currentCity: order.city,
        relatedOrderNo: order.repairNo,
        lastGateTime: nowLocalStr(),
        __auditAction: "修改",
        __auditDetail: "修箱入场、箱状态设为维修中",
      })
    } else {
      await createContainer({
        containerNo: order.containerNo,
        type: order.containerType,
        ownership: order.ownership,
        currentYard: order.yard,
        currentCity: order.city,
        status: "维修中",
        lastGateTime: nowLocalStr(),
        storageDays: 0,
        relatedOrderNo: order.repairNo,
        __auditAction: "新增",
        __auditDetail: "报修创建箱主档",
      })
    }
    const row = findInventoryRow(inventory, { yard: order.yard, city: order.city })
    if (row && !wasInRepair) {
      await updateInventory(inventoryId(row), {
        available: Math.max(0, row.available - 1),
        __auditAction: "修改",
        __auditDetail: "修箱入场占用可用库存",
      })
    }
  }

  async function handleCreate() {
    if (!form.containerNo.trim() || !form.city || !form.yard || !form.damageDesc.trim()) {
      toast.error("请填写箱号、城市、堆场和损坏描述")
      return
    }
    const sequence = String(orders.filter((item) => item.repairNo.startsWith("RP2026")).length + 1).padStart(4, "0")
    const createLog: RepairProcessLogEntry = {
      at: nowLocalStr(),
      by: form.reportedBy || actor,
      fromStatus: "待报修",
      toStatus: "待报修",
      action: "新建报修",
      note: form.damageDesc.trim(),
      fields: [
        { label: "维修等级", value: form.level },
        { label: "维修厂", value: form.vendor || "待指定" },
        { label: "预估费用", value: String(Number(form.estCost) || 0) },
        { label: "照片数", value: String(photos.length) },
      ],
    }
    const order: Omit<RepairOrder, "id"> = {
      repairNo: "RP2026" + sequence,
      containerNo: form.containerNo.trim().toUpperCase(),
      containerType: form.containerType,
      ownership: form.ownership as RepairOrder["ownership"],
      yard: form.yard,
      city: form.city || yards.find((item) => item.name === form.yard)?.city || form.yard.slice(0, 4),
      damageDesc: form.damageDesc.trim(),
      level: form.level,
      vendor: form.vendor || "待指定",
      estCost: Number(form.estCost) || 0,
      reportedBy: form.reportedBy || actor,
      reportedAt: nowLocalStr(),
      status: "待报修",
      processLog: [createLog],
    }
    setUploading(true)
    try {
      const created = await createRepair({ ...order, __auditAction: "新增", __auditDetail: "新建修箱工单 " + order.repairNo })
      await enterRepair(order)
      if (photos.length && created?.id) {
        await uploadPhotos(created.id, photos)
      }
      await refresh()
      setCreateOpen(false)
      setForm(initialForm)
      clearPhotos()
      toast.success(photos.length ? `修箱工单已创建，已上传 ${photos.length} 张照片` : "修箱工单已创建并入修")
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function openAdvance(order: RepairOrder) {
    if (!NEXT_STEP[order.status]) return
    setAdvanceTarget(order)
    setAdvanceForm(emptyAdvanceForm(order))
  }

  async function confirmAdvance() {
    if (!advanceTarget) return
    const order = advanceTarget
    const step = NEXT_STEP[order.status]
    if (!step) return

    const fields: { label: string; value: string }[] = []
    const patch: Partial<RepairOrder> = { status: step.status }

    if (order.status === "待报修") {
      if (!advanceForm.note.trim()) {
        toast.error("请填写报修提交说明")
        return
      }
      fields.push({ label: "提交说明", value: advanceForm.note.trim() })
    }

    if (order.status === "待检验") {
      if (!advanceForm.inspectResult.trim()) {
        toast.error("请填写检验结论")
        return
      }
      if (!advanceForm.vendor.trim()) {
        toast.error("请指定维修厂")
        return
      }
      const est = Number(advanceForm.estCost)
      if (Number.isNaN(est) || est < 0) {
        toast.error("请输入有效的预估费用")
        return
      }
      patch.level = advanceForm.level
      patch.vendor = advanceForm.vendor.trim()
      patch.estCost = est
      fields.push(
        { label: "检验结论", value: advanceForm.inspectResult.trim() },
        { label: "维修等级", value: advanceForm.level },
        { label: "维修厂", value: advanceForm.vendor.trim() },
        { label: "预估费用", value: String(est) },
      )
      if (advanceForm.note.trim()) fields.push({ label: "备注", value: advanceForm.note.trim() })
    }

    if (order.status === "维修中") {
      const cost = Number(advanceForm.actualCost)
      if (Number.isNaN(cost) || cost < 0) {
        toast.error("请输入有效的实际维修费用")
        return
      }
      if (!advanceForm.repairSummary.trim()) {
        toast.error("请填写完工说明")
        return
      }
      patch.actualCost = cost
      fields.push(
        { label: "实际费用", value: String(cost) },
        { label: "完工说明", value: advanceForm.repairSummary.trim() },
      )
      if (advanceForm.note.trim()) fields.push({ label: "备注", value: advanceForm.note.trim() })
    }

    if (order.status === "待验收") {
      if (!advanceForm.acceptResult.trim()) {
        toast.error("请填写验收结论")
        return
      }
      fields.push({ label: "验收结论", value: advanceForm.acceptResult.trim() })
      if (advanceForm.note.trim()) fields.push({ label: "验收意见", value: advanceForm.note.trim() })
    }

    const note =
      order.status === "待报修"
        ? advanceForm.note
        : order.status === "维修中"
          ? advanceForm.repairSummary
          : advanceForm.note

    const log = buildLog(order, step.status, step.label, note, fields)
    patch.processLog = [...(order.processLog ?? []), log]

    try {
      if (step.status === "维修中") await enterRepair(order)
      if (step.status === "已完工") {
        patch.finishedAt = nowLocalStr()
        const container = containers.find((item) => item.containerNo === order.containerNo)
        if (container) {
          await updateContainer(container.containerNo, {
            status: "在场",
            currentYard: order.yard,
            currentCity: order.city,
            relatedOrderNo: undefined,
            lastGateTime: nowLocalStr(),
            __auditAction: "修改",
            __auditDetail: "修箱验收完成恢复在场",
          })
        }
        const row = findInventoryRow(inventory, { yard: order.yard, city: order.city })
        if (row) {
          await updateInventory(inventoryId(row), {
            available: row.available + 1,
            __auditAction: "修改",
            __auditDetail: "修箱验收完成回补可用库存",
          })
        }
      }
      await updateRepair(order.id, {
        ...patch,
        __auditAction: "修改",
        __auditDetail: `${step.label}：${fields.map((f) => `${f.label}=${f.value}`).join("；")}`,
      })
      await refresh()
      setAdvanceTarget(null)
      toast.success(step.label + "已完成并留痕")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function scrap() {
    if (!scrapTarget) return
    if (!scrapReason.trim()) {
      toast.error("请填写报废原因")
      return
    }
    try {
      const order = scrapTarget
      const log = buildLog(order, "已报废", "报废处置", scrapReason, [{ label: "报废原因", value: scrapReason.trim() }])
      await updateRepair(order.id, {
        status: "已报废",
        finishedAt: nowLocalStr(),
        processLog: [...(order.processLog ?? []), log],
        __auditAction: "修改",
        __auditDetail: "箱体维修无法修复、报废处理：" + scrapReason.trim(),
      })
      const container = containers.find((item) => item.containerNo === order.containerNo)
      if (container) {
        await updateContainer(container.containerNo, {
          status: "已报废",
          relatedOrderNo: order.repairNo,
          lastGateTime: nowLocalStr(),
          __auditAction: "修改",
          __auditDetail: "箱主档状态设为已报废",
        })
      }
      const row = findInventoryRow(inventory, { yard: order.yard, city: order.city })
      if (row) {
        await updateInventory(inventoryId(row), {
          onSite: Math.max(0, row.onSite - 1),
          available: Math.max(0, row.available - 1),
          __auditAction: "修改",
          __auditDetail: "报废扣减在场及可用库存",
        })
      }
      await refresh()
      setScrapTarget(null)
      setScrapReason("")
      toast.success("工单已报废并留痕")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const advanceStep = advanceTarget ? NEXT_STEP[advanceTarget.status] : null

  return (
    <>
      <PageHeader
        module="M06 · 维修管理"
        title="修箱工单"
        description="报修、检验、派修、验收及报废处置的全流程协作管理。"
        actions={
          <Button
            onClick={() => {
              setCreateOpen(true)
              setForm({ ...initialForm, reportedBy: actor })
            }}
          >
            <Plus className="mr-1 size-4" />
            新建报修
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="维修中" value={stats.repairing} unit="单" icon={Wrench} tone="danger" />
        <StatCard label="待处理" value={stats.pending} unit="单" icon={ClipboardList} tone="warning" />
        <StatCard label="已报废" value={stats.scrapped} unit="箱" icon={Trash2} tone="danger" />
        <StatCard label="累计维修费" value={stats.cost.toLocaleString()} unit="元" icon={CircleDollarSign} tone="success" />
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative max-w-md">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="搜索工单号 / 箱号 / 堆场 / 维修厂"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((item) => (
              <Button key={item} size="sm" variant={status === item ? "default" : "outline"} onClick={() => setStatus(item)}>
                {item === "all" ? "全部" : item}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="工单号" columnKey="repairNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="箱号" columnKey="containerNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="堆场 / 城市" columnKey="location" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="损坏等级" columnKey="level" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="维修厂" columnKey="vendor" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="费用" columnKey="cost" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="报修时间" columnKey="reportedAt" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.repairNo}</TableCell>
                    <TableCell>
                      <p className="font-mono text-xs">{order.containerNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.containerType} · {order.ownership}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {order.yard}
                      <p className="text-xs text-muted-foreground">{order.city}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={solidTone[LEVEL_TONE[order.level]]}>{order.level}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{order.vendor}</TableCell>
                    <TableCell className="text-sm">
                      预估 {order.estCost.toLocaleString()}
                      <p className="text-xs text-muted-foreground">
                        {order.actualCost == null ? "未录入" : "实际 " + order.actualCost.toLocaleString()}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{order.reportedAt}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetailTarget(order)}>
                        <Eye className="mr-1 size-3.5" />
                        详情
                      </Button>
                      {NEXT_STEP[order.status] && (
                        <Button size="sm" variant="ghost" onClick={() => openAdvance(order)}>
                          {NEXT_STEP[order.status]?.label}
                        </Button>
                      )}
                      {!["已完工", "已报废"].includes(order.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            setScrapTarget(order)
                            setScrapReason("")
                          }}
                        >
                          报废
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      未找到匹配的修箱工单
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <ListPagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) clearPhotos()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>新建修箱报修</DialogTitle>
            <DialogDescription>提交后工单进入待报修状态并同步箱主档和库存；损坏照片将压缩至宽 1440px。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="箱号">
              <Input value={form.containerNo} onChange={(event) => setForm({ ...form, containerNo: event.target.value })} />
            </Field>
            <Field label="箱型">
              <Select
                value={form.containerType}
                onValueChange={(value) => setForm({ ...form, containerType: (value ?? "") as RepairOrder["containerType"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTAINER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="城市">
              <CitySearchSelect
                value={form.city}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    city: value,
                    yard: "",
                  })
                }
                cities={pickupCities}
                placeholder="选择城市"
              />
            </Field>
            <Field label="堆场">
              <Select
                value={form.yard}
                disabled={!form.city}
                onValueChange={(value) => setForm({ ...form, yard: value ?? "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.city ? "选择该城市堆场" : "请先选择城市"} />
                </SelectTrigger>
                <SelectContent>
                  {yardsInCity.map((yard) => (
                    <SelectItem key={yard.id} value={yard.name}>
                      {yard.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="维修等级">
              <Select
                value={form.level}
                onValueChange={(value) => setForm({ ...form, level: (value ?? "小修") as RepairLevel })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="预估费用">
              <Input type="number" min="0" value={form.estCost} onChange={(event) => setForm({ ...form, estCost: event.target.value })} />
            </Field>
            <Field label="维修厂">
              <Input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} />
            </Field>
            <Field label="报修人">
              <Input value={form.reportedBy} onChange={(event) => setForm({ ...form, reportedBy: event.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="损坏描述">
                <Textarea
                  rows={2}
                  value={form.damageDesc}
                  onChange={(event) => setForm({ ...form, damageDesc: event.target.value })}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="损坏照片（可多选，自动压缩至宽 1440px）">
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={(event) => {
                    void onPickPhotos(event.target.files)
                    event.target.value = ""
                  }}
                />
              </Field>
              {photos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((photo, index) => (
                    <div key={photo.previewUrl} className="relative overflow-hidden rounded-md border bg-muted/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.previewUrl} alt={photo.name} className="aspect-square w-full object-cover" />
                      <p className="truncate px-1 py-0.5 text-[10px] text-muted-foreground">
                        {photo.width}×{photo.height}
                      </p>
                      <button
                        type="button"
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                        onClick={() => removePhoto(index)}
                        aria-label="移除照片"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false)
                clearPhotos()
              }}
            >
              取消
            </Button>
            <Button disabled={uploading} onClick={handleCreate}>
              {uploading ? "提交中…" : "提交报修"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!advanceTarget} onOpenChange={(open) => !open && setAdvanceTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{advanceStep?.label ?? "节点录入"}</DialogTitle>
            <DialogDescription>
              {advanceTarget?.repairNo}：{advanceTarget?.status} → {advanceStep?.status}，提交后写入节点留痕。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {advanceTarget?.status === "待报修" && (
              <Field label="报修提交说明（必填）">
                <Textarea
                  rows={3}
                  placeholder="补充损坏部位、紧急程度等"
                  value={advanceForm.note}
                  onChange={(event) => setAdvanceForm({ ...advanceForm, note: event.target.value })}
                />
              </Field>
            )}
            {advanceTarget?.status === "待检验" && (
              <>
                <Field label="检验结论（必填）">
                  <Textarea
                    rows={2}
                    placeholder="损坏确认、可否修复等"
                    value={advanceForm.inspectResult}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, inspectResult: event.target.value })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="维修等级">
                    <Select
                      value={advanceForm.level}
                      onValueChange={(value) => setAdvanceForm({ ...advanceForm, level: (value ?? "小修") as RepairLevel })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="预估费用">
                    <Input
                      type="number"
                      min="0"
                      value={advanceForm.estCost}
                      onChange={(event) => setAdvanceForm({ ...advanceForm, estCost: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="维修厂（必填）">
                  <Input
                    value={advanceForm.vendor}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, vendor: event.target.value })}
                  />
                </Field>
                <Field label="备注">
                  <Textarea
                    rows={2}
                    value={advanceForm.note}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, note: event.target.value })}
                  />
                </Field>
              </>
            )}
            {advanceTarget?.status === "维修中" && (
              <>
                <Field label="实际维修费用（必填）">
                  <Input
                    type="number"
                    min="0"
                    value={advanceForm.actualCost}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, actualCost: event.target.value })}
                  />
                </Field>
                <Field label="完工说明（必填）">
                  <Textarea
                    rows={3}
                    placeholder="维修项目、换件情况、完工质量说明"
                    value={advanceForm.repairSummary}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, repairSummary: event.target.value })}
                  />
                </Field>
                <Field label="备注">
                  <Textarea
                    rows={2}
                    value={advanceForm.note}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, note: event.target.value })}
                  />
                </Field>
              </>
            )}
            {advanceTarget?.status === "待验收" && (
              <>
                <Field label="验收结论">
                  <Select
                    value={advanceForm.acceptResult}
                    onValueChange={(value) => setAdvanceForm({ ...advanceForm, acceptResult: value ?? "合格" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="合格">合格</SelectItem>
                      <SelectItem value="有条件通过">有条件通过</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="验收意见">
                  <Textarea
                    rows={3}
                    placeholder="验收检查结果、遗留问题等"
                    value={advanceForm.note}
                    onChange={(event) => setAdvanceForm({ ...advanceForm, note: event.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmAdvance}>确认提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!scrapTarget}
        onOpenChange={(open) => {
          if (!open) {
            setScrapTarget(null)
            setScrapReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认报废</DialogTitle>
            <DialogDescription>{scrapTarget?.repairNo} 将终止维修并扣减在场库存，请填写报废原因留痕。</DialogDescription>
          </DialogHeader>
          <Field label="报废原因（必填）">
            <Textarea
              rows={3}
              placeholder="无法修复的具体原因、评估依据等"
              value={scrapReason}
              onChange={(event) => setScrapReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScrapTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={scrap}>
              确认报废
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>工单详情 · {detailTarget?.repairNo}</DialogTitle>
            <DialogDescription>
              {detailTarget?.containerNo} · {detailTarget?.status} · {detailTarget?.level}
            </DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">堆场：</span>
                  {detailTarget.yard} / {detailTarget.city}
                </p>
                <p>
                  <span className="text-muted-foreground">维修厂：</span>
                  {detailTarget.vendor}
                </p>
                <p>
                  <span className="text-muted-foreground">预估/实际：</span>
                  {detailTarget.estCost.toLocaleString()} / {detailTarget.actualCost?.toLocaleString() ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">报修人：</span>
                  {detailTarget.reportedBy} · {detailTarget.reportedAt}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium">损坏描述</p>
                <p className="text-muted-foreground">{detailTarget.damageDesc}</p>
              </div>
              {detailPhotos.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">损坏照片（{detailPhotos.length}）</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {detailPhotos.map((photo) => (
                      <a
                        key={photo.id}
                        href={`/api/attachments/${encodeURIComponent(photo.id)}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-md border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/attachments/${encodeURIComponent(photo.id)}/file`}
                          alt={photo.fileName}
                          className="aspect-square w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 font-medium">节点留痕</p>
                {(detailTarget.processLog?.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground">暂无流转记录</p>
                ) : (
                  <ol className="space-y-3 border-l-2 border-muted pl-4">
                    {(detailTarget.processLog ?? []).map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className="relative">
                        <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{entry.action}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {entry.fromStatus} → {entry.toStatus}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.at} · {entry.by}
                        </p>
                        {entry.note && <p className="mt-1">{entry.note}</p>}
                        {(entry.fields?.length ?? 0) > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {entry.fields!.map((field) => (
                              <li key={field.label}>
                                {field.label}：{field.value}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
