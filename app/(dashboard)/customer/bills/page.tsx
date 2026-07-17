"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import { useRole } from "@/lib/role-context"
import type { Bill, Notification, OutboundEvent } from "@/lib/types"
import { fmtDeadline, isBillOverdue } from "@/lib/domain/order-ops"
import { enqueueOutbound } from "@/lib/domain/outbound"
import { pushNotification } from "@/lib/domain/notify"
import { toast } from "sonner"
import { Wallet, FileWarning, CheckCircle2, Receipt, Printer, PencilLine, Search } from "lucide-react"

const currency = (n: number) =>
  `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusFilters = ["全部", "待确认", "已确认", "有异议", "已支付", "超时默认确认"]

export default function BillsPage() {
  const { roleId, user } = useRole()
  const isOps = roleId === "R01" || roleId === "R00"
  const { data: bills, update } = useResource<Bill>("bills")
  const { create: createNotif } = useResource<Notification>("notifications")
  const { create: createOutbound } = useResource<OutboundEvent>("outboundEvents")
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState("全部")
  const [detail, setDetail] = useState<Bill | null>(null)
  const [disputeFor, setDisputeFor] = useState<Bill | null>(null)
  const [disputeText, setDisputeText] = useState("")
  const [adjustFor, setAdjustFor] = useState<Bill | null>(null)
  const [adjustAmount, setAdjustAmount] = useState("")
  const [adjustNote, setAdjustNote] = useState("")
  const ranBr07 = useRef(false)

  const filtered = useMemo(() => {
    return bills.filter((b) => {
      const matchKw =
        !keyword ||
        b.billNo.includes(keyword) ||
        b.relatedOrderNo.includes(keyword) ||
        b.party.includes(keyword) ||
        b.type.includes(keyword)
      const matchStatus = status === "全部" || b.status === status
      return matchKw && matchStatus
    })
  }, [bills, keyword, status])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "issuedAt",
    defaultSortDir: "desc",
  })

  useEffect(() => {
    if (ranBr07.current || bills.length === 0) return
    const overdue = bills.filter(isBillOverdue)
    if (overdue.length === 0) {
      ranBr07.current = true
      return
    }
    ranBr07.current = true
    void (async () => {
      for (const b of overdue) {
        try {
          await update(b.id, {
            status: "超时默认确认",
            __auditAction: "修改",
            __auditDetail: `BR-07 超时默认确认 ${b.billNo}`,
          })
        } catch {
          /* ignore */
        }
      }
      toast.info(`已按 BR-07 自动确认 ${overdue.length} 张超时账单`)
      await revalidateResource("bills")
    })()
  }, [bills, update])

  const pending = bills.filter((b) => b.status === "待确认").length
  const totalDue = bills.filter((b) => b.status !== "已支付").reduce((s, b) => s + b.amount, 0)
  const paid = bills.filter((b) => b.status === "已支付").length

  async function confirmBill(id: string) {
    try {
      const bill = bills.find((b) => b.id === id)
      await update(id, { status: "已确认", __auditAction: "修改", __auditDetail: "核对确认账单" })
      if (bill) {
        await enqueueOutbound(createOutbound, {
          type: "booking_bill_push",
          relatedNo: bill.billNo,
          payload: {
            billId: bill.id,
            billNo: bill.billNo,
            relatedOrderNo: bill.relatedOrderNo,
            amount: bill.amount,
            status: "已确认",
            party: bill.party,
          },
        })
        await revalidateResource("outboundEvents")
      }
      toast.success("账单已核对确认，已写入订舱出站队列")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function payBill(id: string) {
    try {
      const bill = bills.find((b) => b.id === id)
      await update(id, { status: "已支付", __auditAction: "修改", __auditDetail: "支付账单" })
      if (bill) {
        await enqueueOutbound(createOutbound, {
          type: "booking_bill_push",
          relatedNo: bill.billNo,
          payload: {
            billId: bill.id,
            billNo: bill.billNo,
            relatedOrderNo: bill.relatedOrderNo,
            amount: bill.amount,
            status: "已支付",
            party: bill.party,
          },
        })
        await revalidateResource("outboundEvents")
      }
      toast.success("账款支付成功，出站队列已更新")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function submitDispute() {
    if (!disputeFor) return
    try {
      await update(disputeFor.id, {
        status: "有异议",
        disputeReason: disputeText.slice(0, 200) || undefined,
        __auditAction: "修改",
        __auditDetail: `提交账单异议：${disputeText.slice(0, 50)}`,
      })
      await pushNotification(createNotif, {
        type: "账单",
        level: "重要",
        title: `账单异议 · ${disputeFor.billNo}`,
        desc: disputeText.slice(0, 80) || "客户提交账单异议，请复核。",
        module: "M01 账单中心",
        href: "/customer/bills",
        roles: ["R01"],
      })
      toast.success("异议已提交，箱管部将收到站内通知")
      setDisputeFor(null)
      setDisputeText("")
      await revalidateResource("notifications")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function openAdjust(b: Bill) {
    setAdjustAmount(String(b.amount))
    setAdjustNote("")
    setAdjustFor(b)
  }

  /** BR-22：箱管调整账单金额/说明后重置为待确认，客户须再次确认；循环直至确认/支付或超时默认确认 */
  async function submitAdjust() {
    if (!adjustFor) return
    const amount = Number(adjustAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请填写有效调整后金额")
      return
    }
    const adjustedBy = user?.name || user?.account || "箱管"
    try {
      const nextItems = [
        ...adjustFor.items.filter((it) => it.label !== "箱管调整说明"),
        { label: "箱管调整说明", value: adjustNote.trim() || `金额由 ¥${adjustFor.amount} 调整为 ¥${amount}` },
      ]
      await update(adjustFor.id, {
        amount,
        items: nextItems,
        status: "待确认",
        adjustedBy,
        confirmDeadline: fmtDeadline(new Date(), 72).slice(0, 10),
        __auditAction: "修改",
        __auditDetail: `BR-22 箱管调整账单 ${adjustFor.billNo}：¥${adjustFor.amount}→¥${amount}`,
      })
      await pushNotification(createNotif, {
        type: "账单",
        level: "重要",
        title: `账单已调整，待再次确认 · ${adjustFor.billNo}`,
        desc: `${adjustedBy} 已调整为 ¥${amount.toLocaleString()}，请在 3 天内重新确认。`,
        module: "M01 账单中心",
        href: "/customer/bills",
        roles: ["R03"],
      })
      await revalidateResource("notifications")
      toast.success("账单已调整并重推客户确认")
      setAdjustFor(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M01 · 客户服务与订舱协同门户"
        title="账单中心"
        description="M01-F04 账单核对与结算 — 核对用箱/调运等费用，3 天内确认，超时自动确认（BR-07）。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="待核对账单" value={pending} icon={FileWarning} hint="超时默认确认" tone="warning" />
        <StatCard label="应付金额" value={currency(totalDue)} icon={Wallet} tone="primary" />
        <StatCard label="已支付账单" value={paid} icon={CheckCircle2} tone="success" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索账单号 / 关联单号 / 对方 / 类型"
                className="pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "全部")}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" />
            账单列表
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="账单号" columnKey="billNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="类型" columnKey="type" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="关联单号" columnKey="relatedOrderNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="对方" columnKey="party" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="金额" columnKey="amount" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="开具时间" columnKey="issuedAt" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="截止" columnKey="confirmDeadline" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.billNo}</TableCell>
                    <TableCell>{b.type}</TableCell>
                    <TableCell className="font-mono text-xs">{b.relatedOrderNo}</TableCell>
                    <TableCell>{b.party}</TableCell>
                    <TableCell>{currency(b.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.issuedAt}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.confirmDeadline}</TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDetail(b)}>明细</Button>
                        {!isOps && b.status === "待确认" && (
                          <>
                            <Button size="sm" onClick={() => confirmBill(b.id)}>确认</Button>
                            <Button size="sm" variant="outline" onClick={() => setDisputeFor(b)}>异议</Button>
                          </>
                        )}
                        {!isOps && (b.status === "已确认" || b.status === "超时默认确认") && (
                          <Button size="sm" onClick={() => payBill(b.id)}>支付</Button>
                        )}
                        {isOps && b.status === "有异议" && (
                          <Button size="sm" className="gap-1" onClick={() => openAdjust(b)}>
                            <PencilLine className="size-3.5" />
                            调整账单
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => { setDetail(b); setTimeout(() => window.print(), 200) }}>
                          <Printer className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      未找到匹配的账单
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <ListPagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-lg print:static print:max-h-none print:max-w-none print:translate-x-0 print:translate-y-0 print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none print:ring-0"
        >
          {detail && (
            <>
              <DialogHeader className="no-print">
                <DialogTitle className="font-mono">{detail.billNo}</DialogTitle>
                <DialogDescription>
                  {detail.type} · {detail.party}
                </DialogDescription>
              </DialogHeader>
              <div className="print-area doc-print-sheet space-y-4 bg-white p-2 text-zinc-900 sm:p-0">
                <header className="border-b-2 border-zinc-900 pb-3 text-center">
                  <p className="text-sm text-zinc-600">中欧班列平台公司 · 集装箱管理部</p>
                  <h2 className="mt-1 text-xl font-bold tracking-[0.15em]">用箱账单</h2>
                  <p className="mt-2 font-mono text-xs text-zinc-600">{detail.billNo}</p>
                </header>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr>
                      <th className="w-28 border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                        账单类型
                      </th>
                      <td className="border border-zinc-300 px-3 py-2">{detail.type}</td>
                      <th className="w-28 border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                        客户
                      </th>
                      <td className="border border-zinc-300 px-3 py-2">{detail.party}</td>
                    </tr>
                    <tr>
                      <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                        关联单号
                      </th>
                      <td className="border border-zinc-300 px-3 py-2 font-mono text-xs">
                        {detail.relatedOrderNo}
                      </td>
                      <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                        状态
                      </th>
                      <td className="border border-zinc-300 px-3 py-2">{detail.status}</td>
                    </tr>
                    <tr>
                      <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                        开具时间
                      </th>
                      <td className="border border-zinc-300 px-3 py-2">{detail.issuedAt}</td>
                      <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                        确认截止
                      </th>
                      <td className="border border-zinc-300 px-3 py-2">{detail.confirmDeadline}</td>
                    </tr>
                    <tr>
                      <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                        应付金额
                      </th>
                      <td className="border border-zinc-300 px-3 py-2 font-semibold" colSpan={3}>
                        {currency(detail.amount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div>
                  <p className="mb-2 text-sm font-medium">费用明细</p>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium">
                          项目
                        </th>
                        <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-right font-medium">
                          金额 / 说明
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.label}>
                          <td className="border border-zinc-300 px-3 py-2">{it.label}</td>
                          <td className="border border-zinc-300 px-3 py-2 text-right">{it.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.disputeReason && (
                  <p className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
                    客户异议原因：{detail.disputeReason}
                  </p>
                )}
                {detail.adjustedBy && (
                  <p className="text-xs text-zinc-500">箱管调整人：{detail.adjustedBy}</p>
                )}
                <p className="pt-4 text-xs text-zinc-500">
                  本账单由系统生成，确认后请按约定完成支付。
                </p>
              </div>
              <Button
                className="no-print w-full"
                variant="outline"
                type="button"
                onClick={() => window.print()}
              >
                <Printer className="mr-1 size-4" />
                打印账单
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!disputeFor} onOpenChange={(o) => !o && setDisputeFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交账单异议</DialogTitle>
            <DialogDescription>请说明异议原因，系统将通知箱管部复核。</DialogDescription>
          </DialogHeader>
          <Textarea value={disputeText} onChange={(e) => setDisputeText(e.target.value)} placeholder="异议说明" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeFor(null)}>取消</Button>
            <Button onClick={submitDispute}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustFor} onOpenChange={(o) => !o && setAdjustFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整账单（BR-22）</DialogTitle>
            <DialogDescription>
              {adjustFor?.billNo} · 客户异议：{adjustFor?.disputeReason || "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="adjustAmount">调整后金额 *</Label>
              <Input
                id="adjustAmount"
                type="number"
                min={1}
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">原金额 {adjustFor ? currency(adjustFor.amount) : ""}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjustNote">调整说明</Label>
              <Textarea
                id="adjustNote"
                placeholder="说明调整原因（客户可见）；若维持原金额可在此说明理由"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustFor(null)}>取消</Button>
            <Button onClick={submitAdjust}>调整并重推客户确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
