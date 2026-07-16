/**
 * 单据模板布局：字段目录、默认布局、取值与默认电子章。
 */
import type { DocKind, UseBoxOrder } from "@/lib/types"

export type { DocKind }

export const DOC_KIND_OPTIONS: { kind: DocKind; label: string; codeHint: string; scene: string }[] = [
  { kind: "pickup", label: "提箱单", codeHint: "RELEASE_", scene: "提箱作业打印" },
  { kind: "return", label: "还箱单", codeHint: "REDELIVERY_", scene: "还箱作业打印" },
  { kind: "dispatch_approval", label: "调运审批表", codeHint: "DISPATCH_APPROVAL_", scene: "调运审批通过后生成" },
  { kind: "business_entrust", label: "用箱业务委托书", codeHint: "BUSINESS_ENTRUST_", scene: "调运任务下发时生成" },
  { kind: "overdue_bill", label: "超期费账单", codeHint: "OVERDUE_BILL_", scene: "超期费核算后生成" },
  { kind: "dispatch_bill", label: "调运费账单", codeHint: "DISPATCH_BILL_", scene: "调运费核算后生成" },
  { kind: "other", label: "其他", codeHint: "DOC_", scene: "自定义打印模板" },
]

export function kindLabel(kind: DocKind | undefined): string {
  return DOC_KIND_OPTIONS.find((o) => o.kind === kind)?.label ?? "其他"
}

export type DocFieldKey =
  | "orderNo"
  | "createdAt"
  | "confirmedAt"
  | "customer"
  | "customerType"
  | "pickupCity"
  | "returnCity"
  | "pickupYard"
  | "returnYard"
  | "containerType"
  | "quantity"
  | "adminRemark"
  | "confirmedBy"
  | "conditionNote"
  | "pickupGateAt"
  | "returnGateAt"
  | "pickupBooking"
  | "returnBooking"

export interface DocFieldDef {
  key: DocFieldKey
  label: string
  kinds: DocKind[]
}

export const DOC_FIELD_CATALOG: DocFieldDef[] = [
  { key: "orderNo", label: "订单号", kinds: ["pickup", "return", "other"] },
  { key: "createdAt", label: "创建时间", kinds: ["pickup", "return", "other"] },
  { key: "confirmedAt", label: "确认时间", kinds: ["pickup", "return", "other"] },
  { key: "customer", label: "客户", kinds: ["pickup", "return", "dispatch_approval", "business_entrust", "other"] },
  { key: "customerType", label: "客户类型", kinds: ["pickup", "return", "other"] },
  { key: "pickupCity", label: "提箱城市", kinds: ["pickup", "return", "dispatch_approval", "other"] },
  { key: "returnCity", label: "还箱城市", kinds: ["pickup", "return", "dispatch_approval", "other"] },
  { key: "pickupYard", label: "提箱堆场", kinds: ["pickup", "return", "other"] },
  { key: "returnYard", label: "还箱堆场", kinds: ["pickup", "return", "other"] },
  { key: "containerType", label: "箱型", kinds: ["pickup", "return", "overdue_bill", "dispatch_bill", "other"] },
  { key: "quantity", label: "数量", kinds: ["pickup", "return", "dispatch_approval", "dispatch_bill", "other"] },
  { key: "adminRemark", label: "备注", kinds: ["pickup", "return", "dispatch_approval", "business_entrust", "overdue_bill", "dispatch_bill", "other"] },
  { key: "confirmedBy", label: "确认人", kinds: ["pickup", "return", "dispatch_approval", "other"] },
  { key: "conditionNote", label: "箱况备注", kinds: ["pickup", "return", "other"] },
  { key: "pickupGateAt", label: "放箱时间", kinds: ["pickup", "other"] },
  { key: "returnGateAt", label: "收箱时间", kinds: ["return", "other"] },
  { key: "pickupBooking", label: "预约提箱时间", kinds: ["pickup", "other"] },
  { key: "returnBooking", label: "预约还箱时间", kinds: ["return", "other"] },
]

