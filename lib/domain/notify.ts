import type { Notification, NotificationLevel, NotificationType, RoleId } from "../types"
import { nowLocalStr } from "./dispatch-ops"

type CreateFn = (payload: Partial<Notification> & Record<string, unknown>) => Promise<unknown>

export async function pushNotification(
  create: CreateFn,
  input: {
    type: NotificationType
    level?: NotificationLevel
    title: string
    desc: string
    module: string
    href: string
    roles: RoleId[]
    actionable?: boolean
    dueAt?: string
  },
) {
  const id = `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  await create({
    id,
    type: input.type,
    level: input.level ?? "普通",
    title: input.title,
    desc: input.desc,
    module: input.module,
    href: input.href,
    roles: input.roles,
    actionable: input.actionable ?? true,
    read: false,
    createdAt: nowLocalStr(),
    dueAt: input.dueAt,
    __auditAction: "新增",
    __auditDetail: `通知：${input.title}`,
  })
}
