/**
 * 将页面中的 .print-area 克隆到独立窗口再打印，
 * 避免 Dialog / 侧栏布局导致空白首页与上方大块留白。
 */
export function printPrintArea(opts?: {
  title?: string
  /** 限定查找范围（如某个 Dialog 容器） */
  root?: ParentNode | null
}): boolean {
  if (typeof window === "undefined") return false

  const scope = opts?.root ?? document
  const area = scope.querySelector(".print-area") as HTMLElement | null
  if (!area) {
    console.warn("[print] 未找到 .print-area")
    return false
  }

  const win = window.open("", "_blank", "noopener,noreferrer,width=920,height=800")
  if (!win) {
    // 弹窗被拦时退回整页打印
    window.print()
    return false
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n")

  const clone = area.cloneNode(true) as HTMLElement
  clone.classList.add("print-area", "doc-print-sheet")
  clone.style.cssText = [
    "position:static",
    "inset:auto",
    "left:auto",
    "top:auto",
    "margin:0",
    "padding:0",
    "width:100%",
    "max-width:186mm",
    "height:auto",
    "min-height:0",
    "overflow:visible",
    "background:#fff",
    "color:#111",
    "box-shadow:none",
    "transform:none",
  ].join(";")

  const title = (opts?.title || "打印").replace(/[<>&"]/g, "")

  win.document.open()
  win.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${title}</title>
${styles}
<style>
  @page { size: A4; margin: 12mm; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    height: auto !important;
    min-height: 0 !important;
  }
  body { color: #111; }
  .no-print { display: none !important; }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; }
    .print-area {
      position: static !important;
      margin: 0 !important;
      max-width: none !important;
      box-shadow: none !important;
    }
  }
</style>
</head>
<body>${clone.outerHTML}</body>
</html>`)
  win.document.close()

  const runPrint = () => {
    try {
      win.focus()
      win.print()
    } catch {
      /* ignore */
    }
  }

  win.onafterprint = () => {
    try {
      win.close()
    } catch {
      /* ignore */
    }
  }

  const imgs = Array.from(win.document.images)
  const kick = () => setTimeout(runPrint, 80)

  if (imgs.length === 0) {
    kick()
  } else {
    let pending = imgs.length
    const tick = () => {
      pending -= 1
      if (pending <= 0) kick()
    }
    for (const img of imgs) {
      if (img.complete) tick()
      else {
        img.addEventListener("load", tick, { once: true })
        img.addEventListener("error", tick, { once: true })
      }
    }
  }

  // 用户取消打印对话框时，部分浏览器不触发 afterprint
  setTimeout(() => {
    try {
      if (!win.closed) win.close()
    } catch {
      /* ignore */
    }
  }, 120_000)

  return true
}
