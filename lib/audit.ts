import "server-only"
import { create } from "./repo"
import type { SessionPayload } from "./session"
import type { AuditAction } from "./types"

function now(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(
    d.getSeconds(),
  )}`
}

interface AuditInput {
  session: SessionPayload | null
  action: AuditAction
  module: string
  target: string
  detail: string
  ip?: string
}

/** 写入一条操作日志（代理登录时记录真实管理员） */
export async function writeAudit({ session, action, module, target, detail, ip }: AuditInput) {
  try {
    const proxied = !!session?.real
    await create("audit", {
      time: now(),
      operator: session?.name ?? "匿名",
      operatorRole: session?.roleId ?? "R00",
      action,
      module,
      target,
      detail,
      ip: ip ?? "-",
      proxied,
      proxyBy: proxied ? session?.real?.name : null,
    })
  } catch (e) {
    console.log("[v0] writeAudit failed:", (e as Error).message)
  }
}

export { now as auditNow }
