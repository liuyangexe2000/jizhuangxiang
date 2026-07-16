"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Container, Lock } from "lucide-react"
import { navGroups } from "@/lib/nav"
import { useRole } from "@/lib/role-context"
import { useRuntimeSettings } from "@/lib/settings-client"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { RoleId } from "@/lib/types"

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { roleId, isAdmin, impersonating } = useRole()
  const { settings } = useRuntimeSettings()
  // 代理登录期间以被代理用户视角显示菜单
  const effectiveAdmin = isAdmin && !impersonating
  const showLocked = settings?.showUnauthorizedMenus?.[roleId as RoleId] !== false
  const navHrefs = settings?.navHrefs

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground [&_svg]:stroke-current">
          <Container className="size-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">集装箱业务管理系统</p>
          <p className="text-xs text-sidebar-foreground/60">中欧班列平台公司</p>
        </div>
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-6">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => {
            const adminOnly = group.module === "系统管理"
            const allowed = adminOnly
              ? effectiveAdmin
              : effectiveAdmin ||
                (navHrefs ? navHrefs.includes(item.href) : item.roles.includes(roleId))
            return allowed || showLocked
          })
          if (visibleItems.length === 0) return null
          return (
            <div key={group.module} className="mb-5">
              <div className="mb-1.5 flex items-center gap-2 px-2">
                {group.module !== "概览" && (
                  <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-bold text-sidebar-accent-foreground">
                    {group.module}
                  </span>
                )}
                <span className="text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
                  {group.label}
                </span>
              </div>
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const adminOnly = group.module === "系统管理"
                  const allowed = adminOnly
                    ? effectiveAdmin
                    : effectiveAdmin ||
                      (navHrefs ? navHrefs.includes(item.href) : item.roles.includes(roleId))
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" &&
                      item.href !== "/admin" &&
                      pathname.startsWith(`${item.href}/`))
                  const Icon = item.icon
                  if (!allowed) {
                    return (
                      <li key={item.href}>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                disabled
                                className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-sidebar-foreground/35 [&_svg]:stroke-current"
                              />
                            }
                          >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            <span className="flex-1 truncate">{item.title}</span>
                            <Lock className="size-3" aria-hidden />
                          </TooltipTrigger>
                          <TooltipContent side="right">当前角色无该功能权限</TooltipContent>
                        </Tooltip>
                      </li>
                    )
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors [&_svg]:shrink-0 [&_svg]:stroke-current",
                          isActive
                            ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        <span className="flex-1 truncate">{item.title}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
