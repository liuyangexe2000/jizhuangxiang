/** 客户 / 集装箱生命周期时间线事件（聚合查询用） */
export type LifecycleEvent = {
  id: string
  at: string
  kind: string
  title: string
  summary: string
  href?: string
  refNo?: string
  meta?: Record<string, string>
}

export function sortEventsDesc(events: LifecycleEvent[]): LifecycleEvent[] {
  return [...events].sort((a, b) => {
    const ta = Date.parse(a.at) || 0
    const tb = Date.parse(b.at) || 0
    if (tb !== ta) return tb - ta
    return a.id.localeCompare(b.id)
  })
}

export function latestEventAt(events: LifecycleEvent[]): string | undefined {
  const sorted = sortEventsDesc(events)
  return sorted[0]?.at
}
