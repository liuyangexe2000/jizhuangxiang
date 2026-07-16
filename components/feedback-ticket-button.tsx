"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { MessageSquarePlus, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { useResource } from "@/lib/api"
import { resizeImageToDataUrl } from "@/lib/image-resize"
import { navGroups } from "@/lib/nav"
import { nowLocalStr } from "@/lib/now-local"
import { roles } from "@/lib/roles"
import { useRole } from "@/lib/role-context"
import { useRuntimeSettings } from "@/lib/settings-client"
import type { FeedbackTicket, FeedbackTicketType } from "@/lib/types"

const TICKET_TYPES: FeedbackTicketType[] = ["bug", "业务需求", "简易", "体验优化", "其他"]

function resolvePageTitle(pathname: string): string {
  for (const g of navGroups) {
    for (const item of g.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return `${g.label} · ${item.title}`
      }
    }
  }
  if (pathname === "/" || pathname === "") return "首页"
  return pathname
}

function clipboardImageFile(data: DataTransfer | null): File | null {
  if (!data) return null
  const items = data.items
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item?.kind === "file" && item.type.startsWith("image/")) {
        return item.getAsFile()
      }
    }
  }
  const files = data.files
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file?.type.startsWith("image/")) return file
    }
  }
  return null
}

export function FeedbackTicketButton() {
  const pathname = usePathname() || "/"
  const { user, roleId, loading: roleLoading } = useRole()
  const { settings } = useRuntimeSettings()
  const { create } = useResource<FeedbackTicket>("feedbackTickets")

  const enabled = settings?.feedbackTicketEnabled !== false
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackTicketType>("bug")
  const [content, setContent] = useState("")
  const [createdAt, setCreatedAt] = useState("")
  const [screenshotDataUrl, setScreenshotDataUrl] = useState("")
  const [screenshotFileName, setScreenshotFileName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const pageTitle = useMemo(() => resolvePageTitle(pathname), [pathname])
  const roleName = useMemo(
    () => roles.find((r) => r.id === roleId)?.name || roleId || "—",
    [roleId],
  )

  const onPickImage = useCallback(async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const resized = await resizeImageToDataUrl(file, 1024)
      setScreenshotDataUrl(resized.dataUrl)
      setScreenshotFileName(resized.fileName)
      toast.success(`截图已压缩为宽 ${resized.width}px`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }, [])

  useEffect(() => {
    if (open) setCreatedAt(nowLocalStr())
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPaste(e: ClipboardEvent) {
      const file = clipboardImageFile(e.clipboardData)
      if (!file) return
      e.preventDefault()
      void onPickImage(
        new File([file], `clipboard_${Date.now()}.png`, {
          type: file.type || "image/png",
        }),
      )
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [open, onPickImage])

  if (roleLoading || !enabled || !user) return null

  async function submit() {
    const text = content.trim()
    if (!text) {
      toast.error("请填写工单内容")
      return
    }
    setSubmitting(true)
    try {
      const stamp = createdAt || nowLocalStr()
      const ticketNo = `FB${stamp.replace(/[-:\s]/g, "").slice(0, 12)}${Math.floor(Math.random() * 900 + 100)}`
      await create({
        id: `fb_${Date.now().toString(36)}`,
        ticketNo,
        type,
        content: text,
        account: user!.account,
        userName: user!.name,
        roleId: roleId!,
        roleName,
        pagePath: pathname,
        pageTitle,
        screenshotDataUrl: screenshotDataUrl || undefined,
        screenshotFileName: screenshotFileName || undefined,
        createdAt: stamp,
        status: "待处理",
        __auditAction: "新增",
        __auditDetail: `${ticketNo} · ${type} · ${pageTitle}`,
      })
      toast.success("工单已提交，感谢反馈")
      setOpen(false)
      setContent("")
      setType("bug")
      setScreenshotDataUrl("")
      setScreenshotFileName("")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="fixed right-5 bottom-5 z-[60] gap-2 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus className="size-4" />
        工单
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>提交软件工单</DialogTitle>
            <DialogDescription>
              用于反馈 Bug、业务需求或改进建议。系统会自动记录账号、角色与当前页面。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>操作账号</Label>
                <div
                  className="flex h-8 items-center overflow-x-auto rounded-lg border border-input bg-muted/50 px-2.5 text-sm whitespace-nowrap text-muted-foreground select-none"
                  title={`${user.name}（${user.account}）`}
                >
                  {user.name}（{user.account}）
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>角色</Label>
                <div
                  className="flex h-8 items-center overflow-x-auto rounded-lg border border-input bg-muted/50 px-2.5 text-sm whitespace-nowrap text-muted-foreground select-none"
                  title={`${roleName}（${roleId}）`}
                >
                  {roleName}（{roleId}）
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>所在功能页面</Label>
                <div
                  className="flex h-8 items-center overflow-x-auto rounded-lg border border-input bg-muted/50 px-2.5 text-sm whitespace-nowrap text-muted-foreground select-none"
                  title={`${pageTitle} · ${pathname}`}
                >
                  {pageTitle} · {pathname}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>工单类型 *</Label>
              <div className="flex flex-wrap gap-2">
                {TICKET_TYPES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={type === t ? "default" : "outline"}
                    onClick={() => setType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>内容 *</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="请描述问题现象、复现步骤，或需求背景与期望效果…"
                rows={5}
              />
            </div>

            <div
              className="space-y-1.5 rounded-lg border border-dashed p-3"
              tabIndex={0}
              onPaste={(e) => {
                const file = clipboardImageFile(e.clipboardData)
                if (!file) return
                e.preventDefault()
                void onPickImage(
                  new File([file], `clipboard_${Date.now()}.png`, {
                    type: file.type || "image/png",
                  }),
                )
              }}
            >
              <Label>截图上传</Label>
              <p className="text-xs text-muted-foreground">
                支持选择图片，或直接 Ctrl+V 粘贴剪贴板截图；宽度自动压缩至不超过 1024px
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm">
                  <Upload className="size-3.5" />
                  {uploading ? "处理中…" : "选择图片"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
                  />
                </label>
                {screenshotDataUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setScreenshotDataUrl("")
                      setScreenshotFileName("")
                    }}
                  >
                    <X className="size-3.5" />
                    清除
                  </Button>
                )}
              </div>
              {screenshotDataUrl && (
                <div className="overflow-hidden rounded-md border bg-muted/30 p-2">
                  <img src={screenshotDataUrl} alt="截图预览" className="max-h-48 max-w-full object-contain" />
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{screenshotFileName}</p>
                </div>
              )}
            </div>

            <input type="hidden" name="createdAt" value={createdAt} readOnly />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={submitting || uploading}>
              {submitting ? "提交中…" : "提交工单"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
