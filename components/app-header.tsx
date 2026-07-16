"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { UserRoundCheck, LogOut, Bell, Menu, ArrowRight } from "lucide-react"
import { useRole } from "@/lib/role-context"
import { useResource } from "@/lib/api"
import type { Notification } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

function sortInbox(a: Notification, b: Notification) {
  const ta = Date.parse(String(a.createdAt).replace(/-/g, "/")) || 0
  const tb = Date.parse(String(b.createdAt).replace(/-/g, "/")) || 0
  if (a.read !== b.read) return a.read ? 1 : -1
  return tb - ta
}

export function AppHeader() {
  const { roleId, role, user, impersonating, stopImpersonation, isAdmin, logout } = useRole()
  const { data: notifications, update } = useResource<Notification>("notifications")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)

  const visible = useMemo(
    () =>
      notifications.filter(
        (n) => ((isAdmin && !impersonating) || n.roles.includes(roleId)),
      ),
    [notifications, isAdmin, impersonating, roleId],
  )

  const unread = visible.filter((n) => !n.read).length
  const latest = useMemo(() => [...visible].sort(sortInbox).slice(0, 5), [visible])

  async function markRead(id: string) {
    const target = notifications.find((n) => n.id === id)
    if (!target || target.read) return
    try {
      await update(id, { read: true, __auditAction: "修改", __auditDetail: "标记通知已读" })
    } catch {
      /* ignore in header */
    }
  }

  return (
    <>
      {impersonating && (
        <div className="flex items-center gap-3 bg-warning px-4 py-2 text-sm text-warning-foreground sm:px-6 [&_svg]:stroke-current">
          <UserRoundCheck className="size-4 shrink-0" />
          <p className="flex-1 truncate">
            正在以 <span className="font-semibold">{impersonating.name}</span>
            （{impersonating.account} · {role.name}）身份进行代理操作
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-warning-foreground/25 bg-warning-foreground/10 text-warning-foreground hover:bg-warning-foreground/15"
            onClick={stopImpersonation}
          >
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
          <Popover open={inboxOpen} onOpenChange={setInboxOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="relative text-foreground [&_svg]:stroke-current"
                />
              }
            >
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold leading-none text-destructive-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
              <span className="sr-only">待办与通知（{unread} 条未读）</span>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-[22rem] gap-0 p-0 sm:w-[24rem]">
              <PopoverHeader className="border-b px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <PopoverTitle>待办与通知</PopoverTitle>
                  <span className="text-xs text-muted-foreground">
                    {unread > 0 ? `${unread} 条未读` : "暂无未读"}
                  </span>
                </div>
              </PopoverHeader>

              <div className="max-h-[22rem] overflow-y-auto">
                {latest.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">暂无通知</p>
                ) : (
                  <ul className="divide-y">
                    {latest.map((n) => (
                      <li key={n.id}>
                        <Link
                          href={n.href || "/inbox"}
                          className={cn(
                            "block px-3 py-2.5 transition-colors hover:bg-muted/60",
                            !n.read && "bg-primary/5",
                          )}
                          onClick={() => {
                            void markRead(n.id)
                            setInboxOpen(false)
                          }}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read ? (
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                            ) : (
                              <span className="mt-1.5 size-1.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className={cn("truncate text-sm", !n.read && "font-medium")}>
                                  {n.title}
                                </p>
                                {n.actionable && !n.read && (
                                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                    待办
                                  </span>
                                )}
                                {n.level === "紧急" && (
                                  <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                                    紧急
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.desc}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {n.module} · {n.createdAt}
                              </p>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  className="w-full justify-between gap-2"
                  nativeButton={false}
                  render={<Link href="/inbox" />}
                  onClick={() => setInboxOpen(false)}
                >
                  查看全部
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </PopoverContent>
          </Popover>

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
