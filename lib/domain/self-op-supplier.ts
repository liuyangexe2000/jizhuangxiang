/**
 * 系统自营主体：作为供应商台账中的「自营」条目，关联自有箱档案入口。
 */

import type { Supplier } from "../types"

export const SELF_OP_SUPPLIER_ID = "s0"
export const SELF_OP_SUPPLIER_NAME = "西安国际陆港多式联运有限公司"

export const selfOpSupplierSeed: Supplier = {
  id: SELF_OP_SUPPLIER_ID,
  name: SELF_OP_SUPPLIER_NAME,
  type: "自营",
  contact: "集装箱管理部",
  phone: "029-8900 0000",
  email: "container@xaport.com",
  country: "中国",
  rating: "A",
  cooperationSince: "2013-01",
  enabled: true,
}

export function isSelfOpSupplier(s: Pick<Supplier, "id" | "name" | "type">): boolean {
  return (
    s.type === "自营" ||
    s.id === SELF_OP_SUPPLIER_ID ||
    s.name === SELF_OP_SUPPLIER_NAME
  )
}
