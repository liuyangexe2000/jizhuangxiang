"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, ChevronDown, ChevronDownIcon, ChevronRight, SearchIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  buildCityTree,
  initialExpandedKeys,
  matchCityQuery,
  provinceKey,
} from "@/lib/city-tree"
import type { CityDictItem } from "@/lib/types"

export interface CitySearchSelectProps {
  id?: string
  value: string
  onValueChange: (value: string) => void
  cities: CityDictItem[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CitySearchSelect({
  id,
  value,
  onValueChange,
  cities,
  placeholder = "选择城市",
  className,
  disabled,
}: CitySearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const tree = useMemo(() => buildCityTree(cities), [cities])

  const searching = query.trim().length > 0

  const filteredCities = useMemo(
    () => (searching ? cities.filter((c) => matchCityQuery(c, query)) : []),
    [cities, query, searching],
  )

  useEffect(() => {
    if (!open) {
      setQuery("")
      return
    }
    setExpanded(initialExpandedKeys(cities, value))
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open, cities, value])

  function toggleProvince(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleSelect(name: string) {
    onValueChange(name)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <span className="line-clamp-1 flex-1 text-left">{value || placeholder}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        className="w-(--anchor-width) overflow-hidden p-0"
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center border-b px-2.5 py-2">
          <SearchIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索省/州、城市名称或编码"
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation()
                setOpen(false)
              }
            }}
          />
        </div>
        <div className="max-h-72 overflow-y-auto overscroll-contain p-1">
          {searching ? (
              filteredCities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">未找到匹配城市</p>
              ) : (
                filteredCities.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    className={cn(
                      "relative flex w-full cursor-default flex-col items-start gap-0.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground",
                      value === city.name && "bg-accent/50",
                    )}
                    onClick={() => handleSelect(city.name)}
                  >
                    <span>{city.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {city.country} / {city.province}
                    </span>
                    {value === city.name && (
                      <CheckIcon className="absolute right-2 top-2 size-4" />
                    )}
                  </button>
                ))
              )
            ) : (
              tree.map((country) => (
                <div key={country.country} className="mb-1 last:mb-0">
                  <div className="px-2 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {country.country}
                    {country.region === "境外" && (
                      <span className="ml-1.5 font-normal normal-case">({country.region})</span>
                    )}
                  </div>
                  {country.provinces.map((prov) => {
                    const key = provinceKey(country.country, prov.province)
                    const isOpen = expanded.has(key)

                    return (
                      <div key={key}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-1 rounded-md py-1.5 pr-2 pl-1 text-sm font-medium hover:bg-accent/60"
                          onClick={() => toggleProvince(key)}
                        >
                          {isOpen ? (
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex-1 text-left">{prov.province}</span>
                          <span className="text-xs text-muted-foreground">{prov.cities.length}</span>
                        </button>
                        {isOpen &&
                          prov.cities.map((city) => (
                            <CityLeaf
                              key={city.id}
                              city={city}
                              indent={6}
                              selected={value === city.name}
                              onSelect={handleSelect}
                            />
                          ))}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CityLeaf({
  city,
  indent,
  selected,
  onSelect,
}: {
  city: CityDictItem
  indent: number
  selected: boolean
  onSelect: (name: string) => void
}) {
  return (
    <button
      type="button"
      style={{ paddingLeft: `${indent * 4}px` }}
      className={cn(
        "relative flex w-full cursor-default items-center rounded-md py-1.5 pr-8 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground",
        selected && "bg-accent/50",
      )}
      onClick={() => onSelect(city.name)}
    >
      <span className="flex-1 text-left">{city.name}</span>
      {selected && <CheckIcon className="absolute right-2 size-4" />}
    </button>
  )
}
