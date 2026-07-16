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
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { InventoryRow, Yard } from "@/lib/types"
import { Warehouse, MapPin, Mail, Phone, PackageOpen, Pencil } from "lucide-react"
import { toast } from "sonner"

type EditForm = {
  name: string
  capacity: string
  phone: string
  email: string
  address: string
}

export default function YardsPage() {
  const { data: rows, update } = useResource<Yard>("yards")
  const { data: inventory } = useResource<InventoryRow>("inventory")
  const [keyword, setKeyword] = useState("")
  const [editing, setEditing] = useState<Yard | null>(null)
  const [form, setForm] = useState<EditForm>({
    name: "",
    capacity: "",
    phone: "",
    email: "",
    address: "",
  })

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
        y.agent.toLowerCase().includes(kw),
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

  function openEdit(y: Yard) {
    setEditing(y)
    setForm({
      name: y.name,
      capacity: String(y.capacity),
      phone: y.phone,
      email: y.email,
      address: y.address,
    })
  }

  async function handleSave() {
    if (!editing) return
    const capacity = Number(form.capacity)
    if (!form.name.trim()) {
      toast.error("请填写堆场名称")
      return
    }
    if (!Number.isFinite(capacity) || capacity < 0) {
      toast.error("容量须为非负数字")
      return
    }
    try {
      await update(editing.id, {
        name: form.name.trim(),
        capacity,
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        __auditAction: "修改",
        __auditDetail: `更新堆场「${form.name.trim()}」`,
      })
      toast.success(`已更新堆场「${form.name.trim()}」`)
      setEditing(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="堆场信息维护"
        description="M04-F03 境内外堆场动态维护 — 联系方式、容量、代管公司与启用状态；在场量取自库存台账"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="堆场总数" value={rows.length} unit="个" icon={Warehouse} tone="primary" />
        <StatCard label="启用中" value={active} unit="个" icon={PackageOpen} tone="success" />
        <StatCard label="总容量" value={totalCap} unit="TEU" icon={Warehouse} tone="primary" />
        <StatCard label="整体利用率" value={usage} unit="%" icon={PackageOpen} tone={usage > 80 ? "warning" : "primary"} />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>堆场列表</CardTitle>
            <CardDescription>共 {rows.length} 个境内外堆场 · 在场量 = 库存 onSite 汇总</CardDescription>
          </div>
          <Input
            placeholder="搜索堆场 / 城市 / 代管公司"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="sm:max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
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
                      <TableCell>
                        <div className="font-medium">{y.name}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {y.address}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{y.region}</Badge>
                        <span className="ml-2 text-sm">{y.city}</span>
                      </TableCell>
                      <TableCell className="text-sm">{y.agent}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="size-3" />
                          {y.phone}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3" />
                          {y.email}
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
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑堆场</DialogTitle>
            <DialogDescription>修改名称、容量与联系信息。在场量由库存台账汇总，不可手改。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="yard-name">堆场名称</Label>
              <Input
                id="yard-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yard-capacity">容量（TEU）</Label>
              <Input
                id="yard-capacity"
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yard-phone">电话</Label>
              <Input
                id="yard-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yard-email">邮箱</Label>
              <Input
                id="yard-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="yard-address">地址</Label>
              <Input
                id="yard-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground">
                当前在场（库存汇总）：{occupancyOf(editing)} / 容量 {form.capacity || editing.capacity}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
