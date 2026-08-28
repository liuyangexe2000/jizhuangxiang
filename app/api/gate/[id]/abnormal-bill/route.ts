import { type NextRequest, NextResponse } from "next/server"
import { get, list, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { writeAudit } from "@/lib/audit"
import {
  generateAbnormalBill,
  hasBillOfType,
} from "@/lib/domain/multi-bill-plan"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import type { Bill, GateRecord, UseBoxOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

/** 异常进出场记录手工生成异常费账单 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!["R00", "R01"].includes(session.roleId)) {
    return NextResponse.json({ error: "仅箱管可生成异常费账单" }, { status: 403 })
  }

  const { id } = await params
  const rec = (await get("gate", decodeURIComponent(id))) as GateRecord | null
  if (!rec) return NextResponse.json({ error: "进出场记录不存在" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  const note = typeof body.note === "string" ? body.note.trim() : ""
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "请填写有效计费金额" }, { status: 400 })
  }

  const refNo = rec.relatedOrderNo || rec.id
  const bills = (await list("bills")) as Bill[]
  if (hasBillOfType(bills, refNo, "异常费账单")) {
    return NextResponse.json({ error: "该记录已生成异常费账单" }, { status: 409 })
  }

  let party = "异常结算"
  let customerId: string | undefined
  if (rec.relatedOrderNo) {
    const orders = (await list("orders")) as UseBoxOrder[]
    const matched = orders.find((o) => o.orderNo === rec.relatedOrderNo)
    if (matched) {
      party = matched.customer
      customerId = matched.customerId
    }
  }

  const billPayload = generateAbnormalBill({
    relatedOrderNo: refNo,
    party,
    customerId,
    amount,
    items: [
      { label: "箱号", value: rec.containerNo },
      { label: "进出场", value: `${rec.type} · ${rec.yard}` },
      { label: "时间", value: rec.time },
      { label: "说明", value: note || "异常进出场计费" },
    ],
  })
  if (!billPayload) {
    return NextResponse.json({ error: "无法生成账单" }, { status: 400 })
  }

  const created = (await create("bills", billPayload)) as Bill
  const now = nowLocalStr()
  await create("notifications", {
    id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: "账单",
    level: "重要",
    title: `异常费账单待确认 · ${rec.containerNo}`,
    desc: `异常进出场计费 ¥${amount.toLocaleString()}（${created.billNo}）。`,
    module: "M03 进出场",
    href: "/customer/bills",
    roles: ["R01", "R03"],
    actionable: true,
    read: false,
    createdAt: now,
  })

  await writeAudit({
    session,
    action: "新增",
    module: "M03 进出场",
    target: rec.containerNo,
    detail: `异常池生成异常费账单 ${created.billNo} ¥${amount}`,
    ip: clientIp(req),
  })

  return NextResponse.json({ ok: true, billNo: created.billNo })
}
