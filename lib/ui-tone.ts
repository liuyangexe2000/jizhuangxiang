/**
 * 全站语义色调（对比度安全）
 *
 * 规则：
 * - solid*：实心底 + 高对比前景（深底浅字 / 浅底深字已在 CSS 变量中配对）
 * - soft*：浅底 + 同色系深字，用于图标底、弱提示
 *
 * 页面请优先引用本文件，避免手写 bg-xxx text-yyy 导致深/深或浅/浅同色。
 */

export const solidTone = {
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  muted: "bg-muted text-muted-foreground",
  info: "bg-accent text-accent-foreground",
} as const

export const softTone = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-destructive-soft text-destructive-soft-foreground",
  muted: "bg-muted text-muted-foreground",
  info: "bg-accent text-accent-foreground",
} as const

export type SolidTone = keyof typeof solidTone
export type SoftTone = keyof typeof softTone

/** 状态 → 柔和色调（StatusBadge / 弱标签） */
export const statusSoftTone: Record<string, SoftTone> = {
  待确认: "muted",
  已确认: "info",
  已取消: "muted",
  超时取消: "danger",
  提箱中: "warning",
  已提箱: "info",
  还箱中: "warning",
  已完成: "success",
  有异议: "danger",
  已支付: "success",
  超时默认确认: "muted",
  草稿: "muted",
  审批中: "warning",
  已驳回: "danger",
  已审批: "info",
  已下发: "info",
  已结束: "success",
  待审批: "muted",
  通过: "success",
  驳回: "danger",
  未开始: "muted",
  待审核: "muted",
  已通过: "success",
  已映射: "success",
  未映射: "warning",
  异常: "danger",
  待核对: "warning",
  已修正: "success",
  无差异: "success",
  待发送: "muted",
  已通知: "info",
  超时: "danger",
  在场: "success",
  已提未还: "warning",
  在途: "info",
  维修中: "danger",
  已报废: "danger",
  已批准: "success",
  执行中: "info",
  履行中: "info",
  已到期: "muted",
  已终止: "danger",
  待报修: "muted",
  待检验: "warning",
  待验收: "info",
  已完工: "success",
  启用: "success",
  停用: "muted",
  正常: "success",
  延迟: "warning",
  未连接: "muted",
}

/** 集成/审计等实心状态标签 */
export const statusSolidTone: Record<string, SolidTone> = {
  正常: "success",
  延迟: "warning",
  异常: "danger",
  未连接: "muted",
  新增: "success",
  修改: "primary",
  删除: "danger",
  审批: "info",
  登录: "muted",
  代理登录: "warning",
  结束代理: "muted",
}
