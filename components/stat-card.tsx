import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { softTone, type SoftTone } from "@/lib/ui-tone"

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  hint,
  tone = "primary",
}: {
  label: string
  value: string | number
  unit?: string
  icon: LucideIcon
  hint?: string
  tone?: SoftTone
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", softTone[tone])}>
          <Icon className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">
            {value}
            {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
          </p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
