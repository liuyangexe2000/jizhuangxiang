import type { SessionPayload } from "./session"
import type { ResourceKey } from "./resources"

/** 内部角色：不做行级隔离 */
const INTERNAL_ROLES = new Set(["R00", "R01", "R02"])

export function isInternalRole(roleId: string) {
  return INTERNAL_ROLES.has(roleId)
}

type Row = Record<string, unknown>

function str(v: unknown) {
  return typeof v === "string" ? v : ""
}

function yardBelongsToAgent(yards: Row[], yardName: string, agentOrg: string) {
  return yards.some((y) => str(y.name) === yardName && str(y.agent) === agentOrg)
}

/**
 * 按会话 org + 角色过滤列表（字符串归属，对齐种子数据中的 customer/agent/carrier/yard 名称）
 */
export function filterRowsByTenant(
  resource: ResourceKey,
  rows: Row[],
  session: SessionPayload,
  ctx?: { yards?: Row[]; inventory?: Row[] },
): Row[] {
  if (!session.org || isInternalRole(session.roleId)) return rows
  const org = session.org
  const role = session.roleId
  const yards = ctx?.yards ?? []

  switch (resource) {
    case "orders":
      if (role === "R03") return rows.filter((r) => str(r.customer) === org)
      if (role === "R04") {
        return rows.filter(
          (r) =>
            yardBelongsToAgent(yards, str(r.pickupYard), org) ||
            yardBelongsToAgent(yards, str(r.returnYard), org),
        )
      }
      if (role === "R06") {
        return rows.filter((r) => str(r.pickupYard) === org || str(r.returnYard) === org)
      }
      return rows
    case "bills":
      return role === "R03" ? rows.filter((r) => str(r.party) === org) : rows
    case "dispatch":
    case "returns":
      return role === "R05" ? rows.filter((r) => str(r.carrier) === org) : rows
    case "inventory":
    case "yards":
      if (role === "R04") return rows.filter((r) => str(r.agent) === org)
      if (role === "R06") return rows.filter((r) => str(r.name) === org || str(r.yard) === org)
      return rows
    case "gate":
    case "discrepancy":
    case "containers":
    case "bookings":
      if (role === "R04") {
        return rows.filter((r) => yardBelongsToAgent(yards, str(r.yard), org))
      }
      if (role === "R06") {
        return rows.filter((r) => str(r.yard) === org || str(r.name) === org)
      }
      return rows
    case "users":
      // 外部角色只能看到自己
      if (role === "R03" || role === "R04" || role === "R05" || role === "R06") {
        return rows.filter((r) => str(r.id) === session.uid)
      }
      return rows
    case "notifications":
      return rows.filter((r) => {
        const roles = Array.isArray(r.roles) ? (r.roles as string[]) : []
        return roles.includes(role)
      })
    default:
      return rows
  }
}

/** 单行是否可读 */
export function canReadRow(
  resource: ResourceKey,
  row: Row,
  session: SessionPayload,
  ctx?: { yards?: Row[] },
): boolean {
  return filterRowsByTenant(resource, [row], session, ctx).length > 0
}

/** 写操作前校验归属 */
export function canWriteRow(
  resource: ResourceKey,
  row: Row,
  session: SessionPayload,
  ctx?: { yards?: Row[] },
): boolean {
  if (isInternalRole(session.roleId)) return true
  return canReadRow(resource, row, session, ctx)
}

/**
 * 外部角色创建时强制写入归属字段，避免伪造他方数据
 */
export function stampCreatePayload(resource: ResourceKey, payload: Row, session: SessionPayload): Row {
  if (!session.org || isInternalRole(session.roleId)) return payload
  const org = session.org
  const next = { ...payload }
  switch (session.roleId) {
    case "R03":
      if (resource === "orders") next.customer = org
      if (resource === "bills") next.party = org
      break
    case "R05":
      if (resource === "dispatch" || resource === "returns") next.carrier = org
      break
    case "R04":
      if (resource === "yards" || resource === "inventory") next.agent = org
      break
    case "R06":
      if (resource === "bookings" || resource === "gate") next.yard = org
      if (resource === "yards") next.name = org
      break
  }
  return next
}
