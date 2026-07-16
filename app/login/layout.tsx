import type { Metadata } from "next"
import { Fraunces, Manrope } from "next/font/google"

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-login-display",
  weight: ["500", "600", "700"],
})

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-login-sans",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "登录 · 集装箱业务管理系统",
  description: "中欧班列平台公司集装箱全生命周期管理 — 安全登录",
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${sans.variable} font-[family-name:var(--font-login-sans)]`}>
      {children}
    </div>
  )
}
