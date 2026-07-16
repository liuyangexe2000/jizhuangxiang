"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { useListQuery } from "@/lib/list-query"
import type { ContainerMaster, GateRecord, InventoryRow } from "@/lib/types"
import {
  Boxes,
  PackageCheck,
  PackageOpen,
  TruckIcon,
  Warehouse,
  Search,
  Repeat2,
  History,
} from "lucide-react"

export default function InventoryLedgerPage() {
  const { data: inventoryRows } = useResource<InventoryRow>("inventory")
  const [kw, setKw] = useState("")
  const [region, setRegion] = useState("全部")

  const rows = useMemo(
    () =>
      inventoryRows.filter((r) => {
        const mk = !kw || r.city.includes(kw) || r.yard.includes(kw) || r.agent.includes(kw)
        const mr = region === "全部" || r.region === region
        return mk && mr
      }),
    [kw, region, inventoryRows],
  )

  const list = useListQuery({
    data: rows,
    defaultSortKey: "region",
    defaultSortDir: "asc",
  })

  const sum = rows.reduce(
    (acc, r) => ({
      onSite: acc.onSite + r.onSite,
      available: acc.available + r.available,
      reserved: acc.reserved + r.reserved,
      incoming: acc.incoming + r.incoming,
    }),
    { onSite: 0, available: 0, reserved: 0, incoming: 0 },
  )

  return (
    <>
      <PageHeader
        module="M03 · 资产与多维库存管理系统"
        title="五维库存台账"
        description="M03-F01 多维库存台账 — 在场库存 / 可用库存 / 已放待提 / 预计进场 / 集装箱总表，按区域-城市-堆场逐级钻取。"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="在场库存" value={sum.onSite} unit="箱" icon={Warehouse} tone="primary" hint="堆场物理实存" />
        <StatCard label="可用库存" value={sum.available} unit="箱" icon={PackageCheck} tone="success" hint="在场 − 已放待提" />
        <StatCard label="已放待提" value={sum.reserved} unit="箱" icon={PackageOpen} tone="warning" hint="已放箱待客户提取" />
        <StatCard label="预计进场" value={sum.incoming} unit="箱" icon={TruckIcon} tone="primary" hint="已提未还在途" />
      </div>

      <Tabs defaultValue="dimensions">
        <TabsList>
          <TabsTrigger value="dimensions">四维库存汇总</TabsTrigger>
          <TabsTrigger value="masters">集装箱总表（生命周期追溯）</TabsTrigger>
        </TabsList>

        {/* 维度汇总（在场/可用/已放待提/预计进场） */}
        <TabsContent value="dimensions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="size-4.5 text-primary" />
                库存汇总表
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="搜索城市 / 堆场 / 代管公司" className="pl-8" value={kw} onChange={(e) => setKw(e.target.value)} />
                </div>
                <Select value={region} onValueChange={(v) => setRegion(v ?? "全部")}>
                  <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["全部", "境内", "境外"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="区域" columnKey="region" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="城市" columnKey="city" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="堆场" columnKey="yard" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="代管公司" columnKey="agent" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="在场" columnKey="onSite" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                      <SortableTableHead label="可用" columnKey="available" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                      <SortableTableHead label="已放待提" columnKey="reserved" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                      <SortableTableHead label="预计进场" columnKey="incoming" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.rows.map((r) => (
                      <TableRow key={r.yard}>
                        <TableCell>
                          <Badge variant={r.region === "境内" ? "secondary" : "outline"}>{r.region}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{r.city}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.yard}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.agent}</TableCell>
                        <TableCell className="text-right font-medium">{r.onSite}</TableCell>
                        <TableCell className="text-right text-success">{r.available}</TableCell>
                        <TableCell className="text-right text-warning-foreground">{r.reserved}</TableCell>
                        <TableCell className="text-right">{r.incoming}</TableCell>
                      </TableRow>
                    ))}
                    {list.total === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                          未找到匹配的库存
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="font-medium">合计（{list.total} 个堆场）</TableCell>
                      <TableCell className="text-right font-semibold">{sum.onSite}</TableCell>
                      <TableCell className="text-right font-semibold text-success">{sum.available}</TableCell>
                      <TableCell className="text-right font-semibold text-warning-foreground">{sum.reserved}</TableCell>
                      <TableCell className="text-right font-semibold">{sum.incoming}</TableCell>
                    </TableRow>
                  </TableFooter>
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
        </TabsContent>

        {/* 第五维：集装箱总表 — 生命周期追溯 + 自有/租赁箱切换 (BR-15) */}
        <TabsContent value="masters">
          <ContainerMasterTable />
        </TabsContent>
      </Tabs>
    </>
  )
}

