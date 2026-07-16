import "server-only"
import { applyAclRuntime, clearAclRuntime, invalidateAclRuntime } from "./acl"
import { getSetting, SETTING_KEYS, type NavAclMap, type ResourceAclMap } from "./settings"

let loaded = false

/** 从 system_settings 刷新覆盖层（仅服务端 API 调用） */
export async function ensureAclRuntime() {
  if (loaded) return
  try {
    const [nav, resources] = await Promise.all([
      getSetting<NavAclMap | null>(SETTING_KEYS.aclNav, null),
      getSetting<ResourceAclMap | null>(SETTING_KEYS.aclResources, null),
    ])
    applyAclRuntime({
      nav: nav && typeof nav === "object" ? nav : null,
      resources: resources && typeof resources === "object" ? resources : null,
    })
  } catch {
    applyAclRuntime({ nav: null, resources: null })
  }
  loaded = true
}

export function resetAclRuntimeCache() {
  loaded = false
  invalidateAclRuntime()
  clearAclRuntime()
}

export { invalidateAclRuntime }
