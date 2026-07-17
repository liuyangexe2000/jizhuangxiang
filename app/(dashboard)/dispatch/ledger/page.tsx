"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useResource, revalidateResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { Bill, BillStatus, DispatchOrder, OutboundEvent } from "@/lib/types"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import { enqueueOutbound } from "@/lib/domain/outbound"
import { downloadCsv } from "@/lib/csv"
import { BookOpenCheck, Wallet, AlertTriangle, Download, CheckCircle2, Printer } from "lucide-react"

const currency = (n: number) => `¥${n.toLocaleString()}`

type LedgerKind = "调运费账单" | "超期费账单"
type RowStatus = "待生成" | BillStatus

interface LedgerEntry {
  id: string
  billId?: string
  billNo?: string
  dispatchNo: string
  type: LedgerKind
  carrier: string
  amount: number
  quantity: number
  status: RowStatus
  note: string
  issuedAt?: string
  /** 待生成时用于创建账单的估算参数 */
  estimateDays?: number
  rate?: number
}

function parseOverdueRate(standard: string): number {
  const m = standard.match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : 120
}

/** 按用箱期与还箱进度估算超期天数 */
function estimateOverdueDays(o: DispatchOrder): number {
  const remainRatio = 1 - o.returnedCount / Math.max(1, o.quantity)
  const byProgress = Math.max(1, Math.ceil(o.useTerm * remainRatio * 0.25))
  const planMs = Date.parse(o.planTime.replace(/-/g, "/"))
  if (Number.isFinite(planMs)) {
    const dueMs = planMs + o.useTerm * 86400000
    const calendarDays = Math.ceil((Date.now() - dueMs) / 86400000)
    if (calendarDays > 0) return Math.max(calendarDays, byProgress)
  }
  return byProgress
}

