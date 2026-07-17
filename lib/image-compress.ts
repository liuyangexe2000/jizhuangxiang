/** 浏览器端将图片压缩到指定最大宽度（等比缩放），输出 JPEG Blob */

export async function compressImageToMaxWidth(
  file: File,
  maxWidth = 1440,
  quality = 0.85,
): Promise<{ blob: Blob; previewUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bitmap.close()
    throw new Error("无法创建画布以压缩图片")
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片压缩失败"))),
      "image/jpeg",
      quality,
    )
  })
  const previewUrl = URL.createObjectURL(blob)
  return { blob, previewUrl, width, height }
}

export function revokePreviewUrls(urls: string[]) {
  for (const u of urls) {
    try {
      URL.revokeObjectURL(u)
    } catch {
      /* ignore */
    }
  }
}
