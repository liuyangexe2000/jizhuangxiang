"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Plus, Printer, Save, Trash2, Upload } from "lucide-react"
import { OrderDocumentPreview } from "@/components/order-document"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useResource, revalidateResource } from "@/lib/api"
import {
  DOC_FIELD_CATALOG,
  builtInSealDataUrl,
  defaultSealConfig,
  fieldsFromLayout,
  kindLabel,
  layoutForKind,
  type DocFieldKey,
  type DocTemplateLayout,
} from "@/lib/domain/doc-template-layout"
import { nowLocalStr } from "@/lib/now-local"
import { useRole } from "@/lib/role-context"
import type { DocTemplate, UseBoxOrder } from "@/lib/types"

const SAMPLE_ORDER: UseBoxOrder = {
  id: "preview",
  orderNo: "UB202607160001",
  customer: "西安国际陆港集团",
  customerType: "班列客户",
  pickupCity: "西安",
  returnCity: "汉堡",
  pickupYard: "陆港堆场",
  returnYard: "汉堡HCS",
  containerType: "40HQ",
  quantity: 12,
  unitPrice: 3200,
  quotedUnitPrice: 3280,
  status: "已确认",
  createdAt: "2026-07-16 09:00",
  confirmedAt: "2026-07-16 10:30",
  confirmedBy: "张伟",
  releaseDocReady: true,
  stuffingListUploaded: false,
  returnProofUploaded: false,
  adminRemark: "已按优惠价确认",
  channel: "订舱勾选",
}

