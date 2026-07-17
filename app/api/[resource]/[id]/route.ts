import { type NextRequest, NextResponse } from "next/server"
import { get, update, remove, list } from "@/lib/repo"
import { isResourceKey, RESOURCES, type ResourceKey } from "@/lib/resources"
import { getSession } from "@/lib/auth-server"
import { writeAudit } from "@/lib/audit"
import { canAccessResource } from "@/lib/acl"
import { ensureAclRuntime } from "@/lib/acl-runtime"
import { hashPassword } from "@/lib/password"
import { canReadRow, canWriteRow } from "@/lib/tenant"
import { ensureCustomerIdColumns } from "@/lib/ensure-customer-id-schema"

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

type Ctx = { params: Promise<{ resource: string; id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { resource, id } = await params
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
  const item = await get(resource, decodeURIComponent(id))
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 })
  const ctx = await tenantContext(resource)
  if (!canReadRow(resource, item, session, ctx)) {
    return NextResponse.json({ error: "无权访问该记录" }, { status: 403 })
  }
  return NextResponse.json(publicRow(resource, item))
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { resource, id } = await params
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
  const existing = await get(resource, decodeURIComponent(id))
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })
  const ctx = await tenantContext(resource)
  if (!canWriteRow(resource, existing, session, ctx)) {
    return NextResponse.json({ error: "无权修改该记录" }, { status: 403 })
  }

  const cfg = RESOURCES[resource]
  const body = await req.json()
  const { __auditAction, __auditDetail, password, ...rest } = body
  const patch = { ...rest }
  delete patch.passwordHash
  if (resource === "users" && typeof password === "string" && password) {
    patch.passwordHash = hashPassword(password)
  }

  // 用箱订单：客户不可自行确认，也不可写堆场/后台备注/放行提箱单/改价
  if (resource === "orders" && session.roleId === "R03") {
    if (patch.status === "已确认") {
      return NextResponse.json({ error: "用箱申请须由箱管确认，客户不可自行确认" }, { status: 403 })
    }
    // 阶段B：提箱中/已完成等执行态须由堆场/代管现场经 confirm-pickup / confirm-return 驱动，客户不可越权直改
    if (
      typeof patch.status === "string" &&
      ["提箱中", "已提箱", "还箱中", "已完成"].includes(patch.status)
    ) {
      return NextResponse.json(
        { error: "提箱/还箱执行状态须由堆场/代管现场确认放箱/收箱驱动，客户不可自行推进" },
        { status: 403 },
      )
    }
    for (const key of [
      "pickupYard",
      "returnYard",
      "adminRemark",
      "releaseDocReady",
      "confirmedBy",
      "unitPrice",
      "quotedUnitPrice",
    ] as const) {
      if (key in patch) {
        return NextResponse.json({ error: `无权修改字段 ${key}` }, { status: 403 })
      }
    }
  }

  const updated = await update(resource, decodeURIComponent(id), patch)
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
  if (resource !== "audit") {
    await writeAudit({
      session,
      action: __auditAction ?? "修改",
      module: cfg.module,
      target: decodeURIComponent(id),
      detail: __auditDetail ?? `更新${cfg.label}`,
      ip: clientIp(req),
    })
  }
  return NextResponse.json(publicRow(resource, updated))
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { resource, id } = await params
  if (!isResourceKey(resource)) return NextResponse.json({ error: "unknown resource" }, { status: 404 })
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  await ensureAclRuntime()
  if (!canAccessResource(resource, session.roleId, "write")) {
    return NextResponse.json({ error: "无权删除该资源" }, { status: 403 })
  }
  const existing = await get(resource, decodeURIComponent(id))
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })
  const ctx = await tenantContext(resource)
  if (!canWriteRow(resource, existing, session, ctx)) {
    return NextResponse.json({ error: "无权删除该记录" }, { status: 403 })
  }

  const cfg = RESOURCES[resource]
  const ok = await remove(resource, decodeURIComponent(id))
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 })
  if (resource !== "audit") {
    const detail = req.nextUrl.searchParams.get("detail") ?? `删除${cfg.label}`
    await writeAudit({
      session,
      action: "删除",
      module: cfg.module,
      target: decodeURIComponent(id),
      detail,
      ip: clientIp(req),
    })
  }
  return NextResponse.json({ ok: true })
}
