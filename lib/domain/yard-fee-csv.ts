/**
 * 堆场费用 CSV 导入导出
 */

import type { Yard } from "../types"

export type YardFeeCsvPatch = {
  /** 匹配键：堆场名称或编码 */
  matchKey: string
  matchBy: "name" | "factoryCode"
  dailyExpenses?: number | null
  freeDuration?: number | null
  boardingFee?: number | null
  alightingFee?: number | null
  secondaryRemovalFee?: number | null
}

export const YARD_FEE_CSV_HEADERS = [
  "堆场名称",
  "堆场编码",
  "堆存日费用",
  "免堆天数",
  "上车费",
  "下车费",
  "二次搬移费",
] as const

export const YARD_FEE_CSV_TEMPLATE_ROWS: string[][] = [
  ["陆港堆场", "LG001", "50", "7", "200", "200", "100"],
  ["", "HB002", "80", "5", "150", "150", ""],
]

const HEADER_ALIASES: Record<string, (typeof YARD_FEE_CSV_HEADERS)[number]> = {
  堆场名称: "堆场名称",
  名称: "堆场名称",
  name: "堆场名称",
  堆场编码: "堆场编码",
  编码: "堆场编码",
  factorycode: "堆场编码",
  堆存日费用: "堆存日费用",
  日堆存费: "堆存日费用",
  dailyexpenses: "堆存日费用",
  免堆天数: "免堆天数",
  免堆: "免堆天数",
  freeduration: "免堆天数",
  上车费: "上车费",
  boardingfee: "上车费",
  下车费: "下车费",
  alightingfee: "下车费",
  二次搬移费: "二次搬移费",
  secondaryremovalfee: "二次搬移费",
}

function parseOptionalNumber(raw: string | undefined, allowEmpty = true): number | null | "invalid" {
  const t = (raw ?? "").trim()
  if (!t) return allowEmpty ? null : "invalid"
  const n = Number(t)
  if (!Number.isFinite(n)) return "invalid"
  return n
}

function parseOptionalInt(raw: string | undefined): number | null | "invalid" {
  const n = parseOptionalNumber(raw)
  if (n === "invalid" || n === null) return n
  if (!Number.isInteger(n) || n < 0) return "invalid"
  return n
}

export function yardFeeToCsvRow(y: Yard): string[] {
  return [
    y.name,
    y.factoryCode || "",
    y.dailyExpenses == null ? "" : String(y.dailyExpenses),
    y.freeDuration == null ? "" : String(y.freeDuration),
    y.boardingFee == null ? "" : String(y.boardingFee),
    y.alightingFee == null ? "" : String(y.alightingFee),
    y.secondaryRemovalFee == null ? "" : String(y.secondaryRemovalFee),
  ]
}

export function parseYardFeeCsv(text: string): { rows: YardFeeCsvPatch[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"))
  if (lines.length === 0) return { rows: [], errors: ["CSV 为空"] }

  const headerLine = lines[0]!
  const sep = headerLine.includes("\t") ? "\t" : ","
  const headers = headerLine.split(sep).map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || h.trim())

  const required = ["堆存日费用", "免堆天数", "上车费", "下车费"] as const
  const hasNameOrCode = headers.includes("堆场名称") || headers.includes("堆场编码")
  if (!hasNameOrCode) {
    return { rows: [], errors: ["缺少表头：堆场名称 或 堆场编码"] }
  }

  const rows: YardFeeCsvPatch[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim())
    const map: Record<string, string> = {}
    headers.forEach((h, idx) => {
      map[h] = cols[idx] ?? ""
    })

    const name = map["堆场名称"]?.trim() || ""
    const code = map["堆场编码"]?.trim() || ""
    if (!name && !code) {
      errors.push(`第 ${i + 1} 行：堆场名称与编码不能同时为空`)
      continue
    }

    const dailyExpenses = parseOptionalNumber(map["堆存日费用"])
    const freeDuration = parseOptionalInt(map["免堆天数"])
    const boardingFee = parseOptionalNumber(map["上车费"])
    const alightingFee = parseOptionalNumber(map["下车费"])
    const secondaryRemovalFee = parseOptionalNumber(map["二次搬移费"])

    const nums = [dailyExpenses, freeDuration, boardingFee, alightingFee, secondaryRemovalFee]
    if (nums.some((n) => n === "invalid")) {
      errors.push(`第 ${i + 1} 行：费用须为非负数字，免堆天数须为非负整数`)
      continue
    }
    if (typeof dailyExpenses === "number" && dailyExpenses < 0) {
      errors.push(`第 ${i + 1} 行：堆存日费用不能为负`)
      continue
    }
    if (typeof boardingFee === "number" && boardingFee < 0) {
      errors.push(`第 ${i + 1} 行：上车费不能为负`)
      continue
    }
    if (typeof alightingFee === "number" && alightingFee < 0) {
      errors.push(`第 ${i + 1} 行：下车费不能为负`)
      continue
    }
    if (typeof secondaryRemovalFee === "number" && secondaryRemovalFee < 0) {
      errors.push(`第 ${i + 1} 行：二次搬移费不能为负`)
      continue
    }

    const hasAnyFee =
      dailyExpenses !== null ||
      freeDuration !== null ||
      boardingFee !== null ||
      alightingFee !== null ||
      secondaryRemovalFee !== null
    if (!hasAnyFee) {
      errors.push(`第 ${i + 1} 行：至少填写一项费用字段`)
      continue
    }

    rows.push({
      matchKey: code || name,
      matchBy: code ? "factoryCode" : "name",
      dailyExpenses: dailyExpenses as number | null,
      freeDuration: freeDuration as number | null,
      boardingFee: boardingFee as number | null,
      alightingFee: alightingFee as number | null,
      secondaryRemovalFee: secondaryRemovalFee as number | null,
    })
  }

  return { rows, errors }
}

/** 将 CSV 行合并到现有堆场（空单元格保留原值） */
export function applyYardFeePatch(yard: Yard, patch: YardFeeCsvPatch): Partial<Yard> {
  return {
    ...(patch.dailyExpenses != null ? { dailyExpenses: patch.dailyExpenses } : {}),
    ...(patch.freeDuration != null ? { freeDuration: patch.freeDuration } : {}),
    ...(patch.boardingFee != null ? { boardingFee: patch.boardingFee } : {}),
    ...(patch.alightingFee != null ? { alightingFee: patch.alightingFee } : {}),
    ...(patch.secondaryRemovalFee != null ? { secondaryRemovalFee: patch.secondaryRemovalFee } : {}),
  }
}

export function findYardForFeePatch(yards: Yard[], patch: YardFeeCsvPatch): Yard | undefined {
  if (patch.matchBy === "factoryCode") {
    const code = patch.matchKey.toLowerCase()
    return yards.find((y) => y.factoryCode?.trim().toLowerCase() === code)
  }
  const name = patch.matchKey.trim()
  return yards.find((y) => y.name.trim() === name)
}