function confirmDeadline(days = 3) {
  const d = new Date(Date.now() + days * 86400000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function isDispatchBill(b: Bill) {
  return b.type === "调运费账单" || b.type === "超期费账单"
}

export default function LedgerPage() {
  const { data: dispatchOrders } = useResource<DispatchOrder>("dispatch")
  const { data: bills, create: createBill, update: updateBill } = useResource<Bill>("bills")
  const { create: createOutbound } = useResource<OutboundEvent>("outboundEvents")
  const [tab, setTab] = useState("all")

  const dispatchNos = useMemo(
    () =>
      new Set(
        dispatchOrders
          .filter((o) => ["已下发", "提箱中", "还箱中", "已结束"].includes(o.status))
          .map((o) => o.dispatchNo),
      ),
    [dispatchOrders],
  )

  const entries = useMemo<LedgerEntry[]>(() => {
    const list: LedgerEntry[] = []
    const byDispatch = new Map(
      [...dispatchNos].map((no) => [no, dispatchOrders.find((o) => o.dispatchNo === no)!] as const),
    )

    // 持久化账单（关联调运单号）
    for (const b of bills) {
      if (!isDispatchBill(b)) continue
      if (!dispatchNos.has(b.relatedOrderNo) && !byDispatch.has(b.relatedOrderNo)) {
        // 仍展示已落库且类型为调运相关的账单
        if (!b.relatedOrderNo.startsWith("DP")) continue
      }
      const o = byDispatch.get(b.relatedOrderNo)
      list.push({
        id: b.id,
        billId: b.id,
        billNo: b.billNo,
        dispatchNo: b.relatedOrderNo,
        type: b.type as LedgerKind,
        carrier: o?.carrier ?? b.party,
        amount: b.amount,
        quantity: o?.quantity ?? 0,
        status: b.status,
        note: b.items.map((i) => `${i.label}:${i.value}`).join(" · ") || b.billNo,
        issuedAt: b.issuedAt,
      })
    }

    // 尚无调运费账单的执行中/已结束任务 → 待生成
    for (const o of dispatchOrders) {
      if (!["已下发", "提箱中", "还箱中", "已结束"].includes(o.status)) continue
      const hasFreight = bills.some(
        (b) => b.relatedOrderNo === o.dispatchNo && b.type === "调运费账单",
      )
      if (!hasFreight) {
        list.push({
          id: `${o.id}-freight-pending`,
          dispatchNo: o.dispatchNo,
          type: "调运费账单",
          carrier: o.carrier,
          amount: o.totalPrice,
          quantity: o.quantity,
          status: "待生成",
          note: `${o.unitPrice}/箱 × ${o.quantity} 箱`,
        })
      }

      const remain = o.quantity - o.returnedCount
      const hasOverdue = bills.some(
        (b) => b.relatedOrderNo === o.dispatchNo && b.type === "超期费账单",
      )
      if (!hasOverdue && o.status === "还箱中" && remain > 0) {
        const rate = parseOverdueRate(o.overdueStandard)
        const days = estimateOverdueDays(o)
        list.push({
          id: `${o.id}-overdue-pending`,
          dispatchNo: o.dispatchNo,
          type: "超期费账单",
          carrier: o.carrier,
          amount: remain * rate * days,
          quantity: remain,
          status: "待生成",
          note: `${remain} 箱 × ¥${rate}/箱/天 × 估 ${days} 天 · ${o.overdueStandard}`,
          estimateDays: days,
          rate,
        })
      }
    }

    return list
  }, [bills, dispatchOrders, dispatchNos])

  const dispatchFees = useMemo(() => entries.filter((e) => e.type === "调运费账单"), [entries])
  const overdueFees = useMemo(() => entries.filter((e) => e.type === "超期费账单"), [entries])
  const totalDispatch = dispatchFees.reduce((s, e) => s + e.amount, 0)
  const totalOverdue = overdueFees.reduce((s, e) => s + e.amount, 0)
  const visible = useMemo(
    () => (tab === "all" ? entries : tab === "dispatch" ? dispatchFees : overdueFees),
    [tab, entries, dispatchFees, overdueFees],
  )

  const list = useListQuery({
    data: visible,
    defaultSortKey: "issuedAt",
    defaultSortDir: "desc",
  })

  async function generateBill(e: LedgerEntry) {
    if (e.status !== "待生成") return
    const o = dispatchOrders.find((d) => d.dispatchNo === e.dispatchNo)
    if (!o) {
      toast.error("未找到关联调运单")
      return
    }
    const issuedAt = nowLocalStr().slice(0, 10)
    try {
      if (e.type === "调运费账单") {
        await createBill({
          billNo: `BILL-DISP-${Date.now().toString().slice(-8)}`,
          type: "调运费账单",
          relatedOrderNo: o.dispatchNo,
          party: o.carrier,
          amount: o.totalPrice,
          status: "待确认",
          issuedAt,
          confirmDeadline: confirmDeadline(3),
          items: [
            { label: "单价", value: `¥${o.unitPrice}` },
            { label: "箱量", value: `${o.quantity}` },
            { label: "线路", value: `${o.pickupPlace}→${o.returnScope}` },
            { label: "合计", value: currency(o.totalPrice) },
          ],
          __auditAction: "新增",
          __auditDetail: `生成调运费账单 ${o.dispatchNo}`,
        })
      } else {
        const rate = e.rate ?? parseOverdueRate(o.overdueStandard)
        const days = e.estimateDays ?? estimateOverdueDays(o)
        const qty = e.quantity
        const amount = qty * rate * days
        await createBill({
          billNo: `BILL-OD-${Date.now().toString().slice(-8)}`,
          type: "超期费账单",
          relatedOrderNo: o.dispatchNo,
          party: o.carrier,
          amount,
          status: "待确认",
          issuedAt,
          confirmDeadline: confirmDeadline(3),
          items: [
            { label: "超期箱量", value: `${qty}` },
            { label: "超期标准", value: `¥${rate}/箱/天` },
            { label: "估算天数", value: `${days}` },
            { label: "合计", value: currency(amount) },
          ],
          __auditAction: "新增",
          __auditDetail: `生成超期费账单 ${o.dispatchNo}`,
        })
      }
      await revalidateResource("bills")
      toast.success(`${e.type}已生成`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function settleOrDownload(e: LedgerEntry) {
    if (!e.billId) return
    if (e.status === "已支付") {
      toast.info(`账单 ${e.billNo} 已支付，可打印归档`)
      window.print()
      return
    }
    try {
      await updateBill(e.billId, {
        status: "已支付",
        __auditAction: "修改",
        __auditDetail: `核销账单 ${e.billNo ?? e.dispatchNo}`,
      })
      await enqueueOutbound(createOutbound, {
        type: "booking_bill_push",
        relatedNo: e.billNo || e.dispatchNo,
        payload: {
          billId: e.billId,
          billNo: e.billNo,
          dispatchNo: e.dispatchNo,
          type: e.type,
          amount: e.amount,
          carrier: e.carrier,
        },
      })
      await Promise.all([revalidateResource("bills"), revalidateResource("outboundEvents")])
      void fetch("/api/outbound/flush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      }).then(() => revalidateResource("outboundEvents"))
      toast.success(`账单 ${e.billNo} 已核销，并写入出站队列尝试投递`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function statusLabel(s: RowStatus) {
    if (s === "待生成") return "待生成"
    if (s === "已支付") return "已核销"
    return s
  }

  function exportLedgerCsv() {
    const headers = ["调运单号", "类型", "承运商", "箱量", "金额", "状态", "账单号", "备注"]
    const rows = entries.map((e) => [
      e.dispatchNo,
      e.type,
      e.carrier,
      e.quantity,
      e.amount,
      statusLabel(e.status),
      e.billNo ?? "",
      e.note,
    ])
    const stamp = nowLocalStr().replace(/[:\s]/g, "").slice(0, 12)
    downloadCsv(`调运台账_${stamp}.csv`, headers, rows)
    toast.success(`已导出 ${entries.length} 条台账 CSV`)
  }

  return (
    <>
      <PageHeader
        module="M02 · 核心业务与调运管理系统"
        title="账单台账"
        description="M02-F05 调运费/超期费账单与台账 — 系统按调运任务与还箱情况自动生成账单，形成可核销台账。"
        actions={
          <Button variant="outline" className="gap-1.5" onClick={exportLedgerCsv}>
            <Download className="size-4" />
            导出台账 CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="调运费合计" value={currency(totalDispatch)} icon={Wallet} tone="primary" />
        <StatCard
          label="超期费合计"
          value={currency(totalOverdue)}
          icon={AlertTriangle}
          tone="warning"
          hint={`${overdueFees.filter((e) => e.status === "待生成").length} 条待生成`}
        />
        <StatCard label="台账条目" value={entries.length} icon={BookOpenCheck} tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">账单台账明细</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab((v as typeof tab) ?? tab)} className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">全部（{entries.length}）</TabsTrigger>
              <TabsTrigger value="dispatch">调运费（{dispatchFees.length}）</TabsTrigger>
              <TabsTrigger value="overdue">超期费（{overdueFees.length}）</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="m-0">
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="调运单号" columnKey="dispatchNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="账单类型" columnKey="type" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="承运商" columnKey="carrier" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="计费说明" columnKey="note" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="金额" columnKey="amount" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.total === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                          暂无台账条目
                        </TableCell>
                      </TableRow>
                    ) : (
                      list.rows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono text-xs font-medium">{e.dispatchNo}</TableCell>
                          <TableCell>
                            <Badge variant={e.type === "调运费账单" ? "secondary" : "destructive"}>
                              {e.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{e.carrier}</TableCell>
                          <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                            {e.note}
                          </TableCell>
                          <TableCell className="font-medium">{currency(e.amount)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                e.status === "已支付"
                                  ? "border-success/40 text-success"
                                  : e.status === "待生成"
                                    ? "border-warning/50 text-warning-foreground"
                                    : ""
                              }
                            >
                              {statusLabel(e.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {e.status === "待生成" ? (
                              <Button size="sm" variant="ghost" onClick={() => generateBill(e)}>
                                生成账单
                              </Button>
                            ) : e.status === "已支付" ? (
                              <Button size="sm" variant="ghost" className="gap-1" onClick={() => settleOrDownload(e)}>
                                <Printer className="size-3.5" />
                                下载
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="gap-1" onClick={() => settleOrDownload(e)}>
                                <CheckCircle2 className="size-3.5" />
                                核销
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  )
}
