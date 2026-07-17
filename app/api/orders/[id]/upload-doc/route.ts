import { type NextRequest, NextResponse } from "next/server"
import { get, list, update, create } from "@/lib/repo"
import { getSession } from "@/lib/auth-server"
import { canWriteRow } from "@/lib/tenant"
import { writeAudit } from "@/lib/audit"
import { nowLocalStr } from "@/lib/domain/dispatch-ops"
import { ensureAttachmentsStoragePathColumn } from "@/lib/ensure-attachments-schema"
import { saveAttachmentFile } from "@/lib/attachment-storage"
import { DOC_UPLOAD_MAX_BYTES } from "@/lib/doc-upload"
import type { UseBoxOrder } from "@/lib/types"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "-"
}

type Ctx = { params: Promise<{ id: string }> }

type DocKind = "stuffing_list" | "return_proof"

const ALLOWED_ROLES = ["R00", "R01", "R03", "R04", "R06"] as const

/**
 * 客户/箱管上传随箱资料或还箱证明（multipart）：落盘 + 写 attachments + 标记订单标志位。
 * 不推进订单执行状态（放箱/收箱仍由现场 confirm-* 驱动）。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.roleId as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "无权上传随箱/还箱资料" }, { status: 403 })
  }

  const order = (await get("orders", decodeURIComponent(id))) as UseBoxOrder | null
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 })

  const yards = await list("yards")
  if (!canWriteRow("orders", order as unknown as Record<string, unknown>, session, { yards })) {
    return NextResponse.json({ error: "无权操作该订单" }, { status: 403 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "请以 multipart 上传文件" }, { status: 400 })
  }

  const kindRaw = String(form.get("kind") || form.get("refType") || "stuffing_list")
  const kind: DocKind = kindRaw === "return_proof" ? "return_proof" : "stuffing_list"
  const note = String(form.get("note") || "").trim()
  const file = form.get("file")

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "请选择要上传的文件" }, { status: 400 })
  }
  if (file.size > DOC_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "文件不能超过 8MB" }, { status: 400 })
  }

  const fileName = (file.name || "").trim() || `${kind}_${order.orderNo}`
  const mime = file.type || "application/octet-stream"
  const bytes = Buffer.from(await file.arrayBuffer())
  const actedBy = session.name || session.account
  const actedAt = nowLocalStr()

  await ensureAttachmentsStoragePathColumn()
  const saved = await saveAttachmentFile({
    orderNo: order.orderNo,
    kind,
    fileName,
    bytes,
  })

  const attachment = await create("attachments", {
    refType: kind,
    refNo: order.orderNo,
    fileName,
    mime,
    size: saved.size,
    uploadedBy: actedBy,
    uploadedAt: actedAt,
    storagePath: saved.storagePath,
  })

  const orderPatch: Record<string, unknown> =
    kind === "stuffing_list"
      ? {
          stuffingListUploaded: true,
          conditionCheck: "通过",
          ...(note ? { conditionNote: note } : {}),
        }
      : { returnProofUploaded: true }

  await update("orders", order.id, orderPatch)

  await writeAudit({
    session,
    action: "新增",
    module: "M01 提还箱作业",
    target: order.orderNo,
    detail:
      kind === "stuffing_list"
        ? `上传随箱资料 ${fileName}`
        : `上传还箱证明 ${fileName}`,
    ip: clientIp(req),
  })

  return NextResponse.json(
    {
      ok: true,
      kind,
      attachmentId: attachment.id,
      fileName,
      size: saved.size,
      stuffingListUploaded: kind === "stuffing_list" ? true : order.stuffingListUploaded,
      returnProofUploaded: kind === "return_proof" ? true : order.returnProofUploaded,
    },
    { status: 201 },
  )
}
