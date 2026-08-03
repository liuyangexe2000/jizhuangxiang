/**
 * 账单/结算币种与汇率（对人民币）。
 * 老系统堆场 currencyId：1=EUR，2=USD，3=CNY。
 */

export type BillCurrency = "CNY" | "USD" | "EUR"

export const BILL_CURRENCIES: BillCurrency[] = ["CNY", "USD", "EUR"]

/** 默认中间价（演示用，可被账单落库汇率覆盖） */
export const DEFAULT_FX_TO_CNY: Record<BillCurrency, number> = {
  CNY: 1,
  USD: 7.2,
  EUR: 7.85,
}

const CURRENCY_BY_ID: Record<number, BillCurrency> = {
  1: "EUR",
  2: "USD",
  3: "CNY",
}

export function currencyFromId(id?: number | null): BillCurrency {
  if (id == null) return "CNY"
  return CURRENCY_BY_ID[id] ?? "CNY"
}

export function currencySymbol(currency: BillCurrency | string | undefined): string {
  if (currency === "USD") return "$"
  if (currency === "EUR") return "€"
  return "¥"
}

export function normalizeBillCurrency(input?: string | null): BillCurrency {
  const u = (input || "CNY").toUpperCase()
  if (u === "USD" || u === "EUR" || u === "CNY") return u
  return "CNY"
}

export function roundMoney(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round((Number(n) || 0) * f) / f
}

export function resolveExchangeRate(currency: BillCurrency, rate?: number | null): number {
  if (currency === "CNY") return 1
  if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) return roundMoney(rate, 4)
  return DEFAULT_FX_TO_CNY[currency]
}

export function toCnyAmount(amount: number, currency: BillCurrency, exchangeRate?: number | null): number {
  const rate = resolveExchangeRate(currency, exchangeRate)
  return roundMoney((Number(amount) || 0) * rate)
}

export function formatMoney(amount: number, currency: BillCurrency | string = "CNY"): string {
  const cur = normalizeBillCurrency(currency)
  const symbol = currencySymbol(cur)
  const body = (Number(amount) || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${symbol}${body}`
}

export function formatExchangeRate(rate: number, currency: BillCurrency | string = "CNY"): string {
  const cur = normalizeBillCurrency(currency)
  if (cur === "CNY") return "1.0000（本币）"
  return `1 ${cur} = ${roundMoney(rate, 4).toFixed(4)} CNY`
}

/** 为中国境内城市默认 CNY，其余默认 EUR（中欧班列场景） */
export function inferBillCurrency(opts?: {
  city?: string
  region?: string
  currencyId?: number | null
}): BillCurrency {
  if (opts?.currencyId != null) return currencyFromId(opts.currencyId)
  const region = (opts?.region || "").trim()
  if (region === "境内") return "CNY"
  if (region === "境外") return "EUR"
  const city = (opts?.city || "").trim()
  if (!city) return "CNY"
  const domestic =
    /北京|上海|天津|重庆|西安|郑州|成都|重庆|武汉|青岛|宁波|广州|深圳|苏州|南京|合肥|兰州|乌鲁木齐|霍尔果斯|阿拉山口|满洲里/.test(
      city,
    )
  return domestic ? "CNY" : "EUR"
}

export function attachBillFx(opts: {
  amount: number
  currency?: BillCurrency | string | null
  exchangeRate?: number | null
}): {
  amount: number
  currency: BillCurrency
  exchangeRate: number
  amountCny: number
} {
  const currency = normalizeBillCurrency(opts.currency)
  const amount = roundMoney(opts.amount)
  const exchangeRate = resolveExchangeRate(currency, opts.exchangeRate)
  return {
    amount,
    currency,
    exchangeRate,
    amountCny: toCnyAmount(amount, currency, exchangeRate),
  }
}

/** 明细行：币种 / 汇率 / 折合人民币 */
export function billFxItems(fx: {
  currency: BillCurrency
  exchangeRate: number
  amountCny: number
}): { label: string; value: string }[] {
  return [
    { label: "币种", value: fx.currency },
    { label: "汇率（对人民币）", value: formatExchangeRate(fx.exchangeRate, fx.currency) },
    { label: "折合人民币", value: formatMoney(fx.amountCny, "CNY") },
  ]
}
