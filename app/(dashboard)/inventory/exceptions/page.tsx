"use client"

import { useMemo, useRef, useState } from "react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { CitySearchSelect } from "@/components/city-search-select"
import { useResource, revalidateResource } from "@/lib/api"
import { downloadCsv, parseCsv } from "@/lib/csv"
import { useDictionary } from "@/lib/dictionary-context"
import { useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import type { ContainerMaster, DispatchOrder, GateRecord, InventoryRow, UseBoxOrder, Yard } from "@/lib/types"
import { applyPickupInventory, applyReturnInventory, findInventoryRow, nowLocalStr } from "@/lib/domain/dispatch-ops"
import { AlertTriangle, Download, Plus, Upload, Wrench, CheckCircle2, Search, Receipt } from "lucide-react"

function toInputTime(time: string) {
  return time.replace(" ", "T").slice(0, 16)
}

function fromInputTime(time: string) {
  const t = time.trim()
  if (!t) return nowLocalStr()
  return t.replace("T", " ").slice(0, 16)
}

const GATE_CSV_HEADERS = ["箱号", "类型", "城市", "堆场", "时间", "箱属"] as const

function parseOwnership(raw: string): "自有箱" | "租赁箱" | null {
  const t = raw.trim()
  if (!t || t === "自有箱") return "自有箱"
  if (t === "租赁箱") return "租赁箱"
  return null
}

export default function ExceptionsPage() {
  const { roleId } = useRole()
  const canBill = roleId === "R00" || roleId === "R01"
  const { pickupCities } = useDictionary()
  const { data: allRecords, create, update } = useResource<GateRecord>("gate")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { data: containers, update: updateContainer } = useResource<ContainerMaster>("containers")
  const { data: dispatches } = useResource<DispatchOrder>("dispatch")
  const { data: orders } = useResource<UseBoxOrder>("orders")
  const { data: yardRows } = useResource<Yard>("yards")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const enabledYards = useMemo(
    () => yardRows.filter((y) => y.enabled !== false && y.deleted !== true),
    [yardRows],
  )
  const [keyword, setKeyword] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [billTarget, setBillTarget] = useState<GateRecord | null>(null)
  const [billAmount, setBillAmount] = useState("")
  const [billNote, setBillNote] = useState("")
  const [billing, setBilling] = useState(false)
  const [form, setForm] = useState({
    containerNo: "",
    type: "进场",
    city: "",
    yard: "",
    gateTime: toInputTime(nowLocalStr()),
  })

  const yardsInCity = useMemo(
    () => (form.city ? enabledYards.filter((y) => y.city === form.city) : []),
    [enabledYards, form.city],
  )

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

  async function submitAbnormalBill() {
    if (!billTarget) return
    const amount = Number(billAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请填写有效计费金额")
      return
    }
    setBilling(true)
    try {
      const res = await fetch(`/api/gate/${encodeURIComponent(billTarget.id)}/abnormal-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: billNote }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "生成失败")
        return
      }
      toast.success(`已生成异常费账单 ${data.billNo}`)
      setBillTarget(null)
      setBillAmount("")
      setBillNote("")
      await revalidateResource("bills")
    } finally {
      setBilling(false)
    }
  }

  async function addManual() {
    if (!form.containerNo.trim()) {
      toast.error("请填写箱号")
      return
    }
    if (!form.city || !form.yard) {
      toast.error("请选择城市与堆场")
      return
    }
    const yardRow = enabledYards.find((y) => y.name === form.yard)
    const city = yardRow?.city || form.city
    try {
      await create({
        containerNo: form.containerNo.toUpperCase(),
        type: form.type as "进场" | "出场",
        time: fromInputTime(form.gateTime),
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
      setForm({
        containerNo: "",
        type: "进场",
        city: "",
        yard: "",
        gateTime: toInputTime(nowLocalStr()),
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function handleDownloadTemplate() {
    downloadCsv("进出场异常_导入模板.csv", [...GATE_CSV_HEADERS], [
      ["TCLU1234567", "进场", "西安", "西安中心站堆场", "2026-08-28 10:00", "自有箱"],
    ])
    toast.success("已下载导入模板")
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const matrix = parseCsv(text)
      if (matrix.length < 2) {
        toast.error("CSV 无有效数据行")
        return
      }
      const header = matrix[0]!.map((h) => h.trim())
      const idx = (name: string) => header.indexOf(name)
      const iNo = idx("箱号")
      const iType = idx("类型")
      const iCity = idx("城市")
      const iYard = idx("堆场")
      const iTime = idx("时间")
      const iOwn = idx("箱属")
      if ([iNo, iType, iCity, iYard, iTime].some((i) => i < 0)) {
        toast.error("CSV 表头须包含：箱号,类型,城市,堆场,时间（箱属可选）")
        return
      }
      let created = 0
      let failed = 0
      const errors: string[] = []
      for (let r = 1; r < matrix.length; r++) {
        const row = matrix[r]!
        const containerNo = (row[iNo] || "").trim().toUpperCase()
        const typeRaw = (row[iType] || "").trim()
        const city = (row[iCity] || "").trim()
        const yard = (row[iYard] || "").trim()
        const timeRaw = (row[iTime] || "").trim()
        const ownRaw = iOwn >= 0 ? (row[iOwn] || "").trim() : "自有箱"
        if (!containerNo || !city || !yard) {
          failed += 1
          errors.push(`第 ${r + 1} 行缺少箱号/城市/堆场`)
          continue
        }
        const ownership = parseOwnership(ownRaw)
        if (!ownership) {
          failed += 1
          errors.push(`第 ${r + 1} 行箱属须为自有箱或租赁箱`)
          continue
        }
        const type = typeRaw === "出场" ? "出场" : typeRaw === "进场" ? "进场" : null
        if (!type) {
          failed += 1
          errors.push(`第 ${r + 1} 行类型须为进场或出场`)
          continue
        }
        const time = timeRaw.includes("T")
          ? fromInputTime(timeRaw)
          : timeRaw || nowLocalStr()
        try {
          await create({
            containerNo,
            type,
            time,
            yard,
            city,
            source: "CSV 批量补录异常",
            mappingStatus: "未映射",
            ownership,
            __auditAction: "新增",
            __auditDetail: `CSV 导入进出场 ${containerNo}`,
          })
          created += 1
        } catch (e) {
          failed += 1
          errors.push(`第 ${r + 1} 行 ${containerNo}：${(e as Error).message}`)
        }
      }
      await revalidateResource("gate")
      if (created > 0 && failed === 0) {
        toast.success(`导入完成：新增 ${created} 条`)
      } else if (created > 0) {
        toast.warning(`部分成功：新增 ${created}，失败 ${failed}`, {
          description: errors.slice(0, 3).join("；"),
        })
      } else {
        toast.error(`导入失败 ${failed} 条`, { description: errors.slice(0, 3).join("；") })
      }
    } catch (e) {
      toast.error((e as Error).message || "导入失败")
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImportFile(file)
        }}
      />
      <PageHeader
        module="M03 · 资产与多维库存管理系统"
        title="异常进出场"
        description="M03-F03 手工补录与异常排查池 — 未映射/异常记录集中排查，支持手工补录进出场并重新匹配订单。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-transparent"
              onClick={handleDownloadTemplate}
            >
              <Download className="size-4" />
              下载模板
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-transparent"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              {importing ? "导入中…" : "CSV 导入"}
            </Button>
            <Dialog
              open={addOpen}
              onOpenChange={(open) => {
                setAddOpen(open)
                if (open) {
                  setForm((f) => ({ ...f, gateTime: toInputTime(nowLocalStr()) }))
                }
              }}
            >
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
                      <Label>城市</Label>
                      <CitySearchSelect
                        value={form.city}
                        onValueChange={(city) => setForm((f) => ({ ...f, city, yard: "" }))}
                        cities={pickupCities}
                        placeholder="选择城市"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>堆场</Label>
                    <Select
                      value={form.yard}
                      disabled={!form.city}
                      onValueChange={(v) => setForm((f) => ({ ...f, yard: v ?? "" }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={form.city ? "选择该城市堆场" : "请先选择城市"} />
                      </SelectTrigger>
                      <SelectContent>
                        {yardsInCity.map((y) => (
                          <SelectItem key={y.id} value={y.name}>
                            {y.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gate-time">进出场时间</Label>
                    <Input
                      id="gate-time"
                      type="datetime-local"
                      value={form.gateTime}
                      onChange={(e) => setForm((f) => ({ ...f, gateTime: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
                  <Button onClick={addManual}>提交补录</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
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
                    <TableCell className="text-right space-x-1">
                      {canBill && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setBillTarget(r)
                            setBillAmount("")
                            setBillNote("")
                          }}
                        >
                          <Receipt className="mr-1 size-3.5" />
                          异常费
                        </Button>
                      )}
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

      <Dialog open={!!billTarget} onOpenChange={(o) => !o && setBillTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成异常费账单</DialogTitle>
            <DialogDescription>
              {billTarget?.containerNo} · {billTarget?.type} · {billTarget?.yard}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>计费金额（元）*</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>说明</Label>
              <Textarea
                rows={2}
                value={billNote}
                onChange={(e) => setBillNote(e.target.value)}
                placeholder="异常计费原因"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillTarget(null)}>
              取消
            </Button>
            <Button disabled={billing} onClick={() => void submitAbnormalBill()}>
              确认出账
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
