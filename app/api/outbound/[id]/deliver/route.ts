import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { writeAudit } from "@/lib/audit"
import { deliverOutboundEvent } from "@/lib/integrations/outbound-deliver"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

/** 单条出站事件真实 HTTP 投递 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!canAccessResource("outboundEvents", session.roleId, "write")) {
    return NextResponse.json({ error: "无权投递出站事件" }, { status: 403 })
  }

  const result = await deliverOutboundEvent(decodeURIComponent(id))
  await writeAudit({
    session,
    action: "修改",
    module: "系统集成",
    target: result.id,
    detail: result.ok
      ? `出站 HTTP 投递成功 → ${result.target}${result.dryRun ? "（本地 echo）" : ""}`
      : `出站 HTTP 投递失败：${result.error || "unknown"}`,
    ip: clientIp(req),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error || "投递失败", result }, { status: 502 })
  }
  return NextResponse.json({ ok: true, result })
}
