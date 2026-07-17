/**
 * 校验：各角色进入其可见页面时，页面所需资源是否具备 read 权限
 * 运行：pnpm exec tsx scripts/check-acl.ts
 */
import { canAccessResource, canAccessPath } from "../lib/acl"
import { navGroups } from "../lib/nav"
import type { RoleId } from "../lib/types"
import type { ResourceKey } from "../lib/resources"

/** 页面路径 → 该页 useResource 依赖（只读校验） */
const PAGE_RESOURCES: Record<string, ResourceKey[]> = {
  "/": ["orders", "dispatch", "bills", "inventory", "notifications", "integrations"],
  "/inbox": ["notifications"],
  "/customer/apply": ["orders", "cities"],
  "/customer/orders": ["orders"],
  "/customer/documents": ["orders", "bookings", "templates", "attachments", "inventory", "repair", "notifications"],
  "/customer/bills": ["bills", "outboundEvents", "notifications"],
  "/dispatch/apply": ["dispatch"],
  "/dispatch/approvals": ["dispatch"],
  "/dispatch/tasks": ["dispatch", "bookings", "inventory", "gate", "containers", "returns"],
  "/dispatch/returns": ["returns", "dispatch", "inventory", "gate", "containers"],
  "/dispatch/ledger": ["dispatch", "bills", "outboundEvents"],
  "/inventory/ledger": ["inventory", "containers"],
  "/inventory/gate": ["gate"],
  "/inventory/exceptions": ["gate", "inventory", "containers", "dispatch", "orders"],
  "/inventory/reports": ["inventory", "containers"],
  "/inventory/discrepancy": ["discrepancy"],
  "/repair/orders": ["repair"],
  "/yard/templates": ["templates"],
  "/yard/bookings": ["bookings"],
  "/yard/yards": ["yards"],
  "/supply/plans": ["supplyPlans"],
  "/supply/contracts": ["supplyContracts"],
  "/supply/suppliers": ["suppliers"],
  "/config/cities": ["cities"],
  "/config/customers": ["customers"],
  "/admin/users": ["users"],
  "/admin": ["settings"],
  "/admin/data": ["orders"],
  "/admin/permissions": ["settings"],
  "/admin/settings": ["settings"],
  "/admin/audit": ["audit"],
  "/admin/integrations": ["integrations", "outboundEvents"],
}

const ROLES: RoleId[] = ["R00", "R01", "R02", "R03", "R04", "R05", "R06"]

let failures = 0

for (const role of ROLES) {
  const realAdmin = role === "R00"
  for (const [path, resources] of Object.entries(PAGE_RESOURCES)) {
    if (!canAccessPath(path, role, { realAdmin })) continue
    // 仪表盘对无权限资源走软降级，仅强制通知可读
    const required = path === "/" ? (["notifications"] as ResourceKey[]) : resources
    for (const res of required) {
      if (!canAccessResource(res, role, "read")) {
        console.error(`FAIL ${role} @ ${path} 缺少 read:${res}`)
        failures++
      }
    }
  }
}

// 承运任务写联动
for (const res of ["inventory", "gate", "containers", "bookings", "dispatch"] as ResourceKey[]) {
  if (!canAccessResource(res, "R05", "write")) {
    console.error(`FAIL R05 任务联动缺少 write:${res}`)
    failures++
  }
}

if (failures === 0) {
  console.log("✅ ACL 与页面依赖校验通过（基于代码默认矩阵；DB 覆盖需运行时验证）")
  process.exit(0)
} else {
  console.error(`❌ 共 ${failures} 处不匹配`)
  process.exit(1)
}
