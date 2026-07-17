import type { CityDictItem } from "./types"

/** 业务表单中应使用 CitySearchSelect 的字段名 */
export const CITY_FIELD_KEYS = new Set([
  "pickupCity",
  "returnCity",
  "demandCity",
  "city",
  "currentCity",
])

/** 应使用堆场主数据下拉的字段名 */
export const YARD_FIELD_KEYS = new Set([
  "yard",
  "pickupYard",
  "returnYard",
  "pickupPlace",
  "currentYard",
])

export function isCityField(key: string) {
  return CITY_FIELD_KEYS.has(key)
}

export function isYardField(key: string) {
  return YARD_FIELD_KEYS.has(key)
}

/** 堆场字段优先按同表单内对应城市字段过滤 */
export function cityKeyForYardField(yardKey: string): string | null {
  if (yardKey === "pickupYard" || yardKey === "pickupPlace") return "pickupCity"
  if (yardKey === "returnYard") return "returnCity"
  if (yardKey === "currentYard") return "currentCity"
  if (yardKey === "yard") return "city"
  return null
}

export function cityOptionsForField(
  key: string,
  options: {
    pickupCities: CityDictItem[]
    returnCities: CityDictItem[]
    cities: CityDictItem[]
  },
): CityDictItem[] {
  if (key === "pickupCity") return options.pickupCities
  if (key === "returnCity") return options.returnCities
  return options.cities.filter((c) => c.enabled)
}

export interface CityTreeProvince {
  province: string
  cities: CityDictItem[]
}

export interface CityTreeCountry {
  country: string
  region: CityDictItem["region"]
  provinces: CityTreeProvince[]
}

export function provinceKey(country: string, province: string) {
  return `${country}|${province}`
}

export function matchCityQuery(city: CityDictItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    city.name.toLowerCase().includes(q) ||
    city.code.toLowerCase().includes(q) ||
    city.country.toLowerCase().includes(q) ||
    city.province.toLowerCase().includes(q)
  )
}

const sortCities = (a: CityDictItem, b: CityDictItem) =>
  a.sort - b.sort || a.name.localeCompare(b.name, "zh-CN")

export function buildCityTree(cities: CityDictItem[]): CityTreeCountry[] {
  const countryMap = new Map<string, CityTreeCountry>()

  for (const city of cities) {
    let country = countryMap.get(city.country)
    if (!country) {
      country = { country: city.country, region: city.region, provinces: [] }
      countryMap.set(city.country, country)
    }
    const provName = city.province.trim() || city.country
    let prov = country.provinces.find((p) => p.province === provName)
    if (!prov) {
      prov = { province: provName, cities: [] }
      country.provinces.push(prov)
    }
    prov.cities.push(city)
  }

  for (const country of countryMap.values()) {
    for (const prov of country.provinces) {
      prov.cities.sort(sortCities)
    }
    country.provinces.sort((a, b) => a.province.localeCompare(b.province, "zh-CN"))
  }

  return [...countryMap.values()].sort((a, b) => {
    if (a.region !== b.region) return a.region === "境内" ? -1 : 1
    return a.country.localeCompare(b.country, "zh-CN")
  })
}

export function findCityPath(
  cities: CityDictItem[],
  cityName: string,
): { country: string; province: string } | null {
  const city = cities.find((c) => c.name === cityName)
  if (!city) return null
  return { country: city.country, province: city.province.trim() || city.country }
}

export function initialExpandedKeys(cities: CityDictItem[], selectedName: string): Set<string> {
  const path = findCityPath(cities, selectedName)
  const keys = new Set<string>()
  if (path) keys.add(provinceKey(path.country, path.province))
  return keys
}
