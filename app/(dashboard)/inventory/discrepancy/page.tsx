"use client"

import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { DiscrepancyRow, InventoryRow } from "@/lib/types"
import { findInventoryRow, nowLocalStr } from "@/lib/domain/dispatch-ops"
import { ScaleIcon, CheckCircle2, AlertCircle, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"

export default function DiscrepancyPage() {
  const { data: rows, update, create } = useResource<DiscrepancyRow>("discrepancy")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const [keyword, setKeyword] = useState("")

  const pending = rows.filter((r) => r.status === "待核对").length
  const fixed = rows.filter((r) => r.status === "已修正").length
  const totalDiff = useMemo(() => rows.reduce((s, r) => s + Math.abs(r.diff), 0), [rows])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter(
      (r) =>
        r.yard.toLowerCase().includes(kw) ||
        r.city.toLowerCase().includes(kw) ||
        r.status.toLowerCase().includes(kw) ||
        r.checkedAt.toLowerCase().includes(kw),
    )
  }, [rows, keyword])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "checkedAt",
    defaultSortDir: "desc",
  })

  async function handleFix(id: string) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const agentCount = row.agentCount
    try {
      await update(id, {
        status: "已修正",
        systemCount: agentCount,
        diff: 0,
        checkedAt: nowLocalStr().slice(0, 10),
        __auditAction: "修改",
        __auditDetail: `核实修正库存差异 ${row.yard}`,
      })

      const inv = findInventoryRow(inventory, { yard: row.yard, city: row.city })
      if (inv?.id) {
        const delta = agentCount - inv.onSite
        await updateInventory(inv.id, {
          onSite: agentCount,
          available: Math.max(0, inv.available + delta),
          __auditAction: "修改",
          __auditDetail: `差异核实同步库存 ${row.yard} → 在场 ${agentCount}`,
        })
      }

      await Promise.all([revalidateResource("discrepancy"), revalidateResource("inventory")])
      toast.success("已按代管公司数据修正系统库存")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleSync() {
    const checkedAt = nowLocalStr()
    try {
      let updated = 0
      let created = 0

      for (const inv of inventory) {
        const existing = rows.find((r) => r.yard === inv.yard)
        const systemCount = inv.onSite

        if (existing) {
          const agentCount = existing.agentCount
          const diff = agentCount - systemCount
          const status: DiscrepancyRow["status"] =
            existing.status === "已修正" && diff === 0
              ? "已修正"
              : diff === 0
                ? "无差异"
                : "待核对"
          await update(existing.id, {
            systemCount,
            agentCount,
            diff,
            checkedAt,
            status,
            __auditAction: "修改",
            __auditDetail: `同步代管对账 ${inv.yard}`,
          })
          updated += 1
        } else {
          const jitter = Math.floor(Math.random() * 5) - 2
          const agentCount = Math.max(0, systemCount + jitter)
          const diff = agentCount - systemCount
          await create({
            yard: inv.yard,
            city: inv.city,
            systemCount,
            agentCount,
            diff,
            checkedAt,
            status: diff === 0 ? "无差异" : "待核对",
            __auditAction: "新增",
            __auditDetail: `同步新建差异行 ${inv.yard}`,
          })
          created += 1
        }
      }

      await revalidateResource("discrepancy")
      toast.success(`代管数据已同步：更新 ${updated} 条，新建 ${created} 条`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="库存差异核对"
        description="系统库存与代管公司实际盘点数据对账，处理差异"
        actions={
          <Button variant="outline" onClick={handleSync} className="gap-2 bg-transparent">
            <RefreshCw className="size-4" />
            同步代管数据
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="待核对堆场" value={pending} unit="个" icon={AlertCircle} tone="warning" />
        <StatCard label="已修正" value={fixed} unit="个" icon={CheckCircle2} tone="success" />
        <StatCard label="累计差异箱量" value={totalDiff} unit="TEU" icon={ScaleIcon} tone="primary" />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>差异明细</CardTitle>
            <CardDescription>系统库存与代管公司盘点数量对比，差异需人工核实修正</CardDescription>
          </div>
          <div className="relative sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索堆场 / 城市 / 状态"
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
                    label="堆场"
                    columnKey="yard"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="城市"
                    columnKey="city"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="系统库存"
                    columnKey="systemCount"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="代管盘点"
                    columnKey="agentCount"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="差异"
                    columnKey="diff"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="核对时间"
                    columnKey="checkedAt"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="状态"
                    columnKey="status"
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
                    <TableCell className="font-medium">{r.yard}</TableCell>
                    <TableCell>{r.city}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.systemCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.agentCount}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          r.diff === 0
                            ? "text-muted-foreground"
                            : "font-semibold text-destructive"
                        }
                      >
                        {r.diff > 0 ? `+${r.diff}` : r.diff}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.checkedAt}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "待核对" ? (
                        <Button size="sm" variant="outline" onClick={() => handleFix(r.id)}>
                          核实修正
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
                      未找到匹配的差异记录
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
    </div>
  )
}
