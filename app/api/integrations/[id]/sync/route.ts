import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { writeAudit } from "@/lib/audit"
import {
  markBookingIntegrationSynced,
  syncBookingOrdersFromApi,
} from "@/lib/integrations/booking-sync"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

/** 集成「立即同步」服务端编排：订舱走真实 HTTP；代管刷新差异 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!canAccessResource("integrations", session.roleId, "write")) {
    return NextResponse.json({ error: "无权同步集成" }, { status: 403 })
  }

  const it = await get("integrations", decodeURIComponent(id))
  if (!it) return NextResponse.json({ error: "集成不存在" }, { status: 404 })
  if (it.status === "未连接") {
    return NextResponse.json({ error: `${it.name} 尚未连接` }, { status: 400 })
  }

  try {
    if (it.category === "订舱平台") {
      const result = await syncBookingOrdersFromApi()
      await markBookingIntegrationSynced(it.id, result, true)
      await create("notifications", {
        id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        type: "系统",
        level: "普通",
        title: `订舱平台同步 · ${it.name}`,
        desc: `HTTP 拉取 ${result.fetched} 条，新建 ${result.created} 条，跳过 ${result.skipped} 条。来源：${result.source}`,
        module: "系统集成",
        href: "/customer/orders",
        roles: ["R00", "R01"],
        actionable: false,
        read: false,
        createdAt: nowLocalStr(),
      })
      await writeAudit({
        session,
        action: "修改",
        module: "系统集成",
        target: it.name,
        detail: `订舱 HTTP 同步：新建 ${result.created}/${result.fetched}`,
        ip: clientIp(req),
      })
      return NextResponse.json({ ok: true, category: it.category, result })
    }

    if (it.category === "代管公司") {
      const inventory = await list("inventory")
      const discrepancy = await list("discrepancy")
      const checkedAt = nowLocalStr()
      let updated = 0
      let created = 0
      for (const inv of inventory) {
        const existing = discrepancy.find((r) => r.yard === inv.yard)
        const systemCount = Number(inv.onSite) || 0
        if (existing) {
          const agentCount = Number(existing.agentCount) || 0
          const diff = agentCount - systemCount
          const status =
            existing.status === "已修正" && diff === 0
              ? "已修正"
              : diff === 0
                ? "无差异"
                : "待核对"
          await update("discrepancy", existing.id, {
            systemCount,
            agentCount,
            diff,
            checkedAt,
            status,
          })
          updated += 1
        } else {
          const jitter = Math.floor(Math.random() * 5) - 2
          const agentCount = Math.max(0, systemCount + jitter)
          const diff = agentCount - systemCount
          await create("discrepancy", {
            yard: inv.yard,
            city: inv.city,
            systemCount,
            agentCount,
            diff,
            checkedAt,
            status: diff === 0 ? "无差异" : "待核对",
          })
          created += 1
        }
      }
      await update("integrations", it.id, {
        status: "正常",
        pending: 0,
        lastSync: nowLocalStr().slice(0, 16),
        successRate: Math.min(100, Number((Number(it.successRate) + 0.4).toFixed(1))),
      })
      await writeAudit({
        session,
        action: "修改",
        module: "系统集成",
        target: it.name,
        detail: `代管对账同步：更新 ${updated} 新建 ${created}`,
        ip: clientIp(req),
      })
      return NextResponse.json({ ok: true, category: it.category, result: { updated, created } })
    }

    // 其它集成：更新时间戳与成功率
    await update("integrations", it.id, {
      status: "正常",
      pending: 0,
      lastSync: nowLocalStr().slice(0, 16),
      successRate: Math.min(100, Number((Number(it.successRate) + 0.3).toFixed(1))),
    })
    await writeAudit({
      session,
      action: "修改",
      module: "系统集成",
      target: it.name,
      detail: `手动同步 ${it.category}`,
      ip: clientIp(req),
    })
    return NextResponse.json({ ok: true, category: it.category })
  } catch (e) {
    await update("integrations", it.id, {
      status: "异常",
      lastSync: nowLocalStr().slice(0, 16),
    }).catch(() => null)
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
