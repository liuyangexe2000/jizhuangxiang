import type { Booking } from "../types"
import { parseBizTime } from "./order-ops"
import type { WorkHoursConfig } from "../types"

const DEFAULT_WH: WorkHoursConfig = { startHour: 8, endHour: 18 }

/** 堆场工作时段（可传入配置） */
export function isWithinWorkHours(
  planTime: string,
  workHours: WorkHoursConfig = DEFAULT_WH,
): boolean {
  const ms = parseBizTime(planTime)
  if (!Number.isFinite(ms)) return false
  const d = new Date(ms)
  const day = d.getDay()
  if (day === 0 || day === 6) return false
  const h = d.getHours() + d.getMinutes() / 60
  const start = workHours.startHour ?? 8
  const end = workHours.endHour ?? 18
  return h >= start && h < end
}

/** 还箱预约须至少提前 N 小时 */
export function returnBookingLeadOk(
  planTime: string,
  leadHours = 24,
  now = Date.now(),
): boolean {
  const ms = parseBizTime(planTime)
  return Number.isFinite(ms) && ms >= now + leadHours * 3600 * 1000
}

/** 发送通知前强校验；返回错误文案或 null */
export function validateBookingForNotify(
  b: Pick<Booking, "type" | "planTime" | "withinWorkHours">,
  opts?: { workHours?: WorkHoursConfig; returnLeadHours?: number },
): string | null {
  const wh = opts?.workHours ?? DEFAULT_WH
  const lead = opts?.returnLeadHours ?? 24
  const within =
    typeof b.withinWorkHours === "boolean" ? b.withinWorkHours : isWithinWorkHours(b.planTime, wh)
  if (!within || !isWithinWorkHours(b.planTime, wh)) {
    return `计划时间不在堆场工作时段（工作日 ${String(wh.startHour).padStart(2, "0")}:00–${String(wh.endHour).padStart(2, "0")}:00），无法发送通知`
  }
  if (b.type === "还箱预约" && !returnBookingLeadOk(b.planTime, lead)) {
    return `还箱预约须至少提前 ${lead} 小时`
  }
  return null
}

/** EIR 风格通知正文 */
export function buildEirNotifyText(b: Booking): string {
  const nos = (b.containerNos || []).join(", ")
  return [
    `【设备交接预约 / EIR】${b.type}`,
    `预约号：${b.bookingNo}`,
    `关联单号：${b.refNo || "—"}`,
    `堆场：${b.yard}（${b.city}）`,
    `计划到达(ETA)：${b.planTime}`,
    `司机：${b.driver}`,
    `证件：${b.driverId}`,
    `电话：${b.driverPhone}`,
    `车牌：${b.plateNo}`,
    `箱号：${nos || "—"}`,
  ].join("\n")
}
