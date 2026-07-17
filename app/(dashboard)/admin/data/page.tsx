"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Database, Plus, Pencil, Trash2, Search } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import { useDictionary } from "@/lib/dictionary-context"
import { cityOptionsForField, isCityField } from "@/lib/city-tree"
import { CONTAINER_TYPES, defaultFieldValue, isContainerTypeField } from "@/lib/container-types"
import { CitySearchSelect } from "@/components/city-search-select"
import type { ResourceKey } from "@/lib/resources"

// 数据集定义：字段以 key/label 描述，支持通用增删改查
interface FieldDef {
  key: string
  label: string
}

interface DatasetDef {
  id: string
  resource: ResourceKey
  name: string
  desc: string
  idKey: string
  fields: FieldDef[]
}

const datasets: DatasetDef[] = [
  {
    id: "orders",
    resource: "orders",
    name: "用箱订单",
    desc: "M01 客户用箱订单主数据",
    idKey: "id",
    fields: [
      { key: "orderNo", label: "订单号" },
      { key: "customer", label: "客户" },
      { key: "pickupCity", label: "提箱城市" },
      { key: "returnCity", label: "还箱城市" },
      { key: "containerType", label: "箱型" },
      { key: "quantity", label: "数量" },
      { key: "status", label: "状态" },
    ],
  },
  {
    id: "dispatch",
    resource: "dispatch",
    name: "调运订单",
    desc: "M02 调运业务主数据",
    idKey: "id",
    fields: [
      { key: "dispatchNo", label: "调运单号" },
      { key: "pickupPlace", label: "提箱地" },
      { key: "returnScope", label: "还箱范围" },
      { key: "quantity", label: "数量" },
      { key: "carrier", label: "承运商" },
      { key: "totalPrice", label: "总价" },
      { key: "status", label: "状态" },
    ],
  },
  {
    id: "bills",
    resource: "bills",
    name: "账单",
    desc: "M01/M02 账单数据",
    idKey: "id",
    fields: [
      { key: "billNo", label: "账单号" },
      { key: "type", label: "类型" },
      { key: "party", label: "对象" },
      { key: "amount", label: "金额" },
      { key: "status", label: "状态" },
    ],
  },
  {
    id: "returns",
    resource: "returns",
    name: "还箱申请",
    desc: "M02 还箱审核数据",
    idKey: "id",
    fields: [
      { key: "applyNo", label: "申请号" },
      { key: "carrier", label: "承运商" },
      { key: "returnYard", label: "还箱堆场" },
      { key: "returnCity", label: "还箱城市" },
      { key: "status", label: "状态" },
      { key: "appliedAt", label: "申请时间" },
    ],
  },
  {
    id: "inventory",
    resource: "inventory",
    name: "库存台账",
    desc: "M03 库存主数据",
    idKey: "id",
    fields: [
      { key: "yard", label: "堆场" },
      { key: "city", label: "城市" },
      { key: "onSite", label: "在场" },
      { key: "available", label: "可用" },
      { key: "reserved", label: "已放待提" },
      { key: "incoming", label: "预计进场" },
    ],
  },
  {
    id: "gate",
    resource: "gate",
    name: "进出场记录",
    desc: "M03 进出场映射记录",
    idKey: "id",
    fields: [
      { key: "containerNo", label: "箱号" },
      { key: "type", label: "类型" },
      { key: "time", label: "时间" },
      { key: "yard", label: "堆场" },
      { key: "city", label: "城市" },
      { key: "mappingStatus", label: "映射状态" },
    ],
  },
  {
    id: "masters",
    resource: "containers",
    name: "集装箱总表",
    desc: "M03 集装箱生命周期主数据",
    idKey: "containerNo",
    fields: [
      { key: "containerNo", label: "箱号" },
      { key: "legacyId", label: "旧系统ID" },
      { key: "type", label: "箱型" },
      { key: "ownership", label: "箱属" },
      { key: "currentYard", label: "当前堆场" },
      { key: "currentCity", label: "当前城市" },
      { key: "status", label: "状态" },
      { key: "storageDays", label: "堆存天数" },
      { key: "factoryId", label: "堆场UUID" },
    ],
  },
  {
    id: "discrepancy",
    resource: "discrepancy",
    name: "库存差异",
    desc: "M03 系统与代管对账",
    idKey: "id",
    fields: [
      { key: "yard", label: "堆场" },
      { key: "city", label: "城市" },
      { key: "systemCount", label: "系统数量" },
      { key: "agentCount", label: "代管数量" },
      { key: "diff", label: "差异" },
      { key: "status", label: "状态" },
    ],
  },
  {
    id: "yards",
    resource: "yards",
    name: "堆场",
    desc: "M04 堆场主数据",
    idKey: "id",
    fields: [
      { key: "name", label: "堆场名称" },
      { key: "region", label: "区域" },
      { key: "city", label: "城市" },
      { key: "agent", label: "代管公司" },
      { key: "capacity", label: "容量" },
      { key: "current", label: "当前" },
    ],
  },
  {
    id: "bookings",
    resource: "bookings",
    name: "堆场预约",
    desc: "M04 预约与通知",
    idKey: "id",
    fields: [
      { key: "bookingNo", label: "预约号" },
      { key: "type", label: "类型" },
      { key: "yard", label: "堆场" },
      { key: "planTime", label: "计划时间" },
      { key: "driver", label: "司机" },
      { key: "status", label: "状态" },
    ],
  },
  {
    id: "templates",
    resource: "templates",
    name: "单据模板",
    desc: "M04 模板配置",
    idKey: "id",
    fields: [
      { key: "name", label: "模板名称" },
      { key: "code", label: "编码" },
      { key: "scene", label: "场景" },
      { key: "updatedAt", label: "更新时间" },
      { key: "enabled", label: "启用" },
    ],
  },
  {
    id: "cities",
    resource: "cities",
    name: "城市字典",
    desc: "基础配置 · 提还箱城市",
    idKey: "id",
    fields: [
      { key: "code", label: "编码" },
      { key: "name", label: "名称" },
      { key: "region", label: "区域" },
      { key: "country", label: "国家" },
      { key: "enabled", label: "启用" },
    ],
  },
  {
    id: "customers",
    resource: "customers",
    name: "客户主档",
    desc: "基础配置 · 客户信息",
    idKey: "id",
    fields: [
      { key: "legacyId", label: "旧ID" },
      { key: "name", label: "客户名称" },
      { key: "abbreviation", label: "简称" },
      { key: "contactUser", label: "联系人" },
      { key: "contactPhone", label: "电话" },
      { key: "email", label: "邮箱" },
      { key: "enabled", label: "启用" },
    ],
  },
  {
    id: "suppliers",
    resource: "suppliers",
    name: "供应商",
    desc: "M05 供应商台账",
    idKey: "id",
    fields: [
      { key: "name", label: "名称" },
      { key: "type", label: "类型" },
      { key: "contact", label: "联系人" },
      { key: "country", label: "国家" },
      { key: "rating", label: "评级" },
      { key: "enabled", label: "启用" },
    ],
  },
  {
    id: "supplyPlans",
    resource: "supplyPlans",
    name: "供应计划",
    desc: "M05 采购/租赁计划",
    idKey: "id",
    fields: [
      { key: "planNo", label: "计划号" },
      { key: "type", label: "类型" },
      { key: "quantity", label: "数量" },
      { key: "demandCity", label: "需求城市" },
      { key: "status", label: "状态" },
      { key: "createdBy", label: "创建人" },
    ],
  },
  {
    id: "supplyContracts",
    resource: "supplyContracts",
    name: "供应合同",
    desc: "M05 供应合同",
    idKey: "id",
    fields: [
      { key: "contractNo", label: "合同号" },
      { key: "supplier", label: "供应商" },
      { key: "quantity", label: "数量" },
      { key: "deliveredQty", label: "已到箱" },
      { key: "status", label: "状态" },
    ],
  },
  {
    id: "repair",
    resource: "repair",
    name: "修箱工单",
    desc: "M06 维修管理",
    idKey: "id",
    fields: [
      { key: "repairNo", label: "工单号" },
      { key: "containerNo", label: "箱号" },
      { key: "yard", label: "堆场" },
      { key: "status", label: "状态" },
      { key: "estCost", label: "预估费用" },
    ],
  },
  {
    id: "notifications",
    resource: "notifications",
    name: "通知",
    desc: "通知中心",
    idKey: "id",
    fields: [
      { key: "title", label: "标题" },
      { key: "type", label: "类型" },
      { key: "level", label: "级别" },
      { key: "module", label: "模块" },
      { key: "read", label: "已读" },
      { key: "createdAt", label: "创建时间" },
    ],
  },
  {
    id: "audit",
    resource: "audit",
    name: "操作日志",
    desc: "系统管理 · 审计追踪",
    idKey: "id",
    fields: [
      { key: "time", label: "时间" },
      { key: "operator", label: "操作人" },
      { key: "action", label: "动作" },
      { key: "module", label: "模块" },
      { key: "detail", label: "详情" },
    ],
  },
  {
    id: "users",
    resource: "users",
    name: "用户账号",
    desc: "系统管理 · 不含密码哈希明文",
    idKey: "id",
    fields: [
      { key: "account", label: "账号" },
      { key: "name", label: "姓名" },
      { key: "roleId", label: "角色" },
      { key: "org", label: "机构" },
      { key: "email", label: "邮箱" },
      { key: "status", label: "状态" },
    ],
  },
  {
    id: "integrations",
    resource: "integrations",
    name: "集成",
    desc: "系统集成状态",
    idKey: "id",
    fields: [
      { key: "name", label: "名称" },
      { key: "category", label: "分类" },
      { key: "direction", label: "方向" },
      { key: "status", label: "状态" },
      { key: "lastSync", label: "最近同步" },
      { key: "pending", label: "待同步" },
    ],
  },
  {
    id: "outboundEvents",
    resource: "outboundEvents",
    name: "出站事件",
    desc: "订舱账单等出站队列",
    idKey: "id",
    fields: [
      { key: "type", label: "类型" },
      { key: "relatedNo", label: "关联单号" },
      { key: "status", label: "状态" },
      { key: "createdAt", label: "创建时间" },
      { key: "deliveredAt", label: "投递时间" },
    ],
  },
  {
    id: "attachments",
    resource: "attachments",
    name: "附件元数据",
    desc: "单据附件（本地文件 + 元数据）",
    idKey: "id",
    fields: [
      { key: "refType", label: "关联类型" },
      { key: "refNo", label: "关联单号" },
      { key: "fileName", label: "文件名" },
      { key: "mime", label: "MIME" },
      { key: "size", label: "大小" },
      { key: "storagePath", label: "存储路径" },
      { key: "uploadedBy", label: "上传人" },
      { key: "uploadedAt", label: "上传时间" },
    ],
  },
  {
    id: "settings",
    resource: "settings",
    name: "系统设置KV",
    desc: "原始键值（建议优先用「系统参数」页）",
    idKey: "key",
    fields: [
      { key: "key", label: "键" },
      { key: "updatedAt", label: "更新时间" },
      { key: "updatedBy", label: "更新人" },
    ],
  },
]

