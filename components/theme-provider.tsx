"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * next-themes 会注入内联 <script> 防止主题闪烁。
 * React 19 / Next 16 对组件内 <script> 会打出 console.error（开发态误报，SSR 下脚本实际有效）。
 * 与 shadcn dark-mode 文档一致：开发环境过滤该条噪音。
 */
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const orig = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) return
    orig.apply(console, args)
  }
}

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
