"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { Building2, Search, Pencil, FolderOpen } from "lucide-react"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { Customer } from "@/lib/types"

export default function CustomersPage() {
  const { data: rows, update } = useResource<Customer>("customers")
  const [keyword, setKeyword] = useState("")
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState({
    abbreviation: "",
    contactUser: "",
    contactPhone: "",
    email: "",
    address: "",
  })

  const pool = useMemo(() => rows.filter((c) => !c.deleted), [rows])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return pool
    return pool.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        c.abbreviation.toLowerCase().includes(kw) ||
        c.contactUser.toLowerCase().includes(kw) ||
        c.contactPhone.includes(kw) ||
        c.email.toLowerCase().includes(kw) ||
        c.creditCode.toLowerCase().includes(kw) ||
        String(c.legacyId).includes(kw) ||
        c.customId.toLowerCase().includes(kw),
    )
  }, [pool, keyword])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "legacyId",
    defaultSortDir: "asc",
  })

  const stats = useMemo(() => {
    const enabled = pool.filter((c) => c.enabled).length
    return { total: pool.length, enabled, disabled: pool.length - enabled }
  }, [pool])

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({
      abbreviation: c.abbreviation,
      contactUser: c.contactUser,
      contactPhone: c.contactPhone,
      email: c.email,
      address: c.address,
    })
  }

  async function toggleEnabled(c: Customer, enabled: boolean) {
    try {
      await update(c.id, {
        enabled,
        __auditAction: "修改",
        __auditDetail: `${enabled ? "启用" : "停用"}客户 ${c.name}`,
      })
      toast.success(enabled ? `已启用 ${c.name}` : `已停用 ${c.name}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function saveEdit() {
    if (!editing) return
    try {
      await update(editing.id, {
        abbreviation: form.abbreviation.trim(),
        contactUser: form.contactUser.trim(),
        contactPhone: form.contactPhone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        __auditAction: "修改",
        __auditDetail: `更新客户资料 ${editing.name}`,
      })
      toast.success("客户资料已保存")
      setEditing(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="基础配置"
        title="客户主档"
        description="客户名称、联系人与信用代码等主数据；可打开生命周期档案汇总用箱订单与账单轨迹。legacyId / customId 用于与旧系统数据匹配。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="客户总数" value={stats.total} icon={Building2} tone="primary" />
        <StatCard label="已启用" value={stats.enabled} icon={Building2} tone="success" />
        <StatCard label="已停用" value={stats.disabled} icon={Building2} tone="warning" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">客户列表</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索名称 / 简称 / 联系人 / 旧ID"
              className="pl-8"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="旧ID" columnKey="legacyId" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="客户名称" columnKey="name" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="简称" columnKey="abbreviation" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="联系人" columnKey="contactUser" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead>电话</TableHead>
                  <TableHead>邮箱</TableHead>
                  <SortableTableHead label="启用" columnKey="enabled" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((c) => (
                  <TableRow key={c.id} className={c.enabled ? "" : "opacity-55"}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.legacyId}</TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="truncate font-medium" title={c.name}>
                        {c.name}
                      </div>
                      {c.hasSeal && (
                        <Badge variant="outline" className="mt-1 h-5 text-[10px]">
                          有电子章
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{c.abbreviation || "—"}</TableCell>
                    <TableCell className="text-sm">{c.contactUser || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.contactPhone || "—"}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground" title={c.email}>
                      {c.email || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={c.enabled} onCheckedChange={(v) => void toggleEnabled(c, !!v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          nativeButton={false}
                          render={<Link href={`/config/customers/${encodeURIComponent(c.id)}`} />}
                        >
                          <FolderOpen className="size-3.5" />
                          档案
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(c)}>
                          <Pencil className="size-3.5" />
                          编辑
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      暂无客户数据
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑客户</DialogTitle>
            <DialogDescription>
              {editing?.name}
              {editing ? ` · 旧ID ${editing.legacyId}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>简称</Label>
              <Input value={form.abbreviation} onChange={(e) => setForm((f) => ({ ...f, abbreviation: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>联系人</Label>
                <Input value={form.contactUser} onChange={(e) => setForm((f) => ({ ...f, contactUser: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>电话</Label>
                <Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>邮箱</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>地址</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button type="button" onClick={() => void saveEdit()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
