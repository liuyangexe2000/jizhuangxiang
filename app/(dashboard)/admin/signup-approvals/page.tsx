"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import type { AccountApplication } from "@/lib/types"
import { CheckCircle2, Search, XCircle } from "lucide-react"

const STATUS_TABS = ["全部", "待审核", "已通过", "已驳回"] as const

export default function SignupApprovalsPage() {
  const router = useRouter()
  const { isAdmin } = useRole()
  const { data: apps } = useResource<AccountApplication>("accountApplications")
  const [keyword, setKeyword] = useState("")
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>("待审核")
  const [rejectTarget, setRejectTarget] = useState<AccountApplication | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [credDialog, setCredDialog] = useState<{ account: string; password: string } | null>(null)

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    return apps.filter((a) => {
      const matchStatus = statusTab === "全部" || a.status === statusTab
      const matchKw =
        !needle ||
        [a.name, a.org, a.email, a.phone].some((v) => v.toLowerCase().includes(needle))
      return matchStatus && matchKw
    })
  }, [apps, keyword, statusTab])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
  })

  if (!isAdmin) {
    router.replace("/")
    return null
  }

  async function review(id: string, action: "approve" | "reject", reason?: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/account-applications/${encodeURIComponent(id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectReason: reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "操作失败")
        return
      }
      if (action === "approve" && data.account && data.initialPassword) {
        setCredDialog({ account: data.account, password: data.initialPassword })
        toast.success("已通过并开通账号")
      } else {
        toast.success("已驳回申请")
      }
      await revalidateResource("accountApplications")
      await revalidateResource("users")
      setRejectTarget(null)
      setRejectReason("")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        module="系统管理"
        title="账号申请审批"
        description="审核公开提交的账号申请，通过后自动开通 R03 客户账号。"
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative max-w-md">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="搜索姓名 / 组织 / 邮箱 / 手机"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={statusTab === tab ? "default" : "outline"}
                onClick={() => setStatusTab(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="姓名" columnKey="name" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="组织" columnKey="org" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="联系" columnKey="email" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="提交时间" columnKey="createdAt" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.name}</TableCell>
                    <TableCell className="text-sm">{app.org}</TableCell>
                    <TableCell className="text-sm">
                      <p>{app.email}</p>
                      <p className="text-xs text-muted-foreground">{app.phone}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{app.createdAt}</TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                      {app.rejectReason && (
                        <p className="mt-1 max-w-[200px] truncate text-xs text-destructive" title={app.rejectReason}>
                          {app.rejectReason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {app.status === "待审核" ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === app.id}
                            onClick={() => void review(app.id, "approve")}
                          >
                            <CheckCircle2 className="mr-1 size-3.5 text-success" />
                            通过
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={busyId === app.id}
                            onClick={() => {
                              setRejectTarget(app)
                              setRejectReason("")
                            }}
                          >
                            <XCircle className="mr-1 size-3.5" />
                            驳回
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {app.reviewedBy ? `${app.reviewedBy} · ${app.reviewedAt}` : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      暂无申请记录
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

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回申请</DialogTitle>
            <DialogDescription>{rejectTarget?.name} · {rejectTarget?.org}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>驳回原因 *</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请说明驳回原因，将展示给申请人"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || busyId === rejectTarget?.id}
              onClick={() => rejectTarget && void review(rejectTarget.id, "reject", rejectReason.trim())}
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credDialog} onOpenChange={(o) => !o && setCredDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>账号已开通</DialogTitle>
            <DialogDescription>请通过安全渠道将初始密码告知申请人，并提醒首次登录后修改密码。</DialogDescription>
          </DialogHeader>
          {credDialog && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
              <p>登录账号：{credDialog.account}</p>
              <p>初始密码：{credDialog.password}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredDialog(null)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
