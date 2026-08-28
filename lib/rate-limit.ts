/**
 * 简易内存限流（单实例生产够用；多实例可换 Redis）
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    b = { count: 1, resetAt: now + windowMs }
    buckets.set(key, b)
    return { ok: true }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  }
  b.count += 1
  return { ok: true }
}

/** 从请求取客户端 IP（与 audit 一致） */
export function clientIpFromRequest(req: { headers: { get(name: string): string | null } }) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}
