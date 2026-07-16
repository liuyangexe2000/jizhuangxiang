"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { MapPinned, Plus, Pencil, Trash2, Search, Download, Upload } from "lucide-react"
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
import { useDictionary, type CityInput } from "@/lib/dictionary-context"
import { useListQuery } from "@/lib/list-query"
import type { CityDictItem, CityRegion } from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"

const emptyForm: CityInput = {
  code: "",
  name: "",
  region: "境内",
  country: "中国",
  province: "",
  usableAsPickup: true,
  usableAsReturn: true,
  enabled: true,
  sort: 99,
}

export default function CityDictPage() {
  const { cities, addCity, updateCity, removeCity, toggleEnabled } = useDictionary()
  const [keyword, setKeyword] = useState("")
  const [regionFilter, setRegionFilter] = useState<"全部" | CityRegion>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CityDictItem | null>(null)
  const [form, setForm] = useState<CityInput>(emptyForm)

  const filtered = useMemo(() => {
    return cities.filter((c) => {
      const matchKw =
        !keyword ||
        c.name.includes(keyword) ||
        c.code.toLowerCase().includes(keyword.toLowerCase()) ||
        c.country.includes(keyword) ||
        c.province.includes(keyword)
      const matchRegion = regionFilter === "全部" || c.region === regionFilter
      return matchKw && matchRegion
    })
  }, [cities, keyword, regionFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "sort",
    defaultSortDir: "asc",
  })

  const stats = useMemo(
    () => ({
      total: cities.length,
      enabled: cities.filter((c) => c.enabled).length,
      pickup: cities.filter((c) => c.enabled && c.usableAsPickup).length,
      ret: cities.filter((c) => c.enabled && c.usableAsReturn).length,
    }),
    [cities],
  )

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(c: CityDictItem) {
    setEditing(c)
    const { id, ...rest } = c
    setForm(rest)
    setDialogOpen(true)
  }

  function set<K extends keyof CityInput>(k: K, v: CityInput[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("请填写城市编码与城市名称")
      return
    }
    const dup = cities.find(
      (c) => c.code.toLowerCase() === form.code.trim().toLowerCase() && c.id !== editing?.id,
    )
    if (dup) {
      toast.error(`城市编码「${form.code}」已存在`)
      return
    }
    void (async () => {
      try {
        if (editing) {
          await updateCity(editing.id, form)
          toast.success(`已更新城市「${form.name}」`)
        } else {
          await addCity(form)
          toast.success(`已新增城市「${form.name}」`)
        }
        setDialogOpen(false)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
  }

  function handleDelete(c: CityDictItem) {
    void (async () => {
      try {
        await removeCity(c.id)
        toast.success(`已删除城市「${c.name}」`)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
  }

  return (
    <>
      <PageHeader
        module="基础配置 · 基础数据字典"
        title="城市字典"
        description="维护提箱/还箱城市字典，配置可用范围与启用状态，变更实时同步至用箱申请、调运申请等下拉选择。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={() => toast.info("城市字典导出尚未接入")}>
              <Download className="size-4" />
              导出
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={() => toast.info("请选择要导入的字典文件")}>
              <Upload className="size-4" />
              导入
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openAdd}>
              <Plus className="size-4" />
              新增城市
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="城市总数" value={stats.total} icon={MapPinned} />
        <StatCard label="已启用" value={stats.enabled} icon={MapPinned} tone="success" />
        <StatCard label="可提箱城市" value={stats.pickup} icon={Upload} />
        <StatCard label="可还箱城市" value={stats.ret} icon={Download} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">城市列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索城市名称/编码/国家"
                className="w-56 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select value={regionFilter} onValueChange={(v) => setRegionFilter(v as typeof regionFilter)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["全部", "境内", "境外"].map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
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
                  <SortableTableHead label="编码" columnKey="code" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="w-20" />
                  <SortableTableHead label="城市名称" columnKey="name" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="省/州" columnKey="province" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="区域" columnKey="region" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="国家/地区" columnKey="country" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="提箱" columnKey="usableAsPickup" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <SortableTableHead label="还箱" columnKey="usableAsReturn" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <SortableTableHead label="排序" columnKey="sort" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="w-16 text-center" />
                  <SortableTableHead label="启用" columnKey="enabled" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <TableHead className="w-28 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((c) => (
                  <TableRow key={c.id} className={c.enabled ? "" : "opacity-55"}>
                    <TableCell className="font-mono text-xs font-medium">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.province || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.region === "境内" ? "secondary" : "outline"}>{c.region}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.country}</TableCell>
                    <TableCell className="text-center">
                      {c.usableAsPickup ? (
                        <Badge className={solidTone.success}>可提箱</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.usableAsReturn ? (
                        <Badge className="bg-primary text-primary-foreground">可还箱</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{c.sort}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={c.enabled}
                        onCheckedChange={() => {
                          void toggleEnabled(c.id).catch((e) => toast.error((e as Error).message))
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(c)}>
                          <Pencil className="size-4" />
                          <span className="sr-only">编辑</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(c)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">删除</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      未找到匹配的城市
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑城市" : "新增城市"}</DialogTitle>
            <DialogDescription>
              维护城市字典项，控制其在提箱/还箱城市下拉中的可用性。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">城市编码 *</Label>
                <Input
                  id="code"
                  placeholder="如 XA / HAM"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">城市名称 *</Label>
                <Input id="name" placeholder="如 西安" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>区域</Label>
                <Select value={form.region} onValueChange={(v) => set("region", v as CityRegion)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["境内", "境外"].map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">国家/地区</Label>
                <Input id="country" value={form.country} onChange={(e) => set("country", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="province">省/州</Label>
                <Input
                  id="province"
                  placeholder="如 陕西省 / 汉堡"
                  value={form.province}
                  onChange={(e) => set("province", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sort">排序值</Label>
                <Input
                  id="sort"
                  type="number"
                  min={1}
                  value={form.sort}
                  onChange={(e) => set("sort", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">可作为提箱城市</p>
                  <p className="text-xs text-muted-foreground">在用箱/调运申请的提箱下拉中可选</p>
                </div>
                <Switch checked={form.usableAsPickup} onCheckedChange={(v) => set("usableAsPickup", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">可作为还箱城市</p>
                  <p className="text-xs text-muted-foreground">在用箱/调运申请的还箱下拉中可选</p>
                </div>
                <Switch checked={form.usableAsReturn} onCheckedChange={(v) => set("usableAsReturn", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">启用</p>
                  <p className="text-xs text-muted-foreground">停用后不再出现在任何下拉选择中</p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>{editing ? "保存修改" : "确认新增"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
