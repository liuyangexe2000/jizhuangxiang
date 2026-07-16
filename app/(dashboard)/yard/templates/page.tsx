"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useResource } from "@/lib/api"
import type { DocTemplate } from "@/lib/types"
import { FileText, FileCheck2, FileClock, Eye, ListTree } from "lucide-react"
import { toast } from "sonner"

export default function TemplatesPage() {
  const { data: templates, update } = useResource<DocTemplate>("templates")
  const [preview, setPreview] = useState<DocTemplate | null>(null)
  const [fieldsView, setFieldsView] = useState<DocTemplate | null>(null)

  const enabledCount = templates.filter((t) => t.enabled).length
  const printRelated = templates.filter(
    (t) => t.enabled && (t.code === "RELEASE_ORDER" || t.code === "REDELIVERY_ORDER" || t.name.includes("提箱") || t.name.includes("还箱")),
  )

  async function toggle(id: string) {
    const t = templates.find((x) => x.id === id)
    try {
      await update(id, { enabled: !t?.enabled, __auditAction: "修改", __auditDetail: `${t?.name} 已${t?.enabled ? "停用" : "启用"}` })
      toast.success(`${t?.name} 已${t?.enabled ? "停用" : "启用"}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="单据模板引擎"
        description="M04-F01 标准化单据模板配置 — 启用中的模板名称会作为客户门户提还箱单打印标题；字段定义供单据生成与预览使用"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="模板总数" value={templates.length} unit="个" icon={FileText} tone="primary" />
        <StatCard label="已启用" value={enabledCount} unit="个" icon={FileCheck2} tone="success" />
        <StatCard
          label="停用"
          value={templates.length - enabledCount}
          unit="个"
          icon={FileClock}
          tone="warning"
        />
      </div>

      {printRelated.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">打印引用中</CardTitle>
            <CardDescription>
              以下已启用模板会喂给「提还箱作业」打印标题（提箱 / 还箱相关）
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {printRelated.map((t) => (
              <Badge key={t.id} variant="outline" className="font-normal">
                {t.name}
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
                  <Badge variant={t.enabled ? "default" : "secondary"}>
                    {t.enabled ? "已启用" : "已停用"}
                  </Badge>
                  {t.enabled && (t.code === "RELEASE_ORDER" || t.code === "REDELIVERY_ORDER" || t.name.includes("提箱") || t.name.includes("还箱")) && (
                    <span className="text-[11px] text-muted-foreground">用于打印标题</span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">生成场景：</span>
                {t.scene}
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  模板字段（{t.fields.length}）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {t.fields.slice(0, 6).map((f) => (
                    <span
                      key={f}
                      className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    >
                      {f}
                    </span>
                  ))}
                  {t.fields.length > 6 && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      +{t.fields.length - 6}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">更新于 {t.updatedAt}</span>
                <div className="flex items-center gap-2">
                  <Dialog
                    open={fieldsView?.id === t.id}
                    onOpenChange={(o) => setFieldsView(o ? t : null)}
                  >
                    <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5 bg-transparent" />}>
                      <ListTree className="size-3.5" />
                      预览字段
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>{t.name} · 字段列表</DialogTitle>
                        <DialogDescription>
                          共 {t.fields.length} 个字段 · {t.scene}
                        </DialogDescription>
                      </DialogHeader>
                      <ul className="grid grid-cols-2 gap-2">
                        {t.fields.map((f, i) => (
                          <li
                            key={f}
                            className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
                          >
                            <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </DialogContent>
                  </Dialog>
                  <Dialog
                    open={preview?.id === t.id}
                    onOpenChange={(o) => setPreview(o ? t : null)}
                  >
                    <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5 bg-transparent" />}>
                      <Eye className="size-3.5" />
                      预览
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>{t.name} · 字段预览</DialogTitle>
                        <DialogDescription>{t.scene}</DialogDescription>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-2">
                        {t.fields.map((f) => (
                          <div
                            key={f}
                            className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
                          >
                            {f}
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <div className="flex items-center gap-2">
                    <Switch checked={t.enabled} onCheckedChange={() => toggle(t.id)} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
