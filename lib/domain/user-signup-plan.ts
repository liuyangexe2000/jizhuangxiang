/**
 * 公开账号申请 — Batch D 计划骨架
 */

export type AccountApplicationStatus = "待审核" | "已通过" | "已驳回"

export interface AccountApplication {
  /** 申请人姓名 */
  name: string
  /** 所属组织 / 公司 */
  org: string
  /** 邮箱 */
  email: string
  /** 手机 */
  phone: string
  /** 申请说明（可选） */
  remark?: string
  /** 审核状态（落库后使用） */
  status?: AccountApplicationStatus
  createdAt?: string
}

export type ValidateApplicationResult = {
  ok: boolean
  errors: string[]
}

/**
 * TODO: 校验必填、邮箱/手机格式、组织是否已存在客户主档等
 */
export function validateApplication(
  app: Partial<AccountApplication>,
): ValidateApplicationResult {
  const errors: string[] = []
  if (!app.name?.trim()) errors.push("请填写姓名")
  if (!app.org?.trim()) errors.push("请填写所属组织")
  if (!app.email?.trim()) errors.push("请填写邮箱")
  if (!app.phone?.trim()) errors.push("请填写手机")
  // TODO: 邮箱/手机格式、重复申请检测、落库审核流
  return { ok: errors.length === 0, errors }
}
