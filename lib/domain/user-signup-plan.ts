/**
 * 公开账号申请 — Batch D
 */

import type { AccountApplication, AccountApplicationStatus } from "../types"

export type { AccountApplicationStatus }

export type AccountApplicationInput = Pick<
  AccountApplication,
  "name" | "org" | "email" | "phone" | "remark"
>

export type ValidateApplicationResult = {
  ok: boolean
  errors: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^1[3-9]\d{9}$/

/** 校验必填与格式 */
export function validateApplication(
  app: Partial<AccountApplicationInput>,
): ValidateApplicationResult {
  const errors: string[] = []
  if (!app.name?.trim()) errors.push("请填写姓名")
  if (!app.org?.trim()) errors.push("请填写所属组织")
  if (!app.email?.trim()) errors.push("请填写邮箱")
  else if (!EMAIL_RE.test(app.email.trim())) errors.push("邮箱格式不正确")
  if (!app.phone?.trim()) errors.push("请填写手机")
  else if (!PHONE_RE.test(app.phone.trim().replace(/\s/g, ""))) errors.push("手机号格式不正确")
  return { ok: errors.length === 0, errors }
}

/** 从邮箱前缀或手机生成登录账号 */
export function deriveLoginAccount(email: string, phone: string): string {
  const local = email.split("@")[0]?.trim().toLowerCase()
  if (local) return local.slice(0, 32)
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 6) return digits.slice(-11)
  return `user${Date.now().toString().slice(-6)}`
}

/** 生成随机初始密码（8 位字母数字） */
export function generateInitialPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let s = ""
  for (let i = 0; i < 8; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

export function normalizeApplicationStatus(
  status?: string,
): AccountApplicationStatus {
  if (status === "已通过" || status === "已驳回") return status
  return "待审核"
}
