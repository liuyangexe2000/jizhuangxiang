"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { RoleId, SystemUser } from "./types"
import { roles } from "./mock-data"

interface SessionUser {
  uid: string
  account: string
  name: string
  roleId: RoleId
  org?: string | null
}

interface RoleContextValue {
  /** 当前生效的角色（代理中为被代理用户的角色） */
  roleId: RoleId
  role: (typeof roles)[number]
  /** 当前登录/被代理用户 */
  user: SessionUser | null
  /** 真实登录角色（不受代理影响） */
  realRoleId: RoleId
  isAdmin: boolean
  /** 代理登录中的真实管理员身份，null 表示未代理 */
  real: SessionUser | null
  /** 兼容旧接口：代理中的用户信息（简化为 SystemUser 形态） */
  impersonating: { name: string; account: string; roleId: RoleId } | null
  startImpersonation: (user: SystemUser) => Promise<void>
  stopImpersonation: () => Promise<void>
  logout: () => Promise<void>
  loading: boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [real, setReal] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" })
      const data = await res.json()
      setUser(data.user ?? null)
      setReal(data.real ?? null)
    } catch {
      setUser(null)
      setReal(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const roleId = (user?.roleId ?? "R03") as RoleId
  const realRoleId = (real?.roleId ?? user?.roleId ?? "R03") as RoleId
  const role = roles.find((r) => r.id === roleId) ?? roles[0]
  const isAdmin = realRoleId === "R00"
  const impersonating = real ? { name: user!.name, account: user!.account, roleId } : null

  const startImpersonation = useCallback(
    async (target: SystemUser) => {
      if (!isAdmin || target.roleId === "R00") return
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id }),
      })
      if (res.ok) {
        await refresh()
        router.push("/")
        router.refresh()
      }
    },
    [isAdmin, refresh, router],
  )

  const stopImpersonation = useCallback(async () => {
    const res = await fetch("/api/auth/impersonate", { method: "DELETE" })
    if (res.ok) {
      await refresh()
      router.refresh()
    }
  }, [refresh, router])

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
    setReal(null)
    router.push("/login")
    router.refresh()
  }, [router])

  return (
    <RoleContext.Provider
      value={{
        roleId,
        role,
        user,
        realRoleId,
        isAdmin,
        real,
        impersonating,
        startImpersonation,
        stopImpersonation,
        logout,
        loading,
      }}
    >
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error("useRole must be used within RoleProvider")
  return ctx
}
