/** 将图片压缩为宽度不超过 maxWidth 的 JPEG/PNG data URL */
export async function resizeImageToDataUrl(
  file: File,
  maxWidth = 1024,
): Promise<{ dataUrl: string; fileName: string; mime: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请上传图片文件")
  }
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
    throw new Error("无法处理图片")
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const preferJpeg = !file.type.includes("png") && !file.type.includes("svg")
  const mime = preferJpeg ? "image/jpeg" : "image/png"
  const dataUrl = preferJpeg ? canvas.toDataURL("image/jpeg", 0.82) : canvas.toDataURL("image/png")
  const base = file.name.replace(/\.[^.]+$/, "") || "screenshot"
  const fileName = `${base}_${width}x${height}.${preferJpeg ? "jpg" : "png"}`
  return { dataUrl, fileName, mime, width, height }
}
