/**
 * 提箱箱号解析：确认放箱可不带箱号；事后登记须恰好录满订单箱量。
 */

export function normalizeContainerNos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(
    new Set(
      raw
        .map((x) => (typeof x === "string" ? x.trim().toUpperCase() : ""))
        .filter(Boolean),
    ),
  )
}

/** 事后登记：必须恰好 expectQty 个箱号 */
export function parseRequiredContainerNos(
  body: unknown,
  expectQty: number,
): string[] | { error: string } {
  const nos = normalizeContainerNos((body as { containerNos?: unknown })?.containerNos)
  if (nos.length === 0) {
    return { error: `请录入 ${expectQty} 个提箱箱号` }
  }
  if (nos.length !== expectQty) {
    return { error: `须恰好录入 ${expectQty} 个箱号（当前 ${nos.length} 个）` }
  }
  return nos
}

/**
 * 确认放箱：箱号可选。
 * - 未传或空 → null（随机出场，事后登记）
 * - 有传 → 须恰好 expectQty 个（兼容一次性录完）
 */
export function parseOptionalContainerNos(
  body: unknown,
  expectQty: number,
): string[] | null | { error: string } {
  const raw = (body as { containerNos?: unknown })?.containerNos
  if (raw == null) return null
  if (!Array.isArray(raw) || raw.length === 0) return null
  const nos = normalizeContainerNos(raw)
  if (nos.length !== expectQty) {
    return { error: `若一并录入箱号，须恰好 ${expectQty} 个（当前 ${nos.length} 个）` }
  }
  return nos
}

export function parseOptionalPickupGateAt(body: unknown): string | undefined {
  const raw = (body as { pickupGateAt?: unknown })?.pickupGateAt
  if (typeof raw !== "string") return undefined
  const s = raw.trim().replace("T", " ")
  return s || undefined
}
