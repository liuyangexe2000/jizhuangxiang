"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, MessageSquarePlus, Upload, X } from "lucide-react"
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
import { FEEDBACK_SCREENSHOT_MAX } from "@/lib/domain/feedback-screenshots"
import { resizeImageToDataUrl } from "@/lib/image-resize"
import { navGroups } from "@/lib/nav"
import { nowLocalStr } from "@/lib/now-local"
import { roles } from "@/lib/roles"
import { useRole } from "@/lib/role-context"
import { useRuntimeSettings } from "@/lib/settings-client"
import type { FeedbackScreenshot, FeedbackTicket, FeedbackTicketType } from "@/lib/types"

const TICKET_TYPES: FeedbackTicketType[] = ["bug", "业务需求", "简易", "体验优化", "其他"]

function resolveActiveTabLabels(): string[] {
  if (typeof document === "undefined") return []
  const selectors = [
    'main [data-slot="tabs-trigger"][data-active]',
    'main [data-slot="tabs-trigger"][data-active=""]',
    'main [data-slot="tabs-trigger"][aria-selected="true"]',
    'main [data-slot="tabs-trigger"][data-state="active"]',
  ]
  const seen = new Set<Element>()
  const labels: string[] = []
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return
      seen.add(el)
      const text = (el.textContent || "")
        .replace(/\s+/g, " ")
        .replace(/[（(]\d+[）)]/g, "")
        .trim()
      if (text && !labels.includes(text)) labels.push(text)
    })
  }
  return labels
}

