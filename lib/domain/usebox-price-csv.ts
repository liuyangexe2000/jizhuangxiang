/**
 * 用箱价目 CSV 导入导出
 */

import type { ContainerType, UseBoxPriceRule } from "../types"
import { CONTAINER_TYPES } from "../container-types"

export type UseBoxPriceCsvInput = Omit<UseBoxPriceRule, "id">

export const USEBOX_PRICE_CSV_HEADERS = [
  "提箱城市",
  "还箱城市",
  "箱型",
  "单价",
  "用箱期(天)",
  "超期费(元/箱/天)",
  "价目类型",
  "启用",
] as const

export const USEBOX_PRICE_CSV_TEMPLATE_ROWS: string[][] = [
  ["西安", "汉堡", "40HQ", "3200", "30", "100", "标准", "是"],
  ["西安", "罗兹", "40GP", "-200", "30", "80", "回程补贴", "是"],
]

const HEADER_ALIASES: Record<string, (typeof USEBOX_PRICE_CSV_HEADERS)[number]> = {
  提箱城市: "提箱城市",
  pickupcity: "提箱城市",
  还箱城市: "还箱城市",
  returncity: "还箱城市",
  箱型: "箱型",
  containertype: "箱型",
  单价: "单价",
  unitprice: "单价",
  价格: "单价",
  "用箱期(天)": "用箱期(天)",
  用箱期: "用箱期(天)",
  freedays: "用箱期(天)",
  "超期费(元/箱/天)": "超期费(元/箱/天)",
  超期费: "超期费(元/箱/天)",
  overduedailyrate: "超期费(元/箱/天)",
  价目类型: "价目类型",
  pricekind: "价目类型",
  类型: "价目类型",
  启用: "启用",
  enabled: "启用",
}

function yn(raw: string, fallback = true): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return fallback
  if (["是", "y", "yes", "true", "1", "启用"].includes(v)) return true
  if (["否", "n", "no", "false", "0", "停用"].includes(v)) return false
  return fallback
}

function parsePriceKind(raw: string): UseBoxPriceRule["priceKind"] {
  const v = raw.trim()
  if (v.includes("补贴") || v.includes("回程")) return "subsidy"
  return "standard"
}

export function useBoxPriceToCsvRow(r: UseBoxPriceRule): string[] {
  return [
    r.pickupCity,
    r.returnCity,
    r.containerType,
    String(r.unitPrice),
    String(r.freeDays ?? 30),
    String(r.overdueDailyRate ?? 0),
    r.priceKind === "subsidy" ? "回程补贴" : "标准",
    r.enabled !== false ? "是" : "否",
  ]
}

export function parseUseBoxPriceCsv(text: string): { rows: UseBoxPriceCsvInput[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"))
  if (lines.length === 0) return { rows: [], errors: ["CSV 为空"] }

  const headerLine = lines[0]!
  const sep = headerLine.includes("\t") ? "\t" : ","
  const headers = headerLine.split(sep).map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || h.trim())

  const required = ["提箱城市", "还箱城市", "箱型", "单价"] as const
  for (const req of required) {
    if (!headers.includes(req)) {
      return { rows: [], errors: [`缺少表头列：${req}`] }
    }
  }

  const rows: UseBoxPriceCsvInput[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim())
    const map: Record<string, string> = {}
    headers.forEach((h, idx) => {
      map[h] = cols[idx] ?? ""
    })
    const pickupCity = map["提箱城市"]?.trim()
    const returnCity = map["还箱城市"]?.trim()
    const containerType = map["箱型"]?.trim().toUpperCase() as ContainerType
    const price = Number(map["单价"])
    if (!pickupCity || !returnCity) {
      errors.push(`第 ${i + 1} 行：提箱/还箱城市不能为空`)
      continue
    }
    if (pickupCity === returnCity) {
      errors.push(`第 ${i + 1} 行：提箱与还箱城市不能相同`)
      continue
    }
    if (!CONTAINER_TYPES.includes(containerType)) {
      errors.push(`第 ${i + 1} 行：无效箱型 ${map["箱型"]}`)
      continue
    }
    if (!Number.isFinite(price) || price === 0) {
      errors.push(`第 ${i + 1} 行：单价须为有效非零数字（回程补贴可为负）`)
      continue
    }
    const freeDays = Number(map["用箱期(天)"] || "30")
    const overdueDailyRate = Number(map["超期费(元/箱/天)"] || "0")
    rows.push({
      pickupCity,
      returnCity,
      containerType,
      unitPrice: price,
      freeDays: Number.isFinite(freeDays) && freeDays > 0 ? Math.floor(freeDays) : 30,
      overdueDailyRate: Number.isFinite(overdueDailyRate) ? overdueDailyRate : 0,
      priceKind: parsePriceKind(map["价目类型"] || ""),
      enabled: yn(map["启用"] ?? "是"),
    })
  }
  return { rows, errors }
}
