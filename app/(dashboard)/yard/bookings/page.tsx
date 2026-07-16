"use client"

import { useState, useMemo } from "react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import type { Booking, BookingStatus } from "@/lib/types"
import { CalendarClock, Mail, Send, Clock, User, Phone, Truck, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

export default function BookingsPage() {
  const { roleId } = useRole()
  const canConfirm = roleId === "R00" || roleId === "R01" || roleId === "R04" || roleId === "R06"
  const { data: rows, mutate } = useResource<Booking>("bookings")
  const [typeFilter, setTypeFilter] = useState<string>("全部")
  const [keyword, setKeyword] = useState("")
  const [detail, setDetail] = useState<Booking | null>(null)

  const filtered = useMemo(() => {
    return rows.filter((b) => {
      const matchType = typeFilter === "全部" || b.type === typeFilter
      const kw = keyword.trim().toLowerCase()
      const matchKw =
        !kw ||
        b.bookingNo.toLowerCase().includes(kw) ||
        b.yard.toLowerCase().includes(kw) ||
        b.driver.toLowerCase().includes(kw) ||
        b.containerNos.some((c) => c.toLowerCase().includes(kw))
      return matchType && matchKw
    })
  }, [rows, typeFilter, keyword])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "planTime",
    defaultSortDir: "desc",
  })

  const pending = rows.filter((b) => b.status === "待发送").length
  const notified = rows.filter((b) => b.status === "已通知").length
  const confirmed = rows.filter((b) => b.status === "已确认").length

  async function notify(id: string) {
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/notify`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "通知失败")
      await mutate()
      await revalidateResource("notifications")
      if (data.mailSent) {
        toast.success("已站内通知，并已发送邮件至堆场")
      } else if (data.mailError) {
        toast.success(`已站内通知堆场（邮件未发：${data.mailError}）`)
      } else {
        toast.success("已站内通知堆场")
      }
      if (detail?.id === id) {
        setDetail({ ...detail, status: "已通知" as BookingStatus })
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function confirmBooking(id: string) {
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/confirm`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "确认失败")
      await mutate()
      await revalidateResource("notifications")
      toast.success("已确认接受预约")
      if (detail?.id === id) {
        setDetail({
          ...detail,
          status: "已确认" as BookingStatus,
          confirmedBy: data.confirmedBy,
          confirmedAt: data.confirmedAt,
        })
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="预约与通知"
        description="M04-F02 提还箱预约管理 — 司机/车牌登记、工作时段校验；通知时写站内消息，并按堆场邮箱走 SMTP 发信"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="待发送通知" value={pending} unit="单" icon={Send} tone="warning" />
        <StatCard label="已通知" value={notified} unit="单" icon={Mail} tone="primary" />
        <StatCard label="已确认" value={confirmed} unit="单" icon={CalendarClock} tone="success" />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>预约列表</CardTitle>
            <CardDescription>提箱/还箱预约记录，需在堆场工作时段内预约</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="搜索预约号 / 箱号 / 堆场 / 司机"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "全部")}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="全部">全部类型</SelectItem>
                <SelectItem value="提箱预约">提箱预约</SelectItem>
                <SelectItem value="还箱预约">还箱预约</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={list.sortDir}
              onValueChange={(v) => {
                if (v !== list.sortDir) list.toggleSort("planTime")
              }}
            >
              <SelectTrigger className="sm:w-36">
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">时间倒序</SelectItem>
                <SelectItem value="asc">时间正序</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-3 px-6 py-4">
            {list.rows.map((b) => (
              <div
                key={b.id}
                className="flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{b.bookingNo}</span>
                    <Badge variant={b.type === "提箱预约" ? "default" : "secondary"}>{b.type}</Badge>
                    <StatusBadge status={b.status} />
                    {!b.withinWorkHours && (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                        <AlertTriangle className="size-3" />
                        非工作时段
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {b.planTime}
                    </span>
                    <span>
                      {b.yard} · {b.city}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3.5" />
                      {b.driver}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Truck className="size-3.5" />
                      {b.plateNo}
                    </span>
                    <span>共 {b.containerNos.length} 箱</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDetail(b)}>
                    详情
                  </Button>
                  {b.status === "待发送" && (
                    <Button size="sm" className="gap-1.5" onClick={() => notify(b.id)}>
                      <Send className="size-3.5" />
                      发送通知
                    </Button>
                  )}
                  {b.status === "已通知" && canConfirm && (
                    <Button size="sm" className="gap-1.5" onClick={() => confirmBooking(b.id)}>
                      <CheckCircle2 className="size-3.5" />
                      确认预约
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {list.total === 0 && (
              <p className="py-10 text-center text-muted-foreground">未找到匹配的预约记录</p>
            )}
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

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono">{detail.bookingNo}</span>
                  <Badge variant={detail.type === "提箱预约" ? "default" : "secondary"}>
                    {detail.type}
                  </Badge>
                </DialogTitle>
                <DialogDescription>预约与通知详情</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="计划时间" value={detail.planTime} />
                <Field label="状态" value={detail.status} />
                <Field label="堆场" value={detail.yard} />
                <Field label="城市" value={detail.city} />
                <Field label="司机" value={detail.driver} />
                <Field label="证件号" value={detail.driverId} />
                <Field
                  label="联系电话"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3.5" />
                      {detail.driverPhone}
                    </span>
                  }
                />
                <Field label="车牌号" value={detail.plateNo} />
                <Field label="业务参考号" value={detail.refNo} />
                <Field label="邮件通知" value={detail.notifyByEmail ? "是" : "否"} />
                {detail.status === "已确认" && (
                  <>
                    <Field label="确认人" value={detail.confirmedBy || "—"} />
                    <Field label="确认时间" value={detail.confirmedAt || "—"} />
                  </>
                )}
              </div>
              {detail.status === "已通知" && canConfirm && (
                <Button size="sm" className="w-full gap-1.5" onClick={() => confirmBooking(detail.id)}>
                  <CheckCircle2 className="size-3.5" />
                  确认接受预约
                </Button>
              )}
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  预约箱号（{detail.containerNos.length}）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.containerNos.map((c) => (
                    <span key={c} className="rounded-md bg-background px-2 py-0.5 font-mono text-xs">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
