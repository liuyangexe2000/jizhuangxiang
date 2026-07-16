/** 将图片按宽高等比例缩放：宽度超过 maxWidth 才压缩，否则保留原图。 */
export async function resizeImageToDataUrl(
  file: File,
  maxWidth = 1440,
): Promise<{ dataUrl: string; fileName: string; mime: string; width: number; height: number; resized: boolean }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请上传图片文件")
  }
  const bitmap = await createImageBitmap(file)
  const srcW = bitmap.width
  const srcH = bitmap.height

  // 原本就不超过上限：不缩放、不重编码
  if (srcW <= maxWidth) {
    bitmap.close()
    const dataUrl = await readFileAsDataUrl(file)
    return {
      dataUrl,
      fileName: file.name || `screenshot_${srcW}x${srcH}.png`,
      mime: file.type || "image/png",
      width: srcW,
      height: srcH,
      resized: false,
    }
  }

  const scale = maxWidth / srcW
  const width = Math.max(1, Math.round(srcW * scale))
  const height = Math.max(1, Math.round(srcH * scale))
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
  const dataUrl = preferJpeg ? canvas.toDataURL("image/jpeg", 0.88) : canvas.toDataURL("image/png")
  const base = file.name.replace(/\.[^.]+$/, "") || "screenshot"
  const fileName = `${base}_${width}x${height}.${preferJpeg ? "jpg" : "png"}`
  return { dataUrl, fileName, mime, width, height, resized: true }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("读取图片失败"))
    reader.readAsDataURL(file)
  })
}
