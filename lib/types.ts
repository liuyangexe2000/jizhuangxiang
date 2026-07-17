// 集装箱业务管理系统 — 全局类型定义

export type RoleId = "R00" | "R01" | "R02" | "R03" | "R04" | "R05" | "R06"

export interface Role {
  id: RoleId
  name: string
  org: string
  type: string
  description: string
}

// ---------- M01 客户用箱业务 ----------

export type OrderStatus =
  | "待确认"
  | "已确认"
  | "已取消"
  | "超时取消"
  | "提箱中"
  | "已提箱"
  | "还箱中"
  | "已完成"

export type ContainerType = "20GP" | "40GP" | "40HQ" | "45HQ"

export interface UseBoxOrder {
  id: string
  orderNo: string
  customer: string
  /** 客户主档 id（可选；历史数据可能仅有名称） */
  customerId?: string
  customerType: "班列客户" | "多式联运客户" | "租箱客户"
  pickupCity: string
  returnCity: string
  /** 执行中可改的提箱堆场（BR-16） */
  pickupYard?: string
  /** 执行中可改的还箱堆场（BR-16） */
  returnYard?: string
  containerType: ContainerType
  quantity: number
  /** 成交单价（箱管确认时可改） */
  unitPrice: number
  /** 客户提交时系统报价 */
  quotedUnitPrice?: number
  status: OrderStatus
  createdAt: string
  confirmedAt?: string
  /** 确认人（箱管） */
  confirmedBy?: string
  cancelDeadline?: string // 24h 免责取消截止
  releaseDocReady: boolean
  stuffingListUploaded: boolean
  returnProofUploaded: boolean
  /** 提箱箱况检查：通过 / 异常 / 未检 */
  conditionCheck?: "未检" | "通过" | "异常"
  conditionNote?: string
  channel: "订舱勾选" | "订舱后新增"
  /** 客户申请备注 */
  remark?: string
  /** 箱管确认备注（确认后客户可见） */
  adminRemark?: string
  /** 现场确认放箱人/时间（R04/R06） */
  pickupGateBy?: string
  pickupGateAt?: string
  /** 现场确认收箱人/时间（R04/R06） */
  returnGateBy?: string
  returnGateAt?: string
}

export type BillType = "用箱账单" | "超期费账单" | "箱损费账单" | "用箱变更费账单" | "调运费账单"
export type BillStatus = "待确认" | "已确认" | "有异议" | "已支付" | "超时默认确认"

export interface Bill {
  id: string
  billNo: string
  type: BillType
  relatedOrderNo: string
  party: string
  /** 客户主档 id（可选） */
  customerId?: string
  amount: number
  status: BillStatus
  issuedAt: string
  confirmDeadline: string
  items: { label: string; value: string }[]
  /** 客户异议原因 */
  disputeReason?: string
  /** 箱管调整人（调整金额/明细后写入） */
  adjustedBy?: string
}

// ---------- M02 调运业务 ----------

export type DispatchStatus =
  | "草稿"
  | "审批中"
  | "已驳回"
  | "已审批"
  | "已下发"
  | "提箱中"
  | "还箱中"
  | "已结束"

export interface ApprovalStep {
  level: number
  role: string
  approver: string
  status: "待审批" | "通过" | "驳回" | "未开始"
  comment?: string
  time?: string
}

/** 调运单价方案（按提箱地 + 还箱范围） */
export interface DispatchPriceRule {
  id: string
  pickupPlace: string
  scope: string
  unitPrice: number
  overdue: string
  suggestTerm: number
  zone: "近距" | "中距" | "远距"
  enabled: boolean
}

/** 承运商台账 */
export interface Carrier {
  id: string
  name: string
  enabled: boolean
}

/** 调运审批链配置（按账号解析审批人姓名） */
export interface DispatchApprovalLevel {
  id: string
  level: number
  roleTitle: string
  account: string
}

export interface DispatchOrder {
  id: string
  dispatchNo: string
  planTime: string
  pickupPlace: string
  returnScope: string
  reason: string
  unitPrice: number
  overdueStandard: string
  useTerm: number // 用箱期(天)
  quantity: number
  carrier: string
  totalPrice: number
  status: DispatchStatus
  createdBy: string
  createdAt: string
  approvals: ApprovalStep[]
  pickedCount: number
  returnedCount: number
}

