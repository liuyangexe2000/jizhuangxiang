"use client"

import { useState, useMemo } from "react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CitySearchSelect } from "@/components/city-search-select"
import { ProxyCompanySearchSelect } from "@/components/proxy-company-search-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useResource } from "@/lib/api"
import { useDictionary } from "@/lib/dictionary-context"
import { useListQuery } from "@/lib/list-query"
import { findProxyCompanyByName } from "@/lib/proxy-company"
import { downloadCsv } from "@/lib/csv"
import type { InventoryRow, ProxyCompany, Yard } from "@/lib/types"
import { Warehouse, MapPin, Mail, Phone, PackageOpen, Pencil, Plus, Download, Upload } from "lucide-react"
import { toast } from "sonner"

type YardForm = {
  name: string
  region: "境内" | "境外"
  city: string
  proxyCompanyId: string
  capacity: string
  address: string
  factoryCode: string
  /** 堆存日费用 */
  dailyExpenses: string
  /** 免堆天数 */
  freeDuration: string
  /** 上车费 */
  boardingFee: string
  /** 下车费 */
  alightingFee: string
}

const emptyForm: YardForm = {
  name: "",
  region: "境内",
  city: "",
  proxyCompanyId: "",
  capacity: "",
  address: "",
  factoryCode: "",
  dailyExpenses: "",
  freeDuration: "",
  boardingFee: "",
  alightingFee: "",
}

const YARD_FEE_CSV_HEADERS = [
  "堆场名称",
  "城市",
  "堆存日费用",
  "免堆天数",
  "上车费",
  "下车费",
] as const

