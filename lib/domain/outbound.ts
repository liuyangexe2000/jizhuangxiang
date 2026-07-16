import type { OutboundEvent } from "../types"
import { nowLocalStr } from "./dispatch-ops"

type CreateFn = (payload: Partial<OutboundEvent> & Record<string, unknown>) => Promise<unknown>
type UpdateFn = (id: string, payload: Partial<OutboundEvent> & Record<string, unknown>) => Promise<unknown>

export async function enqueueOutbound(
  create: CreateFn,
  input: {
    type: OutboundEvent["type"]
    relatedNo: string
    payload?: Record<string, unknown>
  },
) {
  const id = `oe_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  await create({
    id,
    type: input.type,
    relatedNo: input.relatedNo,
    payload: input.payload ?? {},
    status: "pending",
    createdAt: nowLocalStr(),
    __auditAction: "新增",
    __auditDetail: `出站队列 ${input.type} · ${input.relatedNo}`,
  })
  return id
}

export async function markDelivered(update: UpdateFn, id: string) {
  await update(id, {
    status: "delivered",
    deliveredAt: nowLocalStr(),
    __auditAction: "修改",
    __auditDetail: `标记出站已投递 ${id}`,
  })
}
