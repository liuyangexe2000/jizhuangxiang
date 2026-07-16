/** 浏览器端 CSV 下载（UTF-8 BOM，便于 Excel 打开中文） */

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
