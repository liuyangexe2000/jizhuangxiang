import { cn } from "@/lib/utils"
import { softTone, statusSoftTone, type SoftTone } from "@/lib/ui-tone"

const softDot: Record<SoftTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  muted: "bg-muted-foreground",
  info: "bg-primary",
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = statusSoftTone[status] ?? "muted"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        softTone[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", softDot[tone])} />
      {status}
    </span>
  )
}
