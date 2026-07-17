import "server-only"
import { mkdir, writeFile, unlink } from "fs/promises"
import path from "path"
import { randomBytes } from "crypto"

const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads", "attachments")

export function getAttachmentUploadRoot() {
  return UPLOAD_ROOT
}

export async function saveAttachmentFile(opts: {
  orderNo: string
  kind: string
  fileName: string
  bytes: Buffer
}): Promise<{ storagePath: string; size: number }> {
  await mkdir(UPLOAD_ROOT, { recursive: true })
  const safeName = opts.fileName.replace(/[^\w.\u4e00-\u9fff-]+/g, "_").slice(0, 120) || "file"
  const token = randomBytes(6).toString("hex")
  const storedName = `${opts.orderNo}_${opts.kind}_${Date.now().toString(36)}_${token}_${safeName}`
  const abs = path.join(UPLOAD_ROOT, storedName)
  await writeFile(abs, opts.bytes)
  // 相对仓库根，便于下载路由解析
  const storagePath = path.join("data", "uploads", "attachments", storedName).replace(/\\/g, "/")
  return { storagePath, size: opts.bytes.length }
}

export async function removeAttachmentFile(storagePath: string | null | undefined) {
  if (!storagePath) return
  const abs = path.isAbsolute(storagePath)
    ? storagePath
    : path.join(process.cwd(), storagePath)
  if (!abs.startsWith(UPLOAD_ROOT)) return
  try {
    await unlink(abs)
  } catch {
    // ignore
  }
}

export function resolveAttachmentAbsPath(storagePath: string): string | null {
  if (!storagePath) return null
  const abs = path.isAbsolute(storagePath)
    ? storagePath
    : path.join(process.cwd(), storagePath)
  const normalized = path.normalize(abs)
  if (!normalized.startsWith(path.normalize(UPLOAD_ROOT))) return null
  return normalized
}
