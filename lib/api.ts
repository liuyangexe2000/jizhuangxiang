"use client"

import useSWR, { mutate as globalMutate } from "swr"
import type { ResourceKey } from "./resources"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  // 无资源权限时返回空列表，避免仪表盘/联动页因 403 整页报错
  if (res.status === 403) return []
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "请求失败")
  return res.json()
}

export interface AuditMeta {
  __auditAction?: string
  __auditDetail?: string
}

/**
 * 通用资源数据 hook —— 基于 SWR 从 /api/<resource> 读取，并提供增删改。
 * 所有写操作后自动重新验证列表，保证多组件同步。
 */
export function useResource<T = any>(resource: ResourceKey) {
  const key = `/api/${resource}`
  const { data, error, isLoading, mutate } = useSWR<T[]>(key, fetcher)

  async function create(payload: Partial<T> & AuditMeta): Promise<T> {
    const res = await fetch(key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "新增失败")
    const created = await res.json()
    await mutate()
    return created
  }

  async function update(id: string, patch: Partial<T> & AuditMeta): Promise<T> {
    const res = await fetch(`${key}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "更新失败")
    const updated = await res.json()
    await mutate()
    return updated
  }

  async function remove(id: string, meta?: AuditMeta): Promise<void> {
    const qs = meta?.__auditDetail ? `?detail=${encodeURIComponent(meta.__auditDetail)}` : ""
    const res = await fetch(`${key}/${encodeURIComponent(id)}${qs}`, { method: "DELETE" })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "删除失败")
    await mutate()
  }

  return {
    data: data ?? [],
    isLoading,
    error,
    mutate,
    create,
    update,
    remove,
  }
}

/** 手动触发某资源列表刷新（跨组件） */
export function revalidateResource(resource: ResourceKey) {
  return globalMutate(`/api/${resource}`)
}
