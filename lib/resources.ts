/**
 * 资源注册表 —— 通用数据层的单一配置源
 * API 路由与种子导入脚本共用此表。
 *
 * - table:   MySQL 表名
 * - id:      主键字段（camelCase，与列名一致），默认 "id"
 * - json:    需要 JSON 序列化/反序列化的字段
 * - bool:    存储为 TINYINT(1) 的布尔字段
 * - seed:    lib/mock-data.ts 中对应的导出名（供初始化脚本使用）
 * - module:  归属业务模块（用于审计日志）
 */

export interface ResourceConfig {
  table: string
  id: string
  json: string[]
  bool: string[]
  seed: string
  module: string
  label: string
}

export const RESOURCES = {
  orders: { table: "use_box_orders", id: "id", json: [], bool: ["releaseDocReady", "stuffingListUploaded", "returnProofUploaded"], seed: "useBoxOrders", module: "M01 客户门户", label: "用箱订单" },
  bills: { table: "bills", id: "id", json: ["items"], bool: [], seed: "bills", module: "M01 账单中心", label: "账单" },
  dispatch: { table: "dispatch_orders", id: "id", json: ["approvals"], bool: [], seed: "dispatchOrders", module: "M02 调运管理", label: "调运订单" },
  returns: { table: "return_applications", id: "id", json: ["containerNos", "relatedDispatchNos"], bool: [], seed: "returnApplications", module: "M02 还箱审核", label: "还箱申请" },
  inventory: { table: "inventory_rows", id: "id", json: [], bool: [], seed: "inventoryRows", module: "M03 库存管理", label: "库存台账" },
  gate: { table: "gate_records", id: "id", json: [], bool: [], seed: "gateRecords", module: "M03 进出场", label: "进出场记录" },
  containers: { table: "container_masters", id: "containerNo", json: [], bool: [], seed: "containerMasters", module: "M03 库存管理", label: "集装箱主档" },
  discrepancy: { table: "discrepancy_rows", id: "id", json: [], bool: [], seed: "discrepancyRows", module: "M03 差异核对", label: "库存差异" },
  templates: { table: "doc_templates", id: "id", json: ["fields", "layout"], bool: ["enabled", "builtIn"], seed: "docTemplates", module: "M04 模板配置", label: "单据模板" },
  bookings: { table: "bookings", id: "id", json: ["containerNos"], bool: ["notifyByEmail", "withinWorkHours"], seed: "bookings", module: "M04 预约与通知", label: "堆场预约" },
  yards: { table: "yards", id: "id", json: [], bool: ["hasSeal", "enabled", "deleted"], seed: "yards", module: "M04 堆场管理", label: "堆场" },
  cities: { table: "city_dict", id: "id", json: [], bool: ["usableAsPickup", "usableAsReturn", "enabled"], seed: "cityDict", module: "基础配置", label: "城市字典" },
  users: { table: "users", id: "id", json: [], bool: [], seed: "systemUsers", module: "系统管理", label: "用户" },
  suppliers: { table: "suppliers", id: "id", json: [], bool: ["enabled"], seed: "suppliers", module: "M05 供应计划", label: "供应商" },
  supplyPlans: { table: "supply_plans", id: "id", json: [], bool: [], seed: "supplyPlans", module: "M05 供应计划", label: "供应计划" },
  supplyContracts: { table: "supply_contracts", id: "id", json: [], bool: [], seed: "supplyContracts", module: "M05 供应计划", label: "供应合同" },
  repair: { table: "repair_orders", id: "id", json: [], bool: [], seed: "repairOrders", module: "M06 维修管理", label: "修箱工单" },
  notifications: { table: "notifications", id: "id", json: ["roles"], bool: ["actionable", "read"], seed: "notifications", module: "通知中心", label: "通知" },
  audit: { table: "audit_logs", id: "id", json: [], bool: ["proxied"], seed: "auditLogs", module: "系统管理", label: "操作日志" },
  integrations: { table: "integrations", id: "id", json: [], bool: [], seed: "integrations", module: "系统集成", label: "集成" },
  outboundEvents: {
    table: "outbound_events",
    id: "id",
    json: ["payload"],
    bool: [],
    seed: "outboundEvents",
    module: "系统集成",
    label: "出站事件",
  },
  attachments: {
    table: "attachments",
    id: "id",
    json: [],
    bool: [],
    seed: "attachments",
    module: "单据附件",
    label: "附件元数据",
  },
  feedbackTickets: {
    table: "feedback_tickets",
    id: "id",
    json: [],
    bool: [],
    seed: "feedbackTickets",
    module: "系统管理",
    label: "反馈工单",
  },
  settings: {
    table: "system_settings",
    id: "key",
    json: ["value"],
    bool: [],
    seed: "systemSettings",
    module: "系统管理",
    label: "系统设置",
  },
} satisfies Record<string, ResourceConfig>

export type ResourceKey = keyof typeof RESOURCES

export function isResourceKey(k: string): k is ResourceKey {
  return Object.prototype.hasOwnProperty.call(RESOURCES, k)
}
