"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  History,
  Search,
  UserRoundCheck,
  ShieldCheck,
  Trash2,
  FileDown,
  Pencil,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ListPagination } from "@/components/list-pagination"
import { SortableTableHead } from "@/components/sortable-table-head"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { roles } from "@/lib/mock-data"
import { useResource } from "@/lib/api"
import { useListQuery } from "@/lib/list-query"
import type { AuditAction, AuditLog } from "@/lib/types"
import { solidTone } from "@/lib/ui-tone"

const ACTION_TONE: Record<AuditAction, string> = {
  新增: solidTone.success,
  修改: solidTone.primary,
  删除: solidTone.danger,
  审批: solidTone.info,
  代理登录: solidTone.warning,
  结束代理: solidTone.muted,
  导出: solidTone.info,
  登录: solidTone.muted,
}

const ACTIONS: ("全部" | AuditAction)[] = [
  "全部",
  "新增",
  "修改",
  "删除",
  "审批",
  "代理登录",
  "导出",
  "登录",
]

const MODULES = [
  "全部模块",
  "系统管理",
  "M01 客户门户",
  "M01 账单中心",
  "M02 调运管理",
  "M03 库存管理",
  "M06 维修管理",
  "基础配置",
]

const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id

export default function AuditPage() {
  const { data: logs } = useResource<AuditLog>("audit")
  const [keyword, setKeyword] = useState("")
  const [action, setAction] = useState<"全部" | AuditAction>("全部")
  const [moduleFilter, setModuleFilter] = useState("全部模块")
  const [proxyOnly, setProxyOnly] = useState(false)

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const kw =
        !keyword ||
        l.operator.includes(keyword) ||
        l.target.includes(keyword) ||
        l.detail.includes(keyword)
      const a = action === "全部" || l.action === action
      const m = moduleFilter === "全部模块" || l.module === moduleFilter
      const p = !proxyOnly || l.proxied
      return kw && a && m && p
    })
  }, [logs, keyword, action, moduleFilter, proxyOnly])

  const list = useListQuery({
    data: filtered,
    defaultSortKey: "time",
    defaultSortDir: "desc",
  })

  const stats = useMemo(() => {
    const total = logs.length
    const proxied = logs.filter((l) => l.proxied).length
    const writes = logs.filter((l) => ["新增", "修改", "删除"].includes(l.action)).length
    const deletes = logs.filter((l) => l.action === "删除").length
    return { total, proxied, writes, deletes }
  }, [logs])

  function exportLogs() {
    toast.info(`操作日志导出尚未接入（当前筛选 ${filtered.length} 条）`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        module="系统管理 · 审计追溯"
        title="操作日志审计中心"
        description="完整记录全平台增删改查与审批操作，并对系统管理员的临时代理登录行为进行独立标记与追溯，保障操作可审计、可回溯。"
        actions={
          <Button variant="outline" className="gap-1.5" onClick={exportLogs}>
            <FileDown className="size-4" />
            导出日志
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="操作总数" value={stats.total} icon={History} tone="primary" />
        <StatCard label="代理操作" value={stats.proxied} icon={UserRoundCheck} tone="warning" />
        <StatCard label="写操作(增改删)" value={stats.writes} icon={Pencil} tone="success" />
        <StatCard label="删除操作" value={stats.deletes} icon={Trash2} tone="danger" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <CardTitle className="text-base">审计流水</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={action} onValueChange={(v) => setAction(v as typeof action)}>
              <TabsList className="flex-wrap">
                {ACTIONS.map((a) => (
                  <TabsTrigger key={a} value={a}>
                    {a}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v ?? "全部")}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={proxyOnly ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setProxyOnly((v) => !v)}
            >
              <UserRoundCheck className="size-4" />
              仅看代理操作
            </Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索操作人/对象/详情"
                className="w-56 pl-8"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="操作时间" columnKey="time" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="whitespace-nowrap" />
                  <SortableTableHead label="操作人" columnKey="operator" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="动作" columnKey="action" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} className="text-center" />
                  <SortableTableHead label="模块" columnKey="module" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="操作对象" columnKey="target" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="详情" columnKey="detail" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                  <SortableTableHead label="来源 IP" columnKey="ip" sortKey={list.sortKey} sortDir={list.sortDir} onSort={list.toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((l) => (
                  <TableRow key={l.id} className={l.proxied ? "bg-warning/5" : undefined}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{l.time}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{l.operator}</span>
                        {l.proxied && (
                          <Badge variant="outline" className="h-5 gap-1 border-warning/50 px-1.5 text-xs text-warning-foreground">
                            <UserRoundCheck className="size-3" />
                            代理
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {l.operatorRole} · {roleName(l.operatorRole)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={ACTION_TONE[l.action]}>{l.action}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{l.module}</TableCell>
                    <TableCell className="font-mono text-xs">{l.target}</TableCell>
                    <TableCell className="max-w-64 text-sm text-muted-foreground">
                      {l.detail}
                      {l.proxied && l.proxyBy && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-warning-foreground">
                          <ShieldCheck className="size-3" />
                          由「{l.proxyBy}」代理执行
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{l.ip}</TableCell>
                  </TableRow>
                ))}
                {list.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      未找到匹配的操作日志
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
      </Card>
    </div>
  )
}
