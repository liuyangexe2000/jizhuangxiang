import { NextRequest, NextResponse } from "next/server"
import { verifySession, SESSION_COOKIE } from "@/lib/session"

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/demo-accounts",
  "/api/auth/me",
  "/api/external",
  "/api/settings/public",
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 放行静态资源与公共路径
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySession(token)

  // 未登录：页面重定向到 /login，API 返回 401
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("from", pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
