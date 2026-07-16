"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { SortDir } from "@/lib/list-query"

export interface SortableTableHeadProps {
  label: string
  columnKey: string
  sortKey: string
  sortDir: SortDir
  onSort: (key: string) => void
  className?: string
}

export function SortableTableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: SortableTableHeadProps) {
  const active = sortKey === columnKey

  return (
    <TableHead className={cn(className)}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-0.5 py-0.5 font-medium hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" />
          ) : (
            <ArrowDown className="size-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}
