import { type NextRequest, NextResponse } from "next/server"
import { get, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canAccessResource } from "@/lib/acl"
import { writeAudit } from "@/lib/audit"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import { ensureAttachmentsStoragePathColumn } from "@/lib/ensure-attachments-schema"
import { saveAttachmentFile } from "@/lib/attachment-storage"
import { DOC_UPLOAD_MAX_BYTES } from "@/lib/doc-upload"
import type { RepairOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

const ALLOWED = ["R00", "R01", "R04", "R06"] as const
const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp|gif)$/i

/** 修箱工单损坏照片上传（multipart，可多次调用） */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!ALLOWED.includes(session.roleId as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: "无权上传修箱照片" }, { status: 403 })
  }
  if (!canAccessResource("repair", session.roleId, "write")) {
    return NextResponse.json({ error: "无权写入修箱工单" }, { status: 403 })
  }

  const order = (await get("repair", decodeURIComponent(id))) as RepairOrder | null
  if (!order) return NextResponse.json({ error: "工单不存在" }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "请以 multipart 上传文件" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "请选择要上传的图片" }, { status: 400 })
  }
  if (file.size > DOC_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "图片不能超过 8MB" }, { status: 400 })
  }
  const mime = file.type || "image/jpeg"
  if (!IMAGE_MIME.test(mime) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name || "")) {
    return NextResponse.json({ error: "仅支持 JPG/PNG/WEBP/GIF 图片" }, { status: 400 })
  }

  const fileName = (file.name || "").trim() || `repair_${order.repairNo}.jpg`
  const bytes = Buffer.from(await file.arrayBuffer())
  const actedBy = session.name || session.account
  const actedAt = nowLocalStr()

  await ensureAttachmentsStoragePathColumn()
  const saved = await saveAttachmentFile({
    orderNo: order.repairNo,
    kind: "repair_photo",
    fileName,
    bytes,
  })

  const attachment = await create("attachments", {
    refType: "repair_photo",
    refNo: order.repairNo,
    fileName,
    mime,
    size: saved.size,
    uploadedBy: actedBy,
    uploadedAt: actedAt,
    storagePath: saved.storagePath,
  })

  await writeAudit({
    session,
    action: "新增",
    module: "M06 维修管理",
    target: order.repairNo,
    detail: `上传修箱照片 ${fileName}`,
    ip: clientIp(req),
  })

  return NextResponse.json({ ok: true, attachment }, { status: 201 })
}
