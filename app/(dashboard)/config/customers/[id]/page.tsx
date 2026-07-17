"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Building2, FileText, Receipt, CalendarClock, GitCompareArrows } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { LifecycleTimeline } from "@/components/lifecycle-timeline"
import { StatusBadge } from "@/components/status-badge"
import { PageSpinner } from "@/components/navigation-loading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useResource } from "@/lib/api"
import { useRole } from "@/lib/role-context"
import {
  customerMatchesOrg,
  getCustomerLifecycle,
} from "@/lib/domain/customer-lifecycle"
import type {
  AttachmentMeta,
  Bill,
  Booking,
  Customer,
  GateRecord,
  SystemUser,
  UseBoxOrder,
} from "@/lib/types"

export default function CustomerLifecyclePage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(String(params.id ?? ""))
  const { roleId, user, loading: roleLoading } = useRole()

  const { data: customers, isLoading: loadingCustomers } = useResource<Customer>("customers")
  const { data: orders, isLoading: loadingOrders } = useResource<UseBoxOrder>("orders")
  const { data: bills, isLoading: loadingBills } = useResource<Bill>("bills")
  const { data: bookings } = useResource<Booking>("bookings")
  const { data: gate } = useResource<GateRecord>("gate")
  const { data: attachments } = useResource<AttachmentMeta>("attachments")
  const { data: users } = useResource<SystemUser>("users")

  const customer = useMemo(() => customers.find((c) => c.id === id), [customers, id])

  const allowed = useMemo(() => {
    if (roleId === "R00" || roleId === "R01") return true
    if (roleId === "R03" && customer) return customerMatchesOrg(customer, user?.org)
    return false
  }, [roleId, customer, user?.org])

  const lifecycle = useMemo(() => {
    if (!customer) return null
    return getCustomerLifecycle({
      customer,
      orders,
      bills,
      bookings,
      gate,
      attachments,
      users,
    })
  }, [customer, orders, bills, bookings, gate, attachments, users])

  const loading = roleLoading || loadingCustomers || loadingOrders || loadingBills

  if (loading) {
    return <PageSpinner label="加载客户档案…" />
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <PageHeader module="基础配置" title="客户档案" description="未找到该客户主档" />
        <Button variant="outline" nativeButton={false} render={<Link href="/config/customers" />}>
          <ArrowLeft className="mr-1 size-4" />
          返回客户主档
        </Button>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeader module="基础配置" title="客户档案" description="无权查看该客户生命周期档案" />
        <Button type="button" variant="outline" onClick={() => router.replace("/")}>
          返回工作台
        </Button>
      </div>
    )
  }

  const { summary, events, nameKeys } = lifecycle!

  return (
    <>
      <div className="mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-0 text-muted-foreground"
          nativeButton={false}
          render={<Link href="/config/customers" />}
        >
          <ArrowLeft className="size-4" />
          返回客户主档
        </Button>
      </div>

      <PageHeader
        module="基础配置"
        title={customer.name}
        description={`客户生命周期档案 · 旧ID ${customer.legacyId}${customer.abbreviation ? ` · 简称 ${customer.abbreviation}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="用箱订单" value={summary.orderCount} icon={FileText} tone="primary" />
        <StatCard label="进行中" value={summary.activeOrderCount} icon={Building2} tone="warning" />
        <StatCard label="已完成" value={summary.completedOrderCount} icon={Building2} tone="success" />
        <StatCard
          label="待确认账单金额"
          value={`¥${summary.pendingBillAmount.toLocaleString()}`}
          icon={Receipt}
          tone="danger"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">主档摘要</CardTitle>
            <CardDescription>匹配键用于关联订单与账单（名称字符串）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">联系人</div>
              <div>{customer.contactUser || "—"} · {customer.contactPhone || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">邮箱</div>
              <div className="break-all">{customer.email || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">地址</div>
              <div>{customer.address || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">信用代码</div>
              <div className="font-mono text-xs">{customer.creditCode || "—"}</div>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant={customer.enabled ? "secondary" : "outline"}>
                {customer.enabled ? "已启用" : "已停用"}
              </Badge>
              {customer.hasSeal && <Badge variant="outline">有电子章</Badge>}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">业务匹配键</div>
              <div className="flex flex-wrap gap-1">
                {nameKeys.map((k) => (
                  <Badge key={k} variant="outline" className="max-w-full truncate font-normal">
                    {k}
                  </Badge>
                ))}
              </div>
            </div>
            {summary.lastActivityAt && (
              <div className="text-xs text-muted-foreground">
                最近活动：{summary.lastActivityAt}
              </div>
            )}
            <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              主档全称与订单中的客户短名不一致时可能漏单，请维护简称或确保订单客户字段与主档名称一致。
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">业务时间线</CardTitle>
            <CardDescription>按时间倒序汇总订单、账单、预约、进出场与附件</CardDescription>
          </CardHeader>
          <CardContent>
            <LifecycleTimeline events={events} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">关联单据</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="orders">
            <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
              <TabsTrigger value="orders">订单 ({lifecycle!.orders.length})</TabsTrigger>
              <TabsTrigger value="bills">账单 ({lifecycle!.bills.length})</TabsTrigger>
              <TabsTrigger value="gate">进出场 ({lifecycle!.gate.length})</TabsTrigger>
              <TabsTrigger value="bookings">
                <CalendarClock className="mr-1 size-3.5" />
                预约 ({lifecycle!.bookings.length})
              </TabsTrigger>
              <TabsTrigger value="attachments">
                <GitCompareArrows className="mr-1 size-3.5" />
                附件 ({lifecycle!.attachments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              <RelatedOrdersTable rows={lifecycle!.orders} />
            </TabsContent>
            <TabsContent value="bills">
              <RelatedBillsTable rows={lifecycle!.bills} />
            </TabsContent>
            <TabsContent value="gate">
              <RelatedGateTable rows={lifecycle!.gate} />
            </TabsContent>
            <TabsContent value="bookings">
              <RelatedBookingsTable rows={lifecycle!.bookings} />
            </TabsContent>
            <TabsContent value="attachments">
              <RelatedAttachmentsTable rows={lifecycle!.attachments} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  )
}

function RelatedOrdersTable({ rows }: { rows: UseBoxOrder[] }) {
  if (rows.length === 0) {
    return <EmptyTab text="暂无关联用箱订单" />
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>订单号</TableHead>
            <TableHead>线路</TableHead>
            <TableHead>箱型×量</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-mono text-xs">
                <Link href="/operations/usebox" className="text-primary hover:underline">
                  {o.orderNo}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                {o.pickupCity}→{o.returnCity}
              </TableCell>
              <TableCell className="text-sm">
                {o.containerType} × {o.quantity}
              </TableCell>
              <TableCell>
                <StatusBadge status={o.status} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{o.createdAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RelatedBillsTable({ rows }: { rows: Bill[] }) {
  if (rows.length === 0) return <EmptyTab text="暂无关联账单" />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>账单号</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>关联订单</TableHead>
            <TableHead className="text-right">金额</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-xs">
                <Link href="/customer/bills" className="text-primary hover:underline">
                  {b.billNo}
                </Link>
              </TableCell>
              <TableCell>{b.type}</TableCell>
              <TableCell className="font-mono text-xs">{b.relatedOrderNo}</TableCell>
              <TableCell className="text-right">¥{b.amount.toLocaleString()}</TableCell>
              <TableCell>
                <StatusBadge status={b.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RelatedGateTable({ rows }: { rows: GateRecord[] }) {
  if (rows.length === 0) return <EmptyTab text="暂无关联进出场记录" />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>箱号</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>堆场</TableHead>
            <TableHead>关联单号</TableHead>
            <TableHead>时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-mono text-xs">
                <Link
                  href={`/inventory/containers/${encodeURIComponent(g.containerNo)}`}
                  className="text-primary hover:underline"
                >
                  {g.containerNo}
                </Link>
              </TableCell>
              <TableCell>{g.type}</TableCell>
              <TableCell className="text-sm">
                {g.city} · {g.yard}
              </TableCell>
              <TableCell className="font-mono text-xs">{g.relatedOrderNo ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{g.time}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RelatedBookingsTable({ rows }: { rows: Booking[] }) {
  if (rows.length === 0) return <EmptyTab text="暂无关联预约" />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>预约号</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>堆场</TableHead>
            <TableHead>计划时间</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-xs">{b.bookingNo}</TableCell>
              <TableCell>{b.type}</TableCell>
              <TableCell className="text-sm">
                {b.city} · {b.yard}
              </TableCell>
              <TableCell className="text-xs">{b.planTime}</TableCell>
              <TableCell>
                <StatusBadge status={b.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RelatedAttachmentsTable({ rows }: { rows: AttachmentMeta[] }) {
  if (rows.length === 0) return <EmptyTab text="暂无关联附件" />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>文件名</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>关联单号</TableHead>
            <TableHead>上传人</TableHead>
            <TableHead>时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="text-sm">{a.fileName}</TableCell>
              <TableCell className="text-xs">{a.refType}</TableCell>
              <TableCell className="font-mono text-xs">{a.refNo}</TableCell>
              <TableCell className="text-sm">{a.uploadedBy}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{a.uploadedAt}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyTab({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>
}
