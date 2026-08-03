"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  Factory,
  KeySquare,
  Star,
  Building2,
  Boxes,
  ExternalLink,
} from "lucide-react"
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
import { isSelfOpSupplier } from "@/lib/domain/self-op-supplier"
import type { ContainerMaster, Supplier, SupplierType } from "@/lib/types"
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

const TYPE_OPTIONS: Array<"全部" | SupplierType> = ["全部", "自营", "制造商", "租赁商"]

export default function SuppliersPage() {
  const { data: suppliers, create, update, remove } = useResource<Supplier>("suppliers")
  const { data: containers } = useResource<ContainerMaster>("containers")
  const [keyword, setKeyword] = useState("")
  const [typeFilter, setTypeFilter] = useState<"全部" | SupplierType>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const ownedBoxCount = useMemo(
    () => containers.filter((c) => c.ownership === "自有箱").length,
    [containers],
  )

  const filtered = useMemo(() => {
    const rows = suppliers.filter((s) => {
      const kw =
        !keyword || s.name.includes(keyword) || s.contact.includes(keyword) || s.country.includes(keyword)
      const t = typeFilter === "全部" || s.type === typeFilter
      return kw && t
    })
    return [...rows].sort((a, b) => {
      const aSelf = isSelfOpSupplier(a) ? 0 : 1
      const bSelf = isSelfOpSupplier(b) ? 0 : 1
      if (aSelf !== bSelf) return aSelf - bSelf
      return 0
    })
  }, [suppliers, keyword, typeFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "cooperationSince",
    defaultSortDir: "desc",
  })

  const stats = useMemo(
    () => ({
      total: suppliers.length,
      selfOp: suppliers.filter((s) => s.type === "自营").length,
      maker: suppliers.filter((s) => s.type === "制造商").length,
      lessor: suppliers.filter((s) => s.type === "租赁商").length,
      gradeA: suppliers.filter((s) => s.rating === "A").length,
    }),
    [suppliers],
  )

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
        const payload = isSelfOpSupplier(editing) ? { ...form, type: "自营" as const } : form
        await update(editing.id, {
          ...payload,
          __auditAction: "修改",
          __auditDetail: `更新供应商「${form.name}」`,
        })
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
    if (isSelfOpSupplier(s)) {
      toast.error("自营主体不可删除", {
        description: "西安国际陆港多式联运有限公司为系统自营方，仅可停用外采供应商",
      })
      return
    }
    try {
      await remove(s.id, { __auditDetail: `删除供应商「${s.name}」` })
      toast.success(`已删除供应商「${s.name}」`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function toggle(s: Supplier) {
    if (isSelfOpSupplier(s) && s.enabled) {
      toast.error("自营主体不可停用")
      return
    }
    try {
      await update(s.id, {
        enabled: !s.enabled,
        __auditAction: "修改",
        __auditDetail: `${s.enabled ? "停用" : "启用"}供应商「${s.name}」`,
      })
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
        description="以自营为主、外采为辅：自营主体对应自有箱档案；制造商/租赁商用于采购与租赁合同。"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            新增供应商
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="供应商总数" value={stats.total} icon={Users} />
        <StatCard label="自营" value={stats.selfOp} icon={Building2} tone="primary" />
        <StatCard label="制造商" value={stats.maker} icon={Factory} />
        <StatCard label="租赁商" value={stats.lessor} icon={KeySquare} />
        <StatCard label="A 级供应商" value={stats.gradeA} icon={Star} tone="success" />
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Boxes className="size-4 text-primary" />
              自有集装箱档案
            </p>
            <p className="text-xs text-muted-foreground">
              自营方「西安国际陆港多式联运有限公司」的箱属资产不在本页逐箱展开，请到五维库存 · 集装箱总表查看
              {ownedBoxCount > 0 ? `（当前自有箱 ${ownedBoxCount.toLocaleString()} 条）` : ""}。
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            nativeButton={false}
            render={<Link href="/inventory/ledger?tab=masters" />}
          >
            打开集装箱总表
            <ExternalLink className="size-3.5" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">供应商列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索名称/联系人/国家"
                className="w-52 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
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
                    label="供应商名称"
                    columnKey="name"
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
                    label="联系人"
                    columnKey="contact"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="联系电话"
                    columnKey="phone"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="国家/地区"
                    columnKey="country"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                  <SortableTableHead
                    label="评级"
                    columnKey="rating"
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                    className="text-center"
                  />
                  <SortableTableHead
                    label="合作起始"
                    columnKey="cooperationSince"
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
                {list.rows.map((s) => {
                  const selfOp = isSelfOpSupplier(s)
                  return (
                    <TableRow key={s.id} className={s.enabled ? "" : "opacity-55"}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-1">
                          <span>{s.name}</span>
                          {selfOp && (
                            <Link
                              href="/inventory/ledger?tab=masters"
                              className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
                            >
                              查看自有箱档案
                              <ExternalLink className="size-3" />
                            </Link>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.type === "自营" ? "default" : s.type === "制造商" ? "secondary" : "outline"}
                        >
                          {s.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.contact}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.phone}</TableCell>
                      <TableCell className="text-muted-foreground">{s.country}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={ratingTone[s.rating]}>{s.rating}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.cooperationSince}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={s.enabled}
                          onCheckedChange={() => void toggle(s)}
                          disabled={selfOp && s.enabled}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(s)}>
                            <Pencil className="size-4" />
                            <span className="sr-only">编辑</span>
                          </Button>
                          {!selfOp && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={() => void handleDelete(s)}
                            >
                              <Trash2 className="size-4" />
                              <span className="sr-only">删除</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
            <DialogDescription>
              {editing && isSelfOpSupplier(editing)
                ? "自营主体类型固定，可维护联系信息；箱档案请到集装箱总表查看。"
                : "维护自营/制造商/租赁商基本信息与合作评级。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">供应商名称 *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  disabled={!!editing && isSelfOpSupplier(editing)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select
                  value={form.type}
                  disabled={!!editing && isSelfOpSupplier(editing)}
                  onValueChange={(v) => set("type", v as SupplierType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="自营">自营</SelectItem>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["A", "B", "C"].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r} 级
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="since">合作起始</Label>
                <Input
                  id="since"
                  type="month"
                  value={form.cooperationSince}
                  onChange={(e) => set("cooperationSince", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">启用</p>
                <p className="text-xs text-muted-foreground">
                  {editing && isSelfOpSupplier(editing)
                    ? "自营主体始终启用"
                    : "停用后不再出现在合同供应方选择中"}
                </p>
              </div>
              <Switch
                checked={form.enabled}
                disabled={!!editing && isSelfOpSupplier(editing)}
                onCheckedChange={(v) => set("enabled", v)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()}>{editing ? "保存修改" : "确认新增"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
