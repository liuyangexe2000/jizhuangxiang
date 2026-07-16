"use client"

import type { DispatchOrder } from "@/lib/types"

const currency = (n: number) => `¥${n.toLocaleString()}`

/**
 * 《调运审批表》成品单据
 * 对应需求 M04 单据模板：计划调运时间、调运线路、调运原因、调运单价、用箱期、
 * 超期费、调运数量、承运商、调运总价、经办部门/人、多级审批签字栏。
 */
export function ApprovalFormDocument({ order }: { order: DispatchOrder }) {
  return (
    <div className="print-area mx-auto max-w-[760px] bg-card p-8 text-card-foreground">
      <header className="mb-6 border-b-2 border-foreground pb-4 text-center">
        <p className="text-sm text-muted-foreground">中欧班列平台公司 · 集装箱管理部</p>
        <h2 className="mt-1 text-2xl font-bold tracking-wide">调 运 审 批 表</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          单据编号：{order.dispatchNo} &nbsp;|&nbsp; 生成时间：{order.createdAt}
        </p>
      </header>

      <table className="w-full border-collapse text-sm">
        <tbody>
          <Row2 l1="计划调运时间" v1={order.planTime} l2="调运原因" v2={order.reason} />
          <Row2 l1="提箱地" v1={order.pickupPlace} l2="还箱范围" v2={order.returnScope} />
          <Row2 l1="调运单价" v1={currency(order.unitPrice) + " / 箱"} l2="超期费标准" v2={order.overdueStandard} />
          <Row2 l1="调运数量" v1={`${order.quantity} 箱`} l2="用箱期" v2={`${order.useTerm} 天`} />
          <Row2 l1="指定承运商" v1={order.carrier} l2="经办部门/人" v2={order.createdBy} />
          <tr>
            <Th>调运总价</Th>
            <td colSpan={3} className="border border-border px-3 py-2 text-base font-bold text-primary">
              {currency(order.totalPrice)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                （{order.quantity} 箱 × {currency(order.unitPrice)}）
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold">多级审批签字栏</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              <Th>审批层级</Th>
              <Th>审批角色</Th>
              <Th>审批人</Th>
              <Th>审批结果</Th>
              <Th>审批意见</Th>
              <Th>签字时间</Th>
            </tr>
          </thead>
          <tbody>
            {order.approvals.map((a) => (
              <tr key={a.level}>
                <Td className="text-center">{a.level}</Td>
                <Td>{a.role}</Td>
                <Td>{a.approver}</Td>
                <Td className="text-center">{a.status}</Td>
                <Td>{a.comment ?? "—"}</Td>
                <Td>{a.time ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-8 flex justify-between text-sm">
        <div className="text-center">
          <div className="mb-10 text-muted-foreground">经办人（签字）</div>
          <div className="border-t border-foreground px-8 pt-1 text-xs text-muted-foreground">日期</div>
        </div>
        <div className="text-center">
          <div className="mb-10 text-muted-foreground">业务部门（盖章）</div>
          <div className="border-t border-foreground px-8 pt-1 text-xs text-muted-foreground">日期</div>
        </div>
      </footer>
    </div>
  )
}

/**
 * 《用箱业务委托书》成品单据
 * 委托方信息、承运商信息、调运任务详情、双方盖章签字栏。
 */
export function EntrustLetterDocument({ order }: { order: DispatchOrder }) {
  return (
    <div className="print-area mx-auto max-w-[760px] bg-card p-8 text-card-foreground">
      <header className="mb-6 border-b-2 border-foreground pb-4 text-center">
        <h2 className="text-2xl font-bold tracking-wide">用 箱 业 务 委 托 书</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          关联调运单：{order.dispatchNo} &nbsp;|&nbsp; 日期：{order.createdAt}
        </p>
      </header>

      <section className="space-y-4 text-sm leading-relaxed">
        <div>
          <p className="mb-1 font-semibold">委托方</p>
          <p className="text-muted-foreground">中欧班列平台公司 · 集装箱管理部（经办人：{order.createdBy}）</p>
        </div>
        <div>
          <p className="mb-1 font-semibold">受托方（承运商）</p>
          <p className="text-muted-foreground">{order.carrier}</p>
        </div>
        <div>
          <p className="mb-2 font-semibold">调运任务详情</p>
          <table className="w-full border-collapse">
            <tbody>
              <Row2 l1="提箱地" v1={order.pickupPlace} l2="还箱范围" v2={order.returnScope} />
              <Row2 l1="计划调运时间" v1={order.planTime} l2="调运数量" v2={`${order.quantity} 箱`} />
              <Row2 l1="调运单价" v1={currency(order.unitPrice) + " / 箱"} l2="用箱期" v2={`${order.useTerm} 天`} />
              <Row2 l1="超期费标准" v1={order.overdueStandard} l2="调运总价" v2={currency(order.totalPrice)} />
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          兹委托受托方按上述任务详情承运集装箱调运业务，双方应遵守用箱期与超期费约定，如实记录提还箱信息。本委托书自双方签章之日起生效。
        </p>
      </section>

      <footer className="mt-10 flex justify-between text-sm">
        <div className="text-center">
          <div className="mb-10 text-muted-foreground">委托方（盖章）</div>
          <div className="border-t border-foreground px-8 pt-1 text-xs text-muted-foreground">日期</div>
        </div>
        <div className="text-center">
          <div className="mb-10 text-muted-foreground">受托方（盖章）</div>
          <div className="border-t border-foreground px-8 pt-1 text-xs text-muted-foreground">日期</div>
        </div>
      </footer>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-border bg-muted/60 px-3 py-2 text-left font-medium">{children}</th>
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-border px-3 py-2 ${className}`}>{children}</td>
}

function Row2({ l1, v1, l2, v2 }: { l1: string; v1: string; l2: string; v2: string }) {
  return (
    <tr>
      <Th>{l1}</Th>
      <Td>{v1}</Td>
      <Th>{l2}</Th>
      <Td>{v2}</Td>
    </tr>
  )
}
