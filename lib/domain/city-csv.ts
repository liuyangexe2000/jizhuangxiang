/**
 * 城市字典 CSV 导入导出（与 /config/cities 页签互通）
 */

import type { CityDictItem, CityRegion } from "../types"

export type CityCsvInput = Omit<CityDictItem, "id">

export const CITY_CSV_HEADERS = [
  "编码",
  "城市名称",
  "省/州",
  "区域",
  "国家/地区",
  "可提箱",
  "可还箱",
  "排序",
  "启用",
] as const

const HEADER_ALIASES: Record<string, (typeof CITY_CSV_HEADERS)[number]> = {
  编码: "编码",
  code: "编码",
  城市编码: "编码",
  城市名称: "城市名称",
  name: "城市名称",
  名称: "城市名称",
  "省/州": "省/州",
  省: "省/州",
  州: "省/州",
  province: "省/州",
  区域: "区域",
  region: "区域",
  "国家/地区": "国家/地区",
  国家: "国家/地区",
  country: "国家/地区",
  可提箱: "可提箱",
  usableAsPickup: "可提箱",
  提箱: "可提箱",
  可还箱: "可还箱",
  usableAsReturn: "可还箱",
  还箱: "可还箱",
  排序: "排序",
  sort: "排序",
  启用: "启用",
  enabled: "启用",
  状态: "启用",
}

function yn(v: boolean): string {
  return v ? "是" : "否"
}

export function cityToCsvRow(c: CityDictItem): string[] {
  return [
    c.code,
    c.name,
    c.province,
    c.region,
    c.country,
    yn(c.usableAsPickup),
    yn(c.usableAsReturn),
    String(c.sort),
    yn(c.enabled),
  ]
}

function parseBool(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase()
  if (!v) return fallback
  if (["是", "y", "yes", "true", "1", "启用", "可"].includes(v)) return true
  if (["否", "n", "no", "false", "0", "停用", "禁用"].includes(v)) return false
  return fallback
}

function parseRegion(raw: string): CityRegion {
  const v = raw.trim()
  if (v === "境外" || v.toLowerCase() === "overseas") return "境外"
  return "境内"
}

/** 将表头行映射为标准列索引；缺「编码」「城市名称」则失败 */
export function mapCityCsvHeaders(headerRow: string[]): {
  ok: true
  index: Partial<Record<(typeof CITY_CSV_HEADERS)[number], number>>
} | { ok: false; message: string } {
  const index: Partial<Record<(typeof CITY_CSV_HEADERS)[number], number>> = {}
  headerRow.forEach((h, i) => {
    const key = HEADER_ALIASES[h.trim()] ?? HEADER_ALIASES[h.trim().toLowerCase()]
    if (key) index[key] = i
  })
  if (index["编码"] == null || index["城市名称"] == null) {
    return {
      ok: false,
      message: `CSV 表头需包含「编码」「城市名称」列（当前：${headerRow.join(", ") || "空"}）`,
    }
  }
  return { ok: true, index }
}

export function parseCityCsvRows(matrix: string[][]): {
  ok: true
  rows: CityCsvInput[]
  errors: string[]
} | { ok: false; message: string } {
  if (matrix.length < 2) {
    return { ok: false, message: "CSV 无数据行，请至少包含表头与一行城市" }
  }
  const mapped = mapCityCsvHeaders(matrix[0]!)
  if (!mapped.ok) return mapped
  const { index } = mapped
  const cell = (row: string[], key: (typeof CITY_CSV_HEADERS)[number]) => {
    const i = index[key]
    return i == null ? "" : (row[i] ?? "").trim()
  }

  const rows: CityCsvInput[] = []
  const errors: string[] = []
  const seen = new Set<string>()

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r]!
    const code = cell(row, "编码")
    const name = cell(row, "城市名称")
    if (!code && !name) continue
    if (!code || !name) {
      errors.push(`第 ${r + 1} 行：编码与城市名称均必填`)
      continue
    }
    const codeKey = code.toLowerCase()
    if (seen.has(codeKey)) {
      errors.push(`第 ${r + 1} 行：编码「${code}」在文件内重复，已跳过`)
      continue
    }
    seen.add(codeKey)

    const sortRaw = cell(row, "排序")
    const sort = sortRaw ? Number(sortRaw) : 99
    const region = parseRegion(cell(row, "区域") || "境内")
    rows.push({
      code,
      name,
      province: cell(row, "省/州"),
      region,
      country: cell(row, "国家/地区") || (region === "境内" ? "中国" : ""),
      usableAsPickup: parseBool(cell(row, "可提箱"), true),
      usableAsReturn: parseBool(cell(row, "可还箱"), true),
      sort: Number.isFinite(sort) ? sort : 99,
      enabled: parseBool(cell(row, "启用"), true),
    })
  }

  if (rows.length === 0) {
    return { ok: false, message: errors[0] || "未解析到有效城市行" }
  }
  return { ok: true, rows, errors }
}
