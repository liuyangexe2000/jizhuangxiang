import { NextResponse } from "next/server"
import { getPublicSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

/** 公开配置：登录页演示开关、侧栏策略、业务参数（无机密） */
export async function GET() {
  const data = await getPublicSettings()
  return NextResponse.json(data)
}
