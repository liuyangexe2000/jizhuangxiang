import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { writeAudit } from "@/lib/audit"
import { hashPassword } from "@/lib/password"
import { ensureAccountApplicationsSchema } from "@/lib/ensure-account-applications-schema"
import {
  deriveLoginAccount,
  generateInitialPassword,
} from "@/lib/domain/user-signup-plan"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import type { AccountApplication, SystemUser } from "@/lib/types"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

/** 管理员审批账号申请：通过 / 驳回 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session || session.roleId !== "R00") {
    return NextResponse.json({ error: "仅系统管理员可审批账号申请" }, { status: 403 })
  }

  await ensureAccountApplicationsSchema()
  const { id } = await params
  const app = (await get("accountApplications", decodeURIComponent(id))) as AccountApplication | null
  if (!app) return NextResponse.json({ error: "申请不存在" }, { status: 404 })
  if (app.status !== "待审核") {
    return NextResponse.json({ error: "该申请已处理，不可重复审批" }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body.action === "reject" ? "reject" : "approve"
  const rejectReason =
    typeof body.rejectReason === "string" ? body.rejectReason.trim() : ""
  const reviewedAt = nowLocalStr()
  const reviewedBy = session.name || session.account

  if (action === "reject") {
    if (!rejectReason) {
      return NextResponse.json({ error: "请填写驳回原因" }, { status: 400 })
    }
    await update("accountApplications", app.id, {
      status: "已驳回",
      reviewedAt,
      reviewedBy,
      rejectReason,
    })
    await writeAudit({
      session,
      action: "审批",
      module: "系统管理",
      target: app.email,
      detail: `驳回账号申请：${rejectReason}`,
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, status: "已驳回" })
  }

  const users = (await list("users")) as SystemUser[]
  let account = deriveLoginAccount(app.email, app.phone)
  let suffix = 0
  while (users.some((u) => u.account.toLowerCase() === account.toLowerCase())) {
    suffix += 1
    account = `${deriveLoginAccount(app.email, app.phone)}${suffix}`
  }

  const initialPassword = generateInitialPassword()
  const user = (await create("users", {
    account,
    name: app.name,
    roleId: "R03",
    org: app.org,
    email: app.email,
    phone: app.phone,
    status: "启用",
    passwordHash: hashPassword(initialPassword),
    lastLogin: "",
    createdAt: reviewedAt,
  })) as SystemUser

  await update("accountApplications", app.id, {
    status: "已通过",
    reviewedAt,
    reviewedBy,
    createdUserId: user.id,
  })

  await create("notifications", {
    id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: "系统",
    level: "普通",
    title: `账号申请已通过 · ${app.name}`,
    desc: `已为 ${app.org} 开通客户账号 ${account}，初始密码已生成（请通过安全渠道告知申请人）。`,
    module: "系统管理",
    href: "/admin/users",
    roles: ["R00"],
    actionable: false,
    read: false,
    createdAt: reviewedAt,
  })

  await writeAudit({
    session,
    action: "审批",
    module: "系统管理",
    target: account,
    detail: `通过账号申请并开通 R03：${app.name} / ${app.org}`,
    ip: clientIp(req),
  })

  return NextResponse.json({
    ok: true,
    status: "已通过",
    account,
    initialPassword,
    userId: user.id,
  })
}
