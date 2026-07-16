import "server-only"
import { cookies } from "next/headers"
import { verifySession, SESSION_COOKIE, type SessionPayload } from "./session"

/** 读取并校验当前请求的会话 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  return verifySession(store.get(SESSION_COOKIE)?.value)
}
