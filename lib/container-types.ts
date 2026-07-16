import type { ContainerType } from "./types"

export const CONTAINER_TYPES: ContainerType[] = ["20GP", "40GP", "40HQ", "45HQ"]

export const DEFAULT_CONTAINER_TYPE: ContainerType = "40HQ"

/** 业务表单中应使用箱型下拉的字段 */
export function isContainerTypeField(key: string, label?: string) {
  return key === "containerType" || (key === "type" && label === "箱型")
}

export function defaultFieldValue(key: string, label?: string) {
  if (isContainerTypeField(key, label)) return DEFAULT_CONTAINER_TYPE
  return ""
}