function buildPageLocation(pathname: string, pageTitle: string, tabs: string[]) {
  const tabPart = tabs.length > 0 ? ` · Tab：${tabs.join(" / ")}` : ""
  return {
    pageTitle: `${pageTitle}${tabPart}`,
    pagePath: tabs.length > 0 ? `${pathname}#${encodeURIComponent(tabs.join("/"))}` : pathname,
  }
}

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
  const [screenshots, setScreenshots] = useState<FeedbackScreenshot[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [locationTitle, setLocationTitle] = useState("")
  const [locationPath, setLocationPath] = useState("")
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const screenshotsRef = useRef(screenshots)
  screenshotsRef.current = screenshots

  const pageTitle = useMemo(() => resolvePageTitle(pathname), [pathname])
  const roleName = useMemo(
    () => roles.find((r) => r.id === roleId)?.name || roleId || "—",
    [roleId],
  )

  const addImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const remain = FEEDBACK_SCREENSHOT_MAX - screenshotsRef.current.length
    if (remain <= 0) {
      toast.error(`最多上传 ${FEEDBACK_SCREENSHOT_MAX} 张截图`)
      return
    }
    const batch = files.slice(0, remain)
    if (files.length > remain) {
      toast.warning(`最多 ${FEEDBACK_SCREENSHOT_MAX} 张，已忽略多余文件`)
    }
    setUploading(true)
    try {
      const next: FeedbackScreenshot[] = []
      for (const file of batch) {
        const resized = await resizeImageToDataUrl(file, 1024)
        next.push({ dataUrl: resized.dataUrl, fileName: resized.fileName })
      }
      setScreenshots((prev) => [...prev, ...next].slice(0, FEEDBACK_SCREENSHOT_MAX))
      toast.success(`已添加 ${next.length} 张截图（宽≤1024px）`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setCreatedAt(nowLocalStr())
    const tabs = resolveActiveTabLabels()
    const loc = buildPageLocation(pathname, resolvePageTitle(pathname), tabs)
    setLocationTitle(loc.pageTitle)
    setLocationPath(loc.pagePath)
  }, [open, pathname])

  useEffect(() => {
    if (!open) return
    function onPaste(e: ClipboardEvent) {
      const file = clipboardImageFile(e.clipboardData)
      if (!file) return
      e.preventDefault()
      void addImages([
        new File([file], `clipboard_${Date.now()}.png`, {
          type: file.type || "image/png",
        }),
      ])
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [open, addImages])

  useEffect(() => {
    if (previewIndex == null) return
    function onKey(e: KeyboardEvent) {
      if (previewIndex == null) return
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setPreviewIndex((i) => (i == null ? i : (i - 1 + screenshotsRef.current.length) % screenshotsRef.current.length))
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        setPreviewIndex((i) => (i == null ? i : (i + 1) % screenshotsRef.current.length))
      }
      if (e.key === "Escape") setPreviewIndex(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [previewIndex])

  if (roleLoading || !enabled || !user) return null

  function removeShot(index: number) {
    setScreenshots((prev) => prev.filter((_, i) => i !== index))
    setPreviewIndex((cur) => {
      if (cur == null) return cur
      if (cur === index) return null
      if (cur > index) return cur - 1
      return cur
    })
  }

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
      const shots = screenshots.slice(0, FEEDBACK_SCREENSHOT_MAX)
      await create({
        id: `fb_${Date.now().toString(36)}`,
        ticketNo,
        type,
        content: text,
        account: user!.account,
        userName: user!.name,
        roleId: roleId!,
        roleName,
        pagePath: locationPath || pathname,
        pageTitle: locationTitle || pageTitle,
        screenshots: shots.length > 0 ? shots : undefined,
        createdAt: stamp,
        status: "待处理",
        __auditAction: "新增",
        __auditDetail: `${ticketNo} · ${type} · ${locationTitle || pageTitle}`,
      })
      toast.success("工单已提交，感谢反馈")
      setOpen(false)
      setContent("")
      setType("bug")
      setScreenshots([])
      setPreviewIndex(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const previewShot = previewIndex != null ? screenshots[previewIndex] : null

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
                  title={`${locationTitle || pageTitle} · ${locationPath || pathname}`}
                >
                  {locationTitle || pageTitle} · {locationPath || pathname}
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
              className="space-y-2 rounded-lg border border-dashed p-3"
              tabIndex={0}
              onPaste={(e) => {
                const file = clipboardImageFile(e.clipboardData)
                if (!file) return
                e.preventDefault()
                void addImages([
                  new File([file], `clipboard_${Date.now()}.png`, {
                    type: file.type || "image/png",
                  }),
                ])
              }}
            >
              <Label>截图上传（最多 {FEEDBACK_SCREENSHOT_MAX} 张）</Label>
              <p className="text-xs text-muted-foreground">
                支持选择或 Ctrl+V 粘贴；缩略图横排，点击可看大图轮播；宽度自动压缩至不超过 1024px
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                    screenshots.length >= FEEDBACK_SCREENSHOT_MAX || uploading
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }`}
                >
                  <Upload className="size-3.5" />
                  {uploading ? "处理中…" : "选择图片"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploading || screenshots.length >= FEEDBACK_SCREENSHOT_MAX}
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? [])
                      e.target.value = ""
                      void addImages(list)
                    }}
                  />
                </label>
                <span className="text-xs text-muted-foreground">
                  {screenshots.length}/{FEEDBACK_SCREENSHOT_MAX}
                </span>
              </div>

              {screenshots.length > 0 && (
                <div className="flex flex-row gap-2 overflow-x-auto pt-1">
                  {screenshots.map((shot, index) => (
                    <div key={`${shot.fileName}-${index}`} className="relative shrink-0">
                      <button
                        type="button"
                        className="block overflow-hidden rounded-md border bg-muted/30 transition hover:ring-2 hover:ring-ring"
                        onClick={() => setPreviewIndex(index)}
                        title="点击查看大图"
                      >
                        <img
                          src={shot.dataUrl}
                          alt={shot.fileName}
                          className="h-20 w-28 object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
                        onClick={() => removeShot(index)}
                        aria-label="删除截图"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
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

      <Dialog open={previewIndex != null && !!previewShot} onOpenChange={(o) => !o && setPreviewIndex(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              截图预览 {previewIndex != null ? `(${previewIndex + 1}/${screenshots.length})` : ""}
            </DialogTitle>
            <DialogDescription className="truncate">{previewShot?.fileName}</DialogDescription>
          </DialogHeader>
          <div className="relative flex min-h-[40vh] items-center justify-center bg-muted/30">
            {screenshots.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute left-2 z-10"
                onClick={() =>
                  setPreviewIndex((i) =>
                    i == null ? i : (i - 1 + screenshots.length) % screenshots.length,
                  )
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}
            {previewShot && (
              <img
                src={previewShot.dataUrl}
                alt={previewShot.fileName}
                className="max-h-[70vh] max-w-full object-contain"
              />
            )}
            {screenshots.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute right-2 z-10"
                onClick={() =>
                  setPreviewIndex((i) => (i == null ? i : (i + 1) % screenshots.length))
                }
              >
                <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
          {screenshots.length > 1 && (
            <div className="flex justify-center gap-2">
              {screenshots.map((shot, index) => (
                <button
                  key={`dot-${index}`}
                  type="button"
                  className={`h-14 w-20 overflow-hidden rounded border ${
                    previewIndex === index ? "ring-2 ring-ring" : "opacity-70 hover:opacity-100"
                  }`}
                  onClick={() => setPreviewIndex(index)}
                >
                  <img src={shot.dataUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
