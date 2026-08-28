import { type NextRequest, NextResponse } from "next/server"
import { list, update } from "@/lib/repo"
import {
  ensureAccountApplicationsSchema,
  ensureAccountApplicationCredentialColumns,
} from "@/lib/ensure-account-applications-schema"
import { checkRateLimit, clientIpFromRequest } from "@/lib/rate-limit"
import type { AccountApplication } from "@/lib/types"

export const dynamic = "force-dynamic"

/** 公开查询账号申请进度；已通过且凭据未取走时返回一次性登录信息 */
export async function POST(req: NextRequest) {
  await ensureAccountApplicationsSchema()
  await ensureAccountApplicationCredentialColumns()

  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : ""
  if (!email || phone.length < 6) {
    return NextResponse.json({ error: "请填写申请时的邮箱与手机号" }, { status: 400 })
  }

  const ip = clientIpFromRequest(req)
  const limited = checkRateLimit(`aa:status:${ip}:${email}`, 20, 60 * 60 * 1000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: `查询过于频繁，请 ${limited.retryAfterSec} 秒后再试` },
      { status: 429 },
    )
  }

  const apps = (await list("accountApplications")) as AccountApplication[]
  const hit = apps
    .filter(
      (a) =>
        a.email.trim().toLowerCase() === email &&
        a.phone.replace(/\D/g, "") === phone,
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]

  if (!hit) {
    return NextResponse.json({ error: "未找到匹配申请，请核对邮箱与手机号" }, { status: 404 })
  }

  if (hit.status === "待审核") {
    return NextResponse.json({
      ok: true,
      status: hit.status,
      message: "申请审核中，请耐心等待管理员处理",
      createdAt: hit.createdAt,
    })
  }

  if (hit.status === "已驳回") {
    return NextResponse.json({
      ok: true,
      status: hit.status,
      rejectReason: hit.rejectReason || "未说明原因",
      reviewedAt: hit.reviewedAt,
    })
  }

  const account = hit.issuedLoginAccount
  const password = hit.issuedInitialPassword
  if (account && password) {
    await update("accountApplications", hit.id, { issuedInitialPassword: "" })
    return NextResponse.json({
      ok: true,
      status: "已通过",
      account,
      initialPassword: password,
      message: "请使用以下账号登录并尽快修改密码；初始密码仅展示一次，请妥善保存。",
      reviewedAt: hit.reviewedAt,
    })
  }

  return NextResponse.json({
    ok: true,
    status: "已通过",
    account: account || undefined,
    message: account
      ? `账号 ${account} 已开通，初始密码已由管理员通过其他渠道告知。`
      : "申请已通过，请联系管理员获取登录账号。",
    reviewedAt: hit.reviewedAt,
  })
}