export type ReturnApplyStatus = "待审核" | "已通过" | "已驳回"

export interface ReturnApplication {
  id: string
  applyNo: string
  carrier: string
  containerNos: string[]
  relatedDispatchNos: string[] // 支持跨订单
  returnCity: string
  returnYard: string
  appliedAt: string
  status: ReturnApplyStatus
  reviewer?: string
  rejectReason?: string
}

// ---------- M03 库存 ----------

export interface InventoryRow {
  id?: string
  region: string
  city: string
  yard: string
  agent: string
  onSite: number // 在场库存(物理)
  available: number // 可用库存 = 在场 - 已放待提
  reserved: number // 已放待提
  incoming: number // 预计进场(已提未还)
}

export type MappingStatus = "已映射" | "未映射" | "异常"

export interface GateRecord {
  id: string
  containerNo: string
  type: "进场" | "出场"
  time: string
  yard: string
  city: string
  source: "系统放箱/调运订单" | "代管公司上传" | "手工补录异常"
  relatedOrderNo?: string
  mappingStatus: MappingStatus
  ownership: "自有箱" | "租赁箱"
}

export interface ContainerMaster {
  /** 箱号（本系统主键） */
  containerNo: string
  /** 老系统 base_container_info.id，仅作匹配，非主键 */
  legacyId?: number | null
  type: ContainerType
  /** 老系统集装箱类型 id */
  containerTypeId?: number | null
  /** 老系统集装箱尺寸 id */
  containerTypeSpecId?: number | null
  ownership: "自有箱" | "租赁箱"
  /** 老系统属性码：1 自有 / 2 长租 / 3 短租 */
  containerAttribute?: string
  containerSupplierId?: string
  /** 老系统 city 原文，如「中国-陕西省-西安市」 */
  cityRaw?: string
  currentCity: string
  currentYard: string
  /** 老系统堆场 uuid，对应 yards.factoryId */
  factoryId?: string
  color?: string
  batch?: string
  status: "在场" | "已提未还" | "在途" | "维修中" | "已报废"
  /** 老系统状态码：0 可用 1 在途 2 锁定 3 维修 4 灭失 */
  statusCode?: string
  validStart?: number | null
  validEnd?: number | null
  currencyId?: number | null
  exchangeRate?: number
  /** 成色：1 新箱 2 次新箱 3 适货箱 */
  containerLife?: number | null
  productionTime?: number | null
  manufacturer?: string
  depreciation?: number | null
  purchasePrice?: number | null
  lifeCycle?: number | null
  createBy?: string
  createTime?: string
  updateBy?: string
  updateTime?: string
  deleted?: boolean
  remark?: string
  createName?: string
  updateName?: string
  /** 开始堆存时间（10 位时间戳） */
  startTime?: number | null
  manualStatus?: string
  freeDay?: number
  lastGateTime: string
  storageDays: number
  relatedOrderNo?: string
}

export interface DiscrepancyRow {
  id: string
  yard: string
  city: string
  systemCount: number
  agentCount: number
  diff: number
  checkedAt: string
  status: "待核对" | "已修正" | "无差异"
}

// ---------- M04 模板与堆场 ----------

export type DocKind =
  | "pickup"
  | "return"
  | "dispatch_approval"
  | "business_entrust"
  | "overdue_bill"
  | "dispatch_bill"
  | "other"

/** 提还箱打印布局（存 JSON） */
export interface DocTemplateLayout {
  orgLine: string
  title: string
  showTemplateName: boolean
  metaLine: string
  rows: { cells: { key: string; label: string }[] }[]
  notice: string
  showSignature: boolean
  signatureLabel: string
  seal: {
    enabled: boolean
    imageDataUrl?: string
    label: string
    offsetX: number
    offsetY: number
    size: number
  }
}

export interface DocTemplate {
  id: string
  name: string
  code: string
  scene: string
  fields: string[]
  updatedAt: string
  enabled: boolean
  /** 单据类别：提箱 / 还箱 / 其他 */
  docKind: DocKind
  /** 内置模板不可直接编辑内容，仅可启用/停用；可「复用」后编辑副本 */
  builtIn: boolean
  /** 复用来源模板 id */
  clonedFrom?: string
  /** 可视化布局；提还箱打印使用 */
  layout?: DocTemplateLayout
}

