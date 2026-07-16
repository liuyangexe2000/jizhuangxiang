import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth-server"
import { ensureAclRuntime } from "@/lib/acl-runtime"
import { getNavAclForRole, getPublicSettings } from "@/lib/settings"
import type { RoleId } from "@/lib/types"

export const dynamic = "force-dynamic"

/** 已登录用户：公开参数 + 本角色菜单覆盖 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  await ensureAclRuntime()
  const pub = await getPublicSettings()
  const navHrefs = await getNavAclForRole(session.roleId as RoleId)
  return NextResponse.json({
    ...pub,
    roleId: session.roleId,
    navHrefs,
  })
}
