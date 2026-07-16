import { type NextRequest, NextResponse } from "next/server"
import { get, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { writeAudit } from "@/lib/audit"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import type { Booking } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

/** 现场角色（堆场/代管）接受预约：待发送/已通知 -> 已确认，写入 confirmedBy/confirmedAt */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!canAccessResource("bookings", session.roleId, "write")) {
    return NextResponse.json({ error: "无权操作预约" }, { status: 403 })
  }
  if (!["R00", "R01", "R04", "R06"].includes(session.roleId)) {
    return NextResponse.json({ error: "预约确认须由堆场/代管现场角色执行" }, { status: 403 })
  }

  const booking = (await get("bookings", decodeURIComponent(id))) as Booking | null
  if (!booking) return NextResponse.json({ error: "预约不存在" }, { status: 404 })
  if (booking.status === "已确认") {
    return NextResponse.json({ error: "该预约已确认，无需重复操作" }, { status: 400 })
  }
  if (booking.status !== "已通知") {
    return NextResponse.json({ error: "须先发送通知，堆场/代管方才能确认预约" }, { status: 400 })
  }

  const confirmedAt = nowLocalStr()
  const confirmedBy = session.name || session.account
  await update("bookings", booking.id, {
    status: "已确认",
    confirmedBy,
    confirmedAt,
  })

  const notifId = `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  await create("notifications", {
    id: notifId,
    type: "任务",
    level: "普通",
    title: `预约已确认 · ${booking.bookingNo}`,
    desc: `${booking.type} · ${booking.yard} · ETA ${booking.planTime} · 由 ${confirmedBy} 确认接受`,
    module: "M04 预约与通知",
    href: "/yard/bookings",
    roles: ["R01"],
    actionable: false,
    read: false,
    createdAt: confirmedAt,
  })

  await writeAudit({
    session,
    action: "修改",
    module: "M04 预约与通知",
    target: String(booking.bookingNo),
    detail: `确认接受预约（${booking.type} · ${booking.yard}）`,
    ip: clientIp(req),
  })

  return NextResponse.json({ ok: true, confirmedBy, confirmedAt })
}
