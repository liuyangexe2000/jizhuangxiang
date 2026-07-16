"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Copy, Eye, FileCheck2, FileClock, FilePlus2, FileText, ListTree, Pencil, Plus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useResource, revalidateResource } from "@/lib/api"
import { fieldsFromLayout, layoutForKind } from "@/lib/domain/doc-template-layout"
import { nowLocalStr } from "@/lib/now-local"
import { useRole } from "@/lib/role-context"
import type { DocKind, DocTemplate } from "@/lib/types"

function kindLabel(kind: DocKind | undefined) {
  if (kind === "pickup") return "提箱单"
  if (kind === "return") return "还箱单"
  return "其他"
}

export default function TemplatesPage() {
  const { roleId } = useRole()
  const isSysAdmin = roleId === "R00"
  const { data: templates, create, update } = useResource<DocTemplate>("templates")
  const [fieldsView, setFieldsView] = useState<DocTemplate | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newCode, setNewCode] = useState("")
  const [newKind, setNewKind] = useState<DocKind>("pickup")
  const [newScene, setNewScene] = useState("自定义打印模板")
  const [saving, setSaving] = useState(false)

  const enabledCount = templates.filter((t) => t.enabled).length
  const pickupEnabled = useMemo(
    () => templates.filter((t) => t.enabled && t.docKind === "pickup"),
    [templates],
  )
  const returnEnabled = useMemo(
    () => templates.filter((t) => t.enabled && t.docKind === "return"),
    [templates],
  )

  async function toggle(id: string) {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    try {
      await update(id, {
        enabled: !t.enabled,
        __auditAction: "修改",
        __auditDetail: `${t.name} 已${t.enabled ? "停用" : "启用"}`,
      })
      toast.success(`${t.name} 已${t.enabled ? "停用" : "启用"}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function cloneTemplate(source: DocTemplate) {
    if (!isSysAdmin) {
      toast.error("仅系统管理员可复用模板")
      return
    }
    setSaving(true)
    try {
      const layout = source.layout ? structuredClone(source.layout) : layoutForKind(source.docKind || "other")
      const id = `t_${Date.now().toString(36)}`
      const name = `${source.name}（副本）`
      const code = `${source.code}_COPY_${Date.now().toString().slice(-4)}`
      await create({
        id,
        name,
        code,
        scene: source.scene,
        fields: fieldsFromLayout(layout),
        updatedAt: nowLocalStr().slice(0, 10),
        enabled: false,
        docKind: source.docKind || "other",
        builtIn: false,
        clonedFrom: source.id,
        layout,
        __auditAction: "新增",
        __auditDetail: `复用模板 ${source.name} → ${name}`,
      })
      await revalidateResource("templates")
      toast.success("已复用为可编辑副本，可进入设计器调整")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function createBlank() {
    if (!isSysAdmin) return
    const name = newName.trim()
    const code = newCode.trim().toUpperCase()
    if (!name || !code) {
      toast.error("请填写名称与编码")
      return
    }
    if (templates.some((t) => t.code === code)) {
      toast.error("编码已存在")
      return
    }
    setSaving(true)
    try {
      const layout = layoutForKind(newKind)
      layout.title = name.replace(/[（(].*$/, "").trim() || layout.title
      await create({
        id: `t_${Date.now().toString(36)}`,
        name,
        code,
        scene: newScene.trim() || "自定义打印模板",
        fields: fieldsFromLayout(layout),
        updatedAt: nowLocalStr().slice(0, 10),
        enabled: false,
        docKind: newKind,
        builtIn: false,
        layout,
        __auditAction: "新增",
        __auditDetail: `新建模板 ${name}`,
      })
      await revalidateResource("templates")
      setCreateOpen(false)
      setNewName("")
      setNewCode("")
      toast.success("模板已创建，请进入设计器编辑")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="单据模板引擎"
        description="提箱单 / 还箱单支持多套内置模板与可视化设计；内置模板不可直接改版，可复用后编辑。打印不含用箱价格。"
        actions={
          isSysAdmin ? (
            <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              新建模板
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="模板总数" value={templates.length} unit="个" icon={FileText} tone="primary" />
        <StatCard label="已启用" value={enabledCount} unit="个" icon={FileCheck2} tone="success" />
        <StatCard label="停用" value={templates.length - enabledCount} unit="个" icon={FileClock} tone="warning" />
      </div>

      {(pickupEnabled.length > 0 || returnEnabled.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">打印引用中</CardTitle>
            <CardDescription>客户门户「提还箱作业」将按启用中的提箱/还箱模板打印（可在预览中切换）</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...pickupEnabled, ...returnEnabled].map((t) => (
              <Badge key={t.id} variant="outline" className="font-normal">
                {kindLabel(t.docKind)} · {t.name}
                {t.builtIn ? " · 内置" : ""}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-4 text-primary" />
                    {t.name}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">{t.code}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={t.enabled ? "default" : "secondary"}>{t.enabled ? "已启用" : "已停用"}</Badge>
                  <Badge variant="outline">{kindLabel(t.docKind)}</Badge>
                  {t.builtIn ? <Badge variant="secondary">内置</Badge> : <Badge variant="outline">自定义</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">生成场景：</span>
                {t.scene}
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">模板字段（{t.fields?.length ?? 0}）</p>
                <div className="flex flex-wrap gap-1.5">
                  {(t.fields ?? []).slice(0, 6).map((f) => (
                    <span key={f} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {f}
                    </span>
                  ))}
                  {(t.fields?.length ?? 0) > 6 && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      +{(t.fields?.length ?? 0) - 6}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">更新于 {t.updatedAt}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 bg-transparent"
                    onClick={() => setFieldsView(t)}
                  >
                    <ListTree className="size-3.5" />
                    字段
                  </Button>
                  {(t.docKind === "pickup" || t.docKind === "return") && (
                    <>
                      {isSysAdmin && !t.builtIn ? (
                        <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" nativeButton={false} render={<Link href={`/yard/templates/${t.id}/design`} />}>
                          <Pencil className="size-3.5" />
                          设计
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" nativeButton={false} render={<Link href={`/yard/templates/${t.id}/design`} />}>
                          <Eye className="size-3.5" />
                          预览设计
                        </Button>
                      )}
                      {isSysAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 bg-transparent"
                          disabled={saving}
                          onClick={() => cloneTemplate(t)}
                        >
                          <Copy className="size-3.5" />
                          复用
                        </Button>
                      )}
                    </>
                  )}
                  <Switch checked={t.enabled} onCheckedChange={() => toggle(t.id)} />
                </div>
              </div>
              {t.builtIn && isSysAdmin && (t.docKind === "pickup" || t.docKind === "return") && (
                <p className="text-[11px] text-muted-foreground">内置模板内容锁定；请「复用」后编辑副本。</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!fieldsView} onOpenChange={(o) => !o && setFieldsView(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{fieldsView?.name} · 字段列表</DialogTitle>
            <DialogDescription>
              共 {fieldsView?.fields?.length ?? 0} 个字段 · {fieldsView?.scene}
            </DialogDescription>
          </DialogHeader>
          <ul className="grid grid-cols-2 gap-2">
            {(fieldsView?.fields ?? []).map((f, i) => (
              <li key={f} className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                {f}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus2 className="size-4" />
              新建单据模板
            </DialogTitle>
            <DialogDescription>创建后默认为停用状态，请进入设计器配置字段与电子章。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>名称 *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如 提箱单（西安港专版）" />
            </div>
            <div className="space-y-1.5">
              <Label>编码 *</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="例如 RELEASE_XA" />
            </div>
            <div className="space-y-1.5">
              <Label>类型</Label>
              <div className="flex gap-2">
                {([
                  ["pickup", "提箱单"],
                  ["return", "还箱单"],
                ] as const).map(([k, label]) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={newKind === k ? "default" : "outline"}
                    onClick={() => setNewKind(k)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>场景说明</Label>
              <Textarea value={newScene} onChange={(e) => setNewScene(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={createBlank} disabled={saving}>
              {saving ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