function DatasetTable({ def }: { def: DatasetDef }) {
  const { cities, pickupCities, returnCities } = useDictionary()
  const { data: rows, create, update, remove } = useResource<Record<string, unknown>>(def.resource)
  const [keyword, setKeyword] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    if (!keyword) return rows
    return rows.filter((r) =>
      def.fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(keyword.toLowerCase())),
    )
  }, [rows, keyword, def.fields])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: def.fields[0]?.key ?? "id",
    defaultSortDir: "asc",
  })

  function openAdd() {
    setEditing(null)
    setForm(Object.fromEntries(def.fields.map((f) => [f.key, defaultFieldValue(f.key, f.label)])))
    setDialogOpen(true)
  }

  function openEdit(r: Record<string, unknown>) {
    setEditing(r)
    setForm(Object.fromEntries(def.fields.map((f) => [f.key, String(r[f.key] ?? "")])))
    setDialogOpen(true)
  }

  async function handleSave() {
    const firstField = def.fields[0]
    if (!form[firstField.key]?.trim()) {
      toast.error(`请填写${firstField.label}`)
      return
    }
    try {
      if (editing) {
        await update(String(editing[def.idKey]), {
          ...form,
          __auditAction: "修改",
          __auditDetail: `更新${def.name}记录 ${form[firstField.key]}`,
        })
        toast.success("已更新记录")
      } else {
        await create({
          ...form,
          __auditAction: "新增",
          __auditDetail: `新增${def.name}记录 ${form[firstField.key]}`,
        })
        toast.success("已新增记录")
      }
      setDialogOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleDelete(r: Record<string, unknown>) {
    try {
      await remove(String(r[def.idKey]), { __auditDetail: `删除${def.name}记录 ${String(r[def.fields[0].key] ?? "")}` })
      toast.success("已删除记录")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">{def.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{def.desc} · 共 {rows.length} 条</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索本表数据"
              className="w-52 pl-8"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            新增记录
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {def.fields.map((f) => (
                  <SortableTableHead
                    key={f.key}
                    label={f.label}
                    columnKey={f.key}
                    sortKey={list.sortKey}
                    sortDir={list.sortDir}
                    onSort={list.toggleSort}
                  />
                ))}
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r, i) => (
                <TableRow key={String(r[def.idKey] ?? i)}>
                  {def.fields.map((f) => (
                    <TableCell key={f.key} className={f.key === def.fields[0].key ? "font-medium" : "text-muted-foreground"}>
                      {String(r[f.key] ?? "—")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(r)}>
                        <Pencil className="size-4" />
                        <span className="sr-only">编辑</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(r)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">删除</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {list.total === 0 && (
                <TableRow>
                  <TableCell colSpan={def.fields.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                    未找到匹配的数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <ListPagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          totalPages={list.totalPages}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `编辑${def.name}记录` : `新增${def.name}记录`}</DialogTitle>
            <DialogDescription>系统管理员可对该数据集进行任意增删改查操作。</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto py-2">
            {def.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                {isCityField(f.key) ? (
                  <CitySearchSelect
                    id={f.key}
                    value={form[f.key] ?? ""}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                    cities={cityOptionsForField(f.key, { pickupCities, returnCities, cities })}
                    placeholder={`选择${f.label}`}
                  />
                ) : isContainerTypeField(f.key, f.label) ? (
                  <Select
                    value={form[f.key] || defaultFieldValue(f.key, f.label)}
                    onValueChange={(v) => v && setForm((prev) => ({ ...prev, [f.key]: v }))}
                  >
                    <SelectTrigger id={f.key}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTAINER_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={f.key}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>{editing ? "保存修改" : "确认新增"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default function AdminDataPage() {
  return (
    <>
      <PageHeader
        module="系统管理 · 系统管理员专区"
        title="业务数据台"
        description="集中管理系统全部已注册业务资源，支持增删改查。请谨慎操作，变更将直接影响业务系统。"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="数据集" value={datasets.length} icon={Database} />
        <StatCard label="业务模块覆盖" value="M01–M06" icon={Database} tone="success" />
        <StatCard label="操作权限" value="全量增删改查" icon={Database} tone="warning" />
        <StatCard label="数据来源" value="实时数据库" icon={Database} />
      </div>

      <Tabs defaultValue={datasets[0].id}>
        <TabsList className="flex-wrap">
          {datasets.map((d) => (
            <TabsTrigger key={d.id} value={d.id}>{d.name}</TabsTrigger>
          ))}
        </TabsList>
        {datasets.map((d) => (
          <TabsContent key={d.id} value={d.id} className="mt-4">
            <DatasetTable def={d} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
