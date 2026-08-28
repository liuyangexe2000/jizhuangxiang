import { type NextRequest, NextResponse } from "next/server"
import { get, list } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canWriteRow } from "@/lib/tenant"
import { writeAudit } from "@/lib/audit"
import { ensureCustomerIdColumns } from "@/lib/ensure-customer-id-schema"
import { ensureOrdersContainerNosColumn } from "@/lib/ensure-orders-schema"
import { cancelUseBoxOrder } from "@/lib/domain/order-cancel"
import type { UseBoxOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

/** 用箱订单取消：库存回滚 + 变更费账单（服务端闭环，禁止仅 PATCH status） */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!["R00", "R01", "R03"].includes(session.roleId)) {
    return NextResponse.json({ error: "无权取消用箱订单" }, { status: 403 })
  }

  await ensureCustomerIdColumns()
  await ensureOrdersContainerNosColumn()

  const order = (await get("orders", decodeURIComponent(id))) as UseBoxOrder | null
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 })

  const yards = (await list("yards")) as { name: string; city: string }[]
  if (!canWriteRow("orders", order as unknown as Record<string, unknown>, session, { yards })) {
    return NextResponse.json({ error: "无权取消该订单" }, { status: 403 })
  }

  try {
    const result = await cancelUseBoxOrder(order, yards)
    const isPostPickup = order.status === "提箱中"
    await writeAudit({
      session,
      action: "修改",
      module: "M01 用箱订单",
      target: order.orderNo,
      detail: isPostPickup
        ? `提箱中取消用箱订单 ${order.orderNo}（收取变更费）`
        : `取消用箱订单 ${order.orderNo}（${result.status}）`,
      ip: clientIp(_req),
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
