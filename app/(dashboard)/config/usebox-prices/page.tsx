"use client"

import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Tags, Plus, Pencil, Trash2, Search, Download, Upload } from "lucide-react"
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
import { CONTAINER_TYPES, DEFAULT_CONTAINER_TYPE } from "@/lib/container-types"
import type { ContainerType, UseBoxPriceRule, UseBoxPriceKind } from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"
import { downloadCsv } from "@/lib/csv"
import {
  parseUseBoxPriceCsv,
  useBoxPriceToCsvRow,
  USEBOX_PRICE_CSV_HEADERS,
  USEBOX_PRICE_CSV_TEMPLATE_ROWS,
} from "@/lib/domain/usebox-price-csv"

type FormState = {
  pickupCity: string
  returnCity: string
  containerType: ContainerType
  unitPrice: string
  freeDays: string
  overdueDailyRate: string
  priceKind: UseBoxPriceKind
  enabled: boolean
}

const emptyForm: FormState = {
  pickupCity: "",
  returnCity: "",
  containerType: DEFAULT_CONTAINER_TYPE,
  unitPrice: "",
  freeDays: "30",
  overdueDailyRate: "0",
  priceKind: "standard",
  enabled: true,
}

export default function UseBoxPricesPage() {
  const { pickupCities, returnCities } = useDictionary()
  const { data: rows, create, update, remove } = useResource<UseBoxPriceRule>("useBoxPriceRules")
  const [keyword, setKeyword] = useState("")
  const [typeFilter, setTypeFilter] = useState<"全部" | ContainerType>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UseBoxPriceRule | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return rows.filter((r) => {
      const matchKw =
        !kw ||
        r.pickupCity.toLowerCase().includes(kw) ||
        r.returnCity.toLowerCase().includes(kw) ||
        r.containerType.toLowerCase().includes(kw)
      const matchType = typeFilter === "全部" || r.containerType === typeFilter
      return matchKw && matchType
    })
  }, [rows, keyword, typeFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "pickupCity",
    defaultSortDir: "asc",
    getSortValue: (row, key) => {
      if (key === "unitPrice") return Number(row.unitPrice)
      return (row as unknown as Record<string, unknown>)[key]
    },
  })

  const stats = useMemo(
    () => ({
      total: rows.length,
      enabled: rows.filter((r) => r.enabled !== false).length,
      routes: new Set(rows.map((r) => `${r.pickupCity}|${r.returnCity}`)).size,
    }),
    [rows],
  )

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyForm, containerType: DEFAULT_CONTAINER_TYPE })
    setDialogOpen(true)
  }

  function openEdit(r: UseBoxPriceRule) {
    setEditing(r)
    setForm({
      pickupCity: r.pickupCity,
      returnCity: r.returnCity,
      containerType: r.containerType,
      unitPrice: String(r.unitPrice),
      freeDays: String(r.freeDays ?? 30),
      overdueDailyRate: String(r.overdueDailyRate ?? 0),
      priceKind: r.priceKind === "subsidy" ? "subsidy" : "standard",
      enabled: r.enabled !== false,
    })
    setDialogOpen(true)
  }

  function findDuplicate(excludeId?: string) {
    return rows.find(
      (r) =>
        r.id !== excludeId &&
        r.pickupCity === form.pickupCity &&
        r.returnCity === form.returnCity &&
        r.containerType === form.containerType,
    )
  }

  function handleSave() {
    if (!form.pickupCity || !form.returnCity) {
      toast.error("请选择提箱城市与还箱城市")
      return
    }
    if (form.pickupCity === form.returnCity) {
      toast.error("提箱城市与还箱城市不能相同")
      return
    }
    const price = Number(form.unitPrice)
    const isSubsidy = form.priceKind === "subsidy"
    if (!Number.isFinite(price) || price === 0) {
      toast.error(isSubsidy ? "回程补贴须为有效非零数字（可为负）" : "请填写有效的用箱单价")
      return
    }
    if (!isSubsidy && price <= 0) {
      toast.error("标准价目单价须大于 0")
      return
    }
    const freeDays = Number(form.freeDays)
    const overdueDailyRate = Number(form.overdueDailyRate)
    const payload = {
      pickupCity: form.pickupCity,
      returnCity: form.returnCity,
      containerType: form.containerType,
      unitPrice: price,
      freeDays: Number.isFinite(freeDays) && freeDays > 0 ? Math.floor(freeDays) : 30,
      overdueDailyRate: Number.isFinite(overdueDailyRate) ? overdueDailyRate : 0,
      priceKind: form.priceKind,
      enabled: form.enabled,
    }
    if (findDuplicate(editing?.id)) {
      toast.error("该线路与箱型已存在价目", {
        description: `${form.pickupCity} → ${form.returnCity} · ${form.containerType}`,
      })
      return
    }
    void (async () => {
      try {
        if (editing) {
          await update(editing.id, {
            ...payload,
            __auditAction: "修改",
            __auditDetail: `更新用箱价目 ${form.pickupCity}→${form.returnCity} ${form.containerType}`,
          })
          toast.success("价目已更新")
        } else {
          await create({
            ...payload,
            __auditAction: "新增",
            __auditDetail: `新增用箱价目 ${form.pickupCity}→${form.returnCity} ${form.containerType}`,
          })
          toast.success("价目已新增")
        }
        setDialogOpen(false)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
  }

  function handleDelete(r: UseBoxPriceRule) {
    void (async () => {
      try {
        await remove(r.id, {
          __auditDetail: `删除用箱价目 ${r.pickupCity}→${r.returnCity} ${r.containerType}`,
        })
        toast.success("已删除价目")
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
  }

  function handleExport() {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    downloadCsv(
      `用箱价目_${stamp}.csv`,
      [...USEBOX_PRICE_CSV_HEADERS],
      filtered.map((r) => useBoxPriceToCsvRow(r)),
    )
    toast.success(`已导出 ${filtered.length} 条价目 CSV`)
  }

  function handleDownloadTemplate() {
    downloadCsv("用箱价目_导入模板.csv", [...USEBOX_PRICE_CSV_HEADERS], USEBOX_PRICE_CSV_TEMPLATE_ROWS)
    toast.success("已下载导入模板")
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { rows: parsed, errors } = parseUseBoxPriceCsv(text)
      if (parsed.length === 0) {
        toast.error(errors[0] || "CSV 无有效数据")
        return
      }
      let created = 0
      let updated = 0
      let failed = 0
      for (const row of parsed) {
        const existing = rows.find(
          (r) =>
            r.pickupCity === row.pickupCity &&
            r.returnCity === row.returnCity &&
            r.containerType === row.containerType,
        )
        try {
          if (existing) {
            await update(existing.id, { ...row, __auditAction: "修改", __auditDetail: "CSV 导入更新价目" })
            updated += 1
          } else {
            await create({ ...row, __auditAction: "新增", __auditDetail: "CSV 导入新增价目" })
            created += 1
          }
        } catch {
          failed += 1
        }
      }
      toast.success(`导入完成：新增 ${created} · 更新 ${updated}${failed ? ` · 失败 ${failed}` : ""}`, {
        description: errors.slice(0, 2).join("；") || undefined,
      })
    } catch (e) {
      toast.error((e as Error).message || "导入失败")
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function formatPrice(r: UseBoxPriceRule) {
    const n = Number(r.unitPrice)
    const prefix = r.priceKind === "subsidy" ? "补贴 " : ""
    return `${prefix}¥${n.toLocaleString()}`
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
        module="基础配置 · 基础数据字典"
        title="用箱价目"
        description="按提箱城市、还箱城市与箱型维护用箱参考单价；客户申请页按启用价目精确报价。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={handleDownloadTemplate}>
              <Download className="size-4" />
              下载模板
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={handleExport}>
              <Download className="size-4" />
              导出 CSV
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
            <Button size="sm" className="gap-1.5" onClick={openAdd}>
              <Plus className="size-4" />
              新增价目
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="价目条数" value={stats.total} icon={Tags} />
        <StatCard label="已启用" value={stats.enabled} icon={Tags} tone="success" />
        <StatCard label="线路数" value={stats.routes} icon={Tags} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">价目列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索城市 / 箱型"
                className="w-56 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部箱型</SelectItem>
                {CONTAINER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
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
                  <SortableTableHead
                    label="提箱城市"
                    columnKey="pickupCity"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="还箱城市"
                    columnKey="returnCity"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="箱型"
                    columnKey="containerType"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="单价"
                    columnKey="unitPrice"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="用箱期"
                    columnKey="freeDays"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="超期费"
                    columnKey="overdueDailyRate"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="类型"
                    columnKey="priceKind"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="启用"
                    columnKey="enabled"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-center"
                  />
                  <TableHead className="w-28 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      暂无价目，请点击「新增价目」
                    </TableCell>
                  </TableRow>
                ) : (
                  list.rows.map((r) => (
                    <TableRow key={r.id} className={r.enabled !== false ? "" : "opacity-55"}>
                      <TableCell className="font-medium">{r.pickupCity}</TableCell>
                      <TableCell className="font-medium">{r.returnCity}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.containerType}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatPrice(r)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.freeDays ?? 30} 天</TableCell>
                      <TableCell className="text-right tabular-nums">¥{Number(r.overdueDailyRate ?? 0).toLocaleString()}/天</TableCell>
                      <TableCell>
                        <Badge variant={r.priceKind === "subsidy" ? "outline" : "secondary"}>
                          {r.priceKind === "subsidy" ? "回程补贴" : "标准"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={r.enabled !== false}
                          onCheckedChange={(enabled) => {
                            void update(r.id, {
                              enabled,
                              __auditAction: "修改",
                              __auditDetail: `${enabled ? "启用" : "停用"}用箱价目 ${r.pickupCity}→${r.returnCity} ${r.containerType}`,
                            }).catch((e) => toast.error((e as Error).message))
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑用箱价目" : "新增用箱价目"}</DialogTitle>
            <DialogDescription>同一线路与箱型仅允许一条价目。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>提箱城市 *</Label>
              <CitySearchSelect
                value={form.pickupCity}
                onValueChange={(v) => setForm((f) => ({ ...f, pickupCity: v }))}
                cities={pickupCities}
                placeholder="选择提箱城市"
              />
            </div>
            <div className="space-y-2">
              <Label>还箱城市 *</Label>
              <CitySearchSelect
                value={form.returnCity}
                onValueChange={(v) => setForm((f) => ({ ...f, returnCity: v }))}
                cities={returnCities}
                placeholder="选择还箱城市"
              />
            </div>
            <div className="space-y-2">
              <Label>箱型 *</Label>
              <Select
                key={editing?.id ?? "new"}
                value={form.containerType || DEFAULT_CONTAINER_TYPE}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    containerType: (v as ContainerType) || DEFAULT_CONTAINER_TYPE,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={DEFAULT_CONTAINER_TYPE} />
                </SelectTrigger>
                <SelectContent>
                  {CONTAINER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>价目类型</Label>
              <Select
                value={form.priceKind}
                onValueChange={(v) => setForm((f) => ({ ...f, priceKind: (v as UseBoxPriceKind) || "standard" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">标准价（单价 &gt; 0）</SelectItem>
                  <SelectItem value="subsidy">回程补贴（单价可为负）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">用箱单价 *</Label>
              <Input
                id="unitPrice"
                type="number"
                step={1}
                value={form.unitPrice}
                onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                placeholder={form.priceKind === "subsidy" ? "例如 -200" : "例如 3280"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="freeDays">用箱期（天）</Label>
                <Input
                  id="freeDays"
                  type="number"
                  min={1}
                  value={form.freeDays}
                  onChange={(e) => setForm((f) => ({ ...f, freeDays: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="overdueDailyRate">超期费（元/箱/天）</Label>
                <Input
                  id="overdueDailyRate"
                  type="number"
                  min={0}
                  value={form.overdueDailyRate}
                  onChange={(e) => setForm((f) => ({ ...f, overdueDailyRate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="text-sm font-medium">启用</div>
                <div className="text-xs text-muted-foreground">停用后客户申请无法匹配该价目</div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
              />
            </div>
            {form.pickupCity && form.returnCity ? (
              <div className={`rounded-md px-3 py-2 text-xs ${solidTone.info}`}>
                线路预览：{form.pickupCity} → {form.returnCity} · {form.containerType}
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
