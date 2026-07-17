"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Users, Plus, Pencil, Trash2, Search, UserRoundCheck, ShieldCheck } from "lucide-react"
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
import { roles } from "@/lib/roles"
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import type { SystemUser, RoleId } from "@/lib/types"

type UserInput = Omit<SystemUser, "id" | "lastLogin" | "createdAt">

const assignableRoles = roles.filter((r) => r.id !== "R00")

const emptyForm: UserInput = {
  account: "",
  name: "",
  roleId: "R01",
  org: "",
  email: "",
  phone: "",
  status: "启用",
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { isAdmin, startImpersonation } = useRole()
  const { data: users, create, update, remove } = useResource<SystemUser>("users")
  const [keyword, setKeyword] = useState("")
  const [roleFilter, setRoleFilter] = useState<"全部" | RoleId>("全部")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SystemUser | null>(null)
  const [form, setForm] = useState<UserInput>(emptyForm)

  const roleName = (id: RoleId) => roles.find((r) => r.id === id)?.name ?? id

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchKw =
        !keyword ||
        u.name.includes(keyword) ||
        u.account.toLowerCase().includes(keyword.toLowerCase()) ||
        u.org.includes(keyword)
      const matchRole = roleFilter === "全部" || u.roleId === roleFilter
      return matchKw && matchRole
    })
  }, [users, keyword, roleFilter])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
    getSortValue: (u, key) => {
      if (key === "contact") return `${u.email} ${u.phone}`
      return (u as unknown as Record<string, unknown>)[key]
    },
  })

  const stats = useMemo(
    () => ({
      total: users.length,
      enabled: users.filter((u) => u.status === "启用").length,
      admins: users.filter((u) => u.roleId === "R00").length,
      proxyable: users.filter((u) => u.roleId !== "R00" && u.status === "启用").length,
    }),
    [users],
  )

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(u: SystemUser) {
    setEditing(u)
    const { id, lastLogin, createdAt, ...rest } = u
    setForm(rest)
    setDialogOpen(true)
  }

  function set<K extends keyof UserInput>(k: K, v: UserInput[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.account.trim() || !form.name.trim()) {
      toast.error("请填写登录账号与姓名")
      return
    }
    const dup = users.find(
      (u) => u.account.toLowerCase() === form.account.trim().toLowerCase() && u.id !== editing?.id,
    )
    if (dup) {
      toast.error(`登录账号「${form.account}」已存在`)
      return
    }
    try {
      if (editing) {
        await update(editing.id, { ...form, __auditAction: "修改", __auditDetail: `更新用户「${form.name}」` })
        toast.success(`已更新用户「${form.name}」`)
      } else {
        await create({
          ...form,
          lastLogin: "—",
          createdAt: new Date().toISOString().slice(0, 10),
          __auditAction: "新增",
          __auditDetail: `新增用户「${form.name}」`,
        })
        toast.success(`已新增用户「${form.name}」（默认密码与种子密码相同）`)
      }
      setDialogOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleDelete(u: SystemUser) {
    if (u.roleId === "R00") {
      toast.error("系统管理员账号不可删除")
      return
    }
    try {
      await remove(u.id, { __auditDetail: `删除用户「${u.name}」` })
      toast.success(`已删除用户「${u.name}」`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function toggleStatus(u: SystemUser) {
    try {
      await update(u.id, {
        status: u.status === "启用" ? "停用" : "启用",
        __auditAction: "修改",
        __auditDetail: `${u.status === "启用" ? "停用" : "启用"}用户「${u.name}」`,
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function proxy(u: SystemUser) {
    if (!isAdmin) return
    if (u.roleId === "R00") {
      toast.error("不可代理其他系统管理员")
      return
    }
    if (u.status !== "启用") {
      toast.error("该用户已停用，无法代理登录")
      return
    }
    startImpersonation(u)
    toast.success(`已切换为 ${u.name} 的代理身份`)
    router.push("/")
  }

  return (
    <>
      <PageHeader
        module="系统管理 · 系统管理员专区"
        title="用户与代理"
        description="管理系统全部用户账号（增删改查、启停），并可临时代理任意用户账号进入其视角进行操作。"
        actions={
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            新增用户
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="用户总数" value={stats.total} icon={Users} />
        <StatCard label="已启用" value={stats.enabled} icon={ShieldCheck} tone="success" />
        <StatCard label="管理员账号" value={stats.admins} icon={ShieldCheck} tone="warning" />
        <StatCard label="可代理用户" value={stats.proxyable} icon={UserRoundCheck} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">用户列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索姓名/账号/机构"
                className="w-56 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部角色</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.id} · {r.name}</SelectItem>
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
                  <SortableTableHead label="账号" columnKey="account" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="姓名" columnKey="name" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="角色" columnKey="roleId" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="所属机构" columnKey="org" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="联系方式" columnKey="contact" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="最近登录" columnKey="lastLogin" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <TableHead className="w-40 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((u) => (
                  <TableRow key={u.id} className={u.status === "启用" ? "" : "opacity-55"}>
                    <TableCell className="font-mono text-xs font-medium">{u.account}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>
                      <Badge variant={u.roleId === "R00" ? "default" : "secondary"}>
                        {u.roleId} · {roleName(u.roleId)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.org}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{u.email}</div>
                      <div>{u.phone}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.lastLogin}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={u.status === "启用"} onCheckedChange={() => toggleStatus(u)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={u.roleId === "R00" || u.status !== "启用"}
                          onClick={() => proxy(u)}
                        >
                          <UserRoundCheck className="size-3.5" />
                          代理
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(u)}>
                          <Pencil className="size-4" />
                          <span className="sr-only">编辑</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          disabled={u.roleId === "R00"}
                          onClick={() => handleDelete(u)}
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
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      未找到匹配的用户
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
            <DialogTitle>{editing ? "编辑用户" : "新增用户"}</DialogTitle>
            <DialogDescription>维护系统用户账号信息及所属角色。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="account">登录账号 *</Label>
                <Input
                  id="account"
                  placeholder="如 zhangwei"
                  value={form.account}
                  onChange={(e) => set("account", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">姓名 *</Label>
                <Input id="name" placeholder="如 张伟" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>所属角色</Label>
              <Select value={form.roleId} onValueChange={(v) => set("roleId", v as RoleId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.id} · {r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org">所属机构</Label>
              <Input id="org" placeholder="如 多联公司 · 集装箱管理部" value={form.org} onChange={(e) => set("org", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">邮箱</Label>
                <Input id="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">电话</Label>
                <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">启用账号</p>
                <p className="text-xs text-muted-foreground">停用后该用户无法登录，也不可被代理</p>
              </div>
              <Switch
                checked={form.status === "启用"}
                onCheckedChange={(v) => set("status", v ? "启用" : "停用")}
              />
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
