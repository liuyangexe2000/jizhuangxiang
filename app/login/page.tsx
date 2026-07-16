"use client"

import { Suspense, useCallback, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Container,
  Loader2,
  Lock,
  ShieldCheck,
  MapPinned,
  ArrowRightLeft,
  Warehouse,
  Users,
  X,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { roles, systemUsers } from "@/lib/mock-data"
import { usePublicSettings } from "@/lib/settings-client"
import type { RoleId, SystemUser } from "@/lib/types"

/** 与种子密码一致，仅供登录页演示快捷入口 */
const DEMO_PASSWORD = "Passw0rd!"

const DEMO_ACCOUNTS = systemUsers.map((u) => {
  const role = roles.find((r) => r.id === u.roleId)
  return {
    ...u,
    roleName: role?.name ?? u.roleId,
    roleType: role?.type ?? "",
  }
})

type DemoAccount = (typeof DEMO_ACCOUNTS)[number]

function roleTone(roleId: RoleId) {
  const map: Record<RoleId, string> = {
    R00: "bg-slate-800 text-white",
    R01: "bg-[#1a4f8c] text-white",
    R02: "bg-sky-700 text-white",
    R03: "bg-emerald-700 text-white",
    R04: "bg-amber-700 text-white",
    R05: "bg-violet-700 text-white",
    R06: "bg-teal-700 text-white",
  }
  return map[roleId]
}

function LoginForm({
  account,
  password,
  onAccountChange,
  onPasswordChange,
  loading,
  error,
  onSubmit,
}: {
  account: string
  password: string
  onAccountChange: (v: string) => void
  onPasswordChange: (v: string) => void
  loading: boolean
  error: string
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="account" className="text-[13px] font-medium text-slate-600">
          账号
        </Label>
        <Input
          id="account"
          value={account}
          onChange={(e) => onAccountChange(e.target.value)}
          autoComplete="username"
          placeholder="请输入登录账号"
          required
          className="h-11 rounded-lg border-slate-200 bg-slate-50/80 px-3.5 text-[15px] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus-visible:border-[#1a4f8c] focus-visible:bg-white focus-visible:ring-[#1a4f8c]/25"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-[13px] font-medium text-slate-600">
          密码
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
          placeholder="请输入密码"
          required
          className="h-11 rounded-lg border-slate-200 bg-slate-50/80 px-3.5 text-[15px] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus-visible:border-[#1a4f8c] focus-visible:bg-white focus-visible:ring-[#1a4f8c]/25"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-red-200/80 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 duration-300"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full rounded-lg bg-[#1a4f8c] text-[15px] font-semibold tracking-wide text-white shadow-[0_8px_24px_-8px_rgba(26,79,140,0.55)] transition-[transform,box-shadow,background-color] hover:bg-[#163f70] hover:shadow-[0_12px_28px_-8px_rgba(26,79,140,0.6)] active:scale-[0.99] disabled:opacity-70"
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? "登录中…" : "登录"}
      </Button>
    </form>
  )
}

