"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Tags, Plus, Pencil, Trash2, Search } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
import { CitySearchSelect } from "@/components/city-search-select"
import { useDictionary } from "@/lib/dictionary-context"
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import { canAccessResource } from "@/lib/acl"
import {
  formatScopeCities,
  resolveRuleReturnCities,
  withRuleScopeFields,
} from "@/lib/domain/dispatch-scope"
import type { DispatchPriceRule, Yard } from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"
import { Checkbox } from "@/components/ui/checkbox"

const ZONES: DispatchPriceRule["zone"][] = ["近距", "中距", "远距"]

type FormState = {
  pickupCity: string
  pickupPlace: string
  returnCities: string[]
  unitPrice: string
  overdue: string
  suggestTerm: string
  zone: DispatchPriceRule["zone"]
  enabled: boolean
}

const emptyForm: FormState = {
  pickupCity: "",
  pickupPlace: "",
  returnCities: [],
  unitPrice: "",
  overdue: "¥100/箱/天",
  suggestTerm: "30",
  zone: "中距",
  enabled: true,
}

export default function DispatchPricesPage() {
  const { roleId } = useRole()
  const canWrite = canAccessResource("dispatchPriceRules", roleId, "write")
  const { pickupCities, returnCities } = useDictionary()
  const { data: rows, create, update, remove } = useResource<DispatchPriceRule>("dispatchPriceRules")
  const { data: yards } = useResource<Yard>("yards")
  const [keyword, setKeyword] = useState("")
  const [zoneFilter, setZoneFilter] = useState<"全部" | DispatchPriceRule["zone"]>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DispatchPriceRule | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [cityQuery, setCityQuery] = useState("")

  const enabledYards = useMemo(
    () => yards.filter((y) => y.enabled && !y.deleted),
    [yards],
  )

  const yardsInCity = useMemo(() => {
    if (!form.pickupCity) return []
    const inCity = enabledYards.filter((y) => y.city === form.pickupCity)
    if (form.pickupPlace && !inCity.some((y) => y.name === form.pickupPlace)) {
      const orphan = yards.find((y) => y.name === form.pickupPlace)
      if (orphan) return [...inCity, orphan]
    }
    return inCity
  }, [enabledYards, yards, form.pickupCity, form.pickupPlace])

  const returnCityOptions = useMemo(() => {
    const fromYards = enabledYards.map((y) => y.city).filter(Boolean)
    const all = Array.from(
      new Set([...returnCities.map((c) => c.name), ...fromYards, ...form.returnCities]),
    ).sort((a, b) => a.localeCompare(b, "zh"))
    const q = cityQuery.trim().toLowerCase()
    if (!q) return all
    return all.filter((c) => c.toLowerCase().includes(q))
  }, [returnCities, enabledYards, form.returnCities, cityQuery])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return rows.filter((r) => {
      const cities = resolveRuleReturnCities(r)
      const matchKw =
        !kw ||
        r.pickupPlace.toLowerCase().includes(kw) ||
        cities.some((c) => c.toLowerCase().includes(kw)) ||
        (r.scope || "").toLowerCase().includes(kw) ||
        r.zone.includes(kw) ||
        String(r.unitPrice).includes(kw)
      const matchZone = zoneFilter === "全部" || r.zone === zoneFilter
      return matchKw && matchZone
    })
  }, [rows, keyword, zoneFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "pickupPlace",
    defaultSortDir: "asc",
    getSortValue: (row, key) => {
      if (key === "unitPrice" || key === "suggestTerm") return Number((row as never)[key])
      return (row as unknown as Record<string, unknown>)[key]
    },
  })

  const stats = useMemo(
    () => ({
      total: rows.length,
      enabled: rows.filter((r) => r.enabled !== false).length,
      yards: new Set(rows.map((r) => r.pickupPlace)).size,
    }),
    [rows],
  )

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyForm })
    setCityQuery("")
    setDialogOpen(true)
  }

  function openEdit(r: DispatchPriceRule) {
    const yard = yards.find((y) => y.name === r.pickupPlace)
    setEditing(r)
    setForm({
      pickupCity: yard?.city || "",
      pickupPlace: r.pickupPlace,
      returnCities: resolveRuleReturnCities(r),
      unitPrice: String(r.unitPrice),
      overdue: r.overdue,
      suggestTerm: String(r.suggestTerm),
      zone: r.zone,
      enabled: r.enabled !== false,
    })
    setCityQuery("")
    setDialogOpen(true)
  }

  function findDuplicate(excludeId?: string, cities?: string[]) {
    const target = [...(cities || [])].map((c) => c.trim()).filter(Boolean).sort()
    return rows.find((r) => {
      if (r.id === excludeId) return false
      if (r.pickupPlace !== form.pickupPlace.trim()) return false
      const other = [...resolveRuleReturnCities(r)].sort()
      return other.length === target.length && other.every((c, i) => c === target[i])
    })
  }

  function toggleReturnCity(city: string) {
    setForm((f) => {
      const has = f.returnCities.includes(city)
      return {
        ...f,
        returnCities: has ? f.returnCities.filter((c) => c !== city) : [...f.returnCities, city],
      }
    })
  }

  function handleSave() {
    const pickupPlace = form.pickupPlace.trim()
    const scopeFields = withRuleScopeFields(form.returnCities)
    if (!form.pickupCity) {
      toast.error("请先选择提箱城市")
      return
    }
    if (!pickupPlace) {
      toast.error("请选择提箱堆场")
      return
    }
    if (scopeFields.returnCities.length === 0) {
      toast.error("请至少勾选一个允许还箱的城市")
      return
    }
    const price = Number(form.unitPrice)
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("请填写有效的调运单价")
      return
    }
    const suggestTerm = Number(form.suggestTerm)
    if (!Number.isFinite(suggestTerm) || suggestTerm <= 0) {
      toast.error("请填写有效的建议用箱期（天）")
      return
    }
    if (findDuplicate(editing?.id, scopeFields.returnCities)) {
      toast.error("该提箱堆场与还箱城市集合已存在价目", {
        description: `${pickupPlace} · ${scopeFields.scope}`,
      })
      return
    }
    void (async () => {
      try {
        const payload = {
          pickupPlace,
          ...scopeFields,
          unitPrice: price,
          overdue: form.overdue.trim() || "¥100/箱/天",
          suggestTerm,
          zone: form.zone,
          enabled: form.enabled,
        }
        if (editing) {
          await update(editing.id, {
            ...payload,
            __auditAction: "修改",
            __auditDetail: `更新调运价目 ${pickupPlace} · ${scopeFields.scope}`,
          })
          toast.success("调运价目已更新")
        } else {
          await create({
            ...payload,
            __auditAction: "新增",
            __auditDetail: `新增调运价目 ${pickupPlace} · ${scopeFields.scope}`,
          })
          toast.success("调运价目已新增")
        }
        setDialogOpen(false)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
  }

  function handleDelete(r: DispatchPriceRule) {
    void (async () => {
      try {
        await remove(r.id, {
          __auditDetail: `删除调运价目 ${r.pickupPlace} · ${resolveRuleReturnCities(r).join("/")}`,
        })
        toast.success("已删除价目")
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
  }

  return (
    <>
      <PageHeader
        module="基础配置 · 基础数据字典"
        title="调运价目"
        description="按提箱堆场 + 可选还箱城市集合维护单价方案。申请时锁定城市范围，还箱执行必须落在该范围内。"
        actions={
          canWrite ? (
            <Button size="sm" className="gap-1.5" onClick={openAdd}>
              <Plus className="size-4" />
              新增价目
            </Button>
          ) : undefined
        }
      />

      {!canWrite && (
        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          当前为只读查看模式（审批角色可核对调运报价，维护请由箱管操作）。
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="价目条数" value={stats.total} icon={Tags} />
        <StatCard label="已启用" value={stats.enabled} icon={Tags} tone="success" />
        <StatCard label="覆盖堆场" value={stats.yards} icon={Tags} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">价目列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索堆场 / 还箱城市"
                className="w-56 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select value={zoneFilter} onValueChange={(v) => setZoneFilter(v as typeof zoneFilter)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部距离</SelectItem>
                {ZONES.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="提箱堆场" columnKey="pickupPlace" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="允许还箱城市" columnKey="scope" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="距离带" columnKey="zone" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="单价" columnKey="unitPrice" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                  <SortableTableHead label="建议用箱期" columnKey="suggestTerm" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-right" />
                  <TableHead>超期标准</TableHead>
                  <SortableTableHead label="启用" columnKey="enabled" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <TableHead className="w-28 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      暂无价目，请点击「新增价目」
                    </TableCell>
                  </TableRow>
                ) : (
                  list.rows.map((r) => (
                    <TableRow key={r.id} className={r.enabled !== false ? "" : "opacity-55"}>
                      <TableCell className="font-medium whitespace-nowrap">{r.pickupPlace}</TableCell>
                      <TableCell className="max-w-[16rem]">
                        {resolveRuleReturnCities(r).join("、") || r.scope || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={solidTone[r.zone === "近距" ? "success" : r.zone === "远距" ? "warning" : "primary"]}>
                          {r.zone}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">¥{Number(r.unitPrice).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.suggestTerm} 天</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.overdue}</TableCell>
                      <TableCell className="text-center">
                        {canWrite ? (
                          <Switch
                            checked={r.enabled !== false}
                            onCheckedChange={(enabled) => {
                              void update(r.id, {
                                enabled,
                                __auditAction: "修改",
                                __auditDetail: `${enabled ? "启用" : "停用"}调运价目 ${r.pickupPlace} · ${r.scope}`,
                              }).catch((e) => toast.error((e as Error).message))
                            }}
                          />
                        ) : (
                          <Badge variant={r.enabled !== false ? "default" : "secondary"}>
                            {r.enabled !== false ? "启用" : "停用"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canWrite && (
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(r)}>
                              <Pencil className="size-4" />
                              <span className="sr-only">编辑</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => handleDelete(r)}>
                              <Trash2 className="size-4" />
                              <span className="sr-only">删除</span>
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
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
            <DialogTitle>{editing ? "编辑调运价目" : "新增调运价目"}</DialogTitle>
            <DialogDescription>
              勾选允许还箱的城市；同一提箱堆场 + 同一城市集合仅一条方案。还箱执行时只能选这些城市。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>提箱城市 *</Label>
              <CitySearchSelect
                value={form.pickupCity}
                onValueChange={(city) =>
                  setForm((f) => ({
                    ...f,
                    pickupCity: city,
                    pickupPlace: "",
                  }))
                }
                cities={pickupCities}
                placeholder="选择城市"
              />
            </div>
            <div className="space-y-2">
              <Label>提箱堆场 *</Label>
              <Select
                value={form.pickupPlace}
                disabled={!form.pickupCity}
                onValueChange={(v) => setForm((f) => ({ ...f, pickupPlace: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.pickupCity ? "选择该城市堆场" : "请先选择城市"} />
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
            <div className="space-y-2 sm:col-span-2">
              <Label>允许还箱城市 *（可多选）</Label>
              <Input
                className="mb-2"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="搜索城市…"
              />
              <div className="thin-scrollbar max-h-40 overflow-y-auto rounded-lg border p-2">
                {returnCityOptions.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground">无匹配城市</p>
                ) : (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {returnCityOptions.map((city) => {
                      const checked = form.returnCities.includes(city)
                      return (
                        <label
                          key={city}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleReturnCity(city)} />
                          <span>{city}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              {form.returnCities.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  已选 {form.returnCities.length} 城：{formatScopeCities(form.returnCities)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">请勾选承运商执行还箱时可选择的城市</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>距离带 *</Label>
              <Select
                value={form.zone}
                onValueChange={(v) => setForm((f) => ({ ...f, zone: (v as DispatchPriceRule["zone"]) || "中距" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONES.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">调运单价 *</Label>
              <Input
                id="unitPrice"
                type="number"
                min={0}
                step={1}
                value={form.unitPrice}
                onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                placeholder="例如 850"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suggestTerm">建议用箱期（天）*</Label>
              <Input
                id="suggestTerm"
                type="number"
                min={1}
                value={form.suggestTerm}
                onChange={(e) => setForm((f) => ({ ...f, suggestTerm: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="overdue">超期费标准</Label>
              <Input
                id="overdue"
                value={form.overdue}
                onChange={(e) => setForm((f) => ({ ...f, overdue: e.target.value }))}
                placeholder="¥120/箱/天"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
              <div>
                <div className="text-sm font-medium">启用</div>
                <div className="text-xs text-muted-foreground">停用后调运申请无法匹配该方案</div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
              />
            </div>
            {form.pickupCity && form.pickupPlace && form.returnCities.length > 0 ? (
              <div className={`rounded-md px-3 py-2 text-xs sm:col-span-2 ${solidTone.info}`}>
                方案预览：{form.pickupCity} · {form.pickupPlace} → {formatScopeCities(form.returnCities)} · {form.zone}
                {form.unitPrice ? ` · ¥${Number(form.unitPrice || 0).toLocaleString()}/箱` : ""}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