export interface DocLayoutCell {
  key: DocFieldKey
  label: string
}

export interface DocLayoutRow {
  cells: DocLayoutCell[]
}

export interface DocSealConfig {
  enabled: boolean
  /** data URL（png/svg/jpeg）；空则用内置红章 */
  imageDataUrl?: string
  label: string
  /** 相对签字区右下：向左偏移 px */
  offsetX: number
  /** 相对签字区底部：向上偏移 px */
  offsetY: number
  size: number
}

export interface DocTemplateLayout {
  orgLine: string
  title: string
  showTemplateName: boolean
  metaLine: string
  rows: DocLayoutRow[]
  notice: string
  showSignature: boolean
  signatureLabel: string
  seal: DocSealConfig
}

export function defaultSealConfig(partial?: Partial<DocSealConfig>): DocSealConfig {
  return {
    enabled: true,
    label: "箱管部",
    offsetX: 24,
    offsetY: 8,
    size: 112,
    ...partial,
  }
}

export function defaultPickupLayout(title = "提 箱 单"): DocTemplateLayout {
  return {
    orgLine: "中欧班列平台公司 · 集装箱管理部",
    title,
    showTemplateName: true,
    metaLine: "订单号：{{orderNo}}  |  生成时间：{{confirmedAt}}",
    rows: [
      {
        cells: [
          { key: "customer", label: "客户" },
          { key: "customerType", label: "客户类型" },
        ],
      },
      {
        cells: [
          { key: "pickupCity", label: "提箱城市" },
          { key: "returnCity", label: "还箱城市" },
        ],
      },
      {
        cells: [
          { key: "pickupYard", label: "提箱堆场" },
          { key: "returnYard", label: "还箱堆场" },
        ],
      },
      {
        cells: [
          { key: "containerType", label: "箱型" },
          { key: "quantity", label: "数量" },
        ],
      },
      { cells: [{ key: "adminRemark", label: "箱管备注" }] },
    ],
    notice:
      "请凭本提箱单前往「{{pickupYard}}」办理提箱手续。提箱后请及时上传 stuffing list。{{confirmedByLine}}",
    showSignature: true,
    signatureLabel: "确认人 / 签章",
    seal: defaultSealConfig({ label: "箱管部" }),
  }
}

export function defaultPickupOpsLayout(): DocTemplateLayout {
  return {
    ...defaultPickupLayout("提箱作业联"),
    rows: [
      {
        cells: [
          { key: "customer", label: "客户" },
          { key: "containerType", label: "箱型" },
        ],
      },
      {
        cells: [
          { key: "quantity", label: "数量" },
          { key: "pickupYard", label: "提箱堆场" },
        ],
      },
      {
        cells: [
          { key: "pickupCity", label: "提箱城市" },
          { key: "pickupBooking", label: "预约提箱时间" },
        ],
      },
      {
        cells: [
          { key: "returnCity", label: "还箱城市" },
          { key: "returnYard", label: "还箱堆场" },
        ],
      },
      { cells: [{ key: "conditionNote", label: "箱况备注" }] },
      { cells: [{ key: "adminRemark", label: "箱管备注" }] },
    ],
    notice: "作业联仅供堆场现场核验，不含费用信息。请核对箱型数量后放箱。",
  }
}

export function defaultPickupSimpleLayout(): DocTemplateLayout {
  return {
    ...defaultPickupLayout("提箱单（简洁）"),
    showTemplateName: false,
    rows: [
      {
        cells: [
          { key: "customer", label: "客户" },
          { key: "quantity", label: "数量" },
        ],
      },
      {
        cells: [
          { key: "containerType", label: "箱型" },
          { key: "pickupYard", label: "提箱堆场" },
        ],
      },
      {
        cells: [
          { key: "pickupCity", label: "提箱城市" },
          { key: "returnCity", label: "还箱城市" },
        ],
      },
    ],
    notice: "请凭本单前往「{{pickupYard}}」办理提箱。",
  }
}

