/**
 * 会话令牌 —— 使用 Web Crypto HMAC-SHA256 签名（兼容 Node 与 Edge/中间件运行时）
 * 令牌格式： base64url(payloadJSON).base64url(hmac)
 */

export interface SessionUser {
  uid: string
  account: string
  name: string
  roleId: string
  /** 组织归属，用于行级多租户过滤（对齐 users.org） */
  org?: string
}

export interface SessionPayload extends SessionUser {
  /** 代理登录时的真实（管理员）身份；未代理时为空 */
  real?: SessionUser
  exp: number
}

export const SESSION_COOKIE = "cb_session"
const MAX_AGE_SEC = 60 * 60 * 12 // 12 小时

function getSecret() {
  return process.env.APP_SECRET ?? "dev-insecure-secret-change-me"
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4))
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmacKey() {
  const enc = new TextEncoder()
  return crypto.subtle.importKey("raw", enc.encode(getSecret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])
}

export async function signSession(user: SessionUser & { real?: SessionUser }): Promise<string> {
  const payload: SessionPayload = { ...user, exp: Date.now() + MAX_AGE_SEC * 1000 }
  const enc = new TextEncoder()
  const payloadBytes = enc.encode(JSON.stringify(payload))
  const payloadPart = b64urlEncode(payloadBytes)
  const key = await hmacKey()
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payloadPart)))
  return `${payloadPart}.${b64urlEncode(sig)}`
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null
  const [payloadPart, sigPart] = token.split(".")
  try {
    const enc = new TextEncoder()
    const key = await hmacKey()
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sigPart), enc.encode(payloadPart))
    if (!ok) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadPart))) as SessionPayload
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export const SESSION_MAX_AGE = MAX_AGE_SEC
