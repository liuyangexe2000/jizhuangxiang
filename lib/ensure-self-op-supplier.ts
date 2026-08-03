import "server-only"
import { list, create } from "@/lib/repo"
import {
  SELF_OP_SUPPLIER_ID,
  SELF_OP_SUPPLIER_NAME,
  selfOpSupplierSeed,
} from "@/lib/domain/self-op-supplier"
import type { Supplier } from "@/lib/types"

let ensured = false

/** 确保自营主体在供应商台账中存在（幂等） */
export async function ensureSelfOpSupplier(): Promise<void> {
  if (ensured) return
  try {
    const rows = (await list("suppliers")) as Supplier[]
    const hit = rows.find(
      (s) => s.id === SELF_OP_SUPPLIER_ID || s.name === SELF_OP_SUPPLIER_NAME || s.type === "自营",
    )
    if (!hit) {
      await create("suppliers", { ...selfOpSupplierSeed })
      console.log(`[v0] self-op supplier seeded: ${SELF_OP_SUPPLIER_NAME}`)
    }
    ensured = true
  } catch (e) {
    console.warn("[v0] ensureSelfOpSupplier skipped:", (e as Error).message)
  }
}
