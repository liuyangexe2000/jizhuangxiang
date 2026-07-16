"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { navGroups } from "@/lib/nav"
import { RESOURCES, type ResourceKey } from "@/lib/resources"
import { SETTING_KEYS } from "@/lib/settings-keys"
import type { RoleId } from "@/lib/types"
import { roles as roleDefs } from "@/lib/mock-data"

const ROLE_IDS: RoleId[] = ["R00", "R01", "R02", "R03", "R04", "R05", "R06"]

type Access = { read: RoleId[]; write: RoleId[] }
type NavMap = Partial<Record<RoleId, string[]>>
type ResMap = Partial<Record<ResourceKey, Access>>

const menuItems = navGroups.flatMap((g) =>
  g.items.map((item) => ({
    href: item.href,
    title: item.title,
    module: g.module,
    defaultRoles: item.roles,
  })),
)

const resourceKeys = Object.keys(RESOURCES) as ResourceKey[]

export default function AdminPermissionsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [navMap, setNavMap] = useState<NavMap>({})
  const [resMap, setResMap] = useState<ResMap>({})
  const [defaults, setDefaults] = useState<{ aclNav: NavMap; aclResources: ResMap } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "加载失败")
        setDefaults(data.defaults)
        setNavMap((data.aclNav as NavMap) || data.defaults.aclNav)
        setResMap((data.aclResources as ResMap) || data.defaults.aclResources)
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const roleLabel = useMemo(() => {
    const m = new Map(roleDefs.map((r) => [r.id, r.name]))
    return (id: RoleId) => m.get(id) ?? id
  }, [])

  function toggleNav(href: string, role: RoleId) {
    if (role === "R00") return
    setNavMap((prev) => {
      const cur = new Set(prev[role] ?? [])
      if (cur.has(href)) cur.delete(href)
      else cur.add(href)
      return { ...prev, [role]: [...cur] }
    })
  }

  function toggleRes(resource: ResourceKey, role: RoleId, action: "read" | "write") {
    if (role === "R00") return
    setResMap((prev) => {
      const rule = prev[resource] ?? { read: [], write: [] }
      const list = new Set(rule[action])
      if (list.has(role)) list.delete(role)
      else list.add(role)
      // write 隐含 read
      let read = new Set(rule.read)
      if (action === "write" && list.has(role)) read.add(role)
      if (action === "read" && !list.has(role)) {
        const w = new Set(rule.write)
        w.delete(role)
        return {
          ...prev,
          [resource]: { read: [...list], write: [...w] },
        }
      }
      return {
        ...prev,
        [resource]: {
          read: action === "read" ? [...list] : [...read],
          write: action === "write" ? [...list] : rule.write,
        },
      }
    })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [SETTING_KEYS.aclNav]: navMap,
          [SETTING_KEYS.aclResources]: resMap,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "保存失败")
      toast.success("权限矩阵已保存，刷新页面后侧栏生效")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function restoreDefaults() {
    if (!defaults) return
    setNavMap(defaults.aclNav)
    setResMap(defaults.aclResources)
    toast.info("已载入代码默认矩阵，请点击保存写入数据库")
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">加载权限矩阵…</p>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        module="系统管理 · 系统管理员专区"
        title="角色权限矩阵"
        description="配置各角色可访问菜单与资源读写。R00 始终全放行，不可取消。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={restoreDefaults}>
              恢复默认
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存矩阵"}
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="nav">
        <TabsList>
          <TabsTrigger value="nav">菜单权限</TabsTrigger>
          <TabsTrigger value="res">资源读写</TabsTrigger>
        </TabsList>

        <TabsContent value="nav" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">菜单可见性</CardTitle>
              <CardDescription>勾选表示该角色可进入对应页面（覆盖 nav.ts）</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">菜单</TableHead>
                    {ROLE_IDS.map((r) => (
                      <TableHead key={r} className="text-center text-xs">
                        {r}
                        <div className="font-normal text-muted-foreground">{roleLabel(r).slice(0, 4)}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menuItems.map((m) => (
                    <TableRow key={m.href}>
                      <TableCell>
                        <div className="text-sm font-medium">{m.title}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{m.href}</div>
                      </TableCell>
                      {ROLE_IDS.map((r) => {
                        const checked =
                          r === "R00" || (navMap[r] ?? []).includes(m.href)
                        return (
                          <TableCell key={r} className="text-center">
                            <Checkbox
                              checked={checked}
                              disabled={r === "R00"}
                              onCheckedChange={() => toggleNav(m.href, r)}
                            />
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="res" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">资源 API 读写</CardTitle>
              <CardDescription>每个单元格：读 / 写（写勾选时自动带读）</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">资源</TableHead>
                    {ROLE_IDS.map((r) => (
                      <TableHead key={r} className="text-center text-xs">
                        {r}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resourceKeys.map((rk) => {
                    const label = RESOURCES[rk].label
                    const rule = resMap[rk] ?? { read: [], write: [] }
                    return (
                      <TableRow key={rk}>
                        <TableCell>
                          <div className="text-sm font-medium">{label}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{rk}</div>
                        </TableCell>
                        {ROLE_IDS.map((r) => {
                          const canRead = r === "R00" || rule.read.includes(r)
                          const canWrite = r === "R00" || rule.write.includes(r)
                          return (
                            <TableCell key={r}>
                              <div className="flex flex-col items-center gap-1">
                                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Checkbox
                                    checked={canRead}
                                    disabled={r === "R00"}
                                    onCheckedChange={() => toggleRes(rk, r, "read")}
                                  />
                                  读
                                </label>
                                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Checkbox
                                    checked={canWrite}
                                    disabled={r === "R00"}
                                    onCheckedChange={() => toggleRes(rk, r, "write")}
                                  />
                                  写
                                </label>
                              </div>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
