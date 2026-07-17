import { NextResponse } from "next/server"
import { list } from "@/lib/repo"
import { getPublicSettings } from "@/lib/settings"
import { roles } from "@/lib/roles"
import type { SystemUser } from "@/lib/types"

export const dynamic = "force-dynamic"

/** 登录页演示账号：仅当系统开启演示入口时返回库内启用用户（不含密码） */
export async function GET() {
  const pub = await getPublicSettings()
  if (!pub.showDemoAccounts) {
    return NextResponse.json([])
  }
  const users = (await list("users")) as SystemUser[]
  const rows = users.map((u) => {
    const role = roles.find((r) => r.id === u.roleId)
    return {
      id: u.id,
      account: u.account,
      name: u.name,
      roleId: u.roleId,
      org: u.org,
      status: u.status,
      roleName: role?.name ?? u.roleId,
      roleType: role?.type ?? "",
    }
  })
  return NextResponse.json(rows)
}
