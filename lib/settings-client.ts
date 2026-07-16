"use client"

import useSWR from "swr"
import type { ApprovalThresholds, RoleId, WorkHoursConfig } from "@/lib/types"

export type PublicSettingsClient = {
  showDemoAccounts: boolean
  showUnauthorizedMenus: Record<RoleId, boolean>
  cancelFreeHours: number
  returnBookingLeadHours: number
  workHours: WorkHoursConfig
  billConfirmDays: number
  returnProofOverdueDays: number
  approvalThresholds: ApprovalThresholds
  feedbackTicketEnabled: boolean
}

export type RuntimeSettingsClient = PublicSettingsClient & {
  roleId: RoleId
  navHrefs: string[] | null
}

const publicFetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error("加载公开配置失败")
  return res.json()
}

const runtimeFetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  if (res.status === 401) return null
  if (!res.ok) throw new Error("加载运行时配置失败")
  return res.json()
}

/** 登录页等未登录场景 */
export function usePublicSettings() {
  const { data, error, isLoading, mutate } = useSWR<PublicSettingsClient>(
    "/api/settings/public",
    publicFetcher,
    { revalidateOnFocus: false },
  )
  return {
    settings: data,
    error,
    isLoading,
    mutate,
  }
}

/** 已登录：侧栏 / 页面守卫 */
export function useRuntimeSettings() {
  const { data, error, isLoading, mutate } = useSWR<RuntimeSettingsClient | null>(
    "/api/settings/runtime",
    runtimeFetcher,
    { revalidateOnFocus: true },
  )
  return {
    settings: data,
    error,
    isLoading,
    mutate,
  }
}
