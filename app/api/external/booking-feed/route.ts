import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * 模拟「外部订舱平台」HTTP 接口，供本系统 BOOKING_API_URL 指向后做真实 fetch 同步。
 * 鉴权：若配置了 BOOKING_API_KEY，则要求请求头 X-Api-Key 或 Authorization: Bearer 匹配。
 */
export async function GET(req: Request) {
  const expected = process.env.BOOKING_API_KEY?.trim()
  if (expected) {
    const key =
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      ""
    if (key !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }

  const stamp = new Date()
  const ymd = stamp.toISOString().slice(0, 10).replace(/-/g, "")
  const suffix = stamp.getTime().toString(36).slice(-4).toUpperCase()

  return NextResponse.json({
    orders: [
      {
        externalId: `EXT-${ymd}-${suffix}`,
        orderNo: `UB${ymd}${suffix}`,
        customer: "西安国际陆港集团",
        customerType: "班列客户",
        pickupCity: "西安",
        returnCity: "汉堡",
        containerType: "40HQ",
        quantity: 4,
        unitPrice: 3180,
        channel: "订舱勾选",
        remark: "外部订舱平台推送",
      },
    ],
  })
}
