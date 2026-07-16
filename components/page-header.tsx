import type { ReactNode } from "react"

export function PageHeader({
  module,
  title,
  description,
  actions,
}: {
  module?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        {module && (
          <span className="text-xs font-semibold tracking-wide text-primary">{module}</span>
        )}
        <h1 className="text-pretty text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
