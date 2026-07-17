"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useRole } from "@/lib/role-context"
import { canAccessPath, isCustomerLifecyclePath, resolveAclNavPath } from "@/lib/acl"
import { useRuntimeSettings } from "@/lib/settings-client"
import { navGroups } from "@/lib/nav"
import { PageSpinner } from "@/components/navigation-loading"
import type { RoleId } from "@/lib/types"

function pathAllowedByHrefs(pathname: string, hrefs: string[], roleId: RoleId): boolean {
  if (isCustomerLifecyclePath(pathname) && roleId === "R03") return true

  const resolved = resolveAclNavPath(pathname)
  let best: string | null = null
  for (const g of navGroups) {
    for (const item of g.items) {
      const match =
        resolved === item.href || (item.href !== "/" && resolved.startsWith(`${item.href}/`))
      if (match && (!best || item.href.length > best.length)) {
        best = item.href
      }
    }
  }
  if (!best) return false
  if (best === "/" || best === "/inbox") return true
  return hrefs.includes(best)
}

/** 防止直链访问无权限页面（与侧栏角色矩阵一致） */
export function PageAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { roleId, isAdmin, impersonating, loading } = useRole()
  const { settings, isLoading: settingsLoading } = useRuntimeSettings()

  const realAdmin = isAdmin && !impersonating
  const ok = (() => {
    if (realAdmin) return true
    if (settings?.navHrefs) return pathAllowedByHrefs(pathname, settings.navHrefs, roleId as RoleId)
    return canAccessPath(pathname, roleId as RoleId, { realAdmin })
  })()

  useEffect(() => {
    if (loading || settingsLoading) return
    if (!ok) router.replace("/")
  }, [pathname, roleId, loading, settingsLoading, ok, router])

  if (loading || settingsLoading) {
    return <PageSpinner />
  }

  if (!ok) {
    return <PageSpinner label="无权访问该页面，正在返回工作台…" />
  }

  return <>{children}</>
}
