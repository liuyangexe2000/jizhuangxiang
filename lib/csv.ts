/** 浏览器端 CSV 下载 / 解析（UTF-8 BOM，便于 Excel 打开中文） */

function escapeCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(escapeCell).join(",")]
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","))
  }
  return lines.join("\r\n")
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const csv = toCsv(headers, rows)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** RFC4180 风格解析；自动去掉 UTF-8 BOM */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let i = 0
  let inQuotes = false

  while (i < src.length) {
    const ch = src[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ",") {
      row.push(cell)
      cell = ""
      i += 1
      continue
    }
    if (ch === "\r") {
      i += 1
      continue
    }
    if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      i += 1
      continue
    }
    cell += ch
    i += 1
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}
