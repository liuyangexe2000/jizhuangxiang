"use client"

import type { DocTemplate, UseBoxOrder } from "@/lib/types"
import {
  builtInSealDataUrl,
  defaultPickupLayout,
  defaultReturnLayout,
  interpolateDocText,
  resolveDocField,
  type DocFieldKey,
  type DocTemplateLayout,
} from "@/lib/domain/doc-template-layout"
import { cn } from "@/lib/utils"

function asLayout(layout?: DocTemplate["layout"], fallback?: DocTemplateLayout): DocTemplateLayout {
  return (layout as DocTemplateLayout | undefined) ?? fallback ?? defaultPickupLayout()
}

function SealBadge({
  seal,
}: {
  seal: DocTemplateLayout["seal"]
}) {
  if (!seal.enabled) return null
  const src = seal.imageDataUrl?.trim() || builtInSealDataUrl(seal.label || "箱管部")
  return (
    <img
      src={src}
      alt={seal.label || "电子章"}
      className="pointer-events-none absolute select-none opacity-90 print:opacity-100"
      style={{
        width: seal.size,
        height: seal.size,
        right: seal.offsetX,
        bottom: seal.offsetY,
      }}
    />
  )
}

function OrderDocShell({
  order,
  template,
  layout,
  extras,
  className,
}: {
  order: UseBoxOrder
  template?: DocTemplate | null
  layout: DocTemplateLayout
  extras?: Partial<Record<DocFieldKey, string>>
  className?: string
}) {
  const meta = interpolateDocText(layout.metaLine, order)
  const notice = interpolateDocText(layout.notice, order)

  return (
    <div
      className={cn(
        "print-area doc-print-sheet relative mx-auto w-full max-w-[210mm] bg-white p-8 text-zinc-900 shadow-sm print:max-w-none print:shadow-none",
        className,
      )}
    >
      <header className="mb-6 border-b-2 border-zinc-900 pb-4 text-center">
        <p className="text-sm text-zinc-600">{layout.orgLine}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-[0.2em]">{layout.title}</h2>
        {layout.showTemplateName && template?.name ? (
          <p className="mt-0.5 text-[11px] text-zinc-500">模板：{template.name}</p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-600">{meta}</p>
      </header>

      <table className="w-full border-collapse text-sm">
        <tbody>
          {layout.rows.map((row, ri) => {
            const cells = row.cells.length > 0 ? row.cells : []
            if (cells.length === 1) {
              const cell = cells[0]
              return (
                <tr key={ri}>
                  <th className="w-28 border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-left font-medium">
                    {cell.label}
                  </th>
                  <td className="border border-zinc-300 px-3 py-2.5" colSpan={3}>
                    {resolveDocField(order, cell.key as DocFieldKey, extras)}
                  </td>
                </tr>
              )
            }
            const left = cells[0]
            const right = cells[1]
            return (
              <tr key={ri}>
                <th className="w-28 border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-left font-medium">
                  {left?.label}
                </th>
                <td className="min-w-[8rem] border border-zinc-300 px-3 py-2.5">
                  {left ? resolveDocField(order, left.key as DocFieldKey, extras) : ""}
                </td>
                <th className="w-28 border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-left font-medium">
                  {right?.label}
                </th>
                <td className="min-w-[8rem] border border-zinc-300 px-3 py-2.5">
                  {right ? resolveDocField(order, right.key as DocFieldKey, extras) : ""}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="mt-6 text-xs leading-relaxed text-zinc-600">{notice}</p>

      {layout.showSignature ? (
        <div className="relative mt-10 min-h-[7.5rem] border-t border-dashed border-zinc-300 pt-4">
          <div className="flex justify-between text-sm text-zinc-700">
            <span>{layout.signatureLabel}</span>
            <span className="text-zinc-500">日期：____________</span>
          </div>
          <p className="mt-8 text-xs text-zinc-400">签字：____________________</p>
          <SealBadge seal={layout.seal} />
        </div>
      ) : layout.seal.enabled ? (
        <div className="relative mt-10 min-h-[7rem]">
          <SealBadge seal={layout.seal} />
        </div>
      ) : null}
    </div>
  )
}

/** 客户用箱提箱单（打印）——不含用箱价格 */
export function OrderPickupDocument({
  order,
  template,
  templateName,
  extras,
}: {
  order: UseBoxOrder
  template?: DocTemplate | null
  /** @deprecated 请传 template */
  templateName?: string
  extras?: Partial<Record<DocFieldKey, string>>
}) {
  const layout = asLayout(template?.layout, defaultPickupLayout())
  const fakeTemplate =
    template ??
    (templateName
      ? ({ id: "", name: templateName, code: "", scene: "", fields: [], updatedAt: "", enabled: true, docKind: "pickup", builtIn: false } as DocTemplate)
      : null)
  return <OrderDocShell order={order} template={fakeTemplate} layout={layout} extras={extras} />
}

/** 客户用箱还箱单（打印） */
export function OrderReturnDocument({
  order,
  template,
  templateName,
  extras,
}: {
  order: UseBoxOrder
  template?: DocTemplate | null
  /** @deprecated 请传 template */
  templateName?: string
  extras?: Partial<Record<DocFieldKey, string>>
}) {
  const layout = asLayout(template?.layout, defaultReturnLayout())
  const fakeTemplate =
    template ??
    (templateName
      ? ({ id: "", name: templateName, code: "", scene: "", fields: [], updatedAt: "", enabled: true, docKind: "return", builtIn: false } as DocTemplate)
      : null)
  return <OrderDocShell order={order} template={fakeTemplate} layout={layout} extras={extras} />
}

/** 设计器实时预览 */
export function OrderDocumentPreview({
  order,
  template,
  layout,
}: {
  order: UseBoxOrder
  template?: DocTemplate | null
  layout: DocTemplateLayout
}) {
  return <OrderDocShell order={order} template={template} layout={layout} />
}
