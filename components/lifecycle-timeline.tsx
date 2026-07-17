"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { LifecycleEvent } from "@/lib/domain/lifecycle-types"
import { cn } from "@/lib/utils"

const KIND_TONE: Record<string, string> = {
  ORDER_CREATED: "bg-blue-500",
  ORDER_CONFIRMED: "bg-emerald-500",
  ORDER_CANCELLED: "bg-slate-400",
  ORDER_PICKUP_GATE: "bg-amber-500",
  ORDER_RETURN_GATE: "bg-teal-500",
  BILL_ISSUED: "bg-violet-500",
  BOOKING_PICKUP: "bg-sky-500",
  BOOKING_RETURN: "bg-cyan-500",
  GATE_OUT: "bg-orange-500",
  GATE_IN: "bg-lime-600",
  ATTACHMENT: "bg-indigo-400",
  REPAIR_OPEN: "bg-rose-500",
  REPAIR_DONE: "bg-emerald-600",
  SCRAP: "bg-red-700",
  RETURN_APPLY: "bg-amber-600",
  RETURN_APPROVED: "bg-green-600",
  RETURN_REJECTED: "bg-red-500",
  SUPPLY_IN: "bg-primary",
  MASTER_CREATED: "bg-muted-foreground",
}

function formatAt(at: string): string {
  if (!at) return "—"
  const d = Date.parse(at)
  if (!Number.isNaN(d)) {
    return new Date(d).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return at
}

export function LifecycleTimeline({
  events,
  emptyText = "暂无业务留痕，仅有主档信息",
}: {
  events: LifecycleEvent[]
  emptyText?: string
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  return (
    <ol className="relative space-y-0 border-l border-border ml-3 pl-6">
      {events.map((ev) => (
        <li key={ev.id} className="relative pb-6 last:pb-0">
          <span
            className={cn(
              "absolute -left-[1.625rem] top-1.5 size-2.5 rounded-full ring-4 ring-background",
              KIND_TONE[ev.kind] ?? "bg-muted-foreground",
            )}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{ev.title}</span>
                <Badge variant="outline" className="h-5 font-mono text-[10px]">
                  {ev.kind}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{ev.summary}</p>
              <p className="text-xs text-muted-foreground/80">{formatAt(ev.at)}</p>
            </div>
            {ev.href && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1"
                nativeButton={false}
                render={<Link href={ev.href} />}
              >
                查看
                <ExternalLink className="size-3.5" />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
