import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { writeAudit } from "@/lib/audit"
import { ensureRepairQuoteColumns } from "@/lib/ensure-repair-schema"
import {
  sumRepairQuoteLines,
  type RepairQuoteLine,
} from "@/lib/domain/repair-approval-plan"
import {
  generateRepairBill,
  hasBillOfType,
} from "@/lib/domain/multi-bill-plan"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import type { Bill, RepairOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

function parseLines(raw: unknown): RepairQuoteLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null
      const r = row as Record<string, unknown>
      const label = typeof r.label === "string" ? r.label.trim() : ""
      const qty = Number(r.qty)
      const unitPrice = Number(r.unitPrice)
      if (!label || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return null
      }
      return {
        label,
        qty,
        unitPrice,
        amount: qty * unitPrice,
        remark: typeof r.remark === "string" ? r.remark : undefined,
      } satisfies RepairQuoteLine
    })
    .filter(Boolean) as RepairQuoteLine[]
}

/** 修箱报价：保存 / 提交 / 审批 / 驳回 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  await ensureRepairQuoteColumns()
  const { id } = await params
  const order = (await get("repair", decodeURIComponent(id))) as RepairOrder | null
  if (!order) return NextResponse.json({ error: "修箱工单不存在" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : "save"
  const actor = session.name || session.account
  const now = nowLocalStr()

  const canEdit = ["R00", "R01", "R03", "R04", "R06"].includes(session.roleId)
  const canApprove = ["R00", "R01"].includes(session.roleId)

  if (action === "save" || action === "submit") {
    if (!canEdit) return NextResponse.json({ error: "无权编辑报价" }, { status: 403 })
    if (order.quoteStatus === "待审批" || order.quoteStatus === "已通过") {
      return NextResponse.json({ error: "当前状态不可修改报价" }, { status: 400 })
    }

    const lines = parseLines(body.lines)
    if (lines.length === 0) {
      return NextResponse.json({ error: "请至少添加一行报价明细" }, { status: 400 })
    }
    const quoteTotal = sumRepairQuoteLines(lines)
    const patch: Partial<RepairOrder> = {
      quoteLines: lines,
      quoteTotal,
      quoteRejectReason: undefined,
    }
    if (action === "submit") {
      patch.quoteStatus = "待审批"
    } else {
      patch.quoteStatus = order.quoteStatus || "待报价"
    }
    const updated = (await update("repair", order.id, patch)) as RepairOrder
    await writeAudit({
      session,
      action: action === "submit" ? "审批" : "修改",
      module: "M06 维修管理",
      target: order.repairNo,
      detail: action === "submit" ? `提交修箱报价 ¥${quoteTotal}` : `保存修箱报价草稿`,
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, order: updated })
  }

  if (action === "approve") {
    if (!canApprove) return NextResponse.json({ error: "仅箱管可审批报价" }, { status: 403 })
    if (order.quoteStatus !== "待审批") {
      return NextResponse.json({ error: "仅待审批报价可通过" }, { status: 400 })
    }
    const quoteTotal = order.quoteTotal ?? sumRepairQuoteLines(order.quoteLines || [])
    if (quoteTotal <= 0) {
      return NextResponse.json({ error: "报价合计须大于 0" }, { status: 400 })
    }

    const updated = (await update("repair", order.id, {
      quoteStatus: "已通过",
      quoteTotal,
      quoteApprovedBy: actor,
      quoteApprovedAt: now,
      quoteRejectReason: undefined,
    })) as RepairOrder

    let billNo: string | undefined
    const bills = (await list("bills")) as Bill[]
    if (!hasBillOfType(bills, order.repairNo, "维修费账单")) {
      const billPayload = generateRepairBill(updated)
      if (billPayload) {
        const created = (await create("bills", billPayload)) as Bill
        billNo = created.billNo
        await create("notifications", {
          id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
          type: "账单",
          level: "重要",
          title: `维修费账单待确认 · ${order.repairNo}`,
          desc: `修箱报价已通过，金额 ¥${quoteTotal.toLocaleString()}（${created.billNo}）。`,
          module: "M06 维修管理",
          href: "/customer/bills",
          roles: ["R01", "R03"],
          actionable: true,
          read: false,
          createdAt: now,
        })
      }
    }

    await writeAudit({
      session,
      action: "审批",
      module: "M06 维修管理",
      target: order.repairNo,
      detail: billNo ? `修箱报价审批通过，已出维修费账单 ${billNo}` : "修箱报价审批通过",
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, order: updated, billNo })
  }

  if (action === "reject") {
    if (!canApprove) return NextResponse.json({ error: "仅箱管可驳回报价" }, { status: 403 })
    if (order.quoteStatus !== "待审批") {
      return NextResponse.json({ error: "仅待审批报价可驳回" }, { status: 400 })
    }
    const rejectReason =
      typeof body.rejectReason === "string" ? body.rejectReason.trim() : ""
    if (!rejectReason) {
      return NextResponse.json({ error: "请填写驳回原因" }, { status: 400 })
    }
    const updated = (await update("repair", order.id, {
      quoteStatus: "已驳回",
      quoteRejectReason: rejectReason,
    })) as RepairOrder
    await writeAudit({
      session,
      action: "审批",
      module: "M06 维修管理",
      target: order.repairNo,
      detail: `驳回修箱报价：${rejectReason}`,
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, order: updated })
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 })
}
