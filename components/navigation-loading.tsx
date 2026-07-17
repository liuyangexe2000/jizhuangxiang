"use client"

import { useCallback, useEffect, useRef, useState, Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

function isModifiedClick(e: MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}

function shouldStartNavigation(anchor: HTMLAnchorElement, e: MouseEvent): boolean {
  if (isModifiedClick(e)) return false
  if (anchor.target && anchor.target !== "_self") return false
  if (anchor.hasAttribute("download")) return false
  const href = anchor.getAttribute("href")
  if (!href || href.startsWith("#")) return false
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
    return false
  }
  try {
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin) return false
    const next = `${url.pathname}${url.search}`
    const curr = `${window.location.pathname}${window.location.search}`
    if (next === curr) return false
  } catch {
    return false
  }
  return true
}

function NavigationLoadingInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (delayRef.current) {
      clearTimeout(delayRef.current)
      delayRef.current = null
    }
    if (safetyRef.current) {
      clearTimeout(safetyRef.current)
      safetyRef.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearTimers()
    setVisible(false)
  }, [clearTimers])

  const show = useCallback(() => {
    clearTimers()
    // 快速切换不闪烁：略延迟后再显示
    delayRef.current = setTimeout(() => {
      setVisible(true)
      safetyRef.current = setTimeout(() => setVisible(false), 10000)
    }, 120)
  }, [clearTimers])

  useEffect(() => {
    hide()
  }, [pathname, searchParams, hide])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      const anchor = el?.closest?.("a") as HTMLAnchorElement | null
      if (!anchor || !shouldStartNavigation(anchor, e)) return
      show()
    }
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("click", onClick, true)
      clearTimers()
    }
  }, [show, clearTimers])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/45 backdrop-blur-[1.5px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card px-9 py-8 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.28)]">
        <Loader2 className="size-9 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">页面加载中</p>
      </div>
    </div>
  )
}

/** 侧栏 / 顶栏等站内链接切换时的居中旋转加载层 */
export function NavigationLoading() {
  return (
    <Suspense fallback={null}>
      <NavigationLoadingInner />
    </Suspense>
  )
}

/** 页面内局部加载（权限校验、Suspense fallback 等） */
export function PageSpinner({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
