"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/status-badge"
import { revalidateResource } from "@/lib/api"
import {
  sumRepairQuoteLines,
  type RepairQuoteLine,
} from "@/lib/domain/repair-approval-plan"
import type { RepairOrder } from "@/lib/types"

type Props = {
  order: RepairOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit: boolean
  canApprove: boolean
  onUpdated?: () => void
}

const emptyLine = (): RepairQuoteLine => ({
  label: "",
  qty: 1,
  unitPrice: 0,
})

export function RepairQuoteDialog({
  order,
  open,
  onOpenChange,
  canEdit,
  canApprove,
  onUpdated,
}: Props) {
  const [lines, setLines] = useState<RepairQuoteLine[]>([emptyLine()])
  const [rejectReason, setRejectReason] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!order || !open) return
    const src = order.quoteLines?.length ? order.quoteLines : [emptyLine()]
    setLines(src.map((l) => ({ ...l })))
    setRejectReason("")
  }, [order, open])

  const total = useMemo(() => sumRepairQuoteLines(lines), [lines])
  const quoteStatus = order?.quoteStatus || "待报价"
  const editable =
    canEdit && (quoteStatus === "待报价" || quoteStatus === "已驳回" || !order?.quoteStatus)

  function setLine(index: number, patch: Partial<RepairQuoteLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  async function postQuote(action: string, extra?: Record<string, unknown>) {
    if (!order) return
    setBusy(true)
    try {
      const res = await fetch(`/api/repair/${encodeURIComponent(order.id)}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, lines, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "操作失败")
        return
      }
      if (action === "approve" && data.billNo) {
        toast.success(`审批通过，已生成维修费账单 ${data.billNo}`)
      } else if (action === "submit") {
        toast.success("报价已提交，等待箱管审批")
      } else if (action === "reject") {
        toast.success("已驳回报价")
      } else {
        toast.success("报价已保存")
      }
      await revalidateResource("repair")
      await revalidateResource("bills")
      onUpdated?.()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  if (!order) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>修箱报价 · {order.repairNo}</DialogTitle>
          <DialogDescription>
            {order.containerNo} · {order.yard}
            {order.quoteStatus && (
              <span className="ml-2 inline-flex align-middle">
                <StatusBadge status={order.quoteStatus} />
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {order.quoteStatus === "已驳回" && order.quoteRejectReason && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            驳回原因：{order.quoteRejectReason}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>费用明细</Label>
            {editable && (
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus className="mr-1 size-3.5" />
                增行
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <Label className="text-xs">费用项</Label>
                  <Input
                    disabled={!editable}
                    value={line.label}
                    onChange={(e) => setLine(index, { label: e.target.value })}
                    placeholder="如更换角柱"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">数量</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    disabled={!editable}
                    value={line.qty}
                    onChange={(e) => setLine(index, { qty: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-xs">单价</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!editable}
                    value={line.unitPrice}
                    onChange={(e) => setLine(index, { unitPrice: Number(e.target.value) })}
                  />
                </div>
                <div className="sm:col-span-2 text-sm font-medium">
                  小计 ¥{(line.qty * line.unitPrice || 0).toLocaleString()}
                </div>
                {editable && lines.length > 1 && (
                  <div className="sm:col-span-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setLines((p) => p.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-right text-sm font-semibold">合计 ¥{total.toLocaleString()}</p>
        </div>

        {order.quoteStatus === "待审批" && canApprove && (
          <div className="space-y-1.5">
            <Label>驳回原因（驳回时必填）</Label>
            <Textarea
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请说明驳回原因"
            />
          </div>
        )}

        {order.quoteStatus === "已通过" && order.quoteApprovedBy && (
          <p className="text-sm text-muted-foreground">
            {order.quoteApprovedBy} 于 {order.quoteApprovedAt} 审批通过
          </p>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {editable && (
            <>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void postQuote("save")}>
                保存草稿
              </Button>
              <Button type="button" disabled={busy} onClick={() => void postQuote("submit")}>
                提交审批
              </Button>
            </>
          )}
          {order.quoteStatus === "待审批" && canApprove && (
            <>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void postQuote("reject", { rejectReason })}
              >
                驳回
              </Button>
              <Button type="button" disabled={busy} onClick={() => void postQuote("approve")}>
                审批通过
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
