"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Download, Eye, MessageSquarePlus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useResource, revalidateResource } from "@/lib/api"
import { downloadCsv } from "@/lib/csv"
import { ticketScreenshots } from "@/lib/domain/feedback-screenshots"
import type { FeedbackTicket, FeedbackTicketStatus } from "@/lib/types"

const STATUSES: FeedbackTicketStatus[] = ["待处理", "处理中", "已关闭"]

export default function AdminFeedbackPage() {
  const { data, update, isLoading } = useResource<FeedbackTicket>("feedbackTickets")
  const [detail, setDetail] = useState<FeedbackTicket | null>(null)
  const [feedbackDraft, setFeedbackDraft] = useState("")
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [shotIndex, setShotIndex] = useState(0)

  const sorted = useMemo(
    () => [...data].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [data],
  )

  const pending = sorted.filter((t) => t.status === "待处理").length
  const detailShots = detail ? ticketScreenshots(detail) : []
  const activeShot = detailShots[Math.min(shotIndex, Math.max(detailShots.length - 1, 0))]

  function openDetail(t: FeedbackTicket) {
    setDetail(t)
    setFeedbackDraft(t.processFeedback ?? "")
    setShotIndex(0)
  }

  async function setStatus(id: string, status: FeedbackTicketStatus) {
    try {
      await update(id, {
        status,
        __auditAction: "修改",
        __auditDetail: `工单状态 → ${status}`,
      })
      await revalidateResource("feedbackTickets")
      toast.success(`已标记为${status}`)
      setDetail((prev) => (prev?.id === id ? { ...prev, status } : prev))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function saveFeedback() {
    if (!detail) return
    const text = feedbackDraft.trim()
    if (!text) {
      toast.error("请填写处理反馈")
      return
    }
    setSavingFeedback(true)
    try {
      await update(detail.id, {
        processFeedback: text,
        __auditAction: "修改",
        __auditDetail: `工单处理反馈 ${detail.ticketNo}`,
      })
      await revalidateResource("feedbackTickets")
      setDetail((prev) => (prev ? { ...prev, processFeedback: text } : prev))
      toast.success("处理反馈已保存")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingFeedback(false)
    }
  }

  function handleExportCsv() {
    const headers = ["工单号", "类型", "状态", "页面", "内容", "提交人", "创建时间", "处理反馈"]
    const rows = sorted.map((t) => [
      t.ticketNo,
      t.type,
      t.status,
      t.pageTitle || t.pagePath,
      t.content,
      `${t.userName}（${t.account}）`,
      t.createdAt,
      t.processFeedback ?? "",
    ])
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`反馈工单_${stamp}.csv`, headers, rows)
    toast.success(`已导出 ${sorted.length} 条工单 CSV`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        module="系统管理 · 系统管理员专区"
        title="反馈工单"
        description="汇总各角色从业务页提交的 Bug、业务需求与改进建议，便于持续完善系统。"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 bg-transparent"
            disabled={sorted.length === 0}
            onClick={handleExportCsv}
          >
            <Download className="size-4" />
            导出 CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>工单总数</CardDescription>
            <CardTitle className="text-2xl">{sorted.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>待处理</CardDescription>
            <CardTitle className="text-2xl">{pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>入口</CardDescription>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <MessageSquarePlus className="size-4 text-primary" />
              右下角「工单」按钮
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">工单列表</CardTitle>
          <CardDescription>按提交时间倒序</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无工单</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>工单号</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>账号 / 角色</TableHead>
                  <TableHead>页面</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>反馈</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.ticketNo}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{t.userName}（{t.account}）</div>
                      <div className="text-xs text-muted-foreground">{t.roleName}</div>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-sm" title={t.pagePath}>
                      {t.pageTitle}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {t.createdAt}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="max-w-[8rem] truncate text-xs text-muted-foreground" title={t.processFeedback}>
                      {t.processFeedback ? "已填写" : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => openDetail(t)}>
                        <Eye className="size-3.5" />
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.ticketNo}</DialogTitle>
            <DialogDescription>
              {detail?.type} · {detail?.pageTitle} · {detail?.createdAt}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <p>
                <span className="text-muted-foreground">提交人：</span>
                {detail.userName}（{detail.account}）· {detail.roleName}（{detail.roleId}）
              </p>
              <p>
                <span className="text-muted-foreground">页面：</span>
                {detail.pagePath}
              </p>
              <div>
                <p className="mb-1.5 text-muted-foreground">用户描述</p>
                <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap">{detail.content}</div>
              </div>

              <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                <Label htmlFor="process-feedback" className="text-sm font-medium text-foreground">
                  工单处理反馈
                </Label>
                <Textarea
                  id="process-feedback"
                  rows={4}
                  placeholder="填写修复说明、验收结论或后续计划…"
                  value={feedbackDraft}
                  onChange={(e) => setFeedbackDraft(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={savingFeedback} onClick={() => void saveFeedback()}>
                    {savingFeedback ? "保存中…" : "保存处理反馈"}
                  </Button>
                </div>
              </div>

              {detailShots.length > 0 && (
                <div className="space-y-2">
                  <div className="relative flex min-h-[12rem] items-center justify-center overflow-hidden rounded-md border bg-muted/20 p-2">
                    {detailShots.length > 1 && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="absolute left-2 z-10"
                        onClick={() =>
                          setShotIndex((i) => (i - 1 + detailShots.length) % detailShots.length)
                        }
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                    )}
                    {activeShot && (
                      <img
                        src={activeShot.dataUrl}
                        alt={activeShot.fileName}
                        className="max-h-[28rem] max-w-full object-contain"
                      />
                    )}
                    {detailShots.length > 1 && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="absolute right-2 z-10"
                        onClick={() => setShotIndex((i) => (i + 1) % detailShots.length)}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {detailShots.map((shot, index) => (
                      <button
                        key={`${shot.fileName}-${index}`}
                        type="button"
                        className={`h-14 w-20 shrink-0 overflow-hidden rounded border ${
                          shotIndex === index ? "ring-2 ring-ring" : "opacity-70 hover:opacity-100"
                        }`}
                        onClick={() => setShotIndex(index)}
                      >
                        <img src={shot.dataUrl} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {shotIndex + 1}/{detailShots.length} · {activeShot?.fileName}
                  </p>
                </div>
              )}
              <div>
                <p className="mb-2 text-muted-foreground">工单状态</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant={detail.status === st ? "default" : "outline"}
                      onClick={() => void setStatus(detail.id, st)}
                    >
                      {st}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