export default function TemplateDesignPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { roleId } = useRole()
  const isSysAdmin = roleId === "R00"
  const { data: templates, update } = useResource<DocTemplate>("templates")
  const template = templates.find((t) => t.id === params.id)

  const [layout, setLayout] = useState<DocTemplateLayout | null>(null)
  const [name, setName] = useState("")
  const [scene, setScene] = useState("")
  const [saving, setSaving] = useState(false)

  const readOnly = !isSysAdmin || !!template?.builtIn

  useEffect(() => {
    if (!template) return
    setName(template.name)
    setScene(template.scene)
    setLayout(
      template.layout
        ? (structuredClone(template.layout) as DocTemplateLayout)
        : layoutForKind(template.docKind || "other"),
    )
  }, [template])

  const catalog = useMemo(() => {
    const kind = template?.docKind || "other"
    const matched = DOC_FIELD_CATALOG.filter((f) => f.kinds.includes(kind))
    return matched.length > 0 ? matched : DOC_FIELD_CATALOG.filter((f) => f.kinds.includes("other"))
  }, [template?.docKind])

  if (!template) {
    return (
      <div className="space-y-4">
        <PageHeader title="模板设计" description="未找到模板" />
        <Button variant="outline" nativeButton={false} render={<Link href="/yard/templates" />}>
          返回列表
        </Button>
      </div>
    )
  }

  if (!layout) return null

  function patchLayout(patch: Partial<DocTemplateLayout>) {
    setLayout((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function patchSeal(patch: Partial<DocTemplateLayout["seal"]>) {
    setLayout((prev) =>
      prev ? { ...prev, seal: { ...prev.seal, ...patch } } : prev,
    )
  }

  function updateCell(ri: number, ci: number, patch: { key?: DocFieldKey; label?: string }) {
    setLayout((prev) => {
      if (!prev) return prev
      const rows = prev.rows.map((row, i) => {
        if (i !== ri) return row
        return {
          cells: row.cells.map((cell, j) => (j === ci ? { ...cell, ...patch } : cell)),
        }
      })
      return { ...prev, rows }
    })
  }

  function addRow(cols: 1 | 2) {
    const first = catalog[0]
    if (!first) return
    setLayout((prev) => {
      if (!prev) return prev
      const cells =
        cols === 1
          ? [{ key: first.key, label: first.label }]
          : [
              { key: first.key, label: first.label },
              { key: catalog[1]?.key ?? first.key, label: catalog[1]?.label ?? first.label },
            ]
      return { ...prev, rows: [...prev.rows, { cells }] }
    })
  }

  function removeRow(ri: number) {
    setLayout((prev) => {
      if (!prev || prev.rows.length <= 1) return prev
      return { ...prev, rows: prev.rows.filter((_, i) => i !== ri) }
    })
  }

  async function save() {
    if (!template || !layout) return
    if (readOnly) {
      toast.error(template.builtIn ? "内置模板不可编辑，请先复用" : "无编辑权限")
      return
    }
    setSaving(true)
    try {
      await update(template.id, {
        name: name.trim() || template.name,
        scene: scene.trim() || template.scene,
        layout,
        fields: fieldsFromLayout(layout),
        updatedAt: nowLocalStr().slice(0, 10),
        __auditAction: "修改",
        __auditDetail: `设计模板 ${template.code}`,
      })
      await revalidateResource("templates")
      toast.success("模板已保存")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function onSealFile(file: File | null) {
    if (!file) return
    if (file.size > 800_000) {
      toast.error("章图片请小于 800KB")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || "")
      patchSeal({ imageDataUrl: url, enabled: true })
    }
    reader.readAsDataURL(file)
  }

  const previewTemplate: DocTemplate = {
    ...template,
    name,
    scene,
    layout,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={readOnly ? "模板预览设计" : "可视化模板设计"}
        description={
          template.builtIn
            ? `内置模板「${template.name}」只读；请返回列表点击「复用」后编辑副本。`
            : `编辑「${template.name}」的字段布局、文案与电子章。提箱单不含用箱价格。`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/yard/templates" />}>
              <ArrowLeft className="size-4" />
              返回
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="size-4" />
              试打印
            </Button>
            {!readOnly && (
              <Button className="gap-1.5" onClick={save} disabled={saving}>
                <Save className="size-4" />
                {saving ? "保存中…" : "保存"}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="no-print space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">基本信息</CardTitle>
              <CardDescription>
                {template.code} · {kindLabel(template.docKind)}
                {template.builtIn ? " · 内置锁定" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>模板名称</Label>
                <Input value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>场景说明</Label>
                <Textarea value={scene} disabled={readOnly} onChange={(e) => setScene(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>机构抬头</Label>
                <Input
                  value={layout.orgLine}
                  disabled={readOnly}
                  onChange={(e) => patchLayout({ orgLine: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>单据标题</Label>
                <Input
                  value={layout.title}
                  disabled={readOnly}
                  onChange={(e) => patchLayout({ title: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label>显示模板名</Label>
                <Switch
                  checked={layout.showTemplateName}
                  disabled={readOnly}
                  onCheckedChange={(v) => patchLayout({ showTemplateName: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>元信息行（可用 {"{{orderNo}}"} {"{{confirmedAt}}"} 等）</Label>
                <Input
                  value={layout.metaLine}
                  disabled={readOnly}
                  onChange={(e) => patchLayout({ metaLine: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>底部说明</Label>
                <Textarea
                  value={layout.notice}
                  disabled={readOnly}
                  onChange={(e) => patchLayout({ notice: e.target.value })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">字段行</CardTitle>
                  <CardDescription>每行 1～2 列；不含用箱价格字段</CardDescription>
                </div>
                {!readOnly && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => addRow(1)}>
                      <Plus className="size-3.5" />1 列
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addRow(2)}>
                      <Plus className="size-3.5" />2 列
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {layout.rows.map((row, ri) => (
                <div key={ri} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">第 {ri + 1} 行</span>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => removeRow(ri)} disabled={layout.rows.length <= 1}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className={`grid gap-2 ${row.cells.length > 1 ? "sm:grid-cols-2" : ""}`}>
                    {row.cells.map((cell, ci) => (
                      <div key={ci} className="space-y-1.5">
                        <Label className="text-xs">字段</Label>
                        <select
                          className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                          disabled={readOnly}
                          value={cell.key}
                          onChange={(e) => {
                            const key = e.target.value as DocFieldKey
                            const def = catalog.find((c) => c.key === key)
                            updateCell(ri, ci, { key, label: def?.label ?? cell.label })
                          }}
                        >
                          {catalog.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={cell.label}
                          disabled={readOnly}
                          onChange={(e) => updateCell(ri, ci, { label: e.target.value })}
                          placeholder="显示标签"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">签章与电子章</CardTitle>
              <CardDescription>打印页右下角叠加电子章图片</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>显示签字区</Label>
                <Switch
                  checked={layout.showSignature}
                  disabled={readOnly}
                  onCheckedChange={(v) => patchLayout({ showSignature: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>签字区标题</Label>
                <Input
                  value={layout.signatureLabel}
                  disabled={readOnly}
                  onChange={(e) => patchLayout({ signatureLabel: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label>启用电子章</Label>
                <Switch
                  checked={layout.seal.enabled}
                  disabled={readOnly}
                  onCheckedChange={(v) => patchSeal({ enabled: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>章面文字（内置章）</Label>
                <Input
                  value={layout.seal.label}
                  disabled={readOnly}
                  onChange={(e) => patchSeal({ label: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label>尺寸</Label>
                  <Input
                    type="number"
                    value={layout.seal.size}
                    disabled={readOnly}
                    onChange={(e) => patchSeal({ size: Number(e.target.value) || 112 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>右偏移</Label>
                  <Input
                    type="number"
                    value={layout.seal.offsetX}
                    disabled={readOnly}
                    onChange={(e) => patchSeal({ offsetX: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>下偏移</Label>
                  <Input
                    type="number"
                    value={layout.seal.offsetY}
                    disabled={readOnly}
                    onChange={(e) => patchSeal({ offsetY: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm">
                    <Upload className="size-3.5" />
                    上传章图
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => onSealFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      patchSeal({
                        ...defaultSealConfig({ label: layout.seal.label }),
                        imageDataUrl: builtInSealDataUrl(layout.seal.label || "箱管部"),
                        enabled: true,
                      })
                    }
                  >
                    使用内置红章
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => patchSeal({ imageDataUrl: undefined })}>
                    清除自定义图
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <p className="no-print text-sm text-muted-foreground">实时预览（A4 宽）</p>
          <div className="overflow-auto rounded-xl border bg-zinc-100 p-4 print:border-0 print:bg-white print:p-0">
            <OrderDocumentPreview order={SAMPLE_ORDER} template={previewTemplate} layout={layout} />
          </div>
        </div>
      </div>
    </div>
  )
}
