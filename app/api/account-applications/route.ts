import { type NextRequest, NextResponse } from "next/server"
import { list, create } from "@/lib/repo"
import { ensureAccountApplicationsSchema } from "@/lib/ensure-account-applications-schema"
import { validateApplication } from "@/lib/domain/user-signup-plan"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit"
import type { AccountApplication } from "@/lib/types"

export const dynamic = "force-dynamic"

/** 公开提交账号申请 */
export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req)
  const limited = checkRateLimit(`aa:apply:${ip}`, 8, 60 * 60 * 1000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: `提交过于频繁，请 ${limited.retryAfterSec} 秒后再试` },
      { status: 429 },
    )
  }

  await ensureAccountApplicationsSchema()
  const body = await req.json().catch(() => ({}))
  const input = {
    name: typeof body.name === "string" ? body.name.trim() : "",
    org: typeof body.org === "string" ? body.org.trim() : "",
    email: typeof body.email === "string" ? body.email.trim() : "",
    phone: typeof body.phone === "string" ? body.phone.trim() : "",
    remark: typeof body.remark === "string" ? body.remark.trim() : undefined,
  }
  const result = validateApplication(input)
  if (!result.ok) {
    return NextResponse.json({ error: result.errors[0] ?? "请完善申请信息" }, { status: 400 })
  }

  const existing = (await list("accountApplications")) as AccountApplication[]
  const dupPending = existing.find(
    (a) =>
      a.status === "待审核" &&
      (a.email.toLowerCase() === input.email.toLowerCase() ||
        a.phone.replace(/\D/g, "") === input.phone.replace(/\D/g, "")),
  )
  if (dupPending) {
    return NextResponse.json({ error: "已有相同邮箱或手机的待审申请，请等待处理" }, { status: 409 })
  }

  const users = await list("users")
  const dupUser = (users as { email?: string; phone?: string }[]).find(
    (u) =>
      (u.email && u.email.toLowerCase() === input.email.toLowerCase()) ||
      (u.phone && u.phone.replace(/\D/g, "") === input.phone.replace(/\D/g, "")),
  )
  if (dupUser) {
    return NextResponse.json({ error: "该邮箱或手机已注册，请直接登录" }, { status: 409 })
  }

  const created = (await create("accountApplications", {
    ...input,
    status: "待审核",
    createdAt: nowLocalStr(),
  })) as AccountApplication

  return NextResponse.json({ ok: true, id: created.id })
}
