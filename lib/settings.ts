/**
 * 系统设置：默认值、读写、ACL/业务参数缓存
 * 服务端模块（依赖 repo）
 */
import "server-only"
import { create, get, list, update } from "./repo"
import { navGroups } from "./nav"
import { defaultResourceAcl } from "./acl-defaults"
import type {
  ApprovalThresholds,
  RoleId,
  SystemSetting,
  WorkHoursConfig,
} from "./types"
import type { ResourceKey } from "./resources"
import { nowLocalStr } from "./now-local"

import { SETTING_KEYS } from "./settings-keys"

export { SETTING_KEYS }
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

const ALL_ROLES: RoleId[] = ["R00", "R01", "R02", "R03", "R04", "R05", "R06"]

export type NavAclMap = Partial<Record<RoleId, string[]>>
export type ResourceAclMap = Partial<
  Record<ResourceKey, { read: RoleId[]; write: RoleId[] }>
>
export type ShowUnauthorizedMenusMap = Record<RoleId, boolean>

export function buildDefaultNavAcl(): NavAclMap {
  const map: NavAclMap = {}
  for (const role of ALL_ROLES) {
    const hrefs: string[] = []
    for (const g of navGroups) {
      for (const item of g.items) {
        if (g.module === "系统管理") {
          if (role === "R00") hrefs.push(item.href)
          continue
        }
        if (role === "R00" || item.roles.includes(role)) hrefs.push(item.href)
      }
    }
    map[role] = [...new Set(hrefs)]
  }
  return map
}

export function buildDefaultShowUnauthorizedMenus(): ShowUnauthorizedMenusMap {
  return Object.fromEntries(ALL_ROLES.map((r) => [r, true])) as ShowUnauthorizedMenusMap
}

export const DEFAULT_WORK_HOURS: WorkHoursConfig = { startHour: 8, endHour: 18 }

export const DEFAULT_APPROVAL_THRESHOLDS: ApprovalThresholds = {
  level2Below: 20000,
  level3Below: 50000,
}

/** 代码默认值（未落库时回退） */
export const CODE_DEFAULTS: Record<string, unknown> = {
  [SETTING_KEYS.showDemoAccounts]: true,
  [SETTING_KEYS.showUnauthorizedMenus]: buildDefaultShowUnauthorizedMenus(),
  [SETTING_KEYS.aclNav]: null, // null = 使用 nav.ts
  [SETTING_KEYS.aclResources]: null, // null = 使用 acl.ts
  [SETTING_KEYS.cancelFreeHours]: 24,
  [SETTING_KEYS.returnBookingLeadHours]: 24,
  [SETTING_KEYS.workHours]: DEFAULT_WORK_HOURS,
  [SETTING_KEYS.billConfirmDays]: 3,
  [SETTING_KEYS.returnProofOverdueDays]: 3,
  [SETTING_KEYS.useboxFreeDays]: 7,
  [SETTING_KEYS.useboxOverdueDailyRate]: 50,
  [SETTING_KEYS.useboxDamageDefaultFee]: 2000,
  [SETTING_KEYS.approvalThresholds]: DEFAULT_APPROVAL_THRESHOLDS,
  [SETTING_KEYS.feedbackTicketEnabled]: true,
}

type CacheBag = {
  values: Map<string, unknown>
  loadedAt: number
}

let cache: CacheBag | null = null

export function invalidateSettingsCache() {
  cache = null
}

async function loadCache(): Promise<CacheBag> {
  if (cache) return cache
  const rows = (await list("settings")) as SystemSetting[]
  const values = new Map<string, unknown>()
  for (const [k, v] of Object.entries(CODE_DEFAULTS)) {
    values.set(k, v)
  }
  for (const row of rows) {
    values.set(row.key, row.value)
  }
  cache = { values, loadedAt: Date.now() }
  return cache
}

export async function getSetting<T = unknown>(key: string, fallback?: T): Promise<T> {
  const c = await loadCache()
  if (c.values.has(key)) return c.values.get(key) as T
  if (fallback !== undefined) return fallback
  return CODE_DEFAULTS[key] as T
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedBy = "admin",
): Promise<SystemSetting> {
  const now = nowLocalStr()
  const existing = await get("settings", key)
  let row: SystemSetting
  if (existing) {
    row = (await update("settings", key, {
      value,
      updatedAt: now,
      updatedBy,
    })) as SystemSetting
  } else {
    row = (await create("settings", {
      key,
      value,
      updatedAt: now,
      updatedBy,
    })) as SystemSetting
  }
  invalidateSettingsCache()
  try {
    const { resetAclRuntimeCache } = await import("./acl-runtime")
    resetAclRuntimeCache()
  } catch {
    /* ignore */
  }
  return row
}

