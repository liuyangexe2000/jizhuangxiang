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
import { ensureBillFxColumns } from "@/lib/ensure-bill-fx-schema"
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
  if (resource === "customers" || resource === "orders") {
    const { ensureCustomerContractColumns } = await import("@/lib/ensure-customer-contract-schema")
    await ensureCustomerContractColumns()
  }
  if (resource === "suppliers") {
    const { ensureSelfOpSupplier } = await import("@/lib/ensure-self-op-supplier")
    await ensureSelfOpSupplier()
  }
  if (resource === "bills") {
    await ensureBillFxColumns()
  }
  if (resource === "dispatch" || resource === "dispatchPriceRules") {
    const { ensureDispatchScopeColumns } = await import("@/lib/ensure-dispatch-scope-schema")
    await ensureDispatchScopeColumns()
  }
  if (resource === "useBoxPriceRules" || resource === "proxyCompanies" || resource === "dispatchPriceRules") {
    const { ensureConfigTablesSchema } = await import("@/lib/ensure-config-tables-schema")
    await ensureConfigTablesSchema()
  }
  if (resource === "orders") {
    const { ensureOrdersContainerNosColumn } = await import("@/lib/ensure-orders-schema")
    await ensureOrdersContainerNosColumn()
  }
  if (resource === "repair") {
    const { ensureRepairQuoteColumns } = await import("@/lib/ensure-repair-schema")
    await ensureRepairQuoteColumns()
  }
  if (resource === "accountApplications") {
    const { ensureAccountApplicationsSchema } = await import("@/lib/ensure-account-applications-schema")
    await ensureAccountApplicationsSchema()
  }
  if (resource === "feedbackTickets") {
    const { ensureFeedbackProcessFeedbackColumn } = await import("@/lib/ensure-feedback-schema")
    await ensureFeedbackProcessFeedbackColumn()
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
  if (resource === "customers" || resource === "orders") {
    const { ensureCustomerContractColumns } = await import("@/lib/ensure-customer-contract-schema")
    await ensureCustomerContractColumns()
  }
  if (resource === "suppliers") {
    const { ensureSelfOpSupplier } = await import("@/lib/ensure-self-op-supplier")
    await ensureSelfOpSupplier()
  }
  if (resource === "bills") {
    await ensureBillFxColumns()
  }
  if (resource === "dispatch" || resource === "dispatchPriceRules") {
    const { ensureDispatchScopeColumns } = await import("@/lib/ensure-dispatch-scope-schema")
    await ensureDispatchScopeColumns()
  }
  if (resource === "useBoxPriceRules" || resource === "proxyCompanies" || resource === "dispatchPriceRules") {
    const { ensureConfigTablesSchema } = await import("@/lib/ensure-config-tables-schema")
    await ensureConfigTablesSchema()
  }
  if (resource === "orders") {
    const { ensureOrdersContainerNosColumn } = await import("@/lib/ensure-orders-schema")
    await ensureOrdersContainerNosColumn()
  }
  if (resource === "repair") {
    const { ensureRepairQuoteColumns } = await import("@/lib/ensure-repair-schema")
    await ensureRepairQuoteColumns()
  }
  if (resource === "accountApplications") {
    const { ensureAccountApplicationsSchema } = await import("@/lib/ensure-account-applications-schema")
    await ensureAccountApplicationsSchema()
  }
  if (resource === "feedbackTickets") {
    const { ensureFeedbackProcessFeedbackColumn } = await import("@/lib/ensure-feedback-schema")
    await ensureFeedbackProcessFeedbackColumn()
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

  if (resource === "proxyCompanies") {
    const name = typeof payload.name === "string" ? payload.name.trim().replace(/\s+/g, " ") : ""
    if (!name) {
      return NextResponse.json({ error: "请填写代管公司名称" }, { status: 400 })
    }
    payload.name = name
    const { findProxyCompanyByName } = await import("@/lib/proxy-company")
    const existing = await list("proxyCompanies")
    const dup = findProxyCompanyByName(existing as { id: string; name: string }[], name)
    if (dup) {
      return NextResponse.json({ error: `代管公司「${dup.name}」已存在` }, { status: 409 })
    }
  }

  if (resource === "bills") {
    const { attachBillFx } = await import("@/lib/domain/money")
    const fx = attachBillFx({
      amount: Number(payload.amount) || 0,
      currency: typeof payload.currency === "string" ? payload.currency : "CNY",
      exchangeRate: typeof payload.exchangeRate === "number" ? payload.exchangeRate : undefined,
    })
    payload.amount = fx.amount
    payload.currency = fx.currency
    payload.exchangeRate = fx.exchangeRate
    payload.amountCny = fx.amountCny
  }

  const stamped = stampCreatePayload(resource, payload, session)
  // 门户手工提交（含箱管代客）固定为「订舱后新增」；「订舱勾选」仅由订舱平台同步写入
  if (resource === "orders") {
    stamped.channel = "订舱后新增"
    const existing = await list("orders")
    const existingNos = existing.map((o) => String((o as { orderNo?: string }).orderNo ?? ""))
    stamped.orderNo = resolveUseBoxOrderNo(stamped.orderNo, existingNos)
    const customers = (await list("customers")) as Customer[]
    if (!stamped.customerId) {
      stamped.customerId = resolveCustomerId(String(stamped.customer ?? ""), customers)
    }
    const master = customers.find((c) => c.id === stamped.customerId)
    if (master) {
      const { assertCustomerCanApply } = await import("@/lib/domain/customer-contract")
      const gate = assertCustomerCanApply(master)
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.message, description: gate.description },
          { status: 403 },
        )
      }
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
