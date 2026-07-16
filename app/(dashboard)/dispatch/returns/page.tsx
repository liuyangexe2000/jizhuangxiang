"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import type { ContainerMaster, DispatchOrder, GateRecord, InventoryRow, ReturnApplication } from "@/lib/types"
import {
  applyReturnInventory,
  buildReturnGate,
  findInventoryRow,
  patchContainerOnReturn,
} from "@/lib/domain/dispatch-ops"
import { PackageCheck, Clock, XCircle, CheckCircle2, Container, Link2 } from "lucide-react"

export default function ReturnsPage() {
  const { data: apps, update } = useResource<ReturnApplication>("returns")
  const { data: orders, update: updateDispatch } = useResource<DispatchOrder>("dispatch")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { create: createGate } = useResource<GateRecord>("gate")
  const { data: containers, update: updateContainer } = useResource<ContainerMaster>("containers")
  const [reviewing, setReviewing] = useState<ReturnApplication | null>(null)
  const [reason, setReason] = useState("")

  const pending = apps.filter((a) => a.status === "待审核")
  const approved = apps.filter((a) => a.status === "已通过")
  const rejected = apps.filter((a) => a.status === "已驳回")

  async function review(kind: "已通过" | "已驳回") {
    if (!reviewing) return
    if (kind === "已驳回" && !reason.trim()) {
      toast.error("驳回需填写原因")
      return
    }
    try {
      await update(reviewing.id, {
        status: kind,
        reviewer: "张伟(调运专员)",
        rejectReason: kind === "已驳回" ? reason : undefined,
        __auditAction: "审批",
        __auditDetail: `${kind}还箱申请 ${reviewing.applyNo}`,
      })

      if (kind === "已通过") {
        const qty = reviewing.containerNos.length
        const related = orders.filter((o) => reviewing.relatedDispatchNos.includes(o.dispatchNo))

        // 按关联调运单分摊还箱数量
        let remain = qty
        for (const o of related) {
          if (remain <= 0) break
          const canReturn = Math.max(0, o.pickedCount - o.returnedCount)
          const add = Math.min(canReturn, remain)
          const returnedCount = Math.min(o.quantity, o.returnedCount + add)
          const status: DispatchOrder["status"] =
            returnedCount >= o.quantity ? "已结束" : o.status === "提箱中" || o.status === "已下发" ? "还箱中" : o.status
          await updateDispatch(o.id, {
            returnedCount,
            status,
            __auditAction: "修改",
            __auditDetail: `还箱回写 ${o.dispatchNo}：${returnedCount}/${o.quantity}`,
          })
          remain -= add
        }

        for (const no of reviewing.containerNos) {
          await createGate({
            ...buildReturnGate(no, reviewing),
            __auditAction: "新增",
            __auditDetail: `还箱进场 ${no}`,
          })
          const c = containers.find((x) => x.containerNo === no)
          if (c) {
            await updateContainer(no, {
              ...patchContainerOnReturn(c, reviewing.returnYard, reviewing.returnCity),
              __auditAction: "修改",
              __auditDetail: `还箱更新主档 ${no}`,
            })
          }
        }

        const inv = findInventoryRow(inventory, { yard: reviewing.returnYard, city: reviewing.returnCity })
        if (inv?.id) {
          await updateInventory(inv.id, {
            ...applyReturnInventory(inv, qty),
            __auditAction: "修改",
            __auditDetail: `还箱回补库存 ${reviewing.returnYard} ×${qty}`,
          })
        } else {
          toast.warning(`未找到还箱堆场「${reviewing.returnYard}」库存台账，已记进场未回补库存`)
        }

        await Promise.all([
          revalidateResource("dispatch"),
          revalidateResource("gate"),
          revalidateResource("inventory"),
          revalidateResource("containers"),
          revalidateResource("returns"),
        ])
        toast.success("还箱申请已通过，已回写调运进度并生成进场记录")
      } else {
        toast.success("还箱申请已驳回")
      }

      setReviewing(null)
      setReason("")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M02 · 核心业务与调运管理系统"
        title="还箱审核"
        description="M02-F04 还箱申请与审核 — 承运商发起跨订单还箱申请，调运专员核对箱号后审核放行。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="待审核" value={pending.length} icon={Clock} tone="warning" />
        <StatCard label="已通过" value={approved.length} icon={CheckCircle2} tone="success" />
        <StatCard label="已驳回" value={rejected.length} icon={XCircle} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {apps.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="font-mono">{a.applyNo}</span>
                  <StatusBadge status={a.status} />
                </CardTitle>
                <span className="text-xs text-muted-foreground">{a.appliedAt}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="承运商" value={a.carrier} />
                <Info label="还箱地点" value={`${a.returnCity} · ${a.returnYard}`} />
              </div>

              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Container className="size-3.5" /> 还箱箱号（{a.containerNos.length}）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.containerNos.map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono text-xs">{c}</Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link2 className="size-3.5" /> 关联调运订单（支持跨订单）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.relatedDispatchNos.map((d) => (
                    <Badge key={d} variant="outline" className="font-mono text-xs">{d}</Badge>
                  ))}
                </div>
              </div>

              {a.rejectReason && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  驳回原因：{a.rejectReason}
                </p>
              )}

              <Separator />

              {a.status === "待审核" ? (
                <Button size="sm" className="gap-1.5" onClick={() => setReviewing(a)}>
                  <PackageCheck className="size-4" />
                  审核
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {a.reviewer ? `审核人：${a.reviewer}` : "已处理"}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>审核还箱申请 {reviewing?.applyNo}</DialogTitle>
            <DialogDescription>核对箱号与关联调运单后通过或驳回。通过后将回写调运还箱进度并生成进场记录。</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="驳回时必填原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => review("已驳回")}>驳回</Button>
            <Button onClick={() => review("已通过")}>通过</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  )
}
