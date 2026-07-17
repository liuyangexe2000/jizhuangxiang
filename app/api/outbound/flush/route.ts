import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { writeAudit } from "@/lib/audit"
import { deliverPendingOutbound } from "@/lib/integrations/outbound-deliver"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

/** 批量投递 pending/failed 出站事件 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!canAccessResource("outboundEvents", session.roleId, "write")) {
    return NextResponse.json({ error: "无权投递出站事件" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(50, Math.max(1, Number(body?.limit) || 20))
  const summary = await deliverPendingOutbound(limit)

  await writeAudit({
    session,
    action: "修改",
    module: "系统集成",
    target: "outbound_flush",
    detail: `批量出站投递：成功 ${summary.delivered}，失败 ${summary.failed} → ${summary.target}`,
    ip: clientIp(req),
  })

  return NextResponse.json({ ok: true, ...summary })
}
