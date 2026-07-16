"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Search, XCircle, Clock, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent } from "@/components/ui/card"
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
import type { Bill, InventoryRow, Notification, UseBoxOrder } from "@/lib/types"
import { buildCancelFeeBill } from "@/lib/domain/order-ops"
import {
  applyReleaseReserveInventory,
  cityFromPlace,
  findInventoryRow,
  inventoryId,
} from "@/lib/domain/dispatch-ops"
import { pushNotification } from "@/lib/domain/notify"

const statusFilters = ["全部", "待确认", "已确认", "提箱中", "还箱中", "已完成", "已取消", "超时取消"]

export default function OrdersPage() {
  const { data: orders, update } = useResource<UseBoxOrder>("orders")
  const { create: createBill } = useResource<Bill>("bills")
  const { create: createNotif } = useResource<Notification>("notifications")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
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

  async function cancelOrder(o: UseBoxOrder) {
    if (!["待确认", "已确认"].includes(o.status)) {
      toast.error("当前状态不可取消")
      return
    }
    const deadlineMs = o.cancelDeadline ? Date.parse(o.cancelDeadline.replace(/-/g, "/")) : NaN
    const withinFree =
      o.status === "待确认"
        ? true
        : Number.isFinite(deadlineMs)
          ? Date.now() <= deadlineMs
          : false
    const nextStatus = withinFree ? "已取消" : "超时取消"
    try {
      await update(o.id, {
        status: nextStatus,
        __auditAction: "修改",
        __auditDetail: `取消用箱订单 ${o.orderNo}（${nextStatus}）`,
      })
      if (o.status === "已确认" && o.pickupYard) {
        const inv = findInventoryRow(inventory, {
          yard: o.pickupYard,
          city: cityFromPlace(o.pickupYard),
        })
        if (inv) {
          await updateInventory(inventoryId(inv), {
            ...applyReleaseReserveInventory(inv, o.quantity),
            __auditAction: "修改",
            __auditDetail: `取消订单释放预占库存 ${o.orderNo}`,
          })
          await revalidateResource("inventory")
        }
      }
      if (!withinFree) {
        await createBill({
          ...buildCancelFeeBill(o),
          __auditAction: "新增",
          __auditDetail: `超时取消取消费 ${o.orderNo}`,
        })
        await pushNotification(createNotif, {
          type: "账单",
          level: "重要",
          title: `取消费账单 · ${o.orderNo}`,
          desc: "订单超时取消，已生成变更费账单。",
          module: "M01 账单中心",
          href: "/customer/bills",
          roles: ["R01", "R03"],
        })
        toast.warning(`订单 ${o.orderNo} 已超时取消，取消费账单已生成（BR-03）`)
      } else {
        toast.success(`订单 ${o.orderNo} 已免责取消`)
      }
      await revalidateResource("bills")
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
                  <SortableTableHead label="金额" columnKey="amount" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="创建时间" columnKey="createdAt" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((o) => {
                  const displayPrice = confirmedLike(o) ? o.unitPrice : o.quotedUnitPrice ?? o.unitPrice
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.orderNo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.pickupCity} → {o.returnCity}
                      </TableCell>
                      <TableCell>
                        {o.containerType} × {o.quantity}
                      </TableCell>
                      <TableCell>¥{(displayPrice * o.quantity).toLocaleString()}</TableCell>
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
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
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
                <Field
                  label={confirmedLike(detail) ? "成交单价" : "系统报价"}
                  value={`¥${(confirmedLike(detail) ? detail.unitPrice : detail.quotedUnitPrice ?? detail.unitPrice).toLocaleString()}`}
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
                {detail.remark && <p className="text-muted-foreground">申请备注：{detail.remark}</p>}
                {confirmedLike(detail) && detail.adminRemark && (
                  <p className="text-foreground">箱管备注：{detail.adminRemark}</p>
                )}
                {confirmedLike(detail) &&
                  detail.quotedUnitPrice != null &&
                  detail.quotedUnitPrice !== detail.unitPrice && (
                    <p className="text-muted-foreground">
                      报价 ¥{detail.quotedUnitPrice.toLocaleString()} → 成交 ¥
                      {detail.unitPrice.toLocaleString()}
                    </p>
                  )}
              </div>

              <div className="flex flex-wrap gap-2">
                {["待确认", "已确认"].includes(detail.status) && (
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
