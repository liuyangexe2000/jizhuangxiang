"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Eye, Search } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useResource, revalidateResource } from "@/lib/api"
import { useRole } from "@/lib/role-context"
import { usePublicSettings } from "@/lib/settings-client"
import { getFieldValue, useListQuery } from "@/lib/list-query"
import { applyReserveInventory, cityFromPlace, findInventoryRow, inventoryId, nowLocalStr } from "@/lib/domain/dispatch-ops"
import { fmtDeadline } from "@/lib/domain/order-ops"
import { attachBillFx, formatExchangeRate, inferBillCurrency } from "@/lib/domain/money"
import { issuePickupDocSlip } from "@/lib/domain/pickup-doc"
import { resolveCustomerId } from "@/lib/domain/resolve-customer"
import { pushNotification } from "@/lib/domain/notify"
import type { BoxSource } from "@/lib/domain/box-source"
import { boxSourceLabel } from "@/lib/domain/box-source"
import { findRentalSupplyContract } from "@/lib/domain/rental-supply-contract"
import type { Customer, InventoryRow, Notification, SupplyContract, UseBoxOrder, Yard } from "@/lib/types"

const statusFilters = ["待确认", "全部", "已确认", "提箱中", "还箱中", "已完成", "已取消", "超时取消"]

export default function OperationsUseboxPage() {
  const { data: orders, update } = useResource<UseBoxOrder>("orders")
  const { data: inventory, update: updateInventory } = useResource<InventoryRow>("inventory")
  const { data: yards } = useResource<Yard>("yards")
  const { data: customers } = useResource<Customer>("customers")
  const { data: supplyContracts } = useResource<SupplyContract>("supplyContracts")
  const { create: createNotification } = useResource<Notification>("notifications")
  const { user } = useRole()
  const { settings } = usePublicSettings()
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState("待确认")
  const [detail, setDetail] = useState<UseBoxOrder | null>(null)
  const [confirming, setConfirming] = useState<UseBoxOrder | null>(null)
  const [pickupYard, setPickupYard] = useState("")
  const [returnYard, setReturnYard] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [adminRemark, setAdminRemark] = useState("")
  const [boxSource, setBoxSource] = useState<"" | BoxSource>("")
  const [submitting, setSubmitting] = useState(false)
  const pendingCount = useMemo(() => orders.filter((order) => order.status === "待确认").length, [orders])

  function yardsForCity(city: string) {
    return yards.filter((yard) => yard.enabled && !yard.deleted && yard.city === city)
  }

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        const matchKeyword =
          !keyword ||
          o.orderNo.includes(keyword) ||
          o.customer.includes(keyword) ||
          o.pickupCity.includes(keyword) ||
          o.returnCity.includes(keyword)
        return matchKeyword && (status === "全部" || o.status === status)
      }),
    [orders, keyword, status],
  )

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
    getSortValue: (order, key) => {
      if (key === "qty") return order.quantity
      if (key === "price") return order.unitPrice * order.quantity
      return getFieldValue(order, key)
    },
  })

  const pickupYards = useMemo(() => confirming ? yardsForCity(confirming.pickupCity) : [], [yards, confirming])
  const returnYards = useMemo(() => confirming ? yardsForCity(confirming.returnCity) : [], [yards, confirming])
  const rentalPreviewContractNo = useMemo(() => {
    if (!confirming || boxSource !== "租赁箱") return null
    const hit = findRentalSupplyContract(supplyContracts, {
      containerType: confirming.containerType,
      quantity: confirming.quantity,
    })
    return hit?.contractNo ?? null
  }, [confirming, boxSource, supplyContracts])

  function openConfirm(order: UseBoxOrder) {
    const pickupOptions = yardsForCity(order.pickupCity)
    const returnOptions = yardsForCity(order.returnCity)
    if (pickupOptions.length === 0) {
      toast.error(`提箱城市「${order.pickupCity}」暂无可用堆场`)
    }
    if (returnOptions.length === 0) {
      toast.error(`还箱城市「${order.returnCity}」暂无可用堆场`)
    }
    setConfirming(order)
    setPickupYard(order.pickupYard || pickupOptions[0]?.name || "")
    setReturnYard(order.returnYard || returnOptions[0]?.name || "")
    setUnitPrice(String(order.quotedUnitPrice ?? order.unitPrice))
    setAdminRemark(order.adminRemark || "")
    setBoxSource(boxSourceLabel(order.boxSource) ?? "")
  }

  async function submitConfirm() {
    if (!confirming) return
    const price = Number(unitPrice)
    if (!pickupYard || !returnYard || !Number.isFinite(price) || price <= 0) {
      toast.error("请选择提箱、还箱堆场并输入有效成交单价")
      return
    }
    const inv = findInventoryRow(inventory, { yard: pickupYard, city: cityFromPlace(pickupYard, yards) || confirming.pickupCity })
    if (!inv || inv.available < confirming.quantity) {
      toast.error("提箱堆场可用库存不足，无法预占")
      return
    }

    setSubmitting(true)
    const now = new Date()
    const confirmedAt = nowLocalStr()
    const customerId =
      confirming.customerId || resolveCustomerId(confirming.customer, customers)
    const confirmedBy = user?.name || user?.account || "箱管"
    const firstSlip = issuePickupDocSlip({
      orderNo: confirming.orderNo,
      existing: [],
      quantity: confirming.quantity,
      issuedBy: confirmedBy,
      issuedAt: confirmedAt,
      remark: "订单确认时自动开具",
    })
    const fx = attachBillFx({
      amount: price * confirming.quantity,
      currency:
        confirming.orderCurrency ||
        inferBillCurrency({ city: confirming.pickupCity }),
      exchangeRate: confirming.exchangeRate,
    })
    const nextOrder: UseBoxOrder = {
      ...confirming,
      customerId,
      status: "已确认",
      pickupYard,
      returnYard,
      unitPrice: price,
      orderCurrency: fx.currency,
      exchangeRate: fx.exchangeRate,
      adminRemark,
      ...(boxSource ? { boxSource } : {}),
      confirmedAt,
      confirmedBy,
      cancelDeadline: fmtDeadline(now, settings?.cancelFreeHours ?? 24),
      releaseDocReady: true,
      pickupDocs: [firstSlip],
    }
    try {
      await update(confirming.id, {
        status: nextOrder.status,
        pickupYard,
        returnYard,
        unitPrice: price,
        orderCurrency: fx.currency,
        exchangeRate: fx.exchangeRate,
        adminRemark,
        ...(boxSource ? { boxSource } : {}),
        confirmedAt,
        confirmedBy: nextOrder.confirmedBy,
        cancelDeadline: nextOrder.cancelDeadline,
        releaseDocReady: true,
        pickupDocs: [firstSlip],
        ...(customerId && !confirming.customerId ? { customerId } : {}),
        __auditAction: "修改",
        __auditDetail: `确认用箱订单 ${confirming.orderNo}，开具提箱单 ${firstSlip.docNo}，预占 ${pickupYard} ${confirming.quantity} 箱`,
      })
      await updateInventory(inventoryId(inv), {
        ...applyReserveInventory(inv, confirming.quantity),
        __auditAction: "修改",
        __auditDetail: `用箱订单预占 ${confirming.orderNo}`,
      })
      await pushNotification(createNotification, {
        type: "任务",
        level: "重要",
        title: `用箱订单已确认 · ${confirming.orderNo}`,
        desc: `${pickupYard}→${returnYard}，已预占 ${confirming.quantity} 箱并开具提箱单 ${firstSlip.docNo}；现场完成提箱后生成账单。`,
        module: "M01 订单处理",
        href: "/customer/documents",
        roles: ["R03"],
      })
      await Promise.all([
        revalidateResource("orders"),
        revalidateResource("inventory"),
        revalidateResource("notifications"),
      ])
      toast.success(`订单 ${confirming.orderNo} 已确认，已预占库存并开具提箱单`)
      setConfirming(null)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        module="M01 · 客户服务与订舱协同门户"
        title="订单处理"
        description="确认待处理用箱申请，分配提、还箱堆场和成交价格，同步库存预占与提箱单；用箱账单在现场完成提箱后生成。"
      />
      <p className="text-sm text-muted-foreground">待确认订单 <span className="font-semibold text-foreground">{pendingCount}</span> 笔</p>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="pl-8" placeholder="搜索订单号、客户或城市" />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value ?? "待确认")}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{statusFilters.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <SortableTableHead label="订单号" columnKey="orderNo" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="客户" columnKey="customer" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="提箱城市" columnKey="pickupCity" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="还箱城市" columnKey="returnCity" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="箱型 / 数量" columnKey="qty" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="箱源" columnKey="boxSource" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="金额" columnKey="price" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="状态" columnKey="status" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <SortableTableHead label="创建时间" columnKey="createdAt" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                <TableHead className="text-right">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {list.rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">{order.orderNo}</TableCell>
                    <TableCell>{order.customer}</TableCell>
                    <TableCell>{order.pickupCity}</TableCell>
                    <TableCell>{order.returnCity}</TableCell>
                    <TableCell>{order.containerType} × {order.quantity}</TableCell>
                    <TableCell>
                      {boxSourceLabel(order.boxSource) ? (
                        <Badge variant="outline">{order.boxSource}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">不限</span>
                      )}
                    </TableCell>
                    <TableCell>¥{(order.unitPrice * order.quantity).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{order.createdAt}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetail(order)}><Eye className="size-4" /><span className="sr-only">查看详情</span></Button>
                      {order.status === "待确认" && <Button size="sm" onClick={() => openConfirm(order)}><CheckCircle2 className="size-4" />确认</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">未找到匹配的用箱订单</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <ListPagination page={list.page} pageSize={list.pageSize} total={list.total} totalPages={list.totalPages} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">{detail && <>
          <DialogHeader><DialogTitle className="font-mono">{detail.orderNo}</DialogTitle><DialogDescription>{detail.customer} · {detail.customerType}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="提箱城市" value={detail.pickupCity} /><Field label="还箱城市" value={detail.returnCity} />
            <Field label="箱型 / 数量" value={`${detail.containerType} × ${detail.quantity}`} /><Field label="成交单价" value={`¥${detail.unitPrice.toLocaleString()}`} />
            <Field label="箱源" value={boxSourceLabel(detail.boxSource) || "不限"} />
            {detail.supplyContractNo && (
              <Field label="供应合同" value={detail.supplyContractNo} />
            )}
            <Field label="提箱堆场" value={detail.pickupYard || "—"} /><Field label="还箱堆场" value={detail.returnYard || "—"} />
            <Field label="结算币种" value={detail.orderCurrency || inferBillCurrency({ city: detail.pickupCity })} />
            <Field
              label="汇率（对人民币）"
              value={formatExchangeRate(
                detail.exchangeRate ?? 1,
                detail.orderCurrency || inferBillCurrency({ city: detail.pickupCity }),
              )}
            />
            <Field label="创建时间" value={detail.createdAt} /><Field label="状态" value={detail.status} />
          </div>
          {detail.remark && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">客户备注：{detail.remark}</p>}
          {detail.adminRemark && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">箱管备注：{detail.adminRemark}</p>}
        </>}</DialogContent>
      </Dialog>

      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="sm:max-w-lg">{confirming && <>
          <DialogHeader><DialogTitle>确认用箱订单</DialogTitle><DialogDescription>{confirming.orderNo} · 确认后将预占库存、开具提箱单并通知客户；账单待现场完成提箱后生成。</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>提箱堆场</Label><Select value={pickupYard} onValueChange={(value) => setPickupYard(value ?? "")}><SelectTrigger><SelectValue placeholder="选择提箱堆场" /></SelectTrigger><SelectContent>{pickupYards.map((yard) => <SelectItem key={yard.id} value={yard.name}>{yard.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>还箱堆场</Label><Select value={returnYard} onValueChange={(value) => setReturnYard(value ?? "")}><SelectTrigger><SelectValue placeholder="选择还箱堆场" /></SelectTrigger><SelectContent>{returnYards.map((yard) => <SelectItem key={yard.id} value={yard.name}>{yard.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2">
              <Label>箱源</Label>
              <Select value={boxSource || "__none__"} onValueChange={(v) => setBoxSource(v === "__none__" ? "" : (v as BoxSource))}>
                <SelectTrigger><SelectValue placeholder="不限（登记时不按箱属过滤）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不限</SelectItem>
                  <SelectItem value="自有箱">自有箱</SelectItem>
                  <SelectItem value="租赁箱">租赁箱</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">客户申请已选箱源时会预填；登记箱号时仅匹配对应箱属。</p>
              {boxSource === "租赁箱" && confirming && (
                <p className="text-xs text-muted-foreground">
                  {rentalPreviewContractNo
                    ? `确认后将绑定供应合同 ${rentalPreviewContractNo} 并扣减合同余量 ${confirming.quantity} 箱。`
                    : `当前无 ${confirming.containerType} × ${confirming.quantity} 的可用租赁合同，确认将失败。`}
                </p>
              )}
            </div>
            <div className="grid gap-2"><Label htmlFor="unit-price">成交单价（元 / 箱）</Label><Input id="unit-price" type="number" min="1" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="admin-remark">箱管备注</Label><Textarea id="admin-remark" value={adminRemark} onChange={(event) => setAdminRemark(event.target.value)} placeholder="确认信息将对客户可见" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setConfirming(null)} disabled={submitting}>取消</Button><Button onClick={submitConfirm} disabled={submitting}>{submitting ? "确认中..." : "确认并预占库存"}</Button></DialogFooter>
        </>}</DialogContent>
      </Dialog>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>
}
