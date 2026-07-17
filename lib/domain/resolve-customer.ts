import type { Customer } from "@/lib/types"

/** 按客户全称/简称解析主档 id（无匹配返回 undefined） */
export function resolveCustomerId(
  customerName: string | undefined | null,
  customers: Customer[],
): string | undefined {
  const name = customerName?.trim()
  if (!name) return undefined
  const hit = customers.find(
    (c) =>
      !c.deleted &&
      (c.name === name ||
        c.abbreviation === name ||
        (!!c.abbreviation && (c.name.includes(name) || name.includes(c.abbreviation)))),
  )
  return hit?.id
}
