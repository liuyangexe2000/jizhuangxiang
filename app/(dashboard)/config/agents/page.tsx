"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Briefcase, Plus, Pencil, Trash2, Search } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import type { ProxyCompany } from "@/lib/types"

type FormState = {
  name: string
  contactUser: string
  phone: string
  email: string
  enabled: boolean
}

const emptyForm: FormState = {
  name: "",
  contactUser: "",
  phone: "",
  email: "",
  enabled: true,
}

export default function ProxyAgentsPage() {
  const { data: rows, create, update, remove } = useResource<ProxyCompany>("proxyCompanies")
  const [keyword, setKeyword] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProxyCompany | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) ||
        r.contactUser.toLowerCase().includes(kw) ||
        r.phone.toLowerCase().includes(kw) ||
        r.email.toLowerCase().includes(kw),
    )
  }, [rows, keyword])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "name",
    defaultSortDir: "asc",
  })

  const stats = useMemo(
    () => ({
      total: rows.length,
      enabled: rows.filter((r) => r.enabled !== false).length,
    }),
    [rows],
  )

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(r: ProxyCompany) {
    setEditing(r)
    setForm({
      name: r.name,
      contactUser: r.contactUser,
      phone: r.phone,
      email: r.email,
      enabled: r.enabled !== false,
    })
    setDialogOpen(true)
  }

  function handleSave() {
    const name = form.name.trim()
    if (!name) {
      toast.error("请填写代管公司名称")
      return
    }
    const dup = rows.find(
      (r) => r.name.trim().toLowerCase() === name.toLowerCase() && r.id !== editing?.id,
    )
    if (dup) {
      toast.error(`代管公司「${name}」已存在`)
      return
    }
    void (async () => {
      try {
        if (editing) {
          await update(editing.id, {
            name,
            contactUser: form.contactUser.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            enabled: form.enabled,
            __auditAction: "修改",
            __auditDetail: `更新代管公司「${name}」`,
          })
          toast.success("代管公司已更新")
        } else {
          await create({
            name,
            contactUser: form.contactUser.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            enabled: form.enabled,
            __auditAction: "新增",
            __auditDetail: `新增代管公司「${name}」`,
          })
          toast.success("代管公司已新增")
        }
        setDialogOpen(false)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
  }

  return (
    <>
      <PageHeader
        module="基础配置 · 基础数据字典"
        title="代管公司"
        description="维护堆场代管公司主档及主联系人；堆场维护中选择公司后自动带出联系人信息。"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            新增代管公司
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
        <StatCard label="公司总数" value={stats.total} icon={Briefcase} />
        <StatCard label="已启用" value={stats.enabled} icon={Briefcase} tone="success" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">公司列表</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索公司 / 联系人 / 电话"
              className="w-56 pl-8"
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
                  <SortableTableHead label="公司名称" columnKey="name" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="联系人" columnKey="contactUser" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="电话" columnKey="phone" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="邮箱" columnKey="email" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="启用" columnKey="enabled" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <TableHead className="w-28 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      暂无代管公司，请点击「新增代管公司」
                    </TableCell>
                  </TableRow>
                ) : (
                  list.rows.map((r) => (
                    <TableRow key={r.id} className={r.enabled !== false ? "" : "opacity-55"}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.contactUser || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={r.enabled !== false}
                          onCheckedChange={(enabled) => {
                            void update(r.id, {
                              enabled,
                              __auditAction: "修改",
                              __auditDetail: `${enabled ? "启用" : "停用"}代管公司 ${r.name}`,
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              void remove(r.id, { __auditDetail: `删除代管公司 ${r.name}` })
                                .then(() => toast.success("已删除"))
                                .catch((e) => toast.error((e as Error).message))
                            }}
                          >
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
            <DialogTitle>{editing ? "编辑代管公司" : "新增代管公司"}</DialogTitle>
            <DialogDescription>公司名称唯一；主联系人信息将在堆场维护中自动带出。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pc-name">公司名称 *</Label>
              <Input
                id="pc-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-contact">联系人</Label>
              <Input
                id="pc-contact"
                value={form.contactUser}
                onChange={(e) => setForm((f) => ({ ...f, contactUser: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-phone">电话</Label>
              <Input
                id="pc-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-email">邮箱</Label>
              <Input
                id="pc-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="text-sm font-medium">启用</div>
                <div className="text-xs text-muted-foreground">停用后堆场表单下拉中不再显示</div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
              />
            </div>
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
