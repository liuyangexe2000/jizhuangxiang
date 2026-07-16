/**
 * 提还箱单据模板布局：字段目录、默认布局、取值与默认电子章。
 */
import type { UseBoxOrder } from "@/lib/types"

export type DocKind = "pickup" | "return" | "other"

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
  { key: "orderNo", label: "订单号", kinds: ["pickup", "return"] },
  { key: "createdAt", label: "创建时间", kinds: ["pickup", "return"] },
  { key: "confirmedAt", label: "确认时间", kinds: ["pickup", "return"] },
  { key: "customer", label: "客户", kinds: ["pickup", "return"] },
  { key: "customerType", label: "客户类型", kinds: ["pickup", "return"] },
  { key: "pickupCity", label: "提箱城市", kinds: ["pickup", "return"] },
  { key: "returnCity", label: "还箱城市", kinds: ["pickup", "return"] },
  { key: "pickupYard", label: "提箱堆场", kinds: ["pickup", "return"] },
  { key: "returnYard", label: "还箱堆场", kinds: ["pickup", "return"] },
  { key: "containerType", label: "箱型", kinds: ["pickup", "return"] },
  { key: "quantity", label: "数量", kinds: ["pickup", "return"] },
  { key: "adminRemark", label: "箱管备注", kinds: ["pickup", "return"] },
  { key: "confirmedBy", label: "确认人", kinds: ["pickup", "return"] },
  { key: "conditionNote", label: "箱况备注", kinds: ["pickup", "return"] },
  { key: "pickupGateAt", label: "放箱时间", kinds: ["pickup"] },
  { key: "returnGateAt", label: "收箱时间", kinds: ["return"] },
  { key: "pickupBooking", label: "预约提箱时间", kinds: ["pickup"] },
  { key: "returnBooking", label: "预约还箱时间", kinds: ["return"] },
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

export function layoutForKind(kind: DocKind): DocTemplateLayout {
  if (kind === "return") return defaultReturnLayout()
  if (kind === "pickup") return defaultPickupLayout()
  return defaultPickupLayout()
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