function DemoAccountDrawer({
  open,
  onOpenChange,
  loading,
  loggingAccount,
  onPick,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  loading: boolean
  loggingAccount: string | null
  onPick: (user: SystemUser) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 border-l border-slate-200/80 bg-white p-0 sm:max-w-[380px]"
      >
        <SheetHeader className="border-b border-slate-100 px-5 py-4 pr-14 text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-[family-name:var(--font-login-display)] text-xl font-semibold text-slate-900">
                演示账号
              </SheetTitle>
              <SheetDescription className="mt-1 text-[13px] leading-relaxed text-slate-500">
                选择账号将使用统一演示密码自动登录。停用账号不可进入。
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-slate-500"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-2">
            {DEMO_ACCOUNTS.map((u: DemoAccount) => {
              const disabled = u.status === "停用" || loading
              const isLogging = loggingAccount === u.account
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(u)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-left transition-[background-color,border-color,box-shadow,transform]",
                      u.status === "停用"
                        ? "cursor-not-allowed opacity-50"
                        : "hover:border-[#1a4f8c]/30 hover:bg-white hover:shadow-sm active:scale-[0.99]",
                      isLogging && "border-[#1a4f8c]/40 bg-white ring-2 ring-[#1a4f8c]/15",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-wide",
                        roleTone(u.roleId),
                      )}
                    >
                      {u.roleId}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{u.name}</span>
                        {u.status === "停用" && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-slate-500">
                            停用
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{u.roleName}</span>
                      <span className="mt-1 block font-mono text-[11px] text-slate-400">
                        {u.account}
                        <span className="mx-1 text-slate-300">·</span>
                        {u.org}
                      </span>
                    </span>
                    {isLogging ? (
                      <Loader2 className="mt-2 size-4 shrink-0 animate-spin text-[#1a4f8c]" />
                    ) : (
                      <ChevronRight className="mt-2 size-4 shrink-0 text-slate-300 transition-colors group-hover:text-[#1a4f8c]" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-slate-400">
          演示密码统一为 <span className="font-mono text-slate-600">{DEMO_PASSWORD}</span>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function LoginWorkbench() {
  const router = useRouter()
  const params = useSearchParams()
  const { settings } = usePublicSettings()
  const showDemo = settings?.showDemoAccounts !== false
  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [loggingAccount, setLoggingAccount] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loginWith = useCallback(
    async (acc: string, pwd: string) => {
      setError("")
      setLoading(true)
      setLoggingAccount(acc)
      setAccount(acc)
      setPassword(pwd)
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: acc, password: pwd }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? "登录失败")
          return
        }
        setDrawerOpen(false)
        const from = params.get("from")
        router.push(from && from.startsWith("/") ? from : "/")
        router.refresh()
      } catch {
        setError("网络错误，请重试")
      } finally {
        setLoading(false)
        setLoggingAccount(null)
      }
    },
    [params, router],
  )

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    void loginWith(account, password)
  }

  function onPickDemo(user: SystemUser) {
    if (user.status === "停用") return
    void loginWith(user.account, DEMO_PASSWORD)
  }

  return (
    <>
      <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100 fill-mode-both">
        <LoginForm
          account={account}
          password={password}
          onAccountChange={setAccount}
          onPasswordChange={setPassword}
          loading={loading}
          error={error}
          onSubmit={onSubmit}
        />
      </div>

      {/* 右下角展开/收起演示账号抽屉（可由管理员关闭） */}
      {showDemo && (
        <>
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? "收起演示账号" : "展开演示账号"}
            aria-expanded={drawerOpen}
            className={cn(
              "fixed right-5 bottom-5 z-[60] flex size-12 items-center justify-center rounded-full bg-[#0c2d52] text-white shadow-[0_12px_32px_-8px_rgba(12,45,82,0.55)] transition-[transform,background-color,box-shadow]",
              "hover:bg-[#13406e] hover:shadow-[0_16px_36px_-8px_rgba(12,45,82,0.65)] active:scale-95",
              drawerOpen && "bg-[#1a4f8c]",
            )}
          >
            {drawerOpen ? <X className="size-5" /> : <Users className="size-5" />}
          </button>

          <DemoAccountDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            loading={loading}
            loggingAccount={loggingAccount}
            onPick={onPickDemo}
          />
        </>
      )}
    </>
  )
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 10% 20%, rgba(56, 120, 180, 0.22), transparent 55%),
            radial-gradient(ellipse 70% 50% at 90% 80%, rgba(20, 60, 100, 0.18), transparent 50%),
            linear-gradient(145deg, #e8eef5 0%, #f4f6f9 42%, #dfe8f2 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(90deg, rgba(26,79,140,0.06) 1px, transparent 1px),
            linear-gradient(rgba(26,79,140,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-1/4 top-1/3 h-px w-[150%] rotate-[-8deg] bg-gradient-to-r from-transparent via-[#1a4f8c]/25 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-1/4 top-[38%] h-px w-[150%] rotate-[-8deg] bg-gradient-to-r from-transparent via-[#2a6aad]/15 to-transparent"
      />

      <div className="login-panel relative z-10 grid w-full max-w-[920px] overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-[0_32px_64px_-24px_rgba(15,40,80,0.35),0_0_0_1px_rgba(255,255,255,0.5)_inset] backdrop-blur-sm md:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0c2d52] p-10 text-white md:flex lg:p-12">
          <div
            aria-hidden
            className="absolute inset-0 opacity-90"
            style={{
              background: `
                radial-gradient(ellipse 90% 70% at 0% 100%, rgba(42,106,173,0.45), transparent 55%),
                radial-gradient(ellipse 60% 50% at 100% 0%, rgba(14, 90, 120, 0.35), transparent 50%),
                linear-gradient(165deg, #0c2d52 0%, #13406e 55%, #0a2544 100%)
              `,
            }}
          />
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-1/2 opacity-[0.12]"
            style={{
              backgroundImage: `repeating-linear-gradient(
                90deg,
                transparent 0,
                transparent 18px,
                rgba(255,255,255,0.5) 18px,
                rgba(255,255,255,0.5) 19px
              )`,
            }}
          />
          <div aria-hidden className="absolute -bottom-16 -right-10 size-56 rounded-full border border-white/10" />
          <div aria-hidden className="absolute -bottom-8 -right-24 size-72 rounded-full border border-white/10" />

          <div className="relative z-10 animate-in fade-in slide-in-from-left-2 duration-700">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20 backdrop-blur-sm">
                <Container className="size-5 text-white" strokeWidth={1.75} />
              </div>
              <div className="leading-tight">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
                  Multimodal · CEEC
                </p>
                <p className="text-sm font-semibold tracking-wide text-white/90">中欧班列平台公司</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-150 fill-mode-both">
            <h1 className="font-[family-name:var(--font-login-display)] text-[2.15rem] font-semibold leading-[1.2] tracking-tight text-balance lg:text-[2.35rem]">
              集装箱业务
              <br />
              管理系统
            </h1>
            <p className="max-w-sm text-[15px] leading-relaxed text-white/70">
              覆盖用箱申请、调运审批、多维库存与堆场作业，贯通供应与维修全链路。
            </p>
            <ul className="grid gap-2.5 pt-1 text-[13px] text-white/65">
              <li className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md bg-white/10">
                  <ArrowRightLeft className="size-3.5" />
                </span>
                五级调运审批 · 提还箱闭环
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md bg-white/10">
                  <Warehouse className="size-3.5" />
                </span>
                境内外堆场 · 代管库存对账
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md bg-white/10">
                  <MapPinned className="size-3.5" />
                </span>
                中欧走廊节点协同可视
              </li>
            </ul>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-xs text-white/50 animate-in fade-in duration-700 delay-300 fill-mode-both">
            <Lock className="size-3.5" />
            <span>会话加密</span>
            <span className="text-white/25">·</span>
            <ShieldCheck className="size-3.5" />
            <span>操作全程审计</span>
          </div>
        </aside>

        <section className="relative flex flex-col justify-center bg-white px-7 py-10 sm:px-10 lg:px-12">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#0c2d52] text-white">
              <Container className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-[family-name:var(--font-login-display)] text-lg font-semibold text-[#0c2d52]">
                集装箱业务管理系统
              </p>
              <p className="text-xs text-slate-500">中欧班列平台公司</p>
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-right-2 duration-700">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a4f8c]/70">
              Sign in
            </p>
            <h2 className="font-[family-name:var(--font-login-display)] text-3xl font-semibold tracking-tight text-slate-900">
              登录
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">请输入账号与密码进入系统</p>
          </div>

          <Suspense
            fallback={
              <div className="mt-8 flex h-40 items-center justify-center text-sm text-slate-400">加载中…</div>
            }
          >
            <LoginWorkbench />
          </Suspense>

          <p className="mt-10 text-center text-[11px] leading-relaxed text-slate-400 md:text-left">
            受权人员专用系统 · 登录即表示遵守公司信息安全规范
          </p>
        </section>
      </div>
    </main>
  )
}
