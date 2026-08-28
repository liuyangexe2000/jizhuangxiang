/**
 * 维修报价审批 — Batch D 计划骨架
 */

/** 报价明细行 */
export type RepairQuoteLine = {
  /** 费用项名称，如「更换角柱」「喷漆」 */
  label: string
  /** 数量 */
  qty: number
  /** 单价 */
  unitPrice: number
  /** 小计（可冗余存储，正式实现时由 qty * unitPrice 计算） */
  amount?: number
  /** 备注 */
  remark?: string
}

/** 审批状态 */
export type RepairApprovalStatus =
  | "待报价"
  | "待审批"
  | "已通过"
  | "已驳回"
  | "已撤回"

export const REPAIR_APPROVAL_STATUSES: RepairApprovalStatus[] = [
  "待报价",
  "待审批",
  "已通过",
  "已驳回",
  "已撤回",
]

/** 维修报价单骨架（尚未落库） */
export type RepairQuoteDraft = {
  repairNo: string
  containerNo: string
  lines: RepairQuoteLine[]
  status: RepairApprovalStatus
  totalAmount?: number
  submittedAt?: string
  approvedAt?: string
  approvedBy?: string
  rejectReason?: string
}

/** 汇总报价行金额（骨架工具） */
export function sumRepairQuoteLines(lines: RepairQuoteLine[]): number {
  return lines.reduce((s, line) => {
    const amt =
      line.amount ??
      (Number.isFinite(line.qty) && Number.isFinite(line.unitPrice)
        ? line.qty * line.unitPrice
        : 0)
    return s + amt
  }, 0)
}
