"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  normalizeContainerNo,
  validateIso6346ContainerNo,
} from "@/lib/domain/container-no"
import type { ContainerMaster } from "@/lib/types"

export interface InYardContainerSelectProps {
  value: string
  onValueChange: (containerNo: string, matched?: ContainerMaster | null) => void
  containers: ContainerMaster[]
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function InYardContainerSelect({
  value,
  onValueChange,
  containers,
  disabled,
  placeholder = "搜索或输入在场箱号",
  className,
}: InYardContainerSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  const filtered = useMemo(() => {
    const q = normalizeContainerNo(query)
    if (!q) return containers.slice(0, 80)
    return containers.filter((c) => normalizeContainerNo(c.containerNo).includes(q)).slice(0, 80)
  }, [containers, query])

  const matched = useMemo(
    () => containers.find((c) => normalizeContainerNo(c.containerNo) === normalizeContainerNo(value)) ?? null,
    [containers, value],
  )

  const formatHint = useMemo(() => {
    const raw = normalizeContainerNo(query || value)
    if (!raw) return ""
    if (raw.length < 11) return `已输入 ${raw.length}/11 位，须符合 ISO 6346`
    const v = validateIso6346ContainerNo(raw)
    if (!v.ok) return v.error
    if (!matched) return "格式正确，但不是当前堆场在场箱"
    return `已匹配在场箱 · ${matched.type} · ${matched.ownership}`
  }, [query, value, matched])

  function commitTyped(raw: string) {
    const no = normalizeContainerNo(raw)
    const hit = containers.find((c) => normalizeContainerNo(c.containerNo) === no) ?? null
    onValueChange(no, hit)
    setQuery(no)
    setOpen(false)
  }

  function handleSelect(c: ContainerMaster) {
    onValueChange(c.containerNo, c)
    setQuery(c.containerNo)
    setOpen(false)
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          disabled={disabled}
          title={matched?.containerNo || value || undefined}
          className={cn(
            "flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate font-mono text-xs">{value || placeholder}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--anchor-width)] min-w-[18rem] p-2">
          <div className="relative mb-2">
            <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              className="h-8 pl-7 font-mono text-xs uppercase"
              value={query}
              disabled={disabled}
              placeholder="输入箱号筛选…"
              onChange={(e) => {
                const next = normalizeContainerNo(e.target.value)
                setQuery(next)
                onValueChange(
                  next,
                  containers.find((c) => normalizeContainerNo(c.containerNo) === next) ?? null,
                )
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitTyped(query)
                }
              }}
            />
          </div>
          <div className="thin-scrollbar max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {containers.length === 0 ? "该堆场暂无在场箱" : "无匹配在场箱号"}
              </p>
            ) : (
              filtered.map((c) => {
                const selected = normalizeContainerNo(c.containerNo) === normalizeContainerNo(value)
                return (
                  <button
                    key={c.containerNo}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                      selected && "bg-accent",
                    )}
                    onClick={() => handleSelect(c)}
                  >
                    <CheckIcon className={cn("size-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs">{c.containerNo}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {c.type} · {c.ownership}
                        {c.currentCity ? ` · ${c.currentCity}` : ""}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {formatHint ? (
        <p
          className={cn(
            "text-[11px] leading-snug",
            matched && validateIso6346ContainerNo(value).ok
              ? "text-emerald-600"
              : "text-muted-foreground",
          )}
        >
          {formatHint}
        </p>
      ) : null}
    </div>
  )
}