function ContainerMasterTable() {
  const { data: listData, update } = useResource<ContainerMaster>("containers")
  const { data: gateRecords, update: updateGate } = useResource<GateRecord>("gate")
  const [kw, setKw] = useState("")

  const filtered = useMemo(
    () =>
      listData.filter(
        (c) => !kw || c.containerNo.includes(kw.toUpperCase()) || c.currentCity.includes(kw),
      ),
    [listData, kw],
  )

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "lastGateTime",
    defaultSortDir: "desc",
    getSortValue: (c, key) => {
      if (key === "location") return `${c.currentCity} ${c.currentYard}`
      return (c as unknown as Record<string, unknown>)[key]
    },
  })

  // BR-15：订单生成后仍可在订单层面切换集装箱属性（自有箱 ↔ 租赁箱）
  async function toggleOwnership(no: string) {
    const cur = listData.find((c) => c.containerNo === no)
    const nextOwnership = cur?.ownership === "自有箱" ? "租赁箱" : "自有箱"
    try {
      await update(no, {
        ownership: nextOwnership,
        __auditAction: "修改",
        __auditDetail: `切换箱属 ${no} → ${nextOwnership}`,
      })

      const relatedGates = gateRecords.filter((g) => g.containerNo === no)
      await Promise.all(
        relatedGates.map((g) =>
          updateGate(g.id, {
            ownership: nextOwnership,
            __auditAction: "修改",
            __auditDetail: `箱属切换同步进出场 ${no} → ${nextOwnership}`,
          }),
        ),
      )

      await Promise.all([revalidateResource("containers"), revalidateResource("gate")])
      toast.success(
        relatedGates.length > 0
          ? `箱号 ${no} 已切换为「${nextOwnership}」，并同步 ${relatedGates.length} 条进出场记录`
          : `箱号 ${no} 已切换为「${nextOwnership}」并同步库存映射`,
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4.5 text-primary" />
          集装箱总表 · 箱号级生命周期追溯
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">BR-15 属性切换：</span>
          订单生成后仍支持在订单层面切换集装箱「自有箱 / 租赁箱」属性，切换后系统自动同步库存映射与费用口径。
        </div>

        <div className="relative sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="搜索箱号 / 城市" className="pl-8" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="箱号" columnKey="containerNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="箱型" columnKey="type" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="箱属" columnKey="ownership" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="当前位置" columnKey="location" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="最近进出场" columnKey="lastGateTime" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="堆存天数" columnKey="storageDays" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                <SortableTableHead label="关联订单" columnKey="relatedOrderNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((c) => (
                <TableRow key={c.containerNo}>
                  <TableCell className="font-mono text-xs font-medium">{c.containerNo}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{c.type}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={c.ownership === "自有箱" ? "secondary" : "outline"}>{c.ownership}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.currentCity}
                    <span className="text-muted-foreground"> · {c.currentYard}</span>
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.lastGateTime}</TableCell>
                  <TableCell className="text-right">
                    <span className={c.storageDays >= 5 ? "font-medium text-warning-foreground" : ""}>
                      {c.storageDays} 天
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.relatedOrderNo ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => toggleOwnership(c.containerNo)}>
                      <Repeat2 className="mr-1 size-3.5" />
                      切换箱属
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {list.total === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    未找到匹配的集装箱
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
  )
}
