"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Users, Plus, Pencil, Trash2, Search, Factory, KeySquare, Star } from "lucide-react"
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
import type { Supplier, SupplierType } from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"

type FormState = Omit<Supplier, "id">

const emptyForm: FormState = {
  name: "",
  type: "制造商",
  contact: "",
  phone: "",
  email: "",
  country: "中国",
  rating: "A",
  cooperationSince: "",
  enabled: true,
}

export default function SuppliersPage() {
  const { data: suppliers, create, update, remove } = useResource<Supplier>("suppliers")
  const [keyword, setKeyword] = useState("")
  const [typeFilter, setTypeFilter] = useState<"全部" | SupplierType>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      const kw = !keyword || s.name.includes(keyword) || s.contact.includes(keyword) || s.country.includes(keyword)
      const t = typeFilter === "全部" || s.type === typeFilter
      return kw && t
    })
  }, [suppliers, keyword, typeFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "cooperationSince",
    defaultSortDir: "desc",
  })

  const stats = useMemo(() => ({
    total: suppliers.length,
    maker: suppliers.filter((s) => s.type === "制造商").length,
    lessor: suppliers.filter((s) => s.type === "租赁商").length,
    gradeA: suppliers.filter((s) => s.rating === "A").length,
  }), [suppliers])

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(s: Supplier) {
    setEditing(s)
    const { id, ...rest } = s
    setForm(rest)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.contact.trim()) {
      toast.error("请填写供应商名称与联系人")
      return
    }
    try {
      if (editing) {
        await update(editing.id, { ...form, __auditAction: "修改", __auditDetail: `更新供应商「${form.name}」` })
        toast.success(`已更新供应商「${form.name}」`)
      } else {
        await create({ ...form, __auditAction: "新增", __auditDetail: `新增供应商「${form.name}」` })
        toast.success(`已新增供应商「${form.name}」`)
      }
      setDialogOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleDelete(s: Supplier) {
    try {
      await remove(s.id, { __auditDetail: `删除供应商「${s.name}」` })
      toast.success(`已删除供应商「${s.name}」`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function toggle(s: Supplier) {
    try {
      await update(s.id, { enabled: !s.enabled, __auditAction: "修改", __auditDetail: `${s.enabled ? "停用" : "启用"}供应商「${s.name}」` })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const ratingTone: Record<Supplier["rating"], string> = {
    A: solidTone.success,
    B: solidTone.primary,
    C: solidTone.muted,
  }

  return (
    <>
      <PageHeader
        module="M05 · 集装箱供应计划管理"
        title="供应商台账"
        description="维护集装箱制造商与租赁商信息，作为采购/租赁合同的供应方来源。"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            新增供应商
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="供应商总数" value={stats.total} icon={Users} />
        <StatCard label="制造商" value={stats.maker} icon={Factory} />
        <StatCard label="租赁商" value={stats.lessor} icon={KeySquare} />
        <StatCard label="A 级供应商" value={stats.gradeA} icon={Star} tone="success" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">供应商列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索名称/联系人/国家"
                className="w-52 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["全部", "制造商", "租赁商"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="供应商名称" columnKey="name" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="类型" columnKey="type" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="联系人" columnKey="contact" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="联系电话" columnKey="phone" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="国家/地区" columnKey="country" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="评级" columnKey="rating" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <SortableTableHead label="合作起始" columnKey="cooperationSince" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="启用" columnKey="enabled" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((s) => (
                  <TableRow key={s.id} className={s.enabled ? "" : "opacity-55"}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant={s.type === "制造商" ? "secondary" : "outline"}>{s.type}</Badge>
                    </TableCell>
                    <TableCell>{s.contact}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{s.country}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={ratingTone[s.rating]}>{s.rating}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.cooperationSince}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(s)}>
                          <Pencil className="size-4" />
                          <span className="sr-only">编辑</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => handleDelete(s)}>
                          <Trash2 className="size-4" />
                          <span className="sr-only">删除</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      未找到匹配的供应商
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
            <DialogTitle>{editing ? "编辑供应商" : "新增供应商"}</DialogTitle>
            <DialogDescription>维护制造商/租赁商基本信息与合作评级。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">供应商名称 *</Label>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v as SupplierType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="制造商">制造商</SelectItem>
                    <SelectItem value="租赁商">租赁商</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="contact">联系人 *</Label>
                <Input id="contact" value={form.contact} onChange={(e) => set("contact", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">联系电话</Label>
                <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">邮箱</Label>
                <Input id="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">国家/地区</Label>
                <Input id="country" value={form.country} onChange={(e) => set("country", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>评级</Label>
                <Select value={form.rating} onValueChange={(v) => set("rating", v as Supplier["rating"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["A", "B", "C"].map((r) => <SelectItem key={r} value={r}>{r} 级</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="since">合作起始</Label>
                <Input id="since" type="month" value={form.cooperationSince} onChange={(e) => set("cooperationSince", e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">启用</p>
                <p className="text-xs text-muted-foreground">停用后不再出现在合同供应方选择中</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
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
