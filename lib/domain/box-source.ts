/**
 * 箱源（自有箱 / 租赁箱）— Batch D 骨架
 * 用于库存筛选、用箱订单 boxSource 与容器 ownership 对齐。
 */

export type BoxSource = "自有箱" | "租赁箱"

export const BOX_SOURCES: BoxSource[] = ["自有箱", "租赁箱"]

export function isBoxSource(v: unknown): v is BoxSource {
  return v === "自有箱" || v === "租赁箱"
}

/** 带箱源字段的可筛选项（库存明细 / 箱主档 / 闸口等） */
export type WithBoxSource = {
  ownership?: BoxSource | string
  boxSource?: BoxSource | string
}

/**
 * 按箱源过滤列表。未指定 source 时原样返回。
 * 优先匹配 ownership，其次 boxSource。
 */
export function filterInventoryByBoxSource<T extends WithBoxSource>(
  items: T[],
  source?: BoxSource | null,
): T[] {
  if (!source) return items
  return items.filter((row) => {
    const hit = row.ownership ?? row.boxSource
    return hit === source
  })
}
