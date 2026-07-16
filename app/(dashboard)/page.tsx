"use client"

import Link from "next/link"
import {
  Boxes,
  Truck,
  Receipt,
  AlertTriangle,
  ArrowRight,
  Ship,
  Landmark,
  Info,
  Bell,
  Clock3,
  Plug,
  CheckCircle2,
} from "lucide-react"
import { useRole } from "@/lib/role-context"
import { canAccessResource } from "@/lib/acl"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { softTone, solidTone } from "@/lib/ui-tone"
import { useResource } from "@/lib/api"
import type {
  UseBoxOrder,
  DispatchOrder,
  Bill,
  InventoryRow,
  Notification as NotificationItem,
  Integration,
} from "@/lib/types"
import { navGroups } from "@/lib/nav"

export default function DashboardPage() {
  const { role, roleId, isAdmin, impersonating } = useRole()
  const effectiveAdmin = isAdmin && !impersonating

  const { data: useBoxOrders } = useResource<UseBoxOrder>("orders")
  const { data: dispatchOrders } = useResource<DispatchOrder>("dispatch")
  const { data: bills } = useResource<Bill>("bills")
  const { data: inventoryRows } = useResource<InventoryRow>("inventory")
  const { data: notifications } = useResource<NotificationItem>("notifications")
  const { data: integrations } = useResource<Integration>("integrations")

  const canOrders = canAccessResource("orders", roleId, "read")
  const canDispatch = canAccessResource("dispatch", roleId, "read")
  const canBills = canAccessResource("bills", roleId, "read")
  const canInventory = canAccessResource("inventory", roleId, "read")

  // 角色化待办：从统一通知中心按当前角色过滤（管理员可见全部）
  const myTodos = notifications
    .filter((n) => (effectiveAdmin || n.roles.includes(roleId)) && n.actionable && !n.read)
    .sort((a, b) => {
      const rank = { 紧急: 0, 重要: 1, 普通: 2 } as const
      return rank[a.level] - rank[b.level]
    })
  const abnormalIntegrations = integrations.filter(
    (i) => i.status === "异常" || i.status === "延迟",
  )

  const totalOnSite = inventoryRows.reduce((s, r) => s + r.onSite, 0)
  const totalAvailable = inventoryRows.reduce((s, r) => s + r.available, 0)
  const activeOrders = useBoxOrders.filter((o) => !["已完成", "已取消", "超时取消"].includes(o.status)).length
  const pendingApprovals = dispatchOrders.filter((d) => d.status === "审批中").length
  const pendingBills = bills.filter((b) => b.status === "待确认" || b.status === "有异议").length

  const accessibleModules = navGroups.filter((g) =>
    g.items.some((i) => effectiveAdmin || i.roles.includes(roleId)),
  )

  return (
    <>
      <PageHeader
        module="工作台"
        title={`欢迎，${role.name}`}
        description={`${role.org} · ${role.type} — ${role.description}`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="在场库存合计"
          value={canInventory ? totalOnSite : "—"}
          unit={canInventory ? "箱" : undefined}
          icon={Boxes}
          tone="primary"
          hint={canInventory ? `可用库存 ${totalAvailable} 箱` : "当前角色无库存权限"}
        />
        <StatCard
          label="进行中用箱订单"
          value={canOrders ? activeOrders : "—"}
          unit={canOrders ? "单" : undefined}
          icon={Ship}
          tone="success"
          hint={canOrders ? "申请/提箱/还箱阶段" : "当前角色无订单权限"}
        />
        <StatCard
          label="待审批调运"
          value={canDispatch ? pendingApprovals : "—"}
          unit={canDispatch ? "项" : undefined}
          icon={Truck}
          tone="warning"
          hint={canDispatch ? "多级审批链处理中" : "当前角色无调运权限"}
        />
        <StatCard
          label="待处理账单"
          value={canBills ? pendingBills : "—"}
          unit={canBills ? "张" : undefined}
          icon={Receipt}
          tone="danger"
          hint={canBills ? "待确认或有异议" : "当前角色无账单权限"}
        />
      </div>

      {effectiveAdmin && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Plug className="size-4 text-primary" />
                系统集成健康度
              </CardTitle>
              <CardDescription>订舱平台 / 代管公司 / 堆场 / 财务系统数据同步状态</CardDescription>
            </div>
            <Link
              href="/admin/integrations"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              集成面板
              <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {abnormalIntegrations.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="size-4" />
                全部 {integrations.length} 个集成运行正常
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {abnormalIntegrations.map((i) => (
                  <Link
                    key={i.id}
                    href="/admin/integrations"
                    className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
                  >
                    <div
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:stroke-current",
                        i.status === "异常" ? softTone.danger : softTone.warning,
                      )}
                    >
                      <AlertTriangle className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        成功率 {i.successRate.toFixed(1)}% · 积压 {i.pending} 条
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        i.status === "异常" ? solidTone.danger : solidTone.warning,
                      )}
                    >
                      {i.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                我的待办
              </CardTitle>
              <CardDescription>按当前角色 {roleId} 聚合的待处理事项，紧急优先</CardDescription>
            </div>
            <Link
              href="/inbox"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              全部
              <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {myTodos.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <CheckCircle2 className="size-8" />
                <p className="text-sm">当前没有待处理事项</p>
              </div>
            )}
            {myTodos.slice(0, 5).map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:stroke-current",
                    n.level === "紧急"
                      ? softTone.danger
                      : n.level === "重要"
                        ? softTone.primary
                        : softTone.muted,
                  )}
                >
                  <Bell className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 shrink-0 px-1.5 text-xs",
                        n.level === "紧急"
                          ? "border-destructive/40 text-destructive"
                          : n.level === "重要"
                            ? "border-primary/40 text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      {n.level}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{n.module}</p>
                </div>
                {n.dueAt && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
                    <Clock3 className="size-3" />
                    限时
                  </span>
                )}
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-4 text-primary" />
              三流协同
            </CardTitle>
            <CardDescription>以多联公司为核心枢纽</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <FlowItem color="bg-primary" title="物流" desc="制造商/租赁商供箱 → 客户提还箱 → 堆场流转" />
            <FlowItem color="bg-chart-2" title="信息流" desc="用箱需求、提还箱指令、进出场信息反馈" />
            <FlowItem color="bg-chart-3" title="资金流" desc="采购/租赁费用、用箱费、调运费结算闭环" />
            <div className="mt-4 flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>外部影响因素：政治环境 · 贸易环境 · 市场波动</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {canOrders && (
      <Card>
        <CardHeader>
          <CardTitle>最近用箱订单</CardTitle>
          <CardDescription>客户用箱业务生命周期状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">订单号</th>
                  <th className="pb-2 font-medium">客户</th>
                  <th className="pb-2 font-medium">提箱 → 还箱</th>
                  <th className="pb-2 font-medium">箱型/数量</th>
                  <th className="pb-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {useBoxOrders.slice(0, 5).map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 font-mono text-xs">{o.orderNo}</td>
                    <td className="py-2.5">{o.customer}</td>
                    <td className="py-2.5 text-muted-foreground">{o.pickupCity} → {o.returnCity}</td>
                    <td className="py-2.5">{o.containerType} × {o.quantity}</td>
                    <td className="py-2.5"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
                {useBoxOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">暂无订单数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>可用功能模块</CardTitle>
          <CardDescription>基于当前角色 {roleId} 的权限</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accessibleModules.flatMap((g) =>
            g.items
              .filter((i) => (effectiveAdmin || i.roles.includes(roleId)) && i.href !== "/")
              .map((i) => {
                const Icon = i.icon
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary hover:bg-accent/40"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{i.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{i.desc}</p>
                    </div>
                    <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                )
              }),
          )}
        </CardContent>
      </Card>
    </>
  )
}

function FlowItem({ color, title, desc }: { color: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-1 size-2.5 shrink-0 rounded-full ${color}`} />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}
