"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ClipboardCheck, Plus, Search, ShoppingCart, KeySquare, CircleDollarSign, CheckCircle2, XCircle, FileText } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CitySearchSelect } from "@/components/city-search-select"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import { useDictionary } from "@/lib/dictionary-context"
import { CONTAINER_TYPES, DEFAULT_CONTAINER_TYPE } from "@/lib/container-types"
import type { SupplyPlan, SupplyPlanType, SupplyPlanStatus, SupplyContract, Supplier, ContainerType } from "@/lib/types"

interface FormState {
  type: SupplyPlanType
  containerType: ContainerType
  quantity: number
  estUnitPrice: number
  demandCity: string
  expectArrival: string
  reason: string
}

const emptyFormBase: Omit<FormState, "demandCity"> = {
  type: "采购",
  containerType: DEFAULT_CONTAINER_TYPE,
  quantity: 100,
  estUnitPrice: 24000,
  expectArrival: "",
  reason: "",
}

export default function SupplyPlansPage() {
  const { cities, pickupCities } = useDictionary()
  const defaultCity = pickupCities[0]?.name ?? cities.find((c) => c.enabled)?.name ?? "西安"

  const { data: plans, create, update } = useResource<SupplyPlan>("supplyPlans")
  const { data: contracts, create: createContract } = useResource<SupplyContract>("supplyContracts")
  const { data: suppliers } = useResource<Supplier>("suppliers")

  const [keyword, setKeyword] = useState("")
  const [typeFilter, setTypeFilter] = useState<"全部" | SupplyPlanType>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>({ ...emptyFormBase, demandCity: defaultCity })

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      const kw = !keyword || p.planNo.includes(keyword) || p.demandCity.includes(keyword) || p.reason.includes(keyword)
      const t = typeFilter === "全部" || p.type === typeFilter
      return kw && t
    })
  }, [plans, keyword, typeFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
  })

  const stats = useMemo(() => {
    const purchasing = plans.filter((p) => p.type === "采购")
    const leasing = plans.filter((p) => p.type === "租赁")
    const pending = plans.filter((p) => p.status === "审批中").length
    const totalQty = plans
      .filter((p) => p.status !== "已驳回" && p.status !== "草稿")
      .reduce((s, p) => s + p.quantity, 0)
    return { purchase: purchasing.length, lease: leasing.length, pending, totalQty }
  }, [plans])

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function openCreate() {
    setForm({ ...emptyFormBase, demandCity: defaultCity })
    setDialogOpen(true)
  }

  async function handleCreate() {
    if (!form.expectArrival) {
      toast.error("请选择期望到箱时间")
      return
    }
    if (!form.reason.trim()) {
      toast.error("请填写需求原因")
      return
    }
    const seq = String(plans.length + 1).padStart(4, "0")
    const planNo = `SP2026${seq}`
    try {
      await create({
        planNo,
        type: form.type,
        containerType: form.containerType,
        quantity: form.quantity,
        estUnitPrice: form.estUnitPrice,
        estAmount: form.quantity * form.estUnitPrice,
        demandCity: form.demandCity,
        expectArrival: form.expectArrival,
        reason: form.reason,
        status: "草稿",
        createdBy: "张伟(集装箱管理部)",
        createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        __auditAction: "新增",
        __auditDetail: `创建${form.type}计划 ${planNo}`,
      })
      setDialogOpen(false)
      setForm({ ...emptyFormBase, demandCity: defaultCity })
      toast.success(`已创建${form.type}计划 ${planNo}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function transition(p: SupplyPlan, next: SupplyPlanStatus, msg: string) {
    try {
      await update(p.id, { status: next, __auditAction: "修改", __auditDetail: msg })
      toast.success(msg)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** 转合同：无关联合同则创建，计划状态进入「执行中」 */
  async function convertToContract(p: SupplyPlan) {
    try {
      const existing = contracts.find((c) => c.relatedPlanNo === p.planNo)
      let createdNo: string | undefined
      if (!existing) {
        const wantType = p.type === "采购" ? "制造商" : "租赁商"
        const supplier =
          suppliers.find((s) => s.enabled && s.type === wantType)?.name ??
          suppliers.find((s) => s.enabled)?.name ??
          "待指定供应商"
        const prefix = p.type === "采购" ? "PC" : "LC"
        const contractNo = `${prefix}2026-${String(contracts.length + 1).padStart(4, "0")}`
        const today = new Date().toISOString().slice(0, 10)
        createdNo = contractNo
        await createContract({
          contractNo,
          type: p.type,
          relatedPlanNo: p.planNo,
          supplier,
          containerType: p.containerType,
          quantity: p.quantity,
          unitPrice: p.estUnitPrice,
          amount: p.estAmount,
          currency: "CNY",
          signedAt: today,
          startDate: today,
          endDate: p.expectArrival || today,
          deliveredQty: 0,
          status: "履行中",
          __auditAction: "新增",
          __auditDetail: `由计划 ${p.planNo} 转合同 ${contractNo}`,
        })
      }

      await update(p.id, {
        status: "执行中",
        __auditAction: "修改",
        __auditDetail: `${p.planNo} 已转合同执行`,
      })
      await Promise.all([revalidateResource("supplyPlans"), revalidateResource("supplyContracts")])
      toast.success(
        existing
          ? `${p.planNo} 已关联合同 ${existing.contractNo}，进入执行中`
          : `${p.planNo} 已转合同 ${createdNo}，进入执行中`,
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M05 · 集装箱供应计划管理"
        title="供应计划"
        description="编制集装箱采购/租赁计划，经审批后转入执行，并跟踪到箱进度。计划金额由数量与预估单价自动计算。"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="size-4" />
            新建计划
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="采购计划" value={stats.purchase} icon={ShoppingCart} />
        <StatCard label="租赁计划" value={stats.lease} icon={KeySquare} />
        <StatCard label="待审批" value={stats.pending} icon={ClipboardCheck} tone="warning" />
        <StatCard label="在途计划箱量" value={stats.totalQty} unit="TEU" icon={CircleDollarSign} tone="success" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">计划列表</CardTitle>
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
                placeholder="搜索计划号/需求城市"
                className="w-52 pl-8"
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
                  <SortableTableHead label="计划号" columnKey="planNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="类型" columnKey="type" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="箱型" columnKey="containerType" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="数量" columnKey="quantity" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                  <SortableTableHead label="预估单价" columnKey="estUnitPrice" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                  <SortableTableHead label="预估金额" columnKey="estAmount" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                  <SortableTableHead label="需求城市" columnKey="demandCity" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="期望到箱" columnKey="expectArrival" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs font-medium">{p.planNo}</TableCell>
                    <TableCell>
                      <span className={p.type === "采购" ? "text-primary" : "text-foreground"}>{p.type}</span>
                    </TableCell>
                    <TableCell>{p.containerType}</TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {p.type === "采购" ? `¥${p.estUnitPrice.toLocaleString()}` : `$${p.estUnitPrice}/天`}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {p.type === "采购" ? `¥${p.estAmount.toLocaleString()}` : `$${p.estAmount.toLocaleString()}`}
                    </TableCell>
                    <TableCell>{p.demandCity}</TableCell>
                    <TableCell className="text-muted-foreground">{p.expectArrival}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {p.status === "草稿" && (
                          <Button size="sm" variant="outline" onClick={() => transition(p, "审批中", `${p.planNo} 已提交审批`)}>
                            提交审批
                          </Button>
                        )}
                        {p.status === "审批中" && (
                          <>
                            <Button size="sm" variant="outline" className="gap-1 text-success" onClick={() => transition(p, "已批准", `${p.planNo} 已批准`)}>
                              <CheckCircle2 className="size-3.5" />
                              批准
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => transition(p, "已驳回", `${p.planNo} 已驳回`)}>
                              <XCircle className="size-3.5" />
                              驳回
                            </Button>
                          </>
                        )}
                        {p.status === "已批准" && (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => convertToContract(p)}>
                            <FileText className="size-3.5" />
                            转合同
                          </Button>
                        )}
                        {p.status === "执行中" && (
                          <Button size="sm" variant="outline" onClick={() => transition(p, "已完成", `${p.planNo} 已完成`)}>
                            完成
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      未找到匹配的供应计划
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新建供应计划</DialogTitle>
            <DialogDescription>编制集装箱采购或租赁计划，提交后进入审批流程。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>计划类型</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v as SupplyPlanType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="采购">采购</SelectItem>
                    <SelectItem value="租赁">租赁</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>箱型</Label>
                <Select value={form.containerType} onValueChange={(v) => set("containerType", v as ContainerType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTAINER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="qty">数量</Label>
                <Input id="qty" type="number" min={1} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">{form.type === "采购" ? "预估单价(¥/箱)" : "预估租金($/天/箱)"}</Label>
                <Input id="price" type="number" min={0} value={form.estUnitPrice} onChange={(e) => set("estUnitPrice", Number(e.target.value))} />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              预估金额：
              <span className="ml-1 font-semibold text-foreground">
                {form.type === "采购" ? "¥" : "$"}
                {(form.quantity * form.estUnitPrice).toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>需求城市</Label>
                <CitySearchSelect
                  value={form.demandCity}
                  onValueChange={(v) => set("demandCity", v)}
                  cities={pickupCities}
                  placeholder="选择需求城市"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arrival">期望到箱时间</Label>
                <Input id="arrival" type="date" value={form.expectArrival} onChange={(e) => set("expectArrival", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">需求原因</Label>
              <Textarea id="reason" rows={2} placeholder="说明本次采购/租赁的业务背景与必要性" value={form.reason} onChange={(e) => set("reason", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreate}>创建计划</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
