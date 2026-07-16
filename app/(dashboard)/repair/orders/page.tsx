"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, CircleDollarSign, ClipboardList, Plus, Search, Trash2, Wrench } from "lucide-react"
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
import { useResource, revalidateResource } from "@/lib/api"
import { CONTAINER_TYPES } from "@/lib/container-types"
import { findInventoryRow, inventoryId, nowLocalStr } from "@/lib/domain/dispatch-ops"
import { getFieldValue, useListQuery } from "@/lib/list-query"
import { solidTone } from "@/lib/ui-tone"
import type { ContainerMaster, InventoryRow, RepairLevel, RepairOrder, RepairStatus, Yard } from "@/lib/types"

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

export default function RepairOrdersPage() {
  const { data: orders, create: createRepair, update: updateRepair } = useResource<RepairOrder>("repair")
  const { data: yards } = useResource<Yard>("yards")
  const { data: containers, create: createContainer, update: updateContainer } = useResource<ContainerMaster>("containers")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState<RepairStatus | "all">("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [costTarget, setCostTarget] = useState<RepairOrder | null>(null)
  const [scrapTarget, setScrapTarget] = useState<RepairOrder | null>(null)
  const [actualCost, setActualCost] = useState("")
  const [form, setForm] = useState(initialForm)

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

  async function refresh() {
    await Promise.all([revalidateResource("repair"), revalidateResource("containers"), revalidateResource("inventory")])
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
    if (!form.containerNo.trim() || !form.yard || !form.damageDesc.trim()) {
      toast.error("请填写箱号、堆场和损坏描述")
      return
    }
    const sequence = String(orders.filter((item) => item.repairNo.startsWith("RP2026")).length + 1).padStart(4, "0")
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
      reportedBy: form.reportedBy || "系统用户",
      reportedAt: nowLocalStr(),
      status: "待报修",
    }
    try {
      await createRepair({ ...order, __auditAction: "新增", __auditDetail: "新建修箱工单 " + order.repairNo })
      await enterRepair(order)
      await refresh()
      setCreateOpen(false)
      setForm(initialForm)
      toast.success("修箱工单已创建并入修")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function advance(order: RepairOrder) {
    const step = NEXT_STEP[order.status]
    if (!step) return
    if (order.status === "维修中") {
      setCostTarget(order)
      setActualCost(order.actualCost?.toString() ?? "")
      return
    }
    try {
      if (step.status === "维修中") await enterRepair(order)
      const patch: Partial<RepairOrder> = { status: step.status }
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
      await updateRepair(order.id, { ...patch, __auditAction: "流转", __auditDetail: step.label })
      await refresh()
      toast.success(step.label)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function confirmCost() {
    if (!costTarget || Number.isNaN(Number(actualCost)) || Number(actualCost) < 0) {
      toast.error("请输入有效的实际维修费用")
      return
    }
    try {
      await updateRepair(costTarget.id, {
        status: "待验收",
        actualCost: Number(actualCost),
        __auditAction: "流转",
        __auditDetail: "完工报验并录入实际费用",
      })
      await refresh()
      setCostTarget(null)
      toast.success("费用已录入并提交验收")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function scrap() {
    if (!scrapTarget) return
    try {
      const order = scrapTarget
      await updateRepair(order.id, {
        status: "已报废",
        finishedAt: nowLocalStr(),
        __auditAction: "报废",
        __auditDetail: "箱体维修无法修复、报废处理",
      })
      const container = containers.find((item) => item.containerNo === order.containerNo)
      if (container) {
        await updateContainer(container.containerNo, {
          status: "已报废",
          relatedOrderNo: order.repairNo,
          lastGateTime: nowLocalStr(),
          __auditAction: "报废",
          __auditDetail: "箱主档状态设为已报废",
        })
      }
      const row = findInventoryRow(inventory, { yard: order.yard, city: order.city })
      if (row) {
        await updateInventory(inventoryId(row), {
          onSite: Math.max(0, row.onSite - 1),
          available: Math.max(0, row.available - 1),
          __auditAction: "报废",
          __auditDetail: "报废扣减在场及可用库存",
        })
      }
      await refresh()
      setScrapTarget(null)
      toast.success("工单已报废")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M06 · 维修管理"
        title="修箱工单"
        description="报修、检验、派修、验收及报废处置的全流程协作管理。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
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
                      {NEXT_STEP[order.status] && (
                        <Button size="sm" variant="ghost" onClick={() => advance(order)}>
                          {NEXT_STEP[order.status]?.label}
                        </Button>
                      )}
                      {!["已完工", "已报废"].includes(order.status) && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setScrapTarget(order)}>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>新建修箱报修</DialogTitle>
            <DialogDescription>提交后工单进入待报修状态并同步箱主档和库存。</DialogDescription>
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
            <Field label="堆场">
              <Select
                value={form.yard}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    yard: value ?? "",
                    city: yards.find((item) => item.name === (value ?? ""))?.city ?? form.city,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择堆场" />
                </SelectTrigger>
                <SelectContent>
                  {yards
                    .filter((item) => item.enabled)
                    .map((yard) => (
                      <SelectItem key={yard.id} value={yard.name}>
                        {yard.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="城市">
              <Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
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
                <Input value={form.damageDesc} onChange={(event) => setForm({ ...form, damageDesc: event.target.value })} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate}>提交报修</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!costTarget} onOpenChange={(open) => !open && setCostTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>完工报验与费用录入</DialogTitle>
            <DialogDescription>{costTarget?.repairNo} 将流转至待验收。</DialogDescription>
          </DialogHeader>
          <Field label="实际维修费用">
            <Input type="number" min="0" value={actualCost} onChange={(event) => setActualCost(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmCost}>确认报验</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scrapTarget} onOpenChange={(open) => !open && setScrapTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认报废</DialogTitle>
            <DialogDescription>{scrapTarget?.repairNo} 将终止维修并扣减在场库存。</DialogDescription>
          </DialogHeader>
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
