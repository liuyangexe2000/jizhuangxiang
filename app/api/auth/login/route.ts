import { NextRequest, NextResponse } from "next/server"
import { list } from "@/lib/repo"
import { verifyPassword } from "@/lib/password"
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session"
import { writeAudit } from "@/lib/audit"

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

export async function POST(req: NextRequest) {
  const { account, password } = await req.json().catch(() => ({}))
  if (!account || !password) {
    return NextResponse.json({ error: "请输入账号与密码" }, { status: 400 })
  }

  const users = await list("users")
  const user = users.find((u) => u.account === account)
  if (!user) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 })
  }
  if (user.status === "停用") {
    return NextResponse.json({ error: "该账号已停用，请联系管理员" }, { status: 403 })
  }

  // MySQL 后端用户带 passwordHash；内存后端无哈希，回退到默认种子密码
  const ok = user.passwordHash
    ? verifyPassword(password, user.passwordHash)
    : password === DEFAULT_PASSWORD
  if (!ok) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 })
  }

  const sessionUser = {
    uid: user.id,
    account: user.account,
    name: user.name,
    roleId: user.roleId,
    org: typeof user.org === "string" ? user.org : undefined,
  }
  const token = await signSession(sessionUser)

  await writeAudit({
    session: { ...sessionUser, exp: 0 },
    action: "登录",
    module: "系统管理",
    target: user.account,
    detail: `用户登录系统`,
    ip: clientIp(req),
  })

  const res = NextResponse.json({ user: sessionUser })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req))
  return res
}