function numOrNull(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function numToForm(v: number | null | undefined): string {
  return v == null ? "" : String(v)
}

export default function YardsPage() {
  const { cities } = useDictionary()
  const { data: rows, create, update } = useResource<Yard>("yards")
  const { data: inventory, create: createInventory } = useResource<InventoryRow>("inventory")
  const { data: proxyCompanies, create: createProxy, mutate: mutateProxies } =
    useResource<ProxyCompany>("proxyCompanies")
  const [keyword, setKeyword] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Yard | null>(null)
  const [form, setForm] = useState<YardForm>(emptyForm)
  const isAdd = dialogOpen && !editing

  const enabledProxies = useMemo(
    () => proxyCompanies.filter((p) => p.enabled !== false),
    [proxyCompanies],
  )

  const proxyOptions = useMemo(() => {
    const list = [...enabledProxies]
    const sel = proxyCompanies.find((p) => p.id === form.proxyCompanyId)
    if (sel && !list.some((p) => p.id === sel.id)) list.unshift(sel)
    return list
  }, [enabledProxies, proxyCompanies, form.proxyCompanyId])

  const selectedProxy = useMemo(
    () => proxyCompanies.find((p) => p.id === form.proxyCompanyId) ?? null,
    [proxyCompanies, form.proxyCompanyId],
  )

  const occupancyByYard = useMemo(() => {
    const map = new Map<string, number>()
    for (const inv of inventory) {
      map.set(inv.yard, (map.get(inv.yard) ?? 0) + inv.onSite)
    }
    return map
  }, [inventory])

  function occupancyOf(y: Yard) {
    return occupancyByYard.get(y.name) ?? y.current
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter(
      (y) =>
        y.name.toLowerCase().includes(kw) ||
        y.city.toLowerCase().includes(kw) ||
        y.agent.toLowerCase().includes(kw) ||
        y.factoryCode.toLowerCase().includes(kw) ||
        y.factoryNumber.toLowerCase().includes(kw) ||
        String(y.legacyId).includes(kw) ||
        y.contactUser.toLowerCase().includes(kw),
    )
  }, [rows, keyword])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "name",
    defaultSortDir: "asc",
    getSortValue: (y, key) => {
      if (key === "location") return `${y.region} ${y.city}`
      if (key === "occupancy") return occupancyOf(y) / (y.capacity || 1)
      return (y as unknown as Record<string, unknown>)[key]
    },
  })

  const active = rows.filter((y) => y.enabled).length
  const totalCap = rows.reduce((s, y) => s + y.capacity, 0)
  const totalCur = rows.reduce((s, y) => s + occupancyOf(y), 0)
  const usage = Math.round((totalCur / (totalCap || 1)) * 100)

  async function toggle(id: string) {
    const y = rows.find((x) => x.id === id)
    try {
      await update(id, { enabled: !y?.enabled, __auditAction: "修改", __auditDetail: `${y?.name} 已${y?.enabled ? "停用" : "启用"}` })
      toast.success(`${y?.name} 已${y?.enabled ? "停用" : "启用"}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(y: Yard) {
    setEditing(y)
    const byId = proxyCompanies.find((p) => p.id === y.proxyCompanyId)
    const byName = proxyCompanies.find((p) => p.name === y.agent)
    setForm({
      name: y.name,
      region: y.region === "境外" ? "境外" : "境内",
      city: y.city,
      proxyCompanyId: byId?.id || byName?.id || "",
      capacity: String(y.capacity),
      address: y.address,
      factoryCode: y.factoryCode,
      dailyExpenses: numToForm(y.dailyExpenses),
      freeDuration: numToForm(y.freeDuration),
      boardingFee: numToForm(y.boardingFee),
      alightingFee: numToForm(y.alightingFee),
    })
    setDialogOpen(true)
  }

  function exportFeeCsv() {
    const source = filtered.length ? filtered : rows
    downloadCsv(
      `堆场费用_${new Date().toISOString().slice(0, 10)}.csv`,
      [...YARD_FEE_CSV_HEADERS],
      source.map((y) => [
        y.name,
        y.city,
        y.dailyExpenses ?? "",
        y.freeDuration ?? "",
        y.boardingFee ?? "",
        y.alightingFee ?? "",
      ]),
    )
    toast.success(`已导出 ${source.length} 条堆场费用 CSV`)
  }

  function importFeeCsvStub() {
    // TODO: 解析 CSV 批量更新 dailyExpenses / freeDuration / boardingFee / alightingFee
    toast.info("费用 CSV 导入功能开发中")
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditing(null)
  }

  function onCityChange(cityName: string) {
    const hit = cities.find((c) => c.name === cityName)
    setForm((f) => ({
      ...f,
      city: cityName,
      region: hit?.region === "境外" ? "境外" : f.region,
    }))
  }

  async function handleSave() {
    const capacity = Number(form.capacity)
    const name = form.name.trim()
    if (!name) {
      toast.error("请填写堆场名称")
      return
    }
    if (!form.city.trim()) {
      toast.error("请选择堆场城市")
      return
    }
    if (!Number.isFinite(capacity) || capacity < 0) {
      toast.error("容量须为非负数字")
      return
    }
    const dup = rows.find(
      (y) => y.name.trim() === name && y.id !== editing?.id && !y.deleted,
    )
    if (dup) {
      toast.error(`堆场名称「${name}」已存在`)
      return
    }
    const proxy = selectedProxy
    const agentName = proxy?.name ?? ""
    const contactUser = proxy?.contactUser ?? ""
    const phone = proxy?.phone ?? ""
    const email = proxy?.email ?? ""
    const proxyCompanyId = proxy?.id ?? ""
    const dailyExpenses = numOrNull(form.dailyExpenses)
    const freeDuration = numOrNull(form.freeDuration)
    const boardingFee = numOrNull(form.boardingFee)
    const alightingFee = numOrNull(form.alightingFee)
    if (
      (form.dailyExpenses.trim() && dailyExpenses == null) ||
      (form.freeDuration.trim() && freeDuration == null) ||
      (form.boardingFee.trim() && boardingFee == null) ||
      (form.alightingFee.trim() && alightingFee == null)
    ) {
      toast.error("费用字段须为数字（可留空）")
      return
    }

    try {
      if (editing) {
        await update(editing.id, {
          name,
          region: form.region,
          city: form.city.trim(),
          agent: agentName,
          proxyCompanyId,
          capacity,
          phone,
          email,
          address: form.address.trim(),
          contactUser,
          factoryCode: form.factoryCode.trim(),
          dailyExpenses,
          freeDuration,
          boardingFee,
          alightingFee,
          __auditAction: "修改",
          __auditDetail: `更新堆场「${name}」`,
        })
        toast.success(`已更新堆场「${name}」`)
      } else {
        const stamp = new Date()
        const pad = (n: number) => String(n).padStart(2, "0")
        const factoryNumber = `YF${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${String(stamp.getTime()).slice(-6)}`
        await create({
          legacyId: 0,
          factoryId: "",
          factoryNumber,
          factoryCode: form.factoryCode.trim(),
          name,
          region: form.region,
          city: form.city.trim(),
          regionId: null,
          agent: agentName,
          proxyCompanyId,
          address: form.address.trim(),
          phone,
          contactUser,
          email,
          creditCode: "",
          currencyId: null,
          dailyExpenses,
          freeDuration,
          boardingFee,
          alightingFee,
          secondaryRemovalFee: null,
          hasSeal: false,
          capacity,
          current: 0,
          enabled: true,
          deleted: false,
          version: null,
          remark: "",
          receiveRemark: "",
          remarkReturnOrder: "",
          createBy: "",
          createName: "",
          createTime: "",
          updateBy: "",
          updateName: "",
          updateTime: "",
          __auditAction: "新增",
          __auditDetail: `新增堆场「${name}」`,
        })
        const hasInv = inventory.some(
          (inv) => inv.yard === name && inv.city === form.city.trim(),
        )
        if (!hasInv) {
          try {
            await createInventory({
              region: form.region,
              city: form.city.trim(),
              yard: name,
              agent: agentName,
              onSite: 0,
              available: 0,
              reserved: 0,
              incoming: 0,
              __auditAction: "新增",
              __auditDetail: `新建堆场同步库存台账「${name}」`,
            })
          } catch {
            // 堆场已创建；库存行失败不阻断
          }
        }
        toast.success(`已新增堆场「${name}」`)
      }
      closeDialog()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="堆场信息维护"
        description="M04-F03 境内外堆场动态维护 — 含老系统原 id（legacyId）便于跨系统匹配；联系方式、容量、代管公司与启用状态"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            新增堆场
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="堆场总数" value={rows.length} unit="个" icon={Warehouse} tone="primary" />
        <StatCard label="启用中" value={active} unit="个" icon={PackageOpen} tone="success" />
        <StatCard label="总容量" value={totalCap} unit="TEU" icon={Warehouse} tone="primary" />
        <StatCard label="整体利用率" value={usage} unit="%" icon={PackageOpen} tone={usage > 80 ? "warning" : "primary"} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>堆场列表</CardTitle>
            <CardDescription>共 {rows.length} 个境内外堆场 · 在场量 = 库存 onSite 汇总</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="搜索堆场 / 原id / 编码 / 城市 / 代管"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="sm:max-w-xs"
            />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportFeeCsv}>
              <Download className="size-4" />
              导出费用 CSV
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={importFeeCsvStub}>
              <Upload className="size-4" />
              导入费用 CSV
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openAdd}>
              <Plus className="size-4" />
              新增堆场
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="原ID" columnKey="legacyId" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="编码" columnKey="factoryCode" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="堆场名称" columnKey="name" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="区域/城市" columnKey="location" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="代管公司" columnKey="agent" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="联系方式" columnKey="phone" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="容量利用" columnKey="occupancy" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((y) => {
                  const onSite = occupancyOf(y)
                  const pct = Math.round((onSite / (y.capacity || 1)) * 100)
                  return (
                    <TableRow key={y.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{y.legacyId}</TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">{y.factoryCode || "—"}</div>
                        <div className="text-xs text-muted-foreground">{y.factoryNumber}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{y.name}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate max-w-[220px]">{y.address}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{y.region}</Badge>
                        <span className="ml-2 text-sm">{y.city || "—"}</span>
                      </TableCell>
                      <TableCell className="text-sm">{y.agent || "—"}</TableCell>
                      <TableCell>
                        {y.contactUser ? (
                          <div className="text-xs">{y.contactUser}</div>
                        ) : null}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="size-3" />
                          {y.phone || "—"}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3" />
                          {y.email || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>
                              {onSite}/{y.capacity}
                            </span>
                            <span className={pct > 80 ? "text-warning-foreground" : "text-muted-foreground"}>
                              {pct}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${pct > 80 ? "bg-warning" : "bg-primary"}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(y)}>
                            <Pencil className="size-4" />
                            <span className="sr-only">编辑</span>
                          </Button>
                          <Switch checked={y.enabled} onCheckedChange={() => toggle(y.id)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      未找到匹配的堆场
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

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isAdd ? "新增堆场" : "编辑堆场"}</DialogTitle>
            <DialogDescription>
              {isAdd
                ? "填写堆场名称、城市与容量等信息，保存后默认启用，并同步空库存台账行。"
                : "修改名称、城市、容量与联系信息。原系统 id / 编号仅作跨系统匹配记录。"}
            </DialogDescription>
          </DialogHeader>
          <div className="thin-scrollbar grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 sm:grid-cols-3">
            {editing && (
              <div className="col-span-full grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground sm:grid-cols-4">
                <div>原系统 id：<span className="font-mono text-foreground">{editing.legacyId}</span></div>
                <div>编码：<span className="font-mono text-foreground">{editing.factoryCode || "—"}</span></div>
                <div>编号：<span className="font-mono text-foreground">{editing.factoryNumber || "—"}</span></div>
                <div>uuid：<span className="font-mono text-foreground truncate">{editing.factoryId || "—"}</span></div>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="yard-name">堆场名称 *</Label>
              <Input
                id="yard-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如：陆港堆场"
              />
            </div>
            <div className="space-y-1.5">
              <Label>区域 *</Label>
              <Select
                value={form.region}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, region: v === "境外" ? "境外" : "境内" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="境内">境内</SelectItem>
                  <SelectItem value="境外">境外</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>城市 *</Label>
              <CitySearchSelect
                value={form.city}
                onValueChange={onCityChange}
                cities={cities.filter((c) => c.enabled)}
                placeholder="选择城市"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>代管公司</Label>
              <ProxyCompanySearchSelect
                value={form.proxyCompanyId}
                onValueChange={(id) => setForm((f) => ({ ...f, proxyCompanyId: id }))}
                companies={proxyOptions}
                allCompanies={proxyCompanies}
                placeholder="搜索或选择代管公司"
                onCreate={async (name) => {
                  const dup = findProxyCompanyByName(proxyCompanies, name)
                  if (dup) {
                    throw new Error(`代管公司「${dup.name}」已存在，请直接选择`)
                  }
                  const created = await createProxy({
                    name: name.trim().replace(/\s+/g, " "),
                    contactUser: "",
                    phone: "",
                    email: "",
                    enabled: true,
                    __auditAction: "新增",
                    __auditDetail: `堆场表单快捷新增代管公司「${name}」`,
                  })
                  await mutateProxies()
                  return created
                }}
              />
              <p className="text-xs text-muted-foreground">
                支持搜索；输入新名称可直接新增代管公司
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yard-capacity">容量（TEU）*</Label>
              <Input
                id="yard-capacity"
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yard-code">堆场编码</Label>
              <Input
                id="yard-code"
                value={form.factoryCode}
                onChange={(e) => setForm((f) => ({ ...f, factoryCode: e.target.value }))}
                placeholder="可选"
              />
            </div>
            <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2 sm:col-span-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">代管公司联系人（随所选公司自动带出）</p>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">联系人：</span>
                  {selectedProxy?.contactUser || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">电话：</span>
                  {selectedProxy?.phone || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">邮箱：</span>
                  {selectedProxy?.email || "—"}
                </div>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="yard-address">地址</Label>
              <Input
                id="yard-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="col-span-full space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">堆场费用（可空）</p>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="yard-daily">堆存日费用</Label>
                  <Input
                    id="yard-daily"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.dailyExpenses}
                    onChange={(e) => setForm((f) => ({ ...f, dailyExpenses: e.target.value }))}
                    placeholder="元/天"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="yard-free">免堆天数</Label>
                  <Input
                    id="yard-free"
                    type="number"
                    min={0}
                    step="1"
                    value={form.freeDuration}
                    onChange={(e) => setForm((f) => ({ ...f, freeDuration: e.target.value }))}
                    placeholder="天"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="yard-board">上车费</Label>
                  <Input
                    id="yard-board"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.boardingFee}
                    onChange={(e) => setForm((f) => ({ ...f, boardingFee: e.target.value }))}
                    placeholder="元"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="yard-alight">下车费</Label>
                  <Input
                    id="yard-alight"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.alightingFee}
                    onChange={(e) => setForm((f) => ({ ...f, alightingFee: e.target.value }))}
                    placeholder="元"
                  />
                </div>
              </div>
            </div>
            {editing && (
              <p className="col-span-full text-xs text-muted-foreground">
                当前在场（库存汇总）：{occupancyOf(editing)} / 容量 {form.capacity || editing.capacity}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={handleSave}>{isAdd ? "确认新增" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
