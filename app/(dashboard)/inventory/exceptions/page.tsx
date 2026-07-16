"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { ContainerMaster, DispatchOrder, GateRecord, InventoryRow, UseBoxOrder } from "@/lib/types"
import { applyPickupInventory, applyReturnInventory, findInventoryRow, nowLocalStr } from "@/lib/domain/dispatch-ops"
import { AlertTriangle, Plus, Wrench, CheckCircle2, Search } from "lucide-react"

const yards = ["西安新筑堆场", "郑州圃田堆场", "成都青白江堆场", "汉堡港堆场", "杜伊斯堡堆场", "华沙中央堆场"]

export default function ExceptionsPage() {
  const { data: allRecords, create, update } = useResource<GateRecord>("gate")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { data: containers, update: updateContainer } = useResource<ContainerMaster>("containers")
  const { data: dispatches } = useResource<DispatchOrder>("dispatch")
  const { data: orders } = useResource<UseBoxOrder>("orders")
  const [keyword, setKeyword] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ containerNo: "", type: "进场", yard: yards[0] })

  const pool = useMemo(
    () => allRecords.filter((r) => r.mappingStatus !== "已映射"),
    [allRecords],
  )
  const unmapped = pool.filter((r) => r.mappingStatus === "未映射").length
  const abnormal = pool.filter((r) => r.mappingStatus === "异常").length

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return pool
    return pool.filter(
      (r) =>
        r.containerNo.toLowerCase().includes(kw) ||
        r.yard.toLowerCase().includes(kw) ||
        r.city.toLowerCase().includes(kw) ||
        r.source.toLowerCase().includes(kw) ||
        r.mappingStatus.toLowerCase().includes(kw) ||
        r.type.toLowerCase().includes(kw) ||
        (r.relatedOrderNo?.toLowerCase().includes(kw) ?? false),
    )
  }, [pool, keyword])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "time",
    defaultSortDir: "desc",
  })

  function guessOrderNo(rec: GateRecord) {
    const byContainer = containers.find((c) => c.containerNo === rec.containerNo)?.relatedOrderNo
    if (byContainer) return byContainer
    const byDispatch = dispatches.find(
      (d) => d.pickupPlace === rec.yard || d.status === "提箱中" || d.status === "还箱中",
    )?.dispatchNo
    if (byDispatch) return byDispatch
    return orders.find((o) => o.status === "提箱中" || o.status === "还箱中")?.orderNo
  }

  async function resolve(id: string) {
    const rec = pool.find((r) => r.id === id)
    if (!rec) return
    const orderNo = guessOrderNo(rec) ?? rec.relatedOrderNo
    try {
      await update(id, {
        mappingStatus: "已映射",
        relatedOrderNo: orderNo,
        __auditAction: "修改",
        __auditDetail: `手工匹配订单并移出异常池 ${rec.containerNo}`,
      })

      const inv = findInventoryRow(inventory, { yard: rec.yard, city: rec.city })
      if (inv?.id) {
        const patch =
          rec.type === "出场" ? applyPickupInventory(inv, 1) : applyReturnInventory(inv, 1)
        await updateInventory(inv.id, {
          ...patch,
          __auditAction: "修改",
          __auditDetail: `异常映射同步库存 ${rec.yard} ${rec.type}`,
        })
      }

      const c = containers.find((x) => x.containerNo === rec.containerNo)
      if (c) {
        await updateContainer(rec.containerNo, {
          relatedOrderNo: orderNo,
          currentYard: rec.yard,
          currentCity: rec.city,
          status: rec.type === "出场" ? "已提未还" : "在场",
          lastGateTime: rec.time,
          __auditAction: "修改",
          __auditDetail: `异常映射更新主档 ${rec.containerNo}`,
        })
      }

      await Promise.all([
        revalidateResource("gate"),
        revalidateResource("inventory"),
        revalidateResource("containers"),
      ])
      toast.success(
        orderNo
          ? `已匹配订单 ${orderNo}，记录移出异常池并同步库存`
          : "已标记为已映射并同步库存（未找到关联订单号）",
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function addManual() {
    if (!form.containerNo.trim()) {
      toast.error("请填写箱号")
      return
    }
    const city = form.yard.replace(/(港|中央)?堆场$/, "").slice(0, 10) || form.yard.slice(0, 2)
    try {
      await create({
        containerNo: form.containerNo.toUpperCase(),
        type: form.type as "进场" | "出场",
        time: nowLocalStr(),
        yard: form.yard,
        city,
        source: "手工补录异常",
        mappingStatus: "未映射",
        ownership: "自有箱",
        __auditAction: "新增",
        __auditDetail: `手工补录进出场 ${form.containerNo.toUpperCase()}`,
      })
      toast.success("手工补录成功，已加入异常排查池待映射")
      setAddOpen(false)
      setForm({ containerNo: "", type: "进场", yard: yards[0] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M03 · 资产与多维库存管理系统"
        title="异常进出场"
        description="M03-F03 手工补录与异常排查池 — 未映射/异常记录集中排查，支持手工补录进出场并重新匹配订单。"
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={<Button className="gap-1.5" />}>
              <Plus className="size-4" />手工补录
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>手工补录进出场</DialogTitle>
                <DialogDescription>用于代管公司漏传或系统未捕获的进出场记录。</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>箱号</Label>
                  <Input placeholder="如 TCLU1234567" value={form.containerNo} onChange={(e) => setForm((f) => ({ ...f, containerNo: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>类型</Label>
                    <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v ?? "进场" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="进场">进场</SelectItem>
                        <SelectItem value="出场">出场</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>堆场</Label>
                    <Select value={form.yard} onValueChange={(v) => setForm((f) => ({ ...f, yard: v ?? yards[0] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {yards.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
                <Button onClick={addManual}>提交补录</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="异常池总数" value={pool.length} icon={AlertTriangle} tone="warning" />
        <StatCard label="未映射" value={unmapped} icon={Wrench} tone="warning" />
        <StatCard label="异常记录" value={abnormal} icon={AlertTriangle} tone="danger" />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-base">异常排查池</CardTitle>
          <div className="relative sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索箱号 / 堆场 / 来源 / 状态"
              className="pl-8"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="箱号"
                    columnKey="containerNo"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="类型"
                    columnKey="type"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="时间"
                    columnKey="time"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="堆场 / 城市"
                    columnKey="yard"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="来源"
                    columnKey="source"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="映射状态"
                    columnKey="mappingStatus"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs font-medium">{r.containerNo}</TableCell>
                    <TableCell>{r.type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.time}</TableCell>
                    <TableCell className="text-sm">{r.yard} · {r.city}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.source}</TableCell>
                    <TableCell><StatusBadge status={r.mappingStatus} /></TableCell>
                    <TableCell className="text-right">
                      {r.mappingStatus === "已映射" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="size-3.5" /> 已处理
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => resolve(r.id)}>
                          匹配订单
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {pool.length === 0 ? "异常池已清空" : "未找到匹配的异常记录"}
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
    </>
  )
}
