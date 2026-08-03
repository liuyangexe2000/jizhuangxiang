"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, ChevronDownIcon, Plus, SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { findProxyCompanyByName, normalizeProxyCompanyName } from "@/lib/proxy-company"
import type { ProxyCompany } from "@/lib/types"

export interface ProxyCompanySearchSelectProps {
  id?: string
  value: string
  onValueChange: (id: string) => void
  companies: ProxyCompany[]
  /** 重名校验范围（含停用）；默认用 companies */
  allCompanies?: ProxyCompany[]
  /** 录入不存在的名称时创建；返回新建公司（含 id） */
  onCreate?: (name: string) => Promise<ProxyCompany>
  placeholder?: string
  className?: string
  disabled?: boolean
  allowNone?: boolean
  noneLabel?: string
}

export function ProxyCompanySearchSelect({
  id,
  value,
  onValueChange,
  companies,
  allCompanies,
  onCreate,
  placeholder = "选择代管公司",
  className,
  disabled,
  allowNone = true,
  noneLabel = "不指定",
}: ProxyCompanySearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => companies.find((c) => c.id === value) ?? null,
    [companies, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.contactUser.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    )
  }, [companies, query])

  const namePool = allCompanies ?? companies

  const exactMatch = useMemo(() => {
    if (!query.trim()) return null
    return findProxyCompanyByName(namePool, query) ?? null
  }, [namePool, query])

  const canCreate = Boolean(onCreate && normalizeProxyCompanyName(query) && !exactMatch)

  useEffect(() => {
    if (!open) {
      setQuery("")
      return
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  function handleSelect(nextId: string) {
    onValueChange(nextId)
    setOpen(false)
  }

  async function handleCreate() {
    if (!onCreate || creating) return
    const name = query.trim().replace(/\s+/g, " ")
    if (!name) return
    const dup = findProxyCompanyByName(namePool, name)
    if (dup) {
      toast.error(`代管公司「${dup.name}」已存在，请直接选择`)
      handleSelect(dup.id)
      return
    }
    if (!canCreate) return
    setCreating(true)
    try {
      const created = await onCreate(name)
      onValueChange(created.id)
      setOpen(false)
      toast.success(`已新增代管公司「${created.name}」`)
    } catch (e) {
      toast.error((e as Error).message || "新增代管公司失败")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        title={selected?.name || undefined}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          !selected && "text-muted-foreground",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.name || (value ? noneLabel : placeholder)}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        className="w-(--anchor-width) min-w-[22rem] max-w-[min(36rem,calc(100vw-2rem))] overflow-hidden p-0"
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center border-b px-2.5 py-2">
          <SearchIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault()
                void handleCreate()
              }
            }}
            placeholder="搜索公司名，或输入新名称后新增"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="thin-scrollbar max-h-64 overflow-y-auto p-1">
          {allowNone ? (
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                !value && "bg-accent",
              )}
              onClick={() => handleSelect("")}
            >
              <CheckIcon className={cn("size-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
              <span className="text-muted-foreground">{noneLabel}</span>
            </button>
          ) : null}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                c.id === value && "bg-accent",
              )}
              onClick={() => handleSelect(c.id)}
            >
              <CheckIcon
                className={cn("mt-0.5 size-4 shrink-0", c.id === value ? "opacity-100" : "opacity-0")}
              />
              <span className="min-w-0 flex-1 whitespace-normal break-all leading-snug">{c.name}</span>
            </button>
          ))}
          {filtered.length === 0 && !canCreate ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">无匹配公司</p>
          ) : null}
        </div>
        {exactMatch && normalizeProxyCompanyName(query) ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-auto w-full justify-start gap-2 whitespace-normal py-2 text-left"
              onClick={() => handleSelect(exactMatch.id)}
            >
              <CheckIcon className="size-4 shrink-0" />
              <span>
                「<span className="font-medium">{exactMatch.name}</span>」已存在，点击选择
                {exactMatch.enabled === false ? "（已停用）" : ""}
              </span>
            </Button>
          </div>
        ) : null}
        {canCreate ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto w-full justify-start gap-2 whitespace-normal py-2 text-left"
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              <Plus className="size-4 shrink-0" />
              <span>
                新增代管公司「<span className="font-medium">{query.trim()}</span>」
              </span>
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
