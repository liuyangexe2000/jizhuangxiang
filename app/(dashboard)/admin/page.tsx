"use client"

import Link from "next/link"
import {
  LayoutDashboard,
  Users,
  Database,
  Shield,
  Settings,
  History,
  Plug,
  ArrowRight,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RESOURCES } from "@/lib/resources"

const tiles = [
  {
    title: "业务数据台",
    desc: "全量业务资源增删改查，覆盖订单/调运/库存/集成等",
    href: "/admin/data",
    icon: Database,
    hint: `${Object.keys(RESOURCES).length} 个资源`,
  },
  {
    title: "用户与代理",
    desc: "账号启用停用、角色分配、临时代理登录",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "角色权限矩阵",
    desc: "配置各角色菜单可见性与资源读写权限",
    href: "/admin/permissions",
    icon: Shield,
  },
  {
    title: "系统参数",
    desc: "演示账号、无权限菜单策略、业务时限与审批阈值",
    href: "/admin/settings",
    icon: Settings,
  },
  {
    title: "操作日志审计",
    desc: "增删改查与代理登录追溯",
    href: "/admin/audit",
    icon: History,
  },
  {
    title: "集成与出站",
    desc: "订舱/代管同步状态与账单出站队列",
    href: "/admin/integrations",
    icon: Plug,
  },
]

export default function AdminHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        module="系统管理 · 系统管理员专区"
        title="管理中枢"
        description="R00 总后台入口：数据治理、权限矩阵、系统参数与审计集成一站式到达。"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutDashboard className="size-4" />
            快捷入口
          </CardTitle>
          <CardDescription>以下能力仅系统管理员可用；写操作均记入审计日志。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => {
            const Icon = t.icon
            return (
              <Link
                key={t.href}
                href={t.href}
                className="group flex flex-col rounded-lg border p-4 transition-colors hover:bg-muted/40"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="font-medium">{t.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
                {t.hint && <p className="mt-2 text-xs text-primary">{t.hint}</p>}
              </Link>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/data" className="rounded-md border px-3 py-1.5 hover:bg-muted">
          打开业务数据台
        </Link>
        <Link href="/admin/settings" className="rounded-md border px-3 py-1.5 hover:bg-muted">
          打开系统参数
        </Link>
        <Link href="/admin/permissions" className="rounded-md border px-3 py-1.5 hover:bg-muted">
          打开权限矩阵
        </Link>
      </div>
    </div>
  )
}
