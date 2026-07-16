import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { writeAudit } from "@/lib/audit"
import { isSmtpConfigured, sendMail } from "@/lib/mail"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import {
  buildEirNotifyText,
  isWithinWorkHours,
  validateBookingForNotify,
} from "@/lib/domain/booking-ops"
import { getPublicSettings } from "@/lib/settings"
import type { Booking } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

/** 发送预约通知：站内通知 +（可选）真实 SMTP 邮件到堆场 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!canAccessResource("bookings", session.roleId, "write")) {
    return NextResponse.json({ error: "无权操作预约" }, { status: 403 })
  }

  const booking = (await get("bookings", decodeURIComponent(id))) as Booking | null
  if (!booking) return NextResponse.json({ error: "预约不存在" }, { status: 404 })

  const pub = await getPublicSettings()
  const within = isWithinWorkHours(booking.planTime, pub.workHours)
  if (booking.withinWorkHours !== within) {
    await update("bookings", booking.id, { withinWorkHours: within })
    booking.withinWorkHours = within
  }

  const reject = validateBookingForNotify(booking, {
    workHours: pub.workHours,
    returnLeadHours: pub.returnBookingLeadHours,
  })
  if (reject) {
    return NextResponse.json({ error: reject }, { status: 400 })
  }

  const yards = await list("yards")
  const yard = yards.find((y) => y.name === booking.yard)
  const yardEmail = typeof yard?.email === "string" ? yard.email : ""
  const eirText = buildEirNotifyText(booking)

  let mailSent = false
  let mailSkipped = false
  let mailError: string | undefined

  if (booking.notifyByEmail !== false && yardEmail) {
    if (!isSmtpConfigured()) {
      mailSkipped = true
      mailError = "未配置 SMTP（SMTP_HOST / SMTP_FROM）"
    } else {
      try {
        const subject = `【EIR 预约】${booking.type} · ${booking.bookingNo}`
        await sendMail({ to: yardEmail, subject, text: eirText })
        mailSent = true
      } catch (e) {
        mailError = (e as Error).message
      }
    }
  } else if (booking.notifyByEmail !== false && !yardEmail) {
    mailSkipped = true
    mailError = "堆场未配置邮箱"
  }

  await update("bookings", booking.id, { status: "已通知", withinWorkHours: true })

  const notifId = `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const nos = (booking.containerNos || []).slice(0, 3).join(",")
  await create("notifications", {
    id: notifId,
    type: "任务",
    level: "普通",
    title: `堆场预约通知 · ${booking.bookingNo}`,
    desc: `${booking.type} · ${booking.yard} · ETA ${booking.planTime} · 司机 ${booking.driver} · 车牌 ${booking.plateNo} · 箱 ${nos}${(booking.containerNos || []).length > 3 ? "…" : ""}${mailSent ? " · 邮件已发" : mailError ? ` · 邮件未发：${mailError}` : ""}`,
    module: "M04 预约与通知",
    href: "/yard/bookings",
    roles: ["R01", "R04", "R06"],
    actionable: true,
    read: false,
    createdAt: nowLocalStr(),
  })

  await writeAudit({
    session,
    action: "修改",
    module: "M04 预约与通知",
    target: String(booking.bookingNo),
    detail: mailSent
      ? `发送预约通知（站内+邮件→${yardEmail}）`
      : `发送预约通知（站内${mailError ? `；邮件失败：${mailError}` : ""}）`,
    ip: clientIp(req),
  })

  return NextResponse.json({
    ok: true,
    mailSent,
    mailSkipped,
    mailError,
    yardEmail: yardEmail || null,
  })
}