export async function resetSettingToDefault(key: string, updatedBy = "admin") {
  const def = CODE_DEFAULTS[key]
  if (key === SETTING_KEYS.aclNav || key === SETTING_KEYS.aclResources) {
    return setSetting(key, null, updatedBy)
  }
  return setSetting(key, def ?? null, updatedBy)
}

export type PublicSettings = {
  showDemoAccounts: boolean
  showUnauthorizedMenus: ShowUnauthorizedMenusMap
  cancelFreeHours: number
  returnBookingLeadHours: number
  workHours: WorkHoursConfig
  billConfirmDays: number
  returnProofOverdueDays: number
  useboxFreeDays: number
  useboxOverdueDailyRate: number
  useboxDamageDefaultFee: number
  approvalThresholds: ApprovalThresholds
  feedbackTicketEnabled: boolean
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const [
    showDemoAccounts,
    showUnauthorizedMenus,
    cancelFreeHours,
    returnBookingLeadHours,
    workHours,
    billConfirmDays,
    returnProofOverdueDays,
    useboxFreeDays,
    useboxOverdueDailyRate,
    useboxDamageDefaultFee,
    approvalThresholds,
    feedbackTicketEnabled,
  ] = await Promise.all([
    getSetting<boolean>(SETTING_KEYS.showDemoAccounts, true),
    getSetting<ShowUnauthorizedMenusMap>(
      SETTING_KEYS.showUnauthorizedMenus,
      buildDefaultShowUnauthorizedMenus(),
    ),
    getSetting<number>(SETTING_KEYS.cancelFreeHours, 24),
    getSetting<number>(SETTING_KEYS.returnBookingLeadHours, 24),
    getSetting<WorkHoursConfig>(SETTING_KEYS.workHours, DEFAULT_WORK_HOURS),
    getSetting<number>(SETTING_KEYS.billConfirmDays, 3),
    getSetting<number>(SETTING_KEYS.returnProofOverdueDays, 3),
    getSetting<number>(SETTING_KEYS.useboxFreeDays, 7),
    getSetting<number>(SETTING_KEYS.useboxOverdueDailyRate, 50),
    getSetting<number>(SETTING_KEYS.useboxDamageDefaultFee, 2000),
    getSetting<ApprovalThresholds>(SETTING_KEYS.approvalThresholds, DEFAULT_APPROVAL_THRESHOLDS),
    getSetting<boolean>(SETTING_KEYS.feedbackTicketEnabled, true),
  ])
  return {
    showDemoAccounts,
    showUnauthorizedMenus: {
      ...buildDefaultShowUnauthorizedMenus(),
      ...showUnauthorizedMenus,
    },
    cancelFreeHours,
    returnBookingLeadHours,
    workHours: { ...DEFAULT_WORK_HOURS, ...workHours },
    billConfirmDays,
    returnProofOverdueDays,
    useboxFreeDays,
    useboxOverdueDailyRate,
    useboxDamageDefaultFee,
    approvalThresholds: { ...DEFAULT_APPROVAL_THRESHOLDS, ...approvalThresholds },
    feedbackTicketEnabled: !!feedbackTicketEnabled,
  }
}

export async function getNavAclForRole(roleId: RoleId): Promise<string[] | null> {
  const map = await getSetting<NavAclMap | null>(SETTING_KEYS.aclNav, null)
  if (!map || typeof map !== "object") return null
  const hrefs = map[roleId]
  return Array.isArray(hrefs) ? hrefs : null
}

export async function getResourceAclOverlay(): Promise<ResourceAclMap | null> {
  const map = await getSetting<ResourceAclMap | null>(SETTING_KEYS.aclResources, null)
  if (!map || typeof map !== "object") return null
  return map
}

/** 种子用：空数组，首次访问用 CODE_DEFAULTS 回退；管理员保存后才落库 */
export function seedSystemSettings(): SystemSetting[] {
  return []
}

export { defaultResourceAcl, ALL_ROLES }
