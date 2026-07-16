import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { resetAclRuntimeCache } from "@/lib/acl-runtime"
import {
  SETTING_KEYS,
  getPublicSettings,
  getSetting,
  setSetting,
  buildDefaultNavAcl,
  invalidateSettingsCache,
} from "@/lib/settings"
import { defaultResourceAcl } from "@/lib/acl-defaults"
import { writeAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

/** 管理员读取全部设置键 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!canAccessResource("settings", session.roleId, "read")) {
    return NextResponse.json({ error: "无权读取系统设置" }, { status: 403 })
  }
  const pub = await getPublicSettings()
  const [aclNav, aclResources] = await Promise.all([
    getSetting(SETTING_KEYS.aclNav, null),
    getSetting(SETTING_KEYS.aclResources, null),
  ])
  return NextResponse.json({
    ...pub,
    aclNav,
    aclResources,
    defaults: {
      aclNav: buildDefaultNavAcl(),
      aclResources: defaultResourceAcl,
    },
  })
}

/** 管理员批量更新设置 */
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!canAccessResource("settings", session.roleId, "write")) {
    return NextResponse.json({ error: "无权修改系统设置" }, { status: 403 })
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const allowed = new Set(Object.values(SETTING_KEYS))
  const updated: string[] = []
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k as (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS])) continue
    await setSetting(k, v, session.name || session.account)
    updated.push(k)
  }
  invalidateSettingsCache()
  resetAclRuntimeCache()
  await writeAudit({
    session,
    action: "修改",
    module: "系统管理",
    target: "system_settings",
    detail: `更新设置：${updated.join(", ") || "无"}`,
    ip: clientIp(req),
  })
  const pub = await getPublicSettings()
  return NextResponse.json({ ok: true, updated, ...pub })
}
