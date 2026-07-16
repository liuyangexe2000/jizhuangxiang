/**
 * E2E API 会话测试基建
 * - Cookie 登录
 * - 资源 CRUD
 * - 断言收集与报告
 */

export const BASE_URL = (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "")
export const DEMO_PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!"

export type Fail = { scenario: string; message: string }

export class Client {
  cookie = ""
  account = ""
  roleId = ""
  org = ""

  constructor(public label: string) {}

  async login(account: string, password = DEMO_PASSWORD) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`[${this.label}] 登录失败 ${account}: ${data.error || res.status}`)

    const parts: string[] = []
    const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    if (getSetCookie?.length) {
      for (const c of getSetCookie) parts.push(c.split(";")[0].trim())
    } else {
      const raw = res.headers.get("set-cookie")
      if (raw) {
        // 可能是 "cb_session=...; Path=/; ..., other=..."
        for (const seg of raw.split(/,(?=\s*[^;=]+=[^;]*)/)) {
          const pair = seg.split(";")[0].trim()
          if (pair.includes("=")) parts.push(pair)
        }
      }
    }
    this.cookie = parts.filter((p) => p.startsWith("cb_session=")).join("; ") || parts.join("; ")
    if (!this.cookie.includes("cb_session=")) {
      throw new Error(`[${this.label}] 登录未返回 cb_session Cookie（got: ${parts.join(" | ") || "empty"}）`)
    }
    this.account = account
    this.roleId = data.user?.roleId ?? ""
    this.org = data.user?.org ?? ""
    return data.user
  }

  async api<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    let data: any = null
    const text = await res.text()
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { ok: res.ok, status: res.status, data }
  }

  list(resource: string) {
    return this.api<any[]>("GET", `/api/${resource}`)
  }

  create(resource: string, payload: Record<string, unknown>) {
    return this.api("POST", `/api/${resource}`, payload)
  }

  patch(resource: string, id: string, payload: Record<string, unknown>) {
    return this.api("PATCH", `/api/${resource}/${encodeURIComponent(id)}`, payload)
  }

  del(resource: string, id: string) {
    return this.api("DELETE", `/api/${resource}/${encodeURIComponent(id)}`)
  }
}

export function uid(prefix = "E2E") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
}

export function nowStr() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function pastDeadline(daysAgo = 5) {
  const d = new Date(Date.now() - daysAgo * 86400000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export type ScenarioFn = (ctx: { fail: (msg: string) => void; pass: (msg: string) => void }) => Promise<void>

export async function runScenario(name: string, fn: ScenarioFn): Promise<{ name: string; ok: boolean; fails: string[]; notes: string[] }> {
  const fails: string[] = []
  const notes: string[] = []
  const fail = (msg: string) => fails.push(msg)
  const pass = (msg: string) => notes.push(`✓ ${msg}`)
  try {
    await fn({ fail, pass })
  } catch (e) {
    fails.push(`未捕获异常: ${(e as Error).message}`)
  }
  return { name, ok: fails.length === 0, fails, notes }
}

export function assert(cond: unknown, msg: string, fail: (m: string) => void) {
  if (!cond) fail(msg)
}

export async function expectOk(
  label: string,
  res: { ok: boolean; status: number; data: any },
  fail: (m: string) => void,
) {
  if (!res.ok) {
    fail(`${label} 失败 HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`)
  }
}
