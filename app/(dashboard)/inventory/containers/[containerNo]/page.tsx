"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  Boxes,
  Wrench,
  GitCompareArrows,
  PackageCheck,
  CalendarClock,
  FileText,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { LifecycleTimeline } from "@/components/lifecycle-timeline"
import { StatusBadge } from "@/components/status-badge"
import { PageSpinner } from "@/components/navigation-loading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useResource } from "@/lib/api"
import { getContainerLifecycle } from "@/lib/domain/container-lifecycle"
import type {
  Booking,
  ContainerMaster,
  DispatchOrder,
  GateRecord,
  RepairOrder,
  ReturnApplication,
  SupplyContract,
  UseBoxOrder,
} from "@/lib/types"

export default function ContainerLifecyclePage() {
  const params = useParams()
  const containerNo = decodeURIComponent(String(params.containerNo ?? ""))

  const { data: containers, isLoading: loadingMasters } = useResource<ContainerMaster>("containers")
  const { data: gate, isLoading: loadingGate } = useResource<GateRecord>("gate")
  const { data: repair } = useResource<RepairOrder>("repair")
  const { data: returns } = useResource<ReturnApplication>("returns")
  const { data: bookings } = useResource<Booking>("bookings")
  const { data: dispatch } = useResource<DispatchOrder>("dispatch")
  const { data: orders } = useResource<UseBoxOrder>("orders")
  const { data: supplyContracts } = useResource<SupplyContract>("supplyContracts")

  const master = useMemo(
    () => containers.find((c) => c.containerNo === containerNo) ?? null,
    [containers, containerNo],
  )

  const lifecycle = useMemo(
    () =>
      getContainerLifecycle({
        containerNo,
        master,
        gate,
        repair,
        returns,
        bookings,
        dispatch,
        orders,
        supplyContracts,
      }),
    [containerNo, master, gate, repair, returns, bookings, dispatch, orders, supplyContracts],
  )

  if (loadingMasters || loadingGate) {
    return <PageSpinner label="加载集装箱档案…" />
  }

  if (!containerNo) {
    return (
      <div className="space-y-4">
        <PageHeader module="M03" title="集装箱档案" description="缺少箱号参数" />
        <Button variant="outline" nativeButton={false} render={<Link href="/inventory/ledger" />}>
          <ArrowLeft className="mr-1 size-4" />
          返回五维库存台账
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-0 text-muted-foreground"
          nativeButton={false}
          render={<Link href="/inventory/ledger" />}
        >
          <ArrowLeft className="size-4" />
          返回五维库存台账
        </Button>
      </div>

      <PageHeader
        module="M03 库存管理"
        title={containerNo}
        description={
          master
            ? `集装箱生命周期档案 · ${master.type} · ${master.ownership} · ${master.status}`
            : "集装箱生命周期档案（主档未建档或占位箱号）"
        }
      />

      {lifecycle.placeholderNote && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
          {lifecycle.placeholderNote}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="进出场" value={lifecycle.gate.length} icon={GitCompareArrows} tone="primary" />
        <StatCard label="修箱工单" value={lifecycle.repair.length} icon={Wrench} tone="warning" />
        <StatCard label="还箱申请" value={lifecycle.returns.length} icon={PackageCheck} tone="success" />
        <StatCard label="预约" value={lifecycle.bookings.length} icon={CalendarClock} tone="primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">当前状态</CardTitle>
            <CardDescription>主档快照（非历史占用区间）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {master ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{master.type}</Badge>
                  <Badge variant={master.ownership === "自有箱" ? "secondary" : "outline"}>
                    {master.ownership}
                  </Badge>
                  <StatusBadge status={master.status} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">当前位置</div>
                  <div>
                    {master.currentCity} · {master.currentYard}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">最近进出场</div>
                  <div>{master.lastGateTime || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">堆存天数</div>
                  <div className={master.storageDays >= 5 ? "font-medium text-warning-foreground" : ""}>
                    {master.storageDays} 天
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">当前关联单号</div>
                  <div className="font-mono text-xs">{master.relatedOrderNo || "—"}</div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">无实体主档记录</p>
            )}
            {lifecycle.lastActivityAt && (
              <div className="text-xs text-muted-foreground">最近活动：{lifecycle.lastActivityAt}</div>
            )}
            {lifecycle.relatedDocs.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs text-muted-foreground">关联业务</div>
                <ul className="space-y-1.5">
                  {lifecycle.relatedDocs.map((d) => (
                    <li key={`${d.kind}-${d.no}`}>
                      <Link href={d.href} className="text-primary hover:underline">
                        <span className="font-mono text-xs">{d.no}</span>
                        <span className="ml-1 text-muted-foreground">· {d.label}</span>
                        {d.status && (
                          <Badge variant="outline" className="ml-1 h-5 text-[10px]">
                            {d.status}
                          </Badge>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="rounded-md border border-dashed border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              主档 relatedOrderNo 还箱后可能被清空，历史占用仅能从进出场 relatedOrderNo 等痕迹还原。
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="size-4.5 text-primary" />
              业务时间线
            </CardTitle>
            <CardDescription>进出场、修箱、还箱申请、预约等按时间倒序</CardDescription>
          </CardHeader>
          <CardContent>
            <LifecycleTimeline events={lifecycle.events} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">关联单据</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="gate">
            <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
              <TabsTrigger value="gate">进出场 ({lifecycle.gate.length})</TabsTrigger>
              <TabsTrigger value="repair">修箱 ({lifecycle.repair.length})</TabsTrigger>
              <TabsTrigger value="returns">还箱申请 ({lifecycle.returns.length})</TabsTrigger>
              <TabsTrigger value="bookings">预约 ({lifecycle.bookings.length})</TabsTrigger>
              <TabsTrigger value="docs">
                <FileText className="mr-1 size-3.5" />
                关联单 ({lifecycle.relatedDocs.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gate">
              {lifecycle.gate.length === 0 ? (
                <EmptyTab text="暂无进出场记录" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>类型</TableHead>
                        <TableHead>堆场</TableHead>
                        <TableHead>来源</TableHead>
                        <TableHead>关联单号</TableHead>
                        <TableHead>映射</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lifecycle.gate.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell>{g.type}</TableCell>
                          <TableCell className="text-sm">
                            {g.city} · {g.yard}
                          </TableCell>
                          <TableCell className="text-xs">{g.source}</TableCell>
                          <TableCell className="font-mono text-xs">{g.relatedOrderNo ?? "—"}</TableCell>
                          <TableCell>
                            <StatusBadge status={g.mappingStatus} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{g.time}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="repair">
              {lifecycle.repair.length === 0 ? (
                <EmptyTab text="暂无修箱工单" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>工单号</TableHead>
                        <TableHead>等级</TableHead>
                        <TableHead>堆场</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>报修时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lifecycle.repair.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            <Link href="/repair/orders" className="text-primary hover:underline">
                              {r.repairNo}
                            </Link>
                          </TableCell>
                          <TableCell>{r.level}</TableCell>
                          <TableCell className="text-sm">
                            {r.city} · {r.yard}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.reportedAt}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="returns">
              {lifecycle.returns.length === 0 ? (
                <EmptyTab text="暂无还箱申请" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>申请号</TableHead>
                        <TableHead>还箱地</TableHead>
                        <TableHead>关联调运</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>申请时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lifecycle.returns.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            <Link href="/dispatch/returns" className="text-primary hover:underline">
                              {r.applyNo}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.returnCity} · {r.returnYard}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.relatedDispatchNos.join(", ") || "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.appliedAt}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="bookings">
              {lifecycle.bookings.length === 0 ? (
                <EmptyTab text="暂无预约记录" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>预约号</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>堆场</TableHead>
                        <TableHead>计划时间</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lifecycle.bookings.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs">{b.bookingNo}</TableCell>
                          <TableCell>{b.type}</TableCell>
                          <TableCell className="text-sm">
                            {b.city} · {b.yard}
                          </TableCell>
                          <TableCell className="text-xs">{b.planTime}</TableCell>
                          <TableCell>
                            <StatusBadge status={b.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="docs">
              {lifecycle.relatedDocs.length === 0 ? (
                <EmptyTab text="暂无关联业务单" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>类型</TableHead>
                        <TableHead>单号</TableHead>
                        <TableHead>说明</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lifecycle.relatedDocs.map((d) => (
                        <TableRow key={`${d.kind}-${d.no}`}>
                          <TableCell>{d.kind}</TableCell>
                          <TableCell className="font-mono text-xs">
                            <Link href={d.href} className="text-primary hover:underline">
                              {d.no}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{d.label}</TableCell>
                          <TableCell>{d.status ? <StatusBadge status={d.status} /> : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  )
}

function EmptyTab({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>
}
