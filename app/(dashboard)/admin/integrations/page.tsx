"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Plug,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  CircleSlash,
  Timer,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useResource, revalidateResource } from "@/lib/api"
import type { Integration, IntegrationStatus, OutboundEvent } from "@/lib/types"
import { markDelivered } from "@/lib/domain/outbound"

import { solidTone } from "@/lib/ui-tone"

const STATUS_META: Record<
  IntegrationStatus,
  { tone: string; dot: string; icon: typeof CheckCircle2 }
> = {
  正常: { tone: solidTone.success, dot: "bg-success-foreground/80", icon: CheckCircle2 },
  延迟: { tone: solidTone.warning, dot: "bg-warning-foreground/80", icon: Timer },
  异常: { tone: solidTone.danger, dot: "bg-destructive-foreground/80", icon: AlertTriangle },
  未连接: { tone: solidTone.muted, dot: "bg-muted-foreground", icon: CircleSlash },
}

const DIRECTION_META = {
  接收: { icon: ArrowDownToLine, label: "接收" },
  推送: { icon: ArrowUpFromLine, label: "推送" },
  双向: { icon: ArrowLeftRight, label: "双向" },
}

export default function IntegrationsPage() {
  const { data: items, mutate } = useResource<Integration>("integrations")
  const { data: outbound, update: updateOutbound, mutate: mutateOutbound } =
    useResource<OutboundEvent>("outboundEvents")
  const [syncing, setSyncing] = useState<string | null>(null)
  const [delivering, setDelivering] = useState<string | null>(null)
  const [flushing, setFlushing] = useState(false)

  const stats = useMemo(() => {
    const total = items.length
    const healthy = items.filter((i) => i.status === "正常").length
    const abnormal = items.filter((i) => i.status === "异常" || i.status === "延迟").length
    const pending =
      items.reduce((s, i) => s + i.pending, 0) +
      outbound.filter((e) => e.status === "pending" || e.status === "failed").length
    return { total, healthy, abnormal, pending }
  }, [items, outbound])

  const queueOutbound = useMemo(
    () =>
      outbound
        .filter((e) => e.status === "pending" || e.status === "failed")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [outbound],
  )

  async function syncNow(it: Integration) {
    if (it.status === "未连接") {
      toast.error(`${it.name} 尚未连接，无法同步`)
      return
    }
    setSyncing(it.id)
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(it.id)}/sync`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "同步失败")
      await mutate()
      await revalidateResource("notifications")
      if (it.category === "订舱平台") {
        await revalidateResource("orders")
        const r = data.result
        toast.success(
          `订舱 HTTP 同步完成：拉取 ${r?.fetched ?? 0}，新建 ${r?.created ?? 0}，跳过 ${r?.skipped ?? 0}`,
        )
      } else if (it.category === "代管公司") {
        await revalidateResource("discrepancy")
        toast.success(
          `代管对账完成：更新 ${data.result?.updated ?? 0}，新建 ${data.result?.created ?? 0}`,
        )
      } else {
        toast.success("同步完成")
      }
    } catch (e) {
      toast.error((e as Error).message)
      await mutate()
    } finally {
      setSyncing(null)
    }
  }

  async function deliverOutbound(ev: OutboundEvent) {
    setDelivering(ev.id)
    try {
      const res = await fetch(`/api/outbound/${encodeURIComponent(ev.id)}/deliver`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "投递失败")
      await mutateOutbound()
      const dry = data.result?.dryRun ? "（本地 echo）" : ""
      toast.success(`已 HTTP 投递 ${ev.relatedNo}${dry}`)
    } catch (e) {
      toast.error((e as Error).message)
      await mutateOutbound()
    } finally {
      setDelivering(null)
    }
  }

  async function flushOutbound() {
    setFlushing(true)
    try {
      const res = await fetch("/api/outbound/flush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "批量投递失败")
      await mutateOutbound()
      toast.success(`批量投递完成：成功 ${data.delivered ?? 0}，失败 ${data.failed ?? 0}`)
    } catch (e) {
      toast.error((e as Error).message)
      await mutateOutbound()
    } finally {
      setFlushing(false)
    }
  }

  async function markOutboundDelivered(ev: OutboundEvent) {
    try {
      await markDelivered(updateOutbound, ev.id)
      await mutateOutbound()
      toast.success(`已手工标记投递 ${ev.relatedNo}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Integration[]>()
    for (const it of items) {
      const arr = map.get(it.category) ?? []
      arr.push(it)
      map.set(it.category, arr)
    }
    return Array.from(map.entries())
  }, [items])

  return (
    <div className="space-y-6">
      <PageHeader
        module="系统管理 · 系统集成"
        title="集成状态面板"
        description="订舱平台经 BOOKING_API_URL 拉取；账单确认写入出站队列，经 BOOKING_OUTBOUND_URL 真实 HTTP 投递（未配置则打本地 echo）。"
        actions={
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={flushing || queueOutbound.length === 0}
            onClick={() => void flushOutbound()}
          >
            <RefreshCw className={cn("size-3.5", flushing && "animate-spin")} />
            {flushing ? "投递中…" : "批量投递出站"}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="接入系统" value={stats.total} icon={Plug} tone="primary" />
        <StatCard label="运行正常" value={stats.healthy} icon={CheckCircle2} tone="success" />
        <StatCard label="异常/延迟" value={stats.abnormal} icon={AlertTriangle} tone="danger" />
        <StatCard label="待同步/出站" value={stats.pending} icon={Timer} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">出站事件队列（订舱账单推送）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>关联单号</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>尝试</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueOutbound.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="text-sm">{ev.type}</TableCell>
                    <TableCell className="font-mono text-xs">{ev.relatedNo}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ev.status}</Badge>
                      {ev.lastError && (
                        <p className="mt-1 max-w-[220px] truncate text-xs text-destructive" title={ev.lastError}>
                          {ev.lastError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ev.attempts ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ev.createdAt}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={delivering === ev.id}
                        onClick={() => void deliverOutbound(ev)}
                      >
                        {delivering === ev.id ? "投递中…" : "HTTP 投递"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void markOutboundDelivered(ev)}>
                        手工标记
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {queueOutbound.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      暂无待投递出站事件
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {grouped.map(([category, list]) => (
        <div key={category} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{category}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((it) => {
              const meta = STATUS_META[it.status]
              const StatusIcon = meta.icon
              const DirIcon = DIRECTION_META[it.direction].icon
              return (
                <Card key={it.id}>
                  <CardHeader className="gap-2 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm leading-snug text-pretty">{it.name}</CardTitle>
                      <Badge className={cn("shrink-0 gap-1", meta.tone)}>
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            it.status === "正常" ? "bg-success-foreground" : "bg-current opacity-70",
                          )}
                        />
                        {it.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <DirIcon className="size-3.5" />
                        {DIRECTION_META[it.direction].label}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <StatusIcon className="size-3.5" />
                        成功率 {it.successRate}%
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-muted-foreground text-pretty">{it.desc}</p>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>最近同步 {it.lastSync || "—"}</span>
                      <span>待同步 {it.pending}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      disabled={syncing === it.id || it.status === "未连接"}
                      onClick={() => syncNow(it)}
                    >
                      <RefreshCw className={cn("size-3.5", syncing === it.id && "animate-spin")} />
                      {syncing === it.id ? "同步中…" : "立即同步"}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