export type BookingStatus = "待发送" | "已通知" | "已确认" | "超时"

export interface Booking {
  id: string
  bookingNo: string
  type: "提箱预约" | "还箱预约"
  containerNos: string[]
  yard: string
  city: string
  planTime: string
  driver: string
  driverId: string
  driverPhone: string
  plateNo: string
  refNo: string
  notifyByEmail: boolean
  status: BookingStatus
  withinWorkHours: boolean
  confirmedBy?: string
  confirmedAt?: string
}

export interface Yard {
  id: string
  /** 老系统 base_container_factory.id，仅作匹配记录，非本表主键 */
  legacyId: number
  /** 老系统堆场 uuid */
  factoryId: string
  factoryNumber: string
  factoryCode: string
  name: string
  region: string // 境内 | 境外
  city: string
  /** 老系统 region_id（base_region.id） */
  regionId: number | null
  agent: string
  proxyCompanyId: string
  address: string
  phone: string
  contactUser: string
  email: string
  creditCode: string
  currencyId: number | null
  dailyExpenses: number | null
  freeDuration: number | null
  boardingFee: number | null
  alightingFee: number | null
  secondaryRemovalFee: number | null
  /** 是否有电子章（源表 has_seal：0 有 / 1 没有） */
  hasSeal: boolean
  capacity: number
  current: number
  enabled: boolean
  deleted: boolean
  version: number | null
  /** 提箱单备注 */
  remark: string
  /** 还箱指令 */
  receiveRemark: string
  /** 还箱单备注 */
  remarkReturnOrder: string
  createBy: string
  createName: string
  createTime: string
  updateBy: string
  updateName: string
  updateTime: string
}

// ---------- 集装箱供应计划（采购/租赁） ----------

export type SupplierType = "制造商" | "租赁商"

export interface Supplier {
  id: string
  name: string
  type: SupplierType
  contact: string
  phone: string
  email: string
  country: string
  rating: "A" | "B" | "C"
  cooperationSince: string
  enabled: boolean
}

export type SupplyPlanType = "采购" | "租赁"
export type SupplyPlanStatus = "草稿" | "审批中" | "已批准" | "执行中" | "已完成" | "已驳回"

export interface SupplyPlan {
  id: string
  planNo: string
  type: SupplyPlanType
  containerType: ContainerType
  quantity: number
  estUnitPrice: number
  estAmount: number
  demandCity: string
  expectArrival: string
  reason: string
  status: SupplyPlanStatus
  createdBy: string
  createdAt: string
}

export type SupplyContractStatus = "履行中" | "已完成" | "已到期" | "已终止"

export interface SupplyContract {
  id: string
  contractNo: string
  type: SupplyPlanType
  relatedPlanNo: string
  supplier: string
  containerType: ContainerType
  quantity: number
  unitPrice: number
  amount: number
  currency: "CNY" | "USD" | "EUR"
  signedAt: string
  startDate: string
  endDate: string
  deliveredQty: number // 已交付/已到箱数量
  status: SupplyContractStatus
}

// ---------- 集装箱维修管理 ----------

export type RepairStatus =
  | "待报修"
  | "待检验"
  | "维修中"
  | "待验收"
  | "已完工"
  | "已报废"

export type RepairLevel = "小修" | "中修" | "大修" | "报废评估"

export interface RepairOrder {
  id: string
  repairNo: string
  containerNo: string
  containerType: ContainerType
  ownership: "自有箱" | "租赁箱"
  yard: string
  city: string
  damageDesc: string
  level: RepairLevel
  vendor: string // 维修厂
  estCost: number
  actualCost?: number
  reportedBy: string
  reportedAt: string
  finishedAt?: string
  status: RepairStatus
}

// ---------- 系统管理：用户与代理 ----------

export interface SystemUser {
  id: string
  account: string // 登录账号
  name: string // 姓名
  roleId: RoleId // 所属角色
  org: string // 所属机构
  email: string
  phone: string
  status: "启用" | "停用"
  lastLogin: string
  createdAt: string
}

// ---------- 基础数据字典：提箱/还箱城市 ----------

export type CityRegion = "境内" | "境外"

export interface CityDictItem {
  id: string
  code: string // 城市编码，如 XA / HAM
  name: string // 城市名称
  region: CityRegion
  country: string // 所属国家/地区
  province: string // 上级省/州（来自 base_region level=2）
  usableAsPickup: boolean // 可作为提箱城市
  usableAsReturn: boolean // 可作为还箱城市
  enabled: boolean // 是否启用
  sort: number // 排序
}

