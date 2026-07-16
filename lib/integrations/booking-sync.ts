import "server-only"
import { create, list, update } from "@/lib/repo"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import type { UseBoxOrder } from "@/lib/types"
import { DEFAULT_CONTAINER_TYPE } from "@/lib/container-types"

export type BookingFeedItem = {
  externalId?: string
  orderNo?: string
  customer: string
  customerType?: UseBoxOrder["customerType"]
  pickupCity: string
  returnCity: string
  containerType: UseBoxOrder["containerType"]
  quantity: number
  unitPrice?: number
  channel?: UseBoxOrder["channel"]
  remark?: string
}

export type BookingSyncResult = {
  fetched: number
  created: number
  skipped: number
  source: string
  orders: string[]
}

function authHeaders(): HeadersInit {
  const key = process.env.BOOKING_API_KEY
  return key ? { "X-Api-Key": key, Authorization: `Bearer ${key}` } : {}
}

function resolveBookingApiUrl() {
  const configured = process.env.BOOKING_API_URL?.trim()
  if (configured) return configured
  const base = process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3000"
  return `${base.replace(/\/$/, "")}/api/external/booking-feed`
}

function normalizeFeed(data: unknown): BookingFeedItem[] {
  if (Array.isArray(data)) return data as BookingFeedItem[]
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.orders)) return obj.orders as BookingFeedItem[]
    if (Array.isArray(obj.data)) return obj.data as BookingFeedItem[]
  }
  throw new Error("订舱 API 返回格式无效：期望数组或 { orders: [] }")
}

/** 真实 HTTP 拉取订舱平台订单并 upsert 到本系统 */
export async function syncBookingOrdersFromApi(): Promise<BookingSyncResult> {
  const url = resolveBookingApiUrl()
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`订舱 API HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`)
  }
  const items = normalizeFeed(await res.json())
  const existing = await list("orders")
  const existingNos = new Set(existing.map((o) => String(o.orderNo)))
  const createdNos: string[] = []
  let skipped = 0

  for (const item of items) {
    const orderNo =
      item.orderNo ||
      item.externalId ||
      `UB${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    if (existingNos.has(orderNo)) {
      skipped += 1
      continue
    }
    const qty = Math.max(1, Number(item.quantity) || 1)
    const unitPrice = Number(item.unitPrice) || 3000
    await create("orders", {
      orderNo,
      customer: item.customer,
      customerType: item.customerType ?? "班列客户",
      pickupCity: item.pickupCity,
      returnCity: item.returnCity,
      containerType: item.containerType ?? DEFAULT_CONTAINER_TYPE,
      quantity: qty,
      unitPrice,
      quotedUnitPrice: unitPrice,
      status: "待确认",
      createdAt: nowLocalStr(),
      releaseDocReady: false,
      stuffingListUploaded: false,
      returnProofUploaded: false,
      channel: "订舱勾选",
      remark: item.remark ?? `订舱平台同步 · ${item.externalId ?? orderNo}`,
    })
    existingNos.add(orderNo)
    createdNos.push(orderNo)
  }

  return {
    fetched: items.length,
    created: createdNos.length,
    skipped,
    source: url,
    orders: createdNos,
  }
}

/** 更新订舱类集成状态行 */
export async function markBookingIntegrationSynced(
  integrationId: string,
  result: BookingSyncResult,
  ok: boolean,
) {
  const lastSync = nowLocalStr().slice(0, 16)
  await update("integrations", integrationId, {
    status: ok ? "正常" : "异常",
    pending: ok ? 0 : Math.max(0, result.fetched - result.created),
    lastSync,
    successRate: ok ? 99.9 : 85,
  })
}
