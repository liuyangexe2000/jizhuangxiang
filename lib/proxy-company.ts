/** 代管公司名称归一化：去首尾空白、压缩中间空白、小写比对 */
export function normalizeProxyCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

export function findProxyCompanyByName<T extends { id: string; name: string }>(
  rows: T[],
  name: string,
  excludeId?: string,
): T | undefined {
  const key = normalizeProxyCompanyName(name)
  if (!key) return undefined
  return rows.find(
    (r) => normalizeProxyCompanyName(r.name) === key && (!excludeId || r.id !== excludeId),
  )
}
