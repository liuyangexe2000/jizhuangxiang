"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { CityDictItem } from "./types"
import { useResource } from "./api"

export type CityInput = Omit<CityDictItem, "id">

interface DictionaryContextValue {
  cities: CityDictItem[]
  pickupCities: CityDictItem[]
  returnCities: CityDictItem[]
  isLoading: boolean
  addCity: (input: CityInput) => Promise<void>
  updateCity: (id: string, input: Partial<CityInput>) => Promise<void>
  removeCity: (id: string) => Promise<void>
  toggleEnabled: (id: string) => Promise<void>
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null)

const sortCities = (list: CityDictItem[]) =>
  [...list].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code))

export function DictionaryProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, create, update, remove } = useResource<CityDictItem>("cities")
  const cities = useMemo(() => sortCities(data), [data])

  const value: DictionaryContextValue = {
    cities,
    pickupCities: cities.filter((c) => c.enabled && c.usableAsPickup),
    returnCities: cities.filter((c) => c.enabled && c.usableAsReturn),
    isLoading,
    addCity: async (input) => {
      await create({
        ...input,
        __auditAction: "新增",
        __auditDetail: `新增城市字典 ${input.name}`,
      })
    },
    updateCity: async (id, input) => {
      await update(id, {
        ...input,
        __auditAction: "修改",
        __auditDetail: `更新城市字典 ${id}`,
      })
    },
    removeCity: async (id) => {
      await remove(id, { __auditDetail: `删除城市字典 ${id}` })
    },
    toggleEnabled: async (id) => {
      const city = cities.find((c) => c.id === id)
      if (!city) return
      await update(id, {
        enabled: !city.enabled,
        __auditAction: "修改",
        __auditDetail: `${city.enabled ? "停用" : "启用"}城市字典 ${city.name}`,
      })
    },
  }

  return <DictionaryContext.Provider value={value}>{children}</DictionaryContext.Provider>
}

export function useDictionary() {
  const ctx = useContext(DictionaryContext)
  if (!ctx) throw new Error("useDictionary must be used within DictionaryProvider")
  return ctx
}