/** 客户主档（源自 old sql/base_custom） */
export interface Customer {
  id: string
  /** 老系统 base_custom.id，仅作匹配，非主键 */
  legacyId: number
  /** 老系统 uuid（custom_id） */
  customId: string
  name: string
  abbreviation: string
  contactUser: string
  contactPhone: string
  address: string
  creditCode: string
  /** 是否有电子章（源表 has_seal：0 有 / 1 没有） */
  hasSeal: boolean
  enabled: boolean
  deleted: boolean
  createBy: string
  createName: string
  createTime: string
  updateBy: string
  updateName: string
  updateTime: string
  identityCard: string
  email: string
}

// ---------- 统一待办与通知中心 ----------

export type NotificationType = "审批" | "任务" | "账单" | "时限提醒" | "系统"
export type NotificationLevel = "普通" | "重要" | "紧急"

export interface Notification {
  id: string
  type: NotificationType
  level: NotificationLevel
  title: string
  desc: string
  module: string // 来源模块
  href: string // 跳转地址
  roles: RoleId[] // 可见角色
  actionable: boolean // 是否为待办（需处理）
  read: boolean
  createdAt: string
  dueAt?: string // 处理时限
}

// ---------- 操作日志 / 审计追踪 ----------

export type AuditAction = "新增" | "修改" | "删除" | "审批" | "代理登录" | "结束代理" | "导出" | "登录"

export interface AuditLog {
  id: string
  time: string
  operator: string // 操作人
  operatorRole: RoleId
  action: AuditAction
  module: string // 操作模块
  target: string // 操作对象
  detail: string // 详情
  ip: string
  proxied: boolean // 是否为代理操作
  proxyBy?: string // 代理人（管理员）
}

// ---------- 集成状态面板 ----------

export type IntegrationStatus = "正常" | "延迟" | "异常" | "未连接"

export interface Integration {
  id: string
  name: string // 集成名称
  category: "订舱平台" | "代管公司" | "堆场系统" | "财务系统"
  direction: "接收" | "推送" | "双向"
  status: IntegrationStatus
  lastSync: string // 最近同步时间
  successRate: number // 24h 成功率
  pending: number // 待同步条数
  desc: string
}

// ---------- 出站事件队列 ----------

export type OutboundEventStatus = "pending" | "delivered" | "failed"

export interface OutboundEvent {
  id: string
  type: "booking_bill_push" | "notify_proxy" | string
  relatedNo: string
  payload?: Record<string, unknown>
  status: OutboundEventStatus
  createdAt: string
  deliveredAt?: string
}

// ---------- 附件元数据 ----------

export interface AttachmentMeta {
  id: string
  refType: string
  refNo: string
  fileName: string
  mime: string
  size: number
  uploadedBy: string
  uploadedAt: string
  /** 相对项目根的存储路径，如 data/uploads/attachments/xxx.pdf */
  storagePath?: string
}

// ---------- 系统设置 ----------

export interface SystemSetting {
  key: string
  value: unknown
  updatedAt: string
  updatedBy?: string
}

export interface WorkHoursConfig {
  startHour: number
  endHour: number
}

export interface ApprovalThresholds {
  level2Below: number
  level3Below: number
}

// ---------- 软件反馈工单 ----------

export type FeedbackTicketType = "bug" | "业务需求" | "简易" | "体验优化" | "其他"
export type FeedbackTicketStatus = "待处理" | "处理中" | "已关闭"

export interface FeedbackScreenshot {
  dataUrl: string
  fileName: string
}

export interface FeedbackTicket {
  id: string
  ticketNo: string
  type: FeedbackTicketType
  content: string
  account: string
  userName: string
  roleId: RoleId
  roleName: string
  pagePath: string
  pageTitle: string
  /** 截图列表，最多 3 张 */
  screenshots?: FeedbackScreenshot[]
  /** @deprecated 兼容旧单图字段 */
  screenshotDataUrl?: string
  /** @deprecated 兼容旧单图字段 */
  screenshotFileName?: string
  /** 提交时间（表单隐藏字段） */
  createdAt: string
  status: FeedbackTicketStatus
}