export function defaultReturnLayout(title = "还 箱 单"): DocTemplateLayout {
  return {
    orgLine: "中欧班列平台公司 · 集装箱管理部",
    title,
    showTemplateName: true,
    metaLine: "订单号：{{orderNo}}  |  生成时间：{{createdAt}}",
    rows: [
      {
        cells: [
          { key: "customer", label: "客户" },
          { key: "customerType", label: "客户类型" },
        ],
      },
      {
        cells: [
          { key: "returnCity", label: "还箱城市" },
          { key: "returnYard", label: "还箱堆场" },
        ],
      },
      {
        cells: [
          { key: "containerType", label: "箱型" },
          { key: "quantity", label: "数量" },
        ],
      },
      {
        cells: [
          { key: "pickupCity", label: "原提箱城市" },
          { key: "returnBooking", label: "预约还箱时间" },
        ],
      },
    ],
    notice: "请前往「{{returnYard}}」办理还箱。完成后请上传还箱证明。",
    showSignature: true,
    signatureLabel: "收箱确认 / 签章",
    seal: defaultSealConfig({ label: "堆场收箱" }),
  }
}

export function defaultReturnSimpleLayout(): DocTemplateLayout {
  return {
    ...defaultReturnLayout("还箱单（简洁）"),
    showTemplateName: false,
    rows: [
      {
        cells: [
          { key: "customer", label: "客户" },
          { key: "returnYard", label: "还箱堆场" },
        ],
      },
      {
        cells: [
          { key: "containerType", label: "箱型" },
          { key: "quantity", label: "数量" },
        ],
      },
    ],
    notice: "请前往「{{returnYard}}」办理还箱。",
  }
}

export function defaultReturnOpsLayout(): DocTemplateLayout {
  return {
    ...defaultReturnLayout("还箱收箱联"),
    rows: [
      {
        cells: [
          { key: "customer", label: "客户" },
          { key: "orderNo", label: "订单号" },
        ],
      },
      {
        cells: [
          { key: "returnYard", label: "还箱堆场" },
          { key: "returnCity", label: "还箱城市" },
        ],
      },
      {
        cells: [
          { key: "containerType", label: "箱型" },
          { key: "quantity", label: "数量" },
        ],
      },
      { cells: [{ key: "conditionNote", label: "箱况备注" }] },
      { cells: [{ key: "adminRemark", label: "箱管备注" }] },
    ],
    notice: "收箱联供堆场核对空箱状况，请确认后签章收箱。",
  }
}

export function layoutFromFieldLabels(
  title: string,
  labels: string[],
  notice = "本单据由系统模板生成，请核对后签章。",
): DocTemplateLayout {
  const rows: DocLayoutRow[] = []
  for (let i = 0; i < labels.length; i += 2) {
    const left = labels[i]
    const right = labels[i + 1]
    if (right) {
      rows.push({
        cells: [
          { key: "adminRemark", label: left },
          { key: "adminRemark", label: right },
        ],
      })
    } else {
      rows.push({ cells: [{ key: "adminRemark", label: left }] })
    }
  }
  if (rows.length === 0) {
    rows.push({ cells: [{ key: "adminRemark", label: "内容" }] })
  }
  return {
    orgLine: "中欧班列平台公司 · 集装箱管理部",
    title,
    showTemplateName: true,
    metaLine: "单据编号：{{orderNo}}  |  生成时间：{{createdAt}}",
    rows,
    notice,
    showSignature: true,
    signatureLabel: "签章确认",
    seal: defaultSealConfig({ label: "箱管部" }),
  }
}

