/**
 * 默认资源 ACL（与 lib/acl.ts 代码矩阵一致，供设置页「恢复默认」与 settings 引用，避免循环依赖）
 */
import type { RoleId } from "./types"
import type { ResourceKey } from "./resources"

type Access = { read: RoleId[]; write: RoleId[] }

const ALL: RoleId[] = ["R00", "R01", "R02", "R03", "R04", "R05", "R06"]

function roles(...lists: RoleId[][]): RoleId[] {
  return Array.from(new Set(lists.flat()))
}

/** 与 acl.ts 内 DEFAULT_ACL 保持同步 */
export const defaultResourceAcl: Record<ResourceKey, Access> = {
  orders: {
    read: roles(["R00", "R01", "R03", "R04", "R06"]),
    write: roles(["R00", "R01", "R03"]),
  },
  bills: {
    read: roles(["R00", "R01", "R03", "R02", "R05"]),
    write: roles(["R00", "R01", "R03", "R05"]),
  },
  dispatch: {
    read: roles(["R00", "R01", "R02", "R04", "R05"]),
    write: roles(["R00", "R01", "R02", "R04", "R05"]),
  },
  returns: {
    read: roles(["R00", "R01", "R04", "R05"]),
    write: roles(["R00", "R01", "R05"]),
  },
  inventory: {
    read: roles(["R00", "R01", "R03", "R04", "R05", "R06"]),
    write: roles(["R00", "R01", "R03", "R04", "R05"]),
  },
  gate: {
    read: roles(["R00", "R01", "R04", "R05", "R06"]),
    write: roles(["R00", "R01", "R04", "R05", "R06"]),
  },
  containers: {
    read: roles(["R00", "R01", "R04", "R05", "R06"]),
    write: roles(["R00", "R01", "R04", "R05", "R06"]),
  },
  discrepancy: {
    read: roles(["R00", "R01", "R04"]),
    write: roles(["R00", "R01", "R04"]),
  },
  templates: {
    read: roles(["R00", "R01", "R03", "R04", "R06"]),
    write: roles(["R00", "R01", "R04"]),
  },
  bookings: {
    read: roles(["R00", "R01", "R03", "R04", "R05", "R06"]),
    write: roles(["R00", "R01", "R03", "R04", "R05", "R06"]),
  },
  yards: {
    read: roles(["R00", "R01", "R04", "R06"]),
    write: roles(["R00", "R01", "R04", "R06"]),
  },
  cities: {
    read: ALL,
    write: roles(["R00", "R01", "R04"]),
  },
  suppliers: {
    read: roles(["R00", "R01"]),
    write: roles(["R00", "R01"]),
  },
  supplyPlans: {
    read: roles(["R00", "R01"]),
    write: roles(["R00", "R01"]),
  },
  supplyContracts: {
    read: roles(["R00", "R01", "R02"]),
    write: roles(["R00", "R01", "R02"]),
  },
  repair: {
    read: roles(["R00", "R01", "R03", "R04", "R06"]),
    write: roles(["R00", "R01", "R03", "R04", "R06"]),
  },
  notifications: { read: ALL, write: ALL },
  users: { read: ["R00", "R01"], write: ["R00"] },
  audit: { read: ["R00"], write: ["R00"] },
  integrations: { read: ["R00"], write: ["R00"] },
  outboundEvents: {
    read: roles(["R00", "R01", "R03", "R05"]),
    write: roles(["R00", "R01", "R03", "R05"]),
  },
  attachments: {
    read: roles(["R00", "R01", "R03", "R04", "R05", "R06"]),
    write: roles(["R00", "R01", "R03", "R04", "R05", "R06"]),
  },
  settings: { read: ["R00"], write: ["R00"] },
}
