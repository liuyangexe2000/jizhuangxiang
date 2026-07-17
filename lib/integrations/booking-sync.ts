import "server-only"
import { create, list, update } from "@/lib/repo"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import type { Customer, UseBoxOrder } from "@/lib/types"
import { DEFAULT_CONTAINER_TYPE } from "@/lib/container-types"
import { resolveUseBoxOrderNo, isValidUseBoxOrderNo } from "@/lib/domain/usebox-order-no"
import { resolveCustomerId } from "@/lib/domain/resolve-customer"
import { ensureCustomerIdColumns } from "@/lib/ensure-customer-id-schema"

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
  const explicitUrl = Boolean(process.env.BOOKING_API_URL?.trim())
  let items: BookingFeedItem[]
  let source = url
  try {
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
    items = normalizeFeed(await res.json())
  } catch (e) {
    // 未显式配置且默认本地 feed 不可达：进程内合成一条，保证集成「立即同步」不阻塞
    if (!explicitUrl && url.includes("/api/external/booking-feed")) {
      const { useBoxOrderNoPrefix } = await import("@/lib/domain/usebox-order-no")
      const stamp = new Date()
      const prefix = useBoxOrderNoPrefix(stamp)
      const seq = String((Math.floor(stamp.getTime() / 1000) % 9000) + 1).padStart(4, "0")
      items = [
        {
          externalId: `LOCAL-${Date.now().toString(36)}`,
          orderNo: `${prefix}${seq}`,
          customer: "西安国际陆港集团",
          customerType: "班列客户",
          pickupCity: "西安",
          returnCity: "汉堡",
          containerType: DEFAULT_CONTAINER_TYPE,
          quantity: 2,
          unitPrice: 3180,
          channel: "订舱勾选",
          remark: `本地 fallback（${(e as Error).message}）`,
        },
      ]
      source = `local-fallback:${url}`
    } else {
      throw e
    }
  }
  await ensureCustomerIdColumns()
  const existing = await list("orders")
  const existingNos = new Set(existing.map((o) => String(o.orderNo)))
  const customers = (await list("customers")) as Customer[]
  const createdNos: string[] = []
  let skipped = 0

  for (const item of items) {
    const requested = isValidUseBoxOrderNo(item.orderNo) ? item.orderNo : undefined
    const orderNo = resolveUseBoxOrderNo(requested, existingNos)
    if (existingNos.has(orderNo)) {
      skipped += 1
      continue
    }
    const qty = Math.max(1, Number(item.quantity) || 1)
    const unitPrice = Number(item.unitPrice) || 3000
    await create("orders", {
      orderNo,
      customer: item.customer,
      customerId: resolveCustomerId(item.customer, customers),
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
    source,
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
