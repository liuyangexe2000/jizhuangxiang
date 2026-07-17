import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { get } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { ensureAclRuntime } from "@/lib/acl-runtime"
import { resolveAttachmentAbsPath } from "@/lib/attachment-storage"
import type { AttachmentMeta } from "@/lib/types"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** 下载已上传的随箱/还箱附件 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  await ensureAclRuntime()
  if (!canAccessResource("attachments", session.roleId, "read")) {
    return NextResponse.json({ error: "无权下载附件" }, { status: 403 })
  }

  const row = (await get("attachments", decodeURIComponent(id))) as AttachmentMeta | null
  if (!row) return NextResponse.json({ error: "附件不存在" }, { status: 404 })
  if (!row.storagePath) {
    return NextResponse.json({ error: "该附件无实体文件（仅元数据）" }, { status: 404 })
  }

  const abs = resolveAttachmentAbsPath(row.storagePath)
  if (!abs) return NextResponse.json({ error: "文件路径无效" }, { status: 400 })

  try {
    const buf = await readFile(abs)
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": row.mime || "application/octet-stream",
        "Content-Disposition": `${row.mime?.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        "Content-Length": String(buf.length),
      },
    })
  } catch {
    return NextResponse.json({ error: "文件不存在或已丢失" }, { status: 404 })
  }
}
