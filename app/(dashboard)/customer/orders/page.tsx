"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Search, XCircle, Clock, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useResource, revalidateResource } from "@/lib/api"
import { getFieldValue, useListQuery } from "@/lib/list-query"
import type { UseBoxOrder } from "@/lib/types"
import { computeCancelOutcome } from "@/lib/domain/order-ops"
import {
  formatExchangeRate,
  formatMoney,
  inferBillCurrency,
} from "@/lib/domain/money"
import { boxSourceLabel } from "@/lib/domain/box-source"

const statusFilters = ["全部", "待确认", "已确认", "提箱中", "还箱中", "已完成", "已取消", "超时取消"]

export default function OrdersPage() {
  const { data: orders } = useResource<UseBoxOrder>("orders")
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState("全部")
  const [detail, setDetail] = useState<UseBoxOrder | null>(null)

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchKw =
        !keyword ||
        o.orderNo.includes(keyword) ||
        o.customer.includes(keyword) ||
        o.pickupCity.includes(keyword) ||
        o.returnCity.includes(keyword)
      const matchStatus = status === "全部" || o.status === status
      return matchKw && matchStatus
    })
  }, [orders, keyword, status])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
    getSortValue: (o, key) => {
      if (key === "route") return `${o.pickupCity}→${o.returnCity}`
      if (key === "amount") {
        const price = ["已确认", "提箱中", "已提箱", "还箱中", "已完成"].includes(o.status)
          ? o.unitPrice
          : o.quotedUnitPrice ?? o.unitPrice
        return price * o.quantity
      }
      if (key === "qty") return o.quantity
      return getFieldValue(o, key)
    },
  })

  const confirmedLike = (o: UseBoxOrder) =>
    ["已确认", "提箱中", "已提箱", "还箱中", "已完成"].includes(o.status)

  function orderCurrencyOf(o: UseBoxOrder) {
    return o.orderCurrency || inferBillCurrency({ city: o.pickupCity })
  }

  async function cancelOrder(o: UseBoxOrder) {
    const preview = computeCancelOutcome(o)
    if (!preview.canCancel) {
      toast.error("当前状态不可取消")
      return
    }
    const { withinFree, isPostPickup } = preview
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(o.id)}/cancel`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "取消失败")
        return
      }
      await Promise.all([
        revalidateResource("orders"),
        revalidateResource("bills"),
        revalidateResource("inventory"),
        revalidateResource("containers"),
        revalidateResource("gate"),
      ])
      if (!withinFree) {
        toast.warning(
          isPostPickup
            ? `订单 ${o.orderNo} 已取消，已生成变更费账单${data.feeBillNo ? ` ${data.feeBillNo}` : ""}`
            : `订单 ${o.orderNo} 已超时取消，取消费账单已生成（BR-03）`,
        )
      } else {
        toast.success(`订单 ${o.orderNo} 已免责取消`)
      }
      setDetail(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        module="M01 · 客户服务与订舱协同门户"
        title="我的订单"
        description="查看用箱申请进度；箱管确认后可查看堆场、成交价与后台备注，并在单据中心打印提箱单。"
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索订单号 / 客户 / 城市"
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
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="订单号" columnKey="orderNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="线路" columnKey="route" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="箱型/数量" columnKey="qty" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="箱源" columnKey="boxSource" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="金额" columnKey="amount" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="创建时间" columnKey="createdAt" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((o) => {
                  const displayPrice = confirmedLike(o) ? o.unitPrice : o.quotedUnitPrice ?? o.unitPrice
                  const currency = orderCurrencyOf(o)
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.pickupCity} → {o.returnCity}
                      </TableCell>
                      <TableCell>
                        {o.containerType} × {o.quantity}
                      </TableCell>
                      <TableCell>
                        {boxSourceLabel(o.boxSource) ? (
                          <Badge variant="outline">{o.boxSource}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{formatMoney(displayPrice * o.quantity, currency)}</TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{o.createdAt}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetail(o)}>
                          详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      未找到匹配的订单
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
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{detail.orderNo}</DialogTitle>
                <DialogDescription>
                  {detail.customer} · {detail.customerType}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="提箱城市" value={detail.pickupCity} />
                <Field label="还箱城市" value={detail.returnCity} />
                <Field label="箱型 / 数量" value={`${detail.containerType} × ${detail.quantity}`} />
                <Field label="箱源" value={boxSourceLabel(detail.boxSource) || "不限"} />
                <Field
                  label={confirmedLike(detail) ? "成交单价" : "系统报价"}
                  value={formatMoney(
                    confirmedLike(detail) ? detail.unitPrice : detail.quotedUnitPrice ?? detail.unitPrice,
                    orderCurrencyOf(detail),
                  )}
                />
                <Field label="结算币种" value={orderCurrencyOf(detail)} />
                <Field
                  label="汇率（对人民币）"
                  value={formatExchangeRate(
                    detail.exchangeRate ?? 1,
                    orderCurrencyOf(detail),
                  )}
                />
                {confirmedLike(detail) && (
                  <>
                    <Field label="提箱堆场" value={detail.pickupYard || "—"} />
                    <Field label="还箱堆场" value={detail.returnYard || "—"} />
                  </>
                )}
                <Field label="申请入口" value={detail.channel} />
                <Field label="创建时间" value={detail.createdAt} />
                <div className="col-span-2">
                  <span className="text-muted-foreground">当前状态：</span>
                  <StatusBadge status={detail.status} />
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-muted p-3 text-xs">
                {detail.status === "待确认" ? (
                  <div className="flex items-center gap-2 text-foreground">
                    <Clock className="size-3.5 text-warning-foreground" />
                    待箱管确认：分配堆场与成交价后，方可打印提箱单
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-foreground">
                    <ShieldCheck className="size-3.5 text-success" />
                    提箱文件：{detail.releaseDocReady ? "已生成" : "未生成"}
                    {detail.cancelDeadline ? ` · 免责取消截止：${detail.cancelDeadline}` : ""}
                  </div>
                )}
                {detail.status === "提箱中" && (
                  <p className="text-warning-foreground">提箱中取消将收取订单金额 20% 变更费</p>
                )}
                {detail.remark && <p className="text-muted-foreground">申请备注：{detail.remark}</p>}
                {confirmedLike(detail) && detail.adminRemark && (
                  <p className="text-foreground">箱管备注：{detail.adminRemark}</p>
                )}
                {confirmedLike(detail) &&
                  detail.quotedUnitPrice != null &&
                  detail.quotedUnitPrice !== detail.unitPrice && (
                    <p className="text-muted-foreground">
                      报价 {formatMoney(detail.quotedUnitPrice, orderCurrencyOf(detail))} → 成交{" "}
                      {formatMoney(detail.unitPrice, orderCurrencyOf(detail))}
                    </p>
                  )}
              </div>

              <div className="flex flex-wrap gap-2">
                {["待确认", "已确认", "提箱中"].includes(detail.status) && (
                  <Button variant="destructive" className="gap-2" onClick={() => cancelOrder(detail)}>
                    <XCircle className="size-4" />
                    取消订单
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  )
}
