import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth-server"
import { get } from "@/lib/repo"
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session"
import { writeAudit } from "@/lib/audit"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

/** 开始代理登录：仅系统管理员(R00)可代理其他用户 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 })

  // 真实身份：若已在代理中，用 real 判定权限
  const realRole = session.real?.roleId ?? session.roleId
  if (realRole !== "R00") {
    return NextResponse.json({ error: "仅系统管理员可代理登录" }, { status: 403 })
  }

  const { userId } = await req.json().catch(() => ({}))
  const target = await get("users", userId)
  if (!target) return NextResponse.json({ error: "目标用户不存在" }, { status: 404 })

  const real = session.real ?? {
    uid: session.uid,
    account: session.account,
    name: session.name,
    roleId: session.roleId,
    org: session.org,
  }
  const impersonated = {
    uid: target.id,
    account: target.account,
    name: target.name,
    roleId: target.roleId,
    org: typeof target.org === "string" ? target.org : undefined,
  }
  const token = await signSession({ ...impersonated, real })

  await writeAudit({
    session: { ...impersonated, real, exp: 0 },
    action: "代理登录",
    module: "系统管理",
    target: `${target.name}(${target.account})`,
    detail: `管理员 ${real.name} 代理 ${target.roleId} 用户`,
    ip: clientIp(req),
  })

  const res = NextResponse.json({ user: impersonated, real })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req))
  return res
}

/** 结束代理，恢复管理员身份 */
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session?.real) return NextResponse.json({ error: "当前非代理状态" }, { status: 400 })

  const real = session.real
  const token = await signSession(real)

  await writeAudit({
    session: { ...real, exp: 0 },
    action: "结束代理",
    module: "系统管理",
    target: `${session.name}(${session.account})`,
    detail: `管理员 ${real.name} 结束代理`,
    ip: clientIp(req),
  })

  const res = NextResponse.json({ user: real })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req))
  return res
}
