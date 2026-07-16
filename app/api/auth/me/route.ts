import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth-server"
import { currentBackend } from "@/lib/repo"

export async function GET() {
  const session = await getSession()
  const backend = await currentBackend()
  if (!session) {
    return NextResponse.json({ user: null, backend }, { status: 200 })
  }
  return NextResponse.json({
    user: {
      uid: session.uid,
      account: session.account,
      name: session.name,
      roleId: session.roleId,
      org: session.org ?? null,
    },
    real: session.real ?? null,
    backend,
  })
}
