import { randomBytes, scryptSync, timingSafeEqual } from "crypto"

/**
 * 密码哈希（scrypt，Node 原生 crypto，无需第三方依赖）
 * 存储格式：scrypt$<salt-hex>$<hash-hex>
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const [, salt, hash] = parts
  const calc = scryptSync(password, salt, 64)
  const orig = Buffer.from(hash, "hex")
  return calc.length === orig.length && timingSafeEqual(calc, orig)
}
