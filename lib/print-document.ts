/**
 * 将 .print-area 克隆到隐藏 iframe 后打印。
 * 使用自包含样式，不依赖外链 CSS（about:blank 下相对路径会失效导致整页空白）。
 */

const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-area, .doc-print-sheet {
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    padding: 0;
    background: #fff;
    color: #111;
  }
  header {
    border-bottom: 2px solid #111;
    padding-bottom: 12px;
    margin-bottom: 16px;
    text-align: center;
  }
  header p { margin: 4px 0; color: #444; font-size: 13px; }
  header h2 {
    margin: 8px 0 4px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #111;
  }
  .font-mono, [class*="font-mono"] {
    font-family: ui-monospace, Consolas, monospace;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px;
    table-layout: auto;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
    color: #111;
    background: #fff;
  }
  th {
    background: #f4f4f5;
    font-weight: 600;
    width: 7rem;
    white-space: nowrap;
  }
  p { margin: 8px 0; color: #333; }
  .text-xs, [class*="text-xs"] { font-size: 12px; }
  .text-sm, [class*="text-sm"] { font-size: 13px; }
  .font-semibold, .font-bold, [class*="font-bold"], [class*="font-semibold"] {
    font-weight: 700;
  }
  .text-right, [class*="text-right"] { text-align: right; }
  .text-center, [class*="text-center"] { text-align: center; }
  .text-zinc-600, .text-zinc-500, .text-zinc-400,
  .text-muted-foreground, [class*="text-zinc"], [class*="text-muted"] {
    color: #52525b;
  }
  .border-b-2 { border-bottom: 2px solid #111; }
  .border-dashed { border-style: dashed; }
  .relative { position: relative; }
  .absolute { position: absolute; }
  img {
    max-width: 140px;
    max-height: 140px;
    object-fit: contain;
  }
  .no-print { display: none !important; }
  @media print {
    html, body { margin: 0; padding: 0; }
  }
`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function absolutizeUrls(root: HTMLElement, base: string) {
  root.querySelectorAll("img[src]").forEach((img) => {
    const el = img as HTMLImageElement
    const src = el.getAttribute("src")
    if (!src || src.startsWith("data:") || src.startsWith("blob:") || /^https?:/i.test(src)) return
    try {
      el.setAttribute("src", new URL(src, base).href)
    } catch {
      /* ignore */
    }
  })
}

function buildDocumentHtml(area: HTMLElement, title: string): string {
  const clone = area.cloneNode(true) as HTMLElement
  clone.classList.add("print-area", "doc-print-sheet")
  absolutizeUrls(clone, window.location.href)

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`
}

function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images)
  if (imgs.length === 0) return Promise.resolve()
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.addEventListener("load", () => resolve(), { once: true })
          img.addEventListener("error", () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
}

/**
 * @returns 是否成功发起打印
 */
export function printPrintArea(opts?: {
  title?: string
  root?: ParentNode | null
}): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false

  const scope = opts?.root ?? document
  const area = scope.querySelector(".print-area") as HTMLElement | null
  if (!area) {
    console.warn("[print] 未找到 .print-area")
    return false
  }

  const title = opts?.title || "打印"
  const html = buildDocumentHtml(area, title)

  const iframe = document.createElement("iframe")
  iframe.setAttribute("title", "print-frame")
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;"
  document.body.appendChild(iframe)

  const frameWin = iframe.contentWindow
  const frameDoc = iframe.contentDocument
  if (!frameWin || !frameDoc) {
    iframe.remove()
    console.warn("[print] 无法创建打印帧")
    return false
  }

  frameDoc.open()
  frameDoc.write(html)
  frameDoc.close()

  const cleanup = () => {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }

  const run = async () => {
    await waitForImages(frameDoc)
    // 等布局稳定
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    try {
      frameWin.focus()
      frameWin.print()
    } catch (e) {
      console.warn("[print] print() 失败", e)
    } finally {
      // 给系统打印对话框一点时间；取消时也能回收 iframe
      setTimeout(cleanup, 1500)
    }
  }

  void run()
  return true
}

export type PrintDownloadFormat = "html" | "pdf"

function safeDownloadBaseName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function resolvePrintArea(root?: ParentNode | null): HTMLElement | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null
  const scope = root ?? document
  return scope.querySelector(".print-area") as HTMLElement | null
}

/**
 * 下载与打印相同内容的电子版 HTML。
 */
export function downloadPrintArea(opts?: {
  title?: string
  filename?: string
  root?: ParentNode | null
}): boolean {
  const area = resolvePrintArea(opts?.root)
  if (!area) {
    console.warn("[download] 未找到 .print-area")
    return false
  }

  const title = opts?.title || "单据"
  const html = buildDocumentHtml(area, title)
  const base = safeDownloadBaseName(opts?.filename || title)
  const filename = /\.html$/i.test(base) ? base : `${base}.html`
  triggerBlobDownload(new Blob([html], { type: "text/html;charset=utf-8" }), filename)
  return true
}

/**
 * 下载与打印相同内容的 PDF（A4）。
 */
export async function downloadPrintAreaPdf(opts?: {
  title?: string
  filename?: string
  root?: ParentNode | null
}): Promise<boolean> {
  const area = resolvePrintArea(opts?.root)
  if (!area) {
    console.warn("[download-pdf] 未找到 .print-area")
    return false
  }

  const title = opts?.title || "单据"
  const html = buildDocumentHtml(area, title)
  const base = safeDownloadBaseName(opts?.filename || title).replace(/\.pdf$/i, "")
  const filename = `${base}.pdf`

  const iframe = document.createElement("iframe")
  iframe.setAttribute("title", "pdf-frame")
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;"
  document.body.appendChild(iframe)

  const frameWin = iframe.contentWindow
  const frameDoc = iframe.contentDocument
  if (!frameWin || !frameDoc) {
    iframe.remove()
    console.warn("[download-pdf] 无法创建渲染帧")
    return false
  }

  frameDoc.open()
  frameDoc.write(html)
  frameDoc.close()

  try {
    await waitForImages(frameDoc)
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    const target = (frameDoc.querySelector(".print-area") as HTMLElement | null) || frameDoc.body
    const html2canvas = (await import("html2canvas")).default
    const { jsPDF } = await import("jspdf")

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    })

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const contentWidth = pageWidth - margin * 2
    const contentHeight = pageHeight - margin * 2
    const imgHeight = (canvas.height * contentWidth) / canvas.width
    const imgData = canvas.toDataURL("image/jpeg", 0.92)

    if (imgHeight <= contentHeight) {
      pdf.addImage(imgData, "JPEG", margin, margin, contentWidth, imgHeight)
    } else {
      let heightLeft = imgHeight
      let offsetY = 0
      while (heightLeft > 0) {
        if (offsetY > 0) pdf.addPage()
        pdf.addImage(imgData, "JPEG", margin, margin - offsetY, contentWidth, imgHeight)
        offsetY += contentHeight
        heightLeft -= contentHeight
      }
    }

    pdf.save(filename)
    return true
  } catch (e) {
    console.warn("[download-pdf] 生成失败", e)
    return false
  } finally {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }
}

/** 按格式下载电子版（html / pdf） */
export async function downloadPrintAreaAs(
  format: PrintDownloadFormat,
  opts?: { title?: string; filename?: string; root?: ParentNode | null },
): Promise<boolean> {
  if (format === "pdf") return downloadPrintAreaPdf(opts)
  return downloadPrintArea(opts)
}
