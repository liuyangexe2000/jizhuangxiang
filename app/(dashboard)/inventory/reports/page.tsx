"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { InventoryRow, ContainerMaster } from "@/lib/types"
import { downloadCsv } from "@/lib/csv"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import { Boxes, Layers, Timer, Warehouse, Download } from "lucide-react"

const regionChartConfig = {
  onSite: { label: "在场库存", color: "var(--chart-1)" },
  available: { label: "可用库存", color: "var(--chart-3)" },
} satisfies ChartConfig

const dwellChartConfig = {
  count: { label: "箱量", color: "var(--chart-2)" },
} satisfies ChartConfig

const dwellBuckets = [
  { key: "0-7天", min: 0, max: 7 },
  { key: "8-15天", min: 8, max: 15 },
  { key: "16-30天", min: 16, max: 30 },
  { key: "31-60天", min: 31, max: 60 },
  { key: "60天以上", min: 61, max: Number.POSITIVE_INFINITY },
]

export default function InventoryAnalyticsPage() {
  const { data: inventory } = useResource<InventoryRow>("inventory")
  const { data: containerMasters } = useResource<ContainerMaster>("containers")
  const [minDays, setMinDays] = useState("")
  const [maxDays, setMaxDays] = useState("")

  const filteredContainers = useMemo(() => {
    const min = minDays.trim() === "" ? null : Number(minDays)
    const max = maxDays.trim() === "" ? null : Number(maxDays)
    return containerMasters.filter((c) => {
      if (min != null && Number.isFinite(min) && c.storageDays < min) return false
      if (max != null && Number.isFinite(max) && c.storageDays > max) return false
      return true
    })
  }, [containerMasters, minDays, maxDays])

  const regionData = useMemo(() => {
    const map = new Map<string, { region: string; onSite: number; available: number }>()
    for (const row of inventory) {
      const cur = map.get(row.region) ?? { region: row.region, onSite: 0, available: 0 }
      cur.onSite += row.onSite
      cur.available += row.available
      map.set(row.region, cur)
    }
    return Array.from(map.values())
  }, [inventory])

  const cityData = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of inventory) {
      map.set(row.city, (map.get(row.city) ?? 0) + row.onSite)
    }
    return Array.from(map.entries())
      .map(([city, onSite]) => ({ city, onSite }))
      .sort((a, b) => b.onSite - a.onSite)
      .slice(0, 8)
  }, [inventory])

  const dwellData = useMemo(() => {
    return dwellBuckets.map((b) => ({
      bucket: b.key,
      count: filteredContainers.filter((c) => c.storageDays >= b.min && c.storageDays <= b.max).length,
    }))
  }, [filteredContainers])

  const overdue = useMemo(
    () => filteredContainers.filter((c) => c.storageDays > 30),
    [filteredContainers],
  )

  const list = useListQuery({
    data: overdue,
    defaultSortKey: "storageDays",
    defaultSortDir: "desc",
  })

  const totalOnSite = inventory.reduce((s, r) => s + r.onSite, 0)
  const totalAvailable = inventory.reduce((s, r) => s + r.available, 0)
  const totalIncoming = inventory.reduce((s, r) => s + r.incoming, 0)
  const avgDwell = Math.round(
    filteredContainers.reduce((s, c) => s + c.storageDays, 0) / (filteredContainers.length || 1),
  )

  function exportReportCsv() {
    // 导出全部筛选结果（分页前），不受超期表当前页限制
    const headers = ["箱号", "当前堆场", "城市", "堆存天数", "最近进出场", "状态", "箱型"]
    const rows = filteredContainers.map((c) => [
      c.containerNo,
      c.currentYard,
      c.currentCity,
      c.storageDays,
      c.lastGateTime,
      c.status,
      c.type,
    ])
    const stamp = nowLocalStr().replace(/[:\s]/g, "").slice(0, 12)
    downloadCsv(`库存报表_${stamp}.csv`, headers, rows)
    toast.success(`已导出 ${filteredContainers.length} 条库存明细 CSV`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="库存分析与报表"
        description="基于五维库存模型的区域/城市箱量统计、堆存时间筛选与 CSV 导出"
        actions={
          <Button variant="outline" className="gap-1.5" onClick={exportReportCsv}>
            <Download className="size-4" />
            导出 CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">堆存天数下限</p>
            <Input
              type="number"
              className="w-32"
              placeholder="0"
              value={minDays}
              onChange={(e) => setMinDays(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">堆存天数上限</p>
            <Input
              type="number"
              className="w-32"
              placeholder="不限"
              value={maxDays}
              onChange={(e) => setMaxDays(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">筛选后 {filteredContainers.length} 箱</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="在场总量" value={totalOnSite} unit="TEU" icon={Warehouse} tone="primary" />
        <StatCard label="可用库存" value={totalAvailable} unit="TEU" icon={Boxes} tone="success" />
        <StatCard label="预计进场" value={totalIncoming} unit="TEU" icon={Layers} tone="primary" />
        <StatCard label="平均堆存" value={avgDwell} unit="天" icon={Timer} tone="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>区域库存分布</CardTitle>
            <CardDescription>各区域在场库存与可用库存对比</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={regionChartConfig} className="h-[300px] w-full">
              <BarChart data={regionData} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="region" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="onSite" fill="var(--color-onSite)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="available" fill="var(--color-available)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>堆存时间分布</CardTitle>
            <CardDescription>按筛选后的集装箱统计</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={dwellChartConfig} className="h-[300px] w-full">
              <BarChart data={dwellData} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {dwellData.map((entry, i) => (
                    <Cell
                      key={entry.bucket}
                      fill={i >= 3 ? "var(--chart-5)" : "var(--color-count)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>城市箱量 TOP 8</CardTitle>
            <CardDescription>在场库存最高的城市</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cityData.map((c) => {
              const pct = Math.round((c.onSite / (cityData[0]?.onSite || 1)) * 100)
              return (
                <div key={c.city} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.city}</span>
                    <span className="text-muted-foreground">{c.onSite} TEU</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>超期堆存预警</CardTitle>
            <CardDescription>堆存超过 30 天的集装箱明细（受筛选影响）</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto px-6">
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
                      label="当前堆场"
                      columnKey="currentYard"
                      sortKey={list.sortKey}
                      sortDir={list.sortDir}
                      onSort={list.toggleSort}
                    />
                    <SortableTableHead
                      label="城市"
                      columnKey="currentCity"
                      sortKey={list.sortKey}
                      sortDir={list.sortDir}
                      onSort={list.toggleSort}
                    />
                    <SortableTableHead
                      label="堆存天数"
                      columnKey="storageDays"
                      sortKey={list.sortKey}
                      sortDir={list.sortDir}
                      onSort={list.toggleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="最近进出场"
                      columnKey="lastGateTime"
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
                      className="text-right"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.rows.map((c) => (
                    <TableRow key={c.containerNo}>
                      <TableCell className="font-mono text-xs">{c.containerNo}</TableCell>
                      <TableCell>{c.currentYard}</TableCell>
                      <TableCell>{c.currentCity}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">
                        {c.storageDays}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.lastGateTime}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{c.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {list.total === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        暂无超期堆存集装箱
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
    </div>
  )
}
