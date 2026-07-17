import "server-only"
import { get, list, update } from "@/lib/repo"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import { ensureOutboundExtraColumns } from "@/lib/ensure-outbound-schema"
import type { OutboundEvent } from "@/lib/types"

export type OutboundDeliverResult = {
  id: string
  ok: boolean
  status: OutboundEvent["status"]
  target: string
  httpStatus?: number
  error?: string
  dryRun?: boolean
}

function authHeaders(): HeadersInit {
  const key = process.env.BOOKING_API_KEY
  return key ? { "X-Api-Key": key, Authorization: `Bearer ${key}` } : {}
}

/** 出站推送目标；未配置时回落到本地 echo，便于联调 */
export function resolveOutboundUrl(): string {
  const configured = process.env.BOOKING_OUTBOUND_URL?.trim()
  if (configured) return configured
  const base = process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3000"
  return `${base.replace(/\/$/, "")}/api/external/booking-outbound`
}

function isLocalEcho(url: string): boolean {
  return url.includes("/api/external/booking-outbound")
}

export async function deliverOutboundEvent(id: string): Promise<OutboundDeliverResult> {
  await ensureOutboundExtraColumns()
  const ev = (await get("outboundEvents", id)) as OutboundEvent | null
  if (!ev) {
    return { id, ok: false, status: "failed", target: "", error: "出站事件不存在" }
  }
  if (ev.status === "delivered") {
    return {
      id,
      ok: true,
      status: "delivered",
      target: resolveOutboundUrl(),
      error: "已投递，跳过",
    }
  }

  const target = resolveOutboundUrl()
  const attempts = (ev.attempts ?? 0) + 1
  const body = {
    id: ev.id,
    type: ev.type,
    relatedNo: ev.relatedNo,
    payload: ev.payload ?? {},
    createdAt: ev.createdAt,
    attempts,
  }

  // 未显式配置 BOOKING_OUTBOUND_URL 时走进程内 dry-run，避免 APP_BASE_URL 端口与实际 dev 端口不一致导致 fetch failed
  const explicitUrl = Boolean(process.env.BOOKING_OUTBOUND_URL?.trim())
  if (!explicitUrl && isLocalEcho(target)) {
    await update("outboundEvents", id, {
      status: "delivered",
      deliveredAt: nowLocalStr(),
      attempts,
      lastError: "",
    })
    return {
      id,
      ok: true,
      status: "delivered",
      target,
      dryRun: true,
    }
  }

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const text = await res.text().catch(() => "")
    if (!res.ok) {
      const err = `HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`
      // 本地 echo 不可达时不阻塞闭环：记为已投递（dry-run）
      if (isLocalEcho(target)) {
        await update("outboundEvents", id, {
          status: "delivered",
          deliveredAt: nowLocalStr(),
          attempts,
          lastError: `本地 echo 不可达，已降级 delivered：${err}`.slice(0, 500),
        })
        return {
          id,
          ok: true,
          status: "delivered",
          target,
          httpStatus: res.status,
          dryRun: true,
          error: err,
        }
      }
      await update("outboundEvents", id, {
        status: "failed",
        attempts,
        lastError: err,
      })
      return { id, ok: false, status: "failed", target, httpStatus: res.status, error: err }
    }

    await update("outboundEvents", id, {
      status: "delivered",
      deliveredAt: nowLocalStr(),
      attempts,
      lastError: "",
    })
    return {
      id,
      ok: true,
      status: "delivered",
      target,
      httpStatus: res.status,
      dryRun: isLocalEcho(target),
    }
  } catch (e) {
    const err = (e as Error).message
    if (isLocalEcho(target)) {
      await update("outboundEvents", id, {
        status: "delivered",
        deliveredAt: nowLocalStr(),
        attempts,
        lastError: `本地 echo 不可达，已降级 delivered：${err}`.slice(0, 500),
      })
      return { id, ok: true, status: "delivered", target, dryRun: true, error: err }
    }
    await update("outboundEvents", id, {
      status: "failed",
      attempts,
      lastError: err.slice(0, 500),
    })
    return { id, ok: false, status: "failed", target, error: err }
  }
}

export async function deliverPendingOutbound(limit = 20): Promise<{
  target: string
  delivered: number
  failed: number
  results: OutboundDeliverResult[]
}> {
  await ensureOutboundExtraColumns()
  const target = resolveOutboundUrl()
  const all = (await list("outboundEvents")) as OutboundEvent[]
  const pending = all
    .filter((e) => e.status === "pending" || e.status === "failed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, Math.max(1, limit))

  const results: OutboundDeliverResult[] = []
  let delivered = 0
  let failed = 0
  for (const ev of pending) {
    const r = await deliverOutboundEvent(ev.id)
    results.push(r)
    if (r.ok && r.status === "delivered") delivered += 1
    else failed += 1
  }
  return { target, delivered, failed, results }
}
