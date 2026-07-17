import { type NextRequest, NextResponse } from "next/server"
import { list, create } from "@/lib/repo"
import { isResourceKey, RESOURCES, type ResourceKey } from "@/lib/resources"
import { getSession } from "@/lib/auth-server"
import { writeAudit } from "@/lib/audit"
import { canAccessResource } from "@/lib/acl"
import { ensureAclRuntime } from "@/lib/acl-runtime"
import { hashPassword } from "@/lib/password"
import { filterRowsByTenant, stampCreatePayload } from "@/lib/tenant"
import { resolveUseBoxOrderNo } from "@/lib/domain/usebox-order-no"
import { resolveCustomerId } from "@/lib/domain/resolve-customer"
import { ensureCustomerIdColumns } from "@/lib/ensure-customer-id-schema"
import type { Customer } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

function publicRow(resource: string, row: Record<string, any>) {
  if (resource !== "users") return row
  const { passwordHash: _, ...rest } = row
  return rest
}

async function tenantContext(resource: ResourceKey) {
  if (
    resource === "gate" ||
    resource === "discrepancy" ||
    resource === "containers" ||
    resource === "bookings" ||
    resource === "orders"
  ) {
    return { yards: await list("yards") }
  }
  return undefined
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params
  if (!isResourceKey(resource)) return NextResponse.json({ error: "unknown resource" }, { status: 404 })
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  await ensureAclRuntime()
  if (!canAccessResource(resource, session.roleId, "read")) {
    return NextResponse.json({ error: "无权访问该资源" }, { status: 403 })
  }
  if (resource === "orders" || resource === "bills") {
    await ensureCustomerIdColumns()
  }
  if (resource === "orders") {
    const { ensureOrdersContainerNosColumn } = await import("@/lib/ensure-orders-schema")
    await ensureOrdersContainerNosColumn()
  }
  if (resource === "repair") {
    const { ensureRepairProcessLogColumn } = await import("@/lib/ensure-repair-schema")
    await ensureRepairProcessLogColumn()
  }
  const data = await list(resource)
  const ctx = await tenantContext(resource)
  const filtered = filterRowsByTenant(resource, data, session, ctx)
  return NextResponse.json(filtered.map((r) => publicRow(resource, r)))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params
  if (!isResourceKey(resource)) return NextResponse.json({ error: "unknown resource" }, { status: 404 })
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  await ensureAclRuntime()
  if (!canAccessResource(resource, session.roleId, "write")) {
    return NextResponse.json({ error: "无权写入该资源" }, { status: 403 })
  }
  if (resource === "orders" || resource === "bills") {
    await ensureCustomerIdColumns()
  }
  if (resource === "orders") {
    const { ensureOrdersContainerNosColumn } = await import("@/lib/ensure-orders-schema")
    await ensureOrdersContainerNosColumn()
  }
  if (resource === "repair") {
    const { ensureRepairProcessLogColumn } = await import("@/lib/ensure-repair-schema")
    await ensureRepairProcessLogColumn()
  }
  const cfg = RESOURCES[resource]
  const body = await req.json()
  const { __auditAction, __auditDetail, ...payload } = body

  // 新增用户时写入默认密码哈希（可用 body.password 覆盖，不会回传客户端）
  if (resource === "users") {
    const raw = typeof payload.password === "string" && payload.password ? payload.password : undefined
    delete payload.password
    if (!payload.passwordHash) {
      payload.passwordHash = hashPassword(raw ?? process.env.SEED_PASSWORD ?? "Passw0rd!")
    }
  }

  const stamped = stampCreatePayload(resource, payload, session)
  // 门户手工提交（含箱管代客）固定为「订舱后新增」；「订舱勾选」仅由订舱平台同步写入
  if (resource === "orders") {
    stamped.channel = "订舱后新增"
    const existing = await list("orders")
    const existingNos = existing.map((o) => String((o as { orderNo?: string }).orderNo ?? ""))
    stamped.orderNo = resolveUseBoxOrderNo(stamped.orderNo, existingNos)
    if (!stamped.customerId) {
      const customers = (await list("customers")) as Customer[]
      stamped.customerId = resolveCustomerId(String(stamped.customer ?? ""), customers)
    }
  }
  const created = await create(resource, stamped)
  if (resource !== "audit") {
    await writeAudit({
      session,
      action: __auditAction ?? "新增",
      module: cfg.module,
      target: String(created[cfg.id] ?? cfg.label),
      detail: __auditDetail ?? `新增${cfg.label}`,
      ip: clientIp(req),
    })
  }
  return NextResponse.json(publicRow(resource, created), { status: 201 })
}
