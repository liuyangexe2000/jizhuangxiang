"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Search, FileSignature, PackageCheck, CircleDollarSign, Truck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import {
  applyReturnInventory,
  findInventoryRow,
  nowLocalStr,
} from "@/lib/domain/dispatch-ops"
import type {
  SupplyContract,
  SupplyPlan,
  SupplyPlanType,
  ContainerMaster,
  GateRecord,
  InventoryRow,
  Yard,
} from "@/lib/types"

/** 生成到箱新箱号（≤20 字符） */
function genSupplyContainerNo(c: SupplyContract, seq: number) {
  const digits = c.contractNo.replace(/\D/g, "").slice(-6).padStart(6, "0")
  const prefix = c.type === "采购" ? "OWN" : "LSE"
  return `${prefix}${digits}${String(seq).padStart(3, "0")}`
}

export default function SupplyContractsPage() {
  const { data: contracts, update } = useResource<SupplyContract>("supplyContracts")
  const { data: plans } = useResource<SupplyPlan>("supplyPlans")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { data: containers, create: createContainer } = useResource<ContainerMaster>("containers")
  const { create: createGate } = useResource<GateRecord>("gate")
  const { data: yards } = useResource<Yard>("yards")

  const [keyword, setKeyword] = useState("")
  const [typeFilter, setTypeFilter] = useState<"全部" | SupplyPlanType>("全部")

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      const kw = !keyword || c.contractNo.includes(keyword) || c.supplier.includes(keyword) || c.relatedPlanNo.includes(keyword)
      const t = typeFilter === "全部" || c.type === typeFilter
      return kw && t
    })
  }, [contracts, keyword, typeFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "signedAt",
    defaultSortDir: "desc",
    getSortValue: (c, key) => {
      if (key === "progress") return c.quantity > 0 ? c.deliveredQty / c.quantity : 0
      if (key === "validity") return c.startDate
      return (c as unknown as Record<string, unknown>)[key]
    },
  })

  const stats = useMemo(() => {
    const active = contracts.filter((c) => c.status === "履行中").length
    const totalQty = contracts.reduce((s, c) => s + c.quantity, 0)
    const deliveredQty = contracts.reduce((s, c) => s + c.deliveredQty, 0)
    const amountCny = contracts
      .filter((c) => c.currency === "CNY")
      .reduce((s, c) => s + c.amount, 0)
    return { active, totalQty, deliveredQty, amountCny }
  }, [contracts])

  async function receive(c: SupplyContract) {
    const step = Math.max(1, Math.ceil(c.quantity / 5))
    const increment = Math.min(step, c.quantity - c.deliveredQty)
    if (increment <= 0) return

    const delivered = c.deliveredQty + increment
    const done = delivered >= c.quantity
    const plan = plans.find((p) => p.planNo === c.relatedPlanNo)
    const city = plan?.demandCity ?? ""
    const yardRow =
      yards.find((y) => y.enabled && y.city === city) ??
      yards.find((y) => y.city === city)
    const yardName = yardRow?.name ?? (city ? `${city}堆场` : "待分配堆场")
    const ownership: GateRecord["ownership"] = c.type === "采购" ? "自有箱" : "租赁箱"
    const time = nowLocalStr()

    try {
      await update(c.id, {
        deliveredQty: delivered,
        status: done ? "已完成" : c.status,
        __auditAction: "修改",
        __auditDetail: `${c.contractNo} 登记到箱 ${increment} 箱`,
      })

      const nos: string[] = []
      for (let i = 0; i < increment; i++) {
        const seq = c.deliveredQty + i + 1
        let no = genSupplyContainerNo(c, seq)
        // 避免与已有主档冲突
        let guard = 0
        while (
          (containers.some((x) => x.containerNo === no) || nos.includes(no)) &&
          guard < 50
        ) {
          guard += 1
          no = genSupplyContainerNo(c, seq * 100 + guard)
        }
        nos.push(no)

        await createGate({
          containerNo: no,
          type: "进场",
          time,
          yard: yardName,
          city: city || yardRow?.city || "—",
          source: "系统放箱/调运订单",
          relatedOrderNo: c.contractNo,
          mappingStatus: "已映射",
          ownership,
          __auditAction: "新增",
          __auditDetail: `供应到箱进场 ${c.contractNo} · ${no}`,
        })

        await createContainer({
          containerNo: no,
          type: c.containerType,
          ownership,
          currentYard: yardName,
          currentCity: city || yardRow?.city || "—",
          status: "在场",
          lastGateTime: time,
          storageDays: 0,
          relatedOrderNo: c.contractNo,
          __auditAction: "新增",
          __auditDetail: `供应到箱建档 ${no}`,
        })
      }

      const inv = findInventoryRow(inventory, { yard: yardName, city: city || yardRow?.city })
      if (inv?.id) {
        await updateInventory(inv.id, {
          ...applyReturnInventory(inv, increment),
          __auditAction: "修改",
          __auditDetail: `供应到箱回补库存 ${yardName} ×${increment}`,
        })
      } else {
        toast.warning(
          city
            ? `未找到需求城市「${city}」对应库存台账，已记进场未回补库存`
            : "未找到关联计划需求城市，已记进场未回补库存",
        )
      }

      await Promise.all([
        revalidateResource("supplyContracts"),
        revalidateResource("gate"),
        revalidateResource("inventory"),
        revalidateResource("containers"),
        revalidateResource("supplyPlans"),
      ])
      toast.success(`${c.contractNo} 已登记到箱 ${increment} 箱，并同步进场与库存`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const symbol = (cur: SupplyContract["currency"]) => (cur === "CNY" ? "¥" : cur === "USD" ? "$" : "€")

  return (
    <>
      <PageHeader
        module="M05 · 集装箱供应计划管理"
        title="供应合同"
        description="管理由供应计划转化的采购/租赁合同，跟踪合同履行与集装箱到箱进度。"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="履行中合同" value={stats.active} icon={FileSignature} />
        <StatCard label="合同总箱量" value={stats.totalQty} unit="箱" icon={Truck} />
        <StatCard label="已到箱" value={stats.deliveredQty} unit="箱" icon={PackageCheck} tone="success" />
        <StatCard label="采购合同金额" value={`¥${(stats.amountCny / 10000).toFixed(1)}万`} icon={CircleDollarSign} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">合同列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <TabsList>
                <TabsTrigger value="全部">全部</TabsTrigger>
                <TabsTrigger value="采购">采购</TabsTrigger>
                <TabsTrigger value="租赁">租赁</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索合同号/供应商/计划号"
                className="w-56 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="合同号" columnKey="contractNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="类型" columnKey="type" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="供应商" columnKey="supplier" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="关联计划" columnKey="relatedPlanNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="金额" columnKey="amount" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                  <SortableTableHead label="到箱进度" columnKey="progress" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="w-44" />
                  <SortableTableHead label="有效期" columnKey="validity" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((c) => {
                  const pct = Math.round((c.deliveredQty / c.quantity) * 100)
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-medium">{c.contractNo}</TableCell>
                      <TableCell>
                        <span className={c.type === "采购" ? "text-primary" : "text-foreground"}>{c.type}</span>
                      </TableCell>
                      <TableCell className="max-w-40 truncate">{c.supplier}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.relatedPlanNo}</TableCell>
                      <TableCell className="text-right font-medium">
                        {symbol(c.currency)}{c.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{c.deliveredQty}/{c.quantity} 箱</span>
                            <span className="font-medium">{pct}%</span>
                          </div>
                          <Progress value={pct} />
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {c.startDate} ~ {c.endDate}
                      </TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-right">
                        {c.status === "履行中" && c.deliveredQty < c.quantity ? (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => receive(c)}>
                            <PackageCheck className="size-3.5" />
                            登记到箱
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      未找到匹配的合同
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
