/**
 * 集装箱国际编号（ISO 6346）校验与规范化。
 * 格式：4 位字母（箱主代码 3 + 设备类别 U/J/Z）+ 6 位序号 + 1 位校验码。
 */

/** ISO 6346 字母取值（跳过 11 的倍数） */
const LETTER_VALUE: Record<string, number> = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38,
}

const ISO_BODY_RE = /^[A-Z]{4}\d{6}$/
const ISO_FULL_RE = /^[A-Z]{4}\d{7}$/
const CATEGORY_RE = /^[UJZ]$/

export function normalizeContainerNo(input: string): string {
  return input.replace(/[\s\-_.]/g, "").toUpperCase()
}

export function iso6346CheckDigit(body10: string): number | null {
  const body = normalizeContainerNo(body10)
  if (!ISO_BODY_RE.test(body)) return null
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const ch = body[i]!
    const value = i < 4 ? LETTER_VALUE[ch] : Number(ch)
    if (value == null || Number.isNaN(value)) return null
    sum += value * 2 ** i
  }
  const mod = sum % 11
  return mod === 10 ? 0 : mod
}

export type ContainerNoValidation =
  | { ok: true; containerNo: string }
  | { ok: false; error: string }

/** 校验完整 11 位 ISO 6346 箱号（含校验位） */
export function validateIso6346ContainerNo(input: string): ContainerNoValidation {
  const containerNo = normalizeContainerNo(input)
  if (!containerNo) {
    return { ok: false, error: "请填写箱号" }
  }
  if (!ISO_FULL_RE.test(containerNo)) {
    return {
      ok: false,
      error: "箱号须为 11 位国际标准格式（4 位字母 + 6 位序号 + 1 位校验码），如 MSCU1234560",
    }
  }
  if (!CATEGORY_RE.test(containerNo[3]!)) {
    return { ok: false, error: "第 4 位设备类别须为 U / J / Z（常用货运箱为 U）" }
  }
  const expected = iso6346CheckDigit(containerNo.slice(0, 10))
  if (expected == null) {
    return { ok: false, error: "箱号格式无效" }
  }
  if (Number(containerNo[10]) !== expected) {
    return {
      ok: false,
      error: `箱号校验位不正确（应为 ${expected}，当前为 ${containerNo[10]}）`,
    }
  }
  return { ok: true, containerNo }
}

export function isValidIso6346ContainerNo(input: string): boolean {
  return validateIso6346ContainerNo(input).ok
}
