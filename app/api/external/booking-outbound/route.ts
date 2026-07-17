import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * 模拟「外部订舱平台」出站接收端，供 BOOKING_OUTBOUND_URL 指向后做真实 HTTP POST 投递联调。
 * 鉴权：若配置了 BOOKING_API_KEY，则要求 X-Api-Key 或 Authorization: Bearer 匹配。
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }

  const relatedNo = String((body as { relatedNo?: string }).relatedNo || "")
  const type = String((body as { type?: string }).type || "")
  if (!relatedNo || !type) {
    return NextResponse.json({ error: "type 与 relatedNo 必填" }, { status: 400 })
  }

  console.log(
    `[booking-outbound] 收到出站 ${type} · ${relatedNo} · id=${(body as { id?: string }).id || "—"}`,
  )

  return NextResponse.json({
    ok: true,
    echo: true,
    receivedAt: new Date().toISOString(),
    relatedNo,
    type,
  })
}
