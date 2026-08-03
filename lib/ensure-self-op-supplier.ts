import "server-only"
import { list, create } from "@/lib/repo"
import {
  SELF_OP_SUPPLIER_ID,
  SELF_OP_SUPPLIER_NAME,
  selfOpSupplierSeed,
} from "@/lib/domain/self-op-supplier"
import type { Carrier, Supplier } from "@/lib/types"

let ensured = false

/** 确保自营主体 + 调运供应商（由承运商台账同步）存在（幂等） */
export async function ensureSelfOpSupplier(): Promise<void> {
  if (ensured) return
  try {
    const rows = (await list("suppliers")) as Supplier[]
    const byName = new Set(rows.map((s) => s.name))

    const hit = rows.find(
      (s) => s.id === SELF_OP_SUPPLIER_ID || s.name === SELF_OP_SUPPLIER_NAME || s.type === "自营",
    )
    if (!hit) {
      await create("suppliers", { ...selfOpSupplierSeed })
      byName.add(SELF_OP_SUPPLIER_NAME)
      console.log(`[v0] self-op supplier seeded: ${SELF_OP_SUPPLIER_NAME}`)
    }

    const carriers = (await list("carriers")) as Carrier[]
    for (const c of carriers) {
      const name = c.name?.trim()
      if (!name || byName.has(name)) continue
      await create("suppliers", {
        id: `sd-${c.id}`,
        name,
        type: "调运供应商",
        contact: "调运业务对接",
        phone: "",
        email: "",
        country: "—",
        rating: "A",
        cooperationSince: "2024-01",
        enabled: c.enabled !== false,
      })
      byName.add(name)
      console.log(`[v0] dispatch supplier synced: ${name}`)
    }

    ensured = true
  } catch (e) {
    console.warn("[v0] ensureSelfOpSupplier skipped:", (e as Error).message)
  }
}
