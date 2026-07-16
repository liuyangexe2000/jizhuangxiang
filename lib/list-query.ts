"use client"

import { useEffect, useMemo, useState } from "react"

export type SortDir = "asc" | "desc"

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 10

export function compareListValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1

  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b)

  const sa = String(a)
  const sb = String(b)

  // 时间字符串（含 2026-07-01 10:00）按时间戳比较
  const ta = Date.parse(sa.replace(/-/g, "/"))
  const tb = Date.parse(sb.replace(/-/g, "/"))
  if (Number.isFinite(ta) && Number.isFinite(tb) && /\d{4}/.test(sa) && /\d{4}/.test(sb)) {
    return ta - tb
  }

  // 纯数字字符串
  const na = Number(sa.replace(/[^\d.-]/g, ""))
  const nb = Number(sb.replace(/[^\d.-]/g, ""))
  if (sa.trim() !== "" && sb.trim() !== "" && Number.isFinite(na) && Number.isFinite(nb) && /^-?\d/.test(sa) && /^-?\d/.test(sb)) {
    if (na !== nb) return na - nb
  }

  return sa.localeCompare(sb, "zh-CN", { numeric: true, sensitivity: "base" })
}

export function getFieldValue(item: unknown, key: string): unknown {
  const record = item as Record<string, unknown>
  if (key.includes(".")) {
    return key.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part]
      return undefined
    }, record)
  }
  return record[key]
}

export interface UseListQueryOptions<T> {
  data: T[]
  /** 默认排序字段 */
  defaultSortKey: string
  /** 默认排序方向，业务列表通常为时间倒序 */
  defaultSortDir?: SortDir
  /** 自定义取值（如线路、金额等组合列） */
  getSortValue?: (item: T, key: string) => unknown
  defaultPageSize?: number
  pageSizeOptions?: readonly number[]
}

export function useListQuery<T>({
  data,
  defaultSortKey,
  defaultSortDir = "desc",
  getSortValue,
  defaultPageSize = DEFAULT_PAGE_SIZE,
}: UseListQueryOptions<T>) {
  const [sortKey, setSortKey] = useState(defaultSortKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  const sorted = useMemo(() => {
    const list = [...data]
    list.sort((a, b) => {
      const va = getSortValue ? getSortValue(a, sortKey) : getFieldValue(a, sortKey)
      const vb = getSortValue ? getSortValue(b, sortKey) : getFieldValue(b, sortKey)
      const cmp = compareListValues(va, vb)
      return sortDir === "asc" ? cmp : -cmp
    })
    return list
  }, [data, sortKey, sortDir, getSortValue])

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    setPage(1)
  }, [data, sortKey, sortDir, pageSize])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const rows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === defaultSortKey ? defaultSortDir : "asc")
    }
  }

  return {
    rows,
    total,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    sortKey,
    sortDir,
    toggleSort,
    sorted,
  }
}
