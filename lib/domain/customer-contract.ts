/**
 * 客户用箱合同有效期：控制到期/停用客户不可再提交用箱申请。
 */

import type { Customer } from "../types"

export type CustomerContractStatus = "未配置" | "未开始" | "有效" | "已到期" | "已停用"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** 本地日历日 YYYY-MM-DD */
export function todayYmd(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function normalizeContractDate(value?: string | null): string {
  const v = (value ?? "").trim()
  if (!v) return ""
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] ?? ""
}

export function formatContractPeriod(c: Pick<Customer, "contractStart" | "contractEnd">): string {
  const start = normalizeContractDate(c.contractStart)
  const end = normalizeContractDate(c.contractEnd)
  if (!start && !end) return "未配置"
  if (start && end) return `${start} ~ ${end}`
  if (start) return `${start} 起`
  return `至 ${end}`
}

export function getCustomerContractStatus(
  c: Pick<Customer, "enabled" | "deleted" | "contractStart" | "contractEnd">,
  today = todayYmd(),
): CustomerContractStatus {
  if (c.deleted || !c.enabled) return "已停用"
  const start = normalizeContractDate(c.contractStart)
  const end = normalizeContractDate(c.contractEnd)
  if (!start && !end) return "未配置"
  if (start && today < start) return "未开始"
  if (end && today > end) return "已到期"
  return "有效"
}

export type CustomerApplyGate =
  | { ok: true; status: CustomerContractStatus }
  | { ok: false; status: CustomerContractStatus; message: string; description?: string }

/** 是否允许提交用箱申请（未配置起止日时兼容放行；已配置则严格按日校验） */
export function assertCustomerCanApply(
  c: Pick<Customer, "name" | "abbreviation" | "enabled" | "deleted" | "contractStart" | "contractEnd"> | null | undefined,
  today = todayYmd(),
): CustomerApplyGate {
  if (!c) {
    return {
      ok: false,
      status: "未配置",
      message: "未匹配到客户主档",
      description: "请确认申请客户名称与主档全称/简称一致，并维护合同有效期",
    }
  }
  const status = getCustomerContractStatus(c, today)
  const label = c.abbreviation || c.name
  if (status === "已停用") {
    return {
      ok: false,
      status,
      message: `客户「${label}」已停用，无法申请用箱`,
    }
  }
  if (status === "未开始") {
    return {
      ok: false,
      status,
      message: `客户「${label}」合同尚未生效`,
      description: `合同期 ${formatContractPeriod(c)}`,
    }
  }
  if (status === "已到期") {
    return {
      ok: false,
      status,
      message: `客户「${label}」合同已到期，无法申请用箱`,
      description: `合同期 ${formatContractPeriod(c)}，请续签后再申请`,
    }
  }
  return { ok: true, status }
}
