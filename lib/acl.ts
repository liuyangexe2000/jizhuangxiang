/**
 * 资源/路径 ACL（纯同步，可被客户端引用）
 * DB 覆盖由服务端 lib/acl-runtime.ts 注入 applyAclRuntime
 */
import type { RoleId } from "./types"
import type { ResourceKey } from "./resources"
import { navGroups } from "./nav"
import { defaultResourceAcl } from "./acl-defaults"

type Access = { read: RoleId[]; write: RoleId[] }

export type AclAction = "read" | "write"

type NavAclMap = Partial<Record<RoleId, string[]>>
type ResourceAclMap = Partial<Record<ResourceKey, Access>>

let runtimeNav: NavAclMap | null = null
let runtimeResources: ResourceAclMap | null = null

/** 注入 DB 覆盖（null 表示使用代码默认） */
export function applyAclRuntime(opts: {
  nav?: NavAclMap | null
  resources?: ResourceAclMap | null
}) {
  if (opts.nav !== undefined) runtimeNav = opts.nav
  if (opts.resources !== undefined) runtimeResources = opts.resources
}

export function clearAclRuntime() {
  runtimeNav = null
  runtimeResources = null
}

export function invalidateAclRuntime() {
  runtimeNav = null
  runtimeResources = null
}

function resolveResourceRule(resource: ResourceKey): Access | undefined {
  return runtimeResources?.[resource] ?? defaultResourceAcl[resource]
}

export function canAccessResource(
  resource: ResourceKey,
  roleId: RoleId | string,
  action: AclAction,
): boolean {
  if (roleId === "R00") return true
  const rule = resolveResourceRule(resource)
  if (!rule) return false
  const list = action === "read" ? rule.read : rule.write
  return list.includes(roleId as RoleId)
}

export function resourceAcl(resource: ResourceKey): Access {
  return resolveResourceRule(resource) ?? { read: [], write: [] }
}

export function defaultAclMatrix(): Record<ResourceKey, Access> {
  return { ...defaultResourceAcl }
}

function pathAllowedByNavOverlay(pathname: string, roleId: RoleId): boolean | null {
  if (!runtimeNav) return null
  const hrefs = runtimeNav[roleId]
  if (!Array.isArray(hrefs)) return null
  let best: string | null = null
  for (const g of navGroups) {
    for (const item of g.items) {
      const match =
        pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))
      if (match && (!best || item.href.length > best.length)) {
        best = item.href
      }
    }
  }
  if (!best) return roleId === "R00"
  if (best === "/" || best === "/inbox") return true
  return hrefs.includes(best)
}

export function canAccessPath(
  pathname: string,
  roleId: RoleId,
  opts?: { realAdmin?: boolean },
): boolean {
  if (opts?.realAdmin) return true

  const overlay = pathAllowedByNavOverlay(pathname, roleId)
  if (overlay !== null) return overlay

  let best: { href: string; roles: RoleId[] } | null = null
  for (const g of navGroups) {
    for (const item of g.items) {
      const match =
        pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))
      if (match && (!best || item.href.length > best.href.length)) {
        best = { href: item.href, roles: item.roles }
      }
    }
  }
  if (!best) return roleId === "R00"
  if (best.href === "/" || best.href === "/inbox") return true
  return best.roles.includes(roleId)
}

export function canAccessNavItem(
  href: string,
  roleId: RoleId,
  itemRoles: RoleId[],
  opts?: { realAdmin?: boolean; adminOnly?: boolean },
): boolean {
  if (opts?.realAdmin) return true
  if (opts?.adminOnly) return roleId === "R00"
  if (runtimeNav?.[roleId]) {
    return runtimeNav[roleId]!.includes(href)
  }
  return itemRoles.includes(roleId)
}
