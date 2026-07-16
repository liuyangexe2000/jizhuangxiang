import type { RoleId } from "./types"
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  FileDown,
  Receipt,
  Send,
  CheckSquare,
  Truck,
  PackageCheck,
  BookOpenCheck,
  Boxes,
  GitCompareArrows,
  AlertTriangle,
  BarChart3,
  ScaleIcon,
  FileText,
  CalendarClock,
  Warehouse,
  MapPinned,
  Users,
  Database,
  ClipboardCheck,
  Wrench,
  Bell,
  History,
  Plug,
  Shield,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  roles: RoleId[]
  desc: string
}

export interface NavGroup {
  module: string
  label: string
  items: NavItem[]
}

const ALL: RoleId[] = ["R00", "R01", "R02", "R03", "R04", "R05", "R06"]

export const navGroups: NavGroup[] = [
  {
    module: "概览",
    label: "工作台",
    items: [
      { title: "系统仪表盘", href: "/", icon: LayoutDashboard, roles: ALL, desc: "全局业务概览" },
      { title: "待办与通知", href: "/inbox", icon: Bell, roles: ALL, desc: "审批/任务/账单/时限提醒聚合" },
    ],
  },
  {
    module: "M01",
    label: "客户服务与订舱协同门户",
    items: [
      { title: "用箱申请", href: "/customer/apply", icon: FilePlus2, roles: ["R01", "R03"], desc: "订舱勾选/新增用箱服务；箱管可代客申请" },
      { title: "订单处理", href: "/operations/usebox", icon: ClipboardList, roles: ["R01"], desc: "待确认申请确认：分配堆场、改价、备注" },
      { title: "我的订单", href: "/customer/orders", icon: ClipboardList, roles: ["R03"], desc: "客户查看订单生命周期与取消" },
      { title: "单据中心", href: "/customer/documents", icon: FileDown, roles: ["R01", "R03", "R04", "R06"], desc: "提箱/还箱文件与证明上传；R04/R06 现场确认放箱/收箱" },
      { title: "账单中心", href: "/customer/bills", icon: Receipt, roles: ["R01", "R03"], desc: "用箱账单与异常费用确认" },
    ],
  },
  {
    module: "M05",
    label: "集装箱供应计划管理",
    items: [
      { title: "供应计划", href: "/supply/plans", icon: ClipboardCheck, roles: ["R01"], desc: "采购/租赁计划编制与审批" },
      { title: "供应合同", href: "/supply/contracts", icon: FileText, roles: ["R01", "R02"], desc: "采购/租赁合同与到箱跟踪" },
      { title: "供应商台账", href: "/supply/suppliers", icon: Users, roles: ["R01"], desc: "制造商/租赁商信息维护" },
    ],
  },
  {
    module: "M02",
    label: "核心业务与调运管理系统",
    items: [
      { title: "调运申请", href: "/dispatch/apply", icon: Send, roles: ["R01"], desc: "发起调运申请与线路配置" },
      { title: "审批中心", href: "/dispatch/approvals", icon: CheckSquare, roles: ["R01", "R02"], desc: "多级动态审批引擎" },
      { title: "承运任务", href: "/dispatch/tasks", icon: Truck, roles: ["R01", "R04", "R05"], desc: "任务下发与提箱预约" },
      { title: "还箱审核", href: "/dispatch/returns", icon: PackageCheck, roles: ["R01", "R05"], desc: "还箱申请与审核" },
      { title: "账单台账", href: "/dispatch/ledger", icon: BookOpenCheck, roles: ["R01", "R05"], desc: "调运费/超期费账单与台账" },
    ],
  },
  {
    module: "M03",
    label: "资产与多维库存管理系统",
    items: [
      { title: "五维库存台账", href: "/inventory/ledger", icon: Boxes, roles: ["R01", "R04"], desc: "在场/可用/已放待提/预计进场/总表" },
      { title: "进出场映射", href: "/inventory/gate", icon: GitCompareArrows, roles: ["R01", "R04", "R06"], desc: "库存计算与映射引擎" },
      { title: "异常进出场", href: "/inventory/exceptions", icon: AlertTriangle, roles: ["R01", "R04"], desc: "手工补录与异常排查池" },
      { title: "库存分析报表", href: "/inventory/reports", icon: BarChart3, roles: ["R01"], desc: "箱量/堆存/预定在途分析" },
      { title: "差异核对", href: "/inventory/discrepancy", icon: ScaleIcon, roles: ["R01", "R04"], desc: "系统与代管公司对账" },
    ],
  },
  {
    module: "M06",
    label: "集装箱维修管理",
    items: [
      { title: "修箱工单", href: "/repair/orders", icon: Wrench, roles: ["R01", "R04", "R06"], desc: "修箱登记、流转与验收" },
    ],
  },
  {
    module: "M04",
    label: "堆场作业与模板配置中心",
    items: [
      { title: "单据模板", href: "/yard/templates", icon: FileText, roles: ["R00", "R01", "R04"], desc: "标准化单据模板引擎与可视化设计" },
      { title: "预约与通知", href: "/yard/bookings", icon: CalendarClock, roles: ["R01", "R04", "R05", "R06"], desc: "提还箱预约与邮件通知" },
      { title: "堆场维护", href: "/yard/yards", icon: Warehouse, roles: ["R01", "R04", "R06"], desc: "堆场信息动态维护" },
    ],
  },
  {
    module: "基础配置",
    label: "基础数据字典",
    items: [
      { title: "城市字典", href: "/config/cities", icon: MapPinned, roles: ["R00", "R01", "R04"], desc: "提箱/还箱城市字典维护" },
    ],
  },
  {
    module: "系统管理",
    label: "系统管理员专区",
    items: [
      { title: "管理中枢", href: "/admin", icon: LayoutDashboard, roles: ["R00"], desc: "总后台入口与能力导航" },
      { title: "用户与代理", href: "/admin/users", icon: Users, roles: ["R00"], desc: "用户账号管理与临时代理登录" },
      { title: "业务数据台", href: "/admin/data", icon: Database, roles: ["R00"], desc: "全量业务数据增删改查" },
      { title: "角色权限", href: "/admin/permissions", icon: Shield, roles: ["R00"], desc: "菜单与资源权限矩阵" },
      { title: "系统参数", href: "/admin/settings", icon: Settings, roles: ["R00"], desc: "演示开关、菜单策略与业务参数" },
      { title: "操作日志审计", href: "/admin/audit", icon: History, roles: ["R00"], desc: "增删改查与代理登录追溯" },
      { title: "集成状态面板", href: "/admin/integrations", icon: Plug, roles: ["R00"], desc: "订舱平台/代管公司同步状态" },
    ],
  },
]
