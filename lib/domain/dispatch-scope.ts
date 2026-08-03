/**
 * 调运「还箱范围」：可选还箱城市集合（结构化），支撑申请定价与执行校验闭环。
 */

import type { DispatchOrder, DispatchPriceRule } from "../types"

/** 从历史自由文本 scope 解析城市列表 */
export function parseScopeCities(scope: string | null | undefined): string[] {
  if (!scope?.trim()) return []
  return scope
    .split(/[/／,，、|;；]+/)
    .map((s) => s.trim())
    .map((s) => s.replace(/（.*?）/g, "").replace(/\(.*?\)/g, "").trim())
    .map((s) => s.replace(/(港|中央)?堆场$/g, "").trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
}

export function formatScopeCities(cities: string[]): string {
  return cities.map((c) => c.trim()).filter(Boolean).join(" / ")
}

export function normalizeReturnCities(input?: string[] | null, fallbackScope?: string): string[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((c) => c.trim()).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i)
  }
  return parseScopeCities(fallbackScope)
}

export function resolveRuleReturnCities(rule: Pick<DispatchPriceRule, "returnCities" | "scope">): string[] {
  return normalizeReturnCities(rule.returnCities, rule.scope)
}

export function resolveOrderReturnCities(
  order: Pick<DispatchOrder, "returnCities" | "returnScope">,
): string[] {
  return normalizeReturnCities(order.returnCities, order.returnScope)
}

export function isReturnCityAllowed(city: string, allowed: string[]): boolean {
  const c = city.trim()
  if (!c) return false
  if (allowed.length === 0) return false
  return allowed.some((a) => a === c)
}

/** 多单调运共用一次还箱时：取各单允许城市的交集 */
export function intersectReturnCities(orders: Pick<DispatchOrder, "returnCities" | "returnScope">[]): string[] {
  if (orders.length === 0) return []
  let acc = resolveOrderReturnCities(orders[0]!)
  for (let i = 1; i < orders.length; i++) {
    const next = new Set(resolveOrderReturnCities(orders[i]!))
    acc = acc.filter((c) => next.has(c))
  }
  return acc
}

export function withRuleScopeFields(returnCities: string[]): {
  returnCities: string[]
  scope: string
} {
  const cities = normalizeReturnCities(returnCities)
  return { returnCities: cities, scope: formatScopeCities(cities) }
}

export function withOrderScopeFields(returnCities: string[]): {
  returnCities: string[]
  returnScope: string
} {
  const cities = normalizeReturnCities(returnCities)
  return { returnCities: cities, returnScope: formatScopeCities(cities) }
}
