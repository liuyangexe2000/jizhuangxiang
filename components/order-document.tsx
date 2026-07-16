"use client"

import type { UseBoxOrder } from "@/lib/types"

/** 客户用箱提箱单（打印） */
export function OrderPickupDocument({
  order,
  templateName,
}: {
  order: UseBoxOrder
  templateName?: string
}) {
  const title = templateName?.replace(/[（(].*$/, "").trim() || "提 箱 单"
  return (
    <div className="print-area mx-auto max-w-[760px] bg-card p-8 text-card-foreground">
      <header className="mb-6 border-b-2 border-foreground pb-4 text-center">
        <p className="text-sm text-muted-foreground">中欧班列平台公司 · 集装箱管理部</p>
        <h2 className="mt-1 text-2xl font-bold tracking-wide">{title}</h2>
        {templateName && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">模板：{templateName}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          订单号：{order.orderNo} &nbsp;|&nbsp; 生成时间：{order.confirmedAt ?? order.createdAt}
        </p>
      </header>
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-28 border border-border bg-muted/50 px-3 py-2 text-left">客户</th>
            <td className="border border-border px-3 py-2">{order.customer}</td>
            <th className="w-28 border border-border bg-muted/50 px-3 py-2 text-left">客户类型</th>
            <td className="border border-border px-3 py-2">{order.customerType}</td>
          </tr>
          <tr>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">提箱城市</th>
            <td className="border border-border px-3 py-2">{order.pickupCity}</td>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">还箱城市</th>
            <td className="border border-border px-3 py-2">{order.returnCity}</td>
          </tr>
          <tr>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">提箱堆场</th>
            <td className="border border-border px-3 py-2">{order.pickupYard || "—"}</td>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">还箱堆场</th>
            <td className="border border-border px-3 py-2">{order.returnYard || "—"}</td>
          </tr>
          <tr>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">箱型</th>
            <td className="border border-border px-3 py-2">{order.containerType}</td>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">数量</th>
            <td className="border border-border px-3 py-2">{order.quantity} 箱</td>
          </tr>
          <tr>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">用箱单价</th>
            <td className="border border-border px-3 py-2" colSpan={3}>
              ¥{order.unitPrice.toLocaleString()} / 箱（合计 ¥{(order.unitPrice * order.quantity).toLocaleString()}）
              {order.quotedUnitPrice != null && order.quotedUnitPrice !== order.unitPrice
                ? ` · 原报价 ¥${order.quotedUnitPrice.toLocaleString()}`
                : ""}
            </td>
          </tr>
          {order.adminRemark ? (
            <tr>
              <th className="border border-border bg-muted/50 px-3 py-2 text-left">箱管备注</th>
              <td className="border border-border px-3 py-2" colSpan={3}>
                {order.adminRemark}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="mt-6 text-xs text-muted-foreground">
        请凭本提箱单前往「{order.pickupYard || order.pickupCity + "堆场"}」办理提箱手续。提箱后请及时上传 stuffing list。
        {order.confirmedBy ? ` 确认人：${order.confirmedBy}。` : ""}
      </p>
    </div>
  )
}

/** 客户用箱还箱单（打印） */
export function OrderReturnDocument({
  order,
  templateName,
}: {
  order: UseBoxOrder
  templateName?: string
}) {
  const title = templateName?.replace(/[（(].*$/, "").trim() || "还 箱 单"
  return (
    <div className="print-area mx-auto max-w-[760px] bg-card p-8 text-card-foreground">
      <header className="mb-6 border-b-2 border-foreground pb-4 text-center">
        <p className="text-sm text-muted-foreground">中欧班列平台公司 · 集装箱管理部</p>
        <h2 className="mt-1 text-2xl font-bold tracking-wide">{title}</h2>
        {templateName && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">模板：{templateName}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">订单号：{order.orderNo}</p>
      </header>
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-28 border border-border bg-muted/50 px-3 py-2 text-left">客户</th>
            <td className="border border-border px-3 py-2">{order.customer}</td>
            <th className="w-28 border border-border bg-muted/50 px-3 py-2 text-left">还箱城市</th>
            <td className="border border-border px-3 py-2">{order.returnCity}</td>
          </tr>
          <tr>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">还箱堆场</th>
            <td className="border border-border px-3 py-2">{order.returnYard || "—"}</td>
            <th className="border border-border bg-muted/50 px-3 py-2 text-left">箱型/数量</th>
            <td className="border border-border px-3 py-2">
              {order.containerType} × {order.quantity}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-6 text-xs text-muted-foreground">
        请前往「{order.returnYard || order.returnCity + "堆场"}」办理还箱。完成后请上传还箱证明。
      </p>
    </div>
  )
}
