/**
 * 用箱订单号编码：
 *   UB + YYYYMMDD + 当日流水（4～6 位，从 0001 起）
 * 例：UB202607160001
 *
 * 规则：同一自然日内流水递增；全库唯一。
 */

export const USEBOX_ORDER_NO_RE = /^UB(\d{8})(\d{4,6})$/

export function useBoxOrderNoPrefix(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `UB${y}${m}${d}`
}

export function isValidUseBoxOrderNo(orderNo: unknown): orderNo is string {
  return typeof orderNo === "string" && USEBOX_ORDER_NO_RE.test(orderNo.trim())
}

/** 从已有订单号列表分配下一个当日流水号（纯函数，便于单测） */
export function allocateUseBoxOrderNo(existingNos: Iterable<string>, date = new Date()): string {
  const prefix = useBoxOrderNoPrefix(date)
  let maxSeq = 0
  for (const raw of existingNos) {
    const no = String(raw || "").trim()
    if (!no.startsWith(prefix)) continue
    const m = USEBOX_ORDER_NO_RE.exec(no)
    if (!m || m[1] !== prefix.slice(2)) continue
    const seq = Number(m[2])
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  const next = maxSeq + 1
  if (next > 999_999) {
    throw new Error("当日用箱订单号流水已用尽")
  }
  const width = next <= 9999 ? 4 : next <= 99999 ? 5 : 6
  return `${prefix}${String(next).padStart(width, "0")}`
}

/**
 * 解析创建载荷中的订单号：缺省/重复时分配新号；已提供且唯一则保留（兼容测试与外部同步）。
 */
export function resolveUseBoxOrderNo(
  requested: unknown,
  existingNos: Iterable<string>,
  date = new Date(),
): string {
  const no = typeof requested === "string" ? requested.trim() : ""
  const taken = new Set(Array.from(existingNos, (x) => String(x)))
  if (no && !taken.has(no)) return no
  return allocateUseBoxOrderNo(taken, date)
}
