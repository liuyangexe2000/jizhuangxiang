"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useResource, revalidateResource } from "@/lib/api"
import { useRole } from "@/lib/role-context"
import type { DispatchOrder, DispatchStatus, Notification } from "@/lib/types"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import { pushNotification } from "@/lib/domain/notify"
import { CheckCircle2, Clock, XCircle, GitBranch, Layers, FileText, Printer } from "lucide-react"
import { ApprovalFormDocument } from "@/components/dispatch-document"
import { solidTone } from "@/lib/ui-tone"
import { cn } from "@/lib/utils"

const currency = (n: number) => `¥${n.toLocaleString()}`

// 动态审批级别规则（BR-09）
function requiredLevels(total: number) {
  if (total < 20000) return 2
  if (total < 50000) return 3
  return 5
}

export default function ApprovalsPage() {
  const { user, role } = useRole()
  const { data: orders, update } = useResource<DispatchOrder>("dispatch")
  const { create: createNotif } = useResource<Notification>("notifications")
  const [active, setActive] = useState<DispatchOrder | null>(null)
  const [comment, setComment] = useState("")
  const [docOrder, setDocOrder] = useState<DispatchOrder | null>(null)

  const isApproved = (o: DispatchOrder) =>
    ["已审批", "已下发", "还箱中", "已结束", "提箱中"].includes(o.status)

  const inFlow = orders.filter((o) => o.status === "审批中")
  const rejected = orders.filter((o) => o.status === "已驳回")
  const approved = orders.filter((o) => ["已审批", "已下发", "还箱中", "已结束", "提箱中"].includes(o.status))

  async function act(kind: "通过" | "驳回") {
    if (!active) return
    if (kind === "驳回" && !comment.trim()) {
      toast.error("驳回必须填写审批意见")
      return
    }
    const o = active
    const idx = o.approvals.findIndex((a) => a.status === "待审批")
    if (idx === -1) return
    const approvals = o.approvals.map((a, i) =>
      i === idx
        ? { ...a, status: kind, comment: comment || a.comment, time: nowLocalStr() }
        : i === idx + 1 && kind === "通过"
          ? { ...a, status: "待审批" as const }
          : a,
    )
    const allPassed = approvals.filter((a) => a.status !== "未开始").every((a) => a.status === "通过")
    const hasNextPending = approvals.some((a) => a.status === "待审批")
    let status: DispatchStatus = o.status
    if (kind === "驳回") status = "已驳回"
    else if (allPassed && !hasNextPending) status = "已下发"
    try {
      await update(o.id, {
        approvals,
        status,
        __auditAction: "审批",
        __auditDetail: `${kind}调运单 ${o.dispatchNo} 第 ${idx + 1} 级审批`,
      })
      if (status === "已下发") {
        await pushNotification(createNotif, {
          type: "任务",
          level: "重要",
          title: `调运任务已下发 · ${o.dispatchNo}`,
          desc: `${o.carrier} · ${o.pickupPlace} → ${o.returnScope} · ${o.quantity} 箱，请执行提箱任务。`,
          module: "M02 审批中心",
          href: "/dispatch/tasks",
          roles: ["R01", "R05"],
        })
        await Promise.all([revalidateResource("dispatch"), revalidateResource("notifications")])
      } else {
        await revalidateResource("dispatch")
      }
      toast.success(kind === "通过" ? (status === "已下发" ? "审批全部通过，任务已下发承运商" : "已通过当前审批节点，流转至下一级") : "已驳回，流程终止")
      setActive(null)
      setComment("")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M02 · 核心业务与调运管理系统"
        title="审批中心"
        description="M02-F02 多级动态审批引擎 — 依据调运总价自动匹配审批层级，逐级流转、留痕可追溯（BR-09）。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="待我审批"
          value={inFlow.length}
          icon={Clock}
          tone="warning"
          hint={user ? `${role.name} ${user.name}` : undefined}
        />
        <StatCard label="已驳回" value={rejected.length} icon={XCircle} tone="danger" />
        <StatCard label="已通过" value={approved.length} icon={CheckCircle2} tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4.5 text-primary" />
            审批队列
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.map((o) => {
            const need = requiredLevels(o.totalPrice)
            const passed = o.approvals.filter((a) => a.status === "通过").length
            return (
              <div
                key={o.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{o.dispatchNo}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {o.pickupPlace} → {o.returnScope} · {o.quantity} 箱 · 总价 {currency(o.totalPrice)}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <GitBranch className="size-3.5" />
                    需 {need} 级审批 · 已完成 {passed}/{need}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StepDots approvals={o.approvals} />
                  <Button size="sm" variant="outline" onClick={() => setActive(o)}>
                    查看流程
                  </Button>
                  {isApproved(o) && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setDocOrder(o)}>
                      <FileText className="size-3.5" />
                      审批表
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="sm:max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{active.dispatchNo}</DialogTitle>
                <DialogDescription>
                  {active.pickupPlace} → {active.returnScope} · 总价 {currency(active.totalPrice)}
                </DialogDescription>
              </DialogHeader>

              <ol className="relative space-y-4 pl-6">
                {active.approvals.map((a, i) => (
                  <li key={i} className="relative">
                    <span
                      className={cn(
                        "absolute -left-6 top-1 flex size-4 items-center justify-center rounded-full text-[10px]",
                        a.status === "通过"
                          ? solidTone.success
                          : a.status === "驳回"
                            ? solidTone.danger
                            : a.status === "待审批"
                              ? solidTone.warning
                              : solidTone.muted,
                      )}
                    >
                      {a.level}
                    </span>
                    {i < active.approvals.length - 1 && (
                      <span className="absolute -left-[18px] top-5 h-full w-px bg-border" />
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {a.role} · {a.approver}
                        </p>
                        {a.comment && <p className="text-xs text-muted-foreground">意见：{a.comment}</p>}
                        {a.time && <p className="text-xs text-muted-foreground">{a.time}</p>}
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  </li>
                ))}
              </ol>

              {active.status === "审批中" && (
                <>
                  <Separator />
                  <Textarea
                    placeholder="填写审批意见（驳回时必填）"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                  />
                  <DialogFooter className="gap-2">
                    <Button variant="outline" className="gap-1.5" onClick={() => act("驳回")}>
                      <XCircle className="size-4" />
                      驳回
                    </Button>
                    <Button className="gap-1.5" onClick={() => act("通过")}>
                      <CheckCircle2 className="size-4" />
                      通过
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!docOrder} onOpenChange={(open) => !open && setDocOrder(null)}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl print:static print:max-h-none print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none print:ring-0"
        >
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center justify-between">
              <span>调运审批表预览</span>
              <Button size="sm" className="mr-6 gap-1.5" onClick={() => window.print()}>
                <Printer className="size-4" />
                打印 / 导出PDF
              </Button>
            </DialogTitle>
            <DialogDescription>
              全部审批通过后系统自动生成的成品《调运审批表》，可直接打印或导出为 PDF 归档。
            </DialogDescription>
          </DialogHeader>
          {docOrder && <ApprovalFormDocument order={docOrder} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function StepDots({ approvals }: { approvals: DispatchOrder["approvals"] }) {
  return (
    <div className="hidden items-center gap-1 sm:flex">
      {approvals.map((a, i) => (
        <span
          key={i}
          className={`size-2 rounded-full ${
            a.status === "通过"
              ? "bg-success"
              : a.status === "驳回"
                ? "bg-destructive"
                : a.status === "待审批"
                  ? "bg-warning"
                  : "bg-muted"
          }`}
        />
      ))}
    </div>
  )
}
