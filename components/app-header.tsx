"use client"

import { useState } from "react"
import Link from "next/link"
import { UserRoundCheck, LogOut, Bell, Menu } from "lucide-react"
import { useRole } from "@/lib/role-context"
import { useResource } from "@/lib/api"
import type { Notification } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

export function AppHeader() {
  const { roleId, role, user, impersonating, stopImpersonation, isAdmin, logout } = useRole()
  const { data: notifications } = useResource<Notification>("notifications")
  const [mobileOpen, setMobileOpen] = useState(false)

  const unread = notifications.filter(
    (n) => ((isAdmin && !impersonating) || n.roles.includes(roleId)) && !n.read,
  ).length

  return (
    <>
    {impersonating && (
      <div className="flex items-center gap-3 bg-warning px-4 py-2 text-sm text-warning-foreground sm:px-6 [&_svg]:stroke-current">
        <UserRoundCheck className="size-4 shrink-0" />
        <p className="flex-1 truncate">
          正在以 <span className="font-semibold">{impersonating.name}</span>
          （{impersonating.account} · {role.name}）身份进行代理操作
        </p>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 border-warning-foreground/25 bg-warning-foreground/10 text-warning-foreground hover:bg-warning-foreground/15" onClick={stopImpersonation}>
          <LogOut className="size-3.5" />
          结束代理
        </Button>
      </div>
    )}
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm sm:px-6">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger render={<Button variant="outline" size="icon" className="lg:hidden" />}>
          <Menu className="size-5" />
          <span className="sr-only">打开菜单</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="hidden flex-col sm:flex">
        <span className="text-sm font-medium text-foreground">物流 · 信息 · 资金 三流协同</span>
        <span className="text-xs text-muted-foreground">集装箱全生命周期管理平台</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Button variant="outline" size="icon" className="relative text-foreground [&_svg]:stroke-current" nativeButton={false} render={<Link href="/inbox" />}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
          <span className="sr-only">待办与通知（{unread} 条未读）</span>
        </Button>
        <ThemeToggle />
        <div className="hidden text-right sm:block">
          <p className="text-xs text-muted-foreground">{user?.name ?? "未登录"}</p>
          <p className="text-sm font-medium text-foreground">{role.name}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={logout}>
          <LogOut className="size-4" />
          <span className="hidden sm:inline">退出</span>
        </Button>
      </div>
    </header>
    </>
  )
}
