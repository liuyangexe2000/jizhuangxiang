"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useResource, revalidateResource } from "@/lib/api"
import { getFieldValue, useListQuery } from "@/lib/list-query"
import type { ContainerMaster, DispatchOrder, GateRecord, InventoryRow, UseBoxOrder } from "@/lib/types"
import { applyPickupInventory, applyReturnInventory, findInventoryRow } from "@/lib/domain/dispatch-ops"
import { GitCompareArrows, ArrowDownToLine, ArrowUpFromLine, Link2, AlertTriangle } from "lucide-react"

export default function GatePage() {
  const { data: gateRecords, update } = useResource<GateRecord>("gate")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { data: containers, update: updateContainer } = useResource<ContainerMaster>("containers")
  const { data: dispatches } = useResource<DispatchOrder>("dispatch")
  const { data: orders } = useResource<UseBoxOrder>("orders")
  const [type, setType] = useState("全部")
  const [mapping, setMapping] = useState("全部")

  const filtered = useMemo(() => {
    return gateRecords.filter((r) => {
      const mt = type === "全部" || r.type === type
      const mm = mapping === "全部" || r.mappingStatus === mapping
      return mt && mm
    })
  }, [gateRecords, type, mapping])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "time",
    defaultSortDir: "desc",
    getSortValue: (r, key) => {
      if (key === "yardCity") return `${r.yard} ${r.city}`
      return getFieldValue(r, key)
    },
  })

  const mapped = gateRecords.filter((r) => r.mappingStatus === "已映射").length
  const unmapped = gateRecords.filter((r) => r.mappingStatus === "未映射").length
  const abnormal = gateRecords.filter((r) => r.mappingStatus === "异常").length

  function guessOrderNo(rec: GateRecord) {
    const byContainer = containers.find((c) => c.containerNo === rec.containerNo)?.relatedOrderNo
    if (byContainer) return byContainer
    const byDispatch = dispatches.find(
      (d) => d.pickupPlace === rec.yard || d.status === "提箱中" || d.status === "还箱中",
    )?.dispatchNo
    if (byDispatch) return byDispatch
    return orders.find((o) => o.status === "提箱中" || o.status === "还箱中")?.orderNo
  }

  async function autoMatch(id: string) {
    const rec = gateRecords.find((r) => r.id === id)
    if (!rec || rec.mappingStatus === "已映射") return
    const orderNo = guessOrderNo(rec) ?? rec.relatedOrderNo
    try {
      await update(id, {
        mappingStatus: "已映射",
        relatedOrderNo: orderNo,
        __auditAction: "修改",
        __auditDetail: `自动匹配订单 ${rec.containerNo}`,
      })

      const inv = findInventoryRow(inventory, { yard: rec.yard, city: rec.city })
      if (inv?.id) {
        const patch =
          rec.type === "出场" ? applyPickupInventory(inv, 1) : applyReturnInventory(inv, 1)
        await updateInventory(inv.id, {
          ...patch,
          __auditAction: "修改",
          __auditDetail: `进出场映射同步库存 ${rec.yard} ${rec.type}`,
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
          __auditDetail: `进出场映射更新主档 ${rec.containerNo}`,
        })
      }

      await Promise.all([
        revalidateResource("gate"),
        revalidateResource("inventory"),
        revalidateResource("containers"),
      ])
      toast.success(
        orderNo
          ? `已自动匹配订单 ${orderNo}，并同步库存`
          : "已标记为已映射并同步库存（未找到关联订单号）",
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M03 · 资产与多维库存管理系统"
        title="进出场映射"
        description="M03-F02 库存计算与映射引擎 — 进出场记录与系统放箱/调运订单自动映射，驱动库存实时增减。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="已映射记录" value={mapped} icon={Link2} tone="success" hint="自动关联订单" />
        <StatCard label="未映射记录" value={unmapped} icon={GitCompareArrows} tone="warning" hint="待人工确认" />
        <StatCard label="异常记录" value={abnormal} icon={AlertTriangle} tone="danger" hint="进入异常池排查" />
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <Rule icon={ArrowDownToLine} title="进场 → 在场 +1" desc="代管公司上传或系统还箱触发进场，在场库存增加" />
          <Rule icon={ArrowUpFromLine} title="出场 → 在场 −1" desc="系统放箱/调运提箱触发出场，转为已提未还在途" />
          <Rule icon={Link2} title="自动映射" desc="按箱号与调运订单/放箱指令匹配，未匹配进入异常池" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">进出场记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={type} onValueChange={(v) => setType(v ?? "全部")}>
              <SelectTrigger className="w-36"><SelectValue placeholder="类型" /></SelectTrigger>
              <SelectContent>
                {["全部", "进场", "出场"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={mapping} onValueChange={(v) => setMapping(v ?? "全部")}>
              <SelectTrigger className="w-36"><SelectValue placeholder="映射状态" /></SelectTrigger>
              <SelectContent>
                {["全部", "已映射", "未映射", "异常"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="箱号" columnKey="containerNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="类型" columnKey="type" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="时间" columnKey="time" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="堆场 / 城市" columnKey="yardCity" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="数据来源" columnKey="source" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="关联订单" columnKey="relatedOrderNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="映射状态" columnKey="mappingStatus" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs font-medium">{r.containerNo}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-sm ${r.type === "进场" ? "text-success" : "text-primary"}`}>
                        {r.type === "进场" ? <ArrowDownToLine className="size-3.5" /> : <ArrowUpFromLine className="size-3.5" />}
                        {r.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.time}</TableCell>
                    <TableCell className="text-sm">{r.yard}<span className="text-muted-foreground"> · {r.city}</span></TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.source}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.relatedOrderNo ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={r.mappingStatus} /></TableCell>
                    <TableCell className="text-right">
                      {r.mappingStatus !== "已映射" ? (
                        <Button size="sm" variant="outline" onClick={() => autoMatch(r.id)}>
                          自动匹配
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      未找到匹配的进出场记录
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

function Rule({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}
