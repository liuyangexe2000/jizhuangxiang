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
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { DispatchPriceRule, Yard } from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"

const ZONES: DispatchPriceRule["zone"][] = ["近距", "中距", "远距"]

type FormState = {
  pickupPlace: string
  scope: string
  unitPrice: string
  overdue: string
  suggestTerm: string
  zone: DispatchPriceRule["zone"]
  enabled: boolean
}

const emptyForm: FormState = {
  pickupPlace: "",
  scope: "",
  unitPrice: "",
  overdue: "¥100/箱/天",
  suggestTerm: "30",
  zone: "中距",
  enabled: true,
}

export default function DispatchPricesPage() {
  const { data: rows, create, update, remove } = useResource<DispatchPriceRule>("dispatchPriceRules")
  const { data: yards } = useResource<Yard>("yards")
  const [keyword, setKeyword] = useState("")
  const [zoneFilter, setZoneFilter] = useState<"全部" | DispatchPriceRule["zone"]>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DispatchPriceRule | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const yardNames = useMemo(() => {
    const enabled = yards.filter((y) => y.enabled && !y.deleted).map((y) => y.name)
    const fromRules = rows.map((r) => r.pickupPlace)
    return Array.from(new Set([...enabled, ...fromRules])).sort((a, b) => a.localeCompare(b, "zh"))
  }, [yards, rows])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return rows.filter((r) => {
      const matchKw =
        !kw ||
        r.pickupPlace.toLowerCase().includes(kw) ||
        r.scope.toLowerCase().includes(kw) ||
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
    setDialogOpen(true)
  }

  function openEdit(r: DispatchPriceRule) {
    setEditing(r)
    setForm({
      pickupPlace: r.pickupPlace,
      scope: r.scope,
      unitPrice: String(r.unitPrice),
      overdue: r.overdue,
      suggestTerm: String(r.suggestTerm),
      zone: r.zone,
      enabled: r.enabled !== false,
    })
    setDialogOpen(true)
  }

  function findDuplicate(excludeId?: string) {
    return rows.find(
      (r) =>
        r.id !== excludeId &&
        r.pickupPlace === form.pickupPlace.trim() &&
        r.scope.trim() === form.scope.trim(),
    )
  }

  function handleSave() {
    const pickupPlace = form.pickupPlace.trim()
    const scope = form.scope.trim()
    if (!pickupPlace || !scope) {
      toast.error("请填写提箱堆场与还箱范围")
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
    if (findDuplicate(editing?.id)) {
      toast.error("该提箱堆场与还箱范围已存在价目", {
        description: `${pickupPlace} · ${scope}`,
      })
      return
    }
    void (async () => {
      try {
        const payload = {
          pickupPlace,
          scope,
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
            __auditDetail: `更新调运价目 ${pickupPlace} · ${scope}`,
          })
          toast.success("调运价目已更新")
        } else {
          await create({
            ...payload,
            __auditAction: "新增",
            __auditDetail: `新增调运价目 ${pickupPlace} · ${scope}`,
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
          __auditDetail: `删除调运价目 ${r.pickupPlace} · ${r.scope}`,
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
        description="按提箱堆场与还箱范围维护调运单价方案（BR-11）；调运申请页按启用方案匹配报价。"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            新增价目
          </Button>
        }
      />

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
                placeholder="搜索堆场 / 还箱范围"
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
                  <SortableTableHead label="还箱范围" columnKey="scope" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
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
                      <TableCell className="max-w-[16rem]">{r.scope}</TableCell>
                      <TableCell>
                        <Badge className={solidTone[r.zone === "近距" ? "success" : r.zone === "远距" ? "warning" : "primary"]}>
                          {r.zone}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">¥{Number(r.unitPrice).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.suggestTerm} 天</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.overdue}</TableCell>
                      <TableCell className="text-center">
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑调运价目" : "新增调运价目"}</DialogTitle>
            <DialogDescription>同一提箱堆场与还箱范围仅允许一条启用方案。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>提箱堆场 *</Label>
              <Select
                value={form.pickupPlace}
                onValueChange={(v) => setForm((f) => ({ ...f, pickupPlace: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择提箱堆场" />
                </SelectTrigger>
                <SelectContent>
                  {yardNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="scope">还箱范围 *</Label>
              <Input
                id="scope"
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                placeholder="例如 杜伊斯堡 / 纽伦堡 / 慕尼黑"
              />
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
            {form.pickupPlace && form.scope ? (
              <div className={`rounded-md px-3 py-2 text-xs sm:col-span-2 ${solidTone.info}`}>
                方案预览：{form.pickupPlace} → {form.scope} · {form.zone}
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
