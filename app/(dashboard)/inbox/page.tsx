"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRole } from "@/lib/role-context"
import { useResource } from "@/lib/api"
import type { Notification, NotificationType } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Bell,
  CheckCheck,
  Clock3,
  CheckSquare,
  Receipt,
  AlarmClock,
  Settings2,
  ArrowRight,
  Inbox as InboxIcon,
} from "lucide-react"
import { toast } from "sonner"
import { softTone } from "@/lib/ui-tone"

const TYPE_META: Record<NotificationType, { icon: typeof Bell; tone: string }> = {
  审批: { icon: CheckSquare, tone: softTone.primary },
  任务: { icon: Bell, tone: softTone.primary },
  账单: { icon: Receipt, tone: softTone.warning },
  时限提醒: { icon: AlarmClock, tone: softTone.danger },
  系统: { icon: Settings2, tone: softTone.muted },
}

const LEVEL_TONE: Record<string, string> = {
  普通: "border-border text-muted-foreground",
  重要: "border-primary/40 text-primary",
  紧急: "border-destructive/40 text-destructive",
}

const FILTERS: { key: string; label: string }[] = [
  { key: "全部", label: "全部" },
  { key: "待办", label: "待办" },
  { key: "审批", label: "审批" },
  { key: "任务", label: "任务" },
  { key: "账单", label: "账单" },
  { key: "时限提醒", label: "时限提醒" },
  { key: "系统", label: "系统" },
]

export default function InboxPage() {
  const { roleId, isAdmin, impersonating } = useRole()
  const { data: items, update } = useResource<Notification>("notifications")
  const [filter, setFilter] = useState("全部")
  const effectiveAdmin = isAdmin && !impersonating

  // 真实管理员可见全部；代理中或其它角色按生效角色过滤
  const visible = useMemo(
    () => items.filter((n) => effectiveAdmin || n.roles.includes(roleId)),
    [items, effectiveAdmin, roleId],
  )

  const filtered = useMemo(() => {
    let list = visible
    if (filter === "待办") list = list.filter((n) => n.actionable && !n.read)
    else if (filter !== "全部") list = list.filter((n) => n.type === filter)
    // 未读优先，其次按时间倒序
    return [...list].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1
      return a.createdAt < b.createdAt ? 1 : -1
    })
  }, [visible, filter])

  const todoCount = visible.filter((n) => n.actionable && !n.read).length
  const unreadCount = visible.filter((n) => !n.read).length
  const urgentCount = visible.filter((n) => n.level === "紧急" && !n.read).length
  const dueSoon = visible.filter((n) => n.dueAt && !n.read).length

  async function markRead(id: string) {
    const target = items.find((n) => n.id === id)
    if (!target || target.read) return
    try {
      await update(id, { read: true, __auditAction: "修改", __auditDetail: "标记通知已读" })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function markAllRead() {
    const unread = visible.filter((n) => !n.read)
    try {
      await Promise.all(
        unread.map((n) => update(n.id, { read: true, __auditAction: "修改", __auditDetail: "标记通知已读" })),
      )
      toast.success("已将全部通知标记为已读")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        module="工作台"
        title="待办与通知中心"
        description="聚合审批、任务、账单与时限提醒，未读与待办优先呈现，可一键跳转至对应业务处理。"
        actions={
          <Button variant="outline" className="gap-1.5" onClick={markAllRead}>
            <CheckCheck className="size-4" />
            全部已读
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="待处理待办" value={todoCount} icon={CheckSquare} tone="primary" />
        <StatCard label="未读通知" value={unreadCount} icon={Bell} tone="primary" />
        <StatCard label="紧急事项" value={urgentCount} icon={AlarmClock} tone="danger" />
        <StatCard label="限时任务" value={dueSoon} icon={Clock3} tone="warning" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-muted-foreground">
            <InboxIcon className="size-10" />
            <p className="text-sm">暂无匹配的通知</p>
          </div>
        )}

        {filtered.map((n) => {
          const meta = TYPE_META[n.type]
          const Icon = meta.icon
          return (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition-colors",
                !n.read && "border-l-4 border-l-primary",
              )}
            >
              <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", meta.tone)}>
                <Icon className="size-5" />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-sm", !n.read ? "font-semibold text-foreground" : "text-foreground")}>
                    {n.title}
                  </p>
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-xs", LEVEL_TONE[n.level])}>
                    {n.level}
                  </Badge>
                  {!n.read && <span className="size-2 rounded-full bg-primary" aria-label="未读" />}
                </div>
                <p className="text-sm text-muted-foreground">{n.desc}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{n.module}</span>
                  <span>·</span>
                  <span>{n.createdAt}</span>
                  {n.dueAt && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-destructive">
                        <Clock3 className="size-3" />
                        处理时限 {n.dueAt}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <Button size="sm" nativeButton={false} render={<Link href={n.href} />} className="gap-1" onClick={() => markRead(n.id)}>
                  {n.actionable ? "去处理" : "查看"}
                  <ArrowRight className="size-3.5" />
                </Button>
                {!n.read && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markRead(n.id)}>
                    标记已读
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