export function defaultFieldsForKind(kind: DocKind): string[] {
  switch (kind) {
    case "pickup":
      return fieldsFromLayout(defaultPickupLayout())
    case "return":
      return fieldsFromLayout(defaultReturnLayout())
    case "dispatch_approval":
      return [
        "计划调运时间",
        "调运线路",
        "调运原因",
        "调运单价",
        "用箱期",
        "超期费",
        "调运数量",
        "承运商",
        "调运总价",
        "经办部门/人",
        "多级审批签字栏",
      ]
    case "business_entrust":
      return ["委托方信息", "承运商信息", "调运任务详情", "双方盖章签字栏"]
    case "overdue_bill":
      return ["箱号", "超期天数", "超期费标准", "超期费金额"]
    case "dispatch_bill":
      return ["调运线路", "调运数量", "调运单价", "调运总价"]
    default:
      return ["标题字段", "内容字段", "备注"]
  }
}

export function layoutForKind(kind: DocKind): DocTemplateLayout {
  if (kind === "return") return defaultReturnLayout()
  if (kind === "pickup") return defaultPickupLayout()
  const opt = DOC_KIND_OPTIONS.find((o) => o.kind === kind)
  const title = opt?.label ?? "单据"
  return layoutFromFieldLabels(title, defaultFieldsForKind(kind))
}

export function resolveDocField(
  order: UseBoxOrder,
  key: DocFieldKey,
  extras?: Partial<Record<DocFieldKey, string>>,
): string {
  const fromExtra = extras?.[key]?.trim()
  if (fromExtra) return fromExtra
  switch (key) {
    case "orderNo":
      return order.orderNo
    case "createdAt":
      return order.createdAt || "—"
    case "confirmedAt":
      return order.confirmedAt ?? order.createdAt ?? "—"
    case "customer":
      return order.customer
    case "customerType":
      return order.customerType
    case "pickupCity":
      return order.pickupCity
    case "returnCity":
      return order.returnCity
    case "pickupYard":
      return order.pickupYard || "—"
    case "returnYard":
      return order.returnYard || "—"
    case "containerType":
      return order.containerType
    case "quantity":
      return `${order.quantity} 箱`
    case "adminRemark":
      return order.adminRemark?.trim() || "—"
    case "confirmedBy":
      return order.confirmedBy || "—"
    case "conditionNote":
      return order.conditionNote?.trim() || "—"
    case "pickupGateAt":
      return order.pickupGateAt || "—"
    case "returnGateAt":
      return order.returnGateAt || "—"
    case "pickupBooking":
    case "returnBooking":
      return "—"
    default:
      return "—"
  }
}

export function interpolateDocText(template: string, order: UseBoxOrder): string {
  const pickupYard = order.pickupYard || `${order.pickupCity}堆场`
  const returnYard = order.returnYard || `${order.returnCity}堆场`
  const confirmedByLine = order.confirmedBy ? ` 确认人：${order.confirmedBy}。` : ""
  const map: Record<string, string> = {
    orderNo: order.orderNo,
    createdAt: order.createdAt || "—",
    confirmedAt: order.confirmedAt ?? order.createdAt ?? "—",
    customer: order.customer,
    pickupCity: order.pickupCity,
    returnCity: order.returnCity,
    pickupYard,
    returnYard,
    containerType: order.containerType,
    quantity: String(order.quantity),
    confirmedBy: order.confirmedBy || "—",
    confirmedByLine,
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => map[k] ?? "")
}

/** 内置圆形红章（SVG data URL），打印可用 */
export function builtInSealDataUrl(label = "箱管部"): string {
  const safe = label.replace(/[<>&"']/g, "").slice(0, 6) || "箱管"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <circle cx="110" cy="110" r="100" fill="none" stroke="#c0392b" stroke-width="6"/>
  <circle cx="110" cy="110" r="88" fill="none" stroke="#c0392b" stroke-width="2"/>
  <text x="110" y="118" text-anchor="middle" font-family="SimSun, Songti SC, serif" font-size="28" fill="#c0392b" font-weight="700">${safe}</text>
  <text x="110" y="152" text-anchor="middle" font-family="SimSun, Songti SC, serif" font-size="14" fill="#c0392b">电子章</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function fieldsFromLayout(layout: { rows: { cells: { label: string }[] }[] }): string[] {
  const labels = layout.rows.flatMap((r) => r.cells.map((c) => c.label))
  return Array.from(new Set(labels))
}
