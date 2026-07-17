import "server-only"
import { pool } from "./db"
import { RESOURCES, type ResourceKey, type ResourceConfig } from "./resources"
import * as mock from "./mock-data"

/**
 * 通用仓储层 —— 双后端：
 * - 若 MySQL 可连接：读写真实数据库（列名 camelCase）
 * - 否则：回退到进程内内存存储（用 lib/mock-data 种子），保证预览环境可用
 *
 * 后端类型在首次访问时探测一次并缓存。
 */

let backend: "mysql" | "memory" | null = null

async function detectBackend(): Promise<"mysql" | "memory"> {
  if (backend) return backend
  try {
    const conn = await pool.getConnection()
    await conn.query("SELECT 1")
    conn.release()
    backend = "mysql"
    console.log("[v0] repo backend = mysql")
  } catch {
    backend = "memory"
    console.log("[v0] repo backend = memory (MySQL 未连接，使用内存种子数据)")
  }
  return backend
}

// ---------- 值转换 ----------
function decodeRow(cfg: ResourceConfig, row: Record<string, any>): Record<string, any> {
  const out = { ...row }
  for (const f of cfg.json) {
    if (typeof out[f] === "string") {
      try {
        out[f] = JSON.parse(out[f])
      } catch {
        out[f] = f === "value" ? null : []
      }
    }
    // system_settings.value 可为任意 JSON；其它 json 字段多为数组
    if (out[f] == null && f !== "value") out[f] = []
  }
  for (const f of cfg.bool) {
    out[f] = out[f] === 1 || out[f] === true || out[f] === "1"
  }
  return out
}

function encodeValue(cfg: ResourceConfig, key: string, value: any): any {
  if (value === undefined) return null
  if (cfg.json.includes(key)) return value == null ? null : JSON.stringify(value)
  if (cfg.bool.includes(key)) return value ? 1 : 0
  return value
}

function genId(cfg: ResourceConfig) {
  return `${cfg.table}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// ---------- 列缓存（仅 MySQL） ----------
const columnCache = new Map<string, string[]>()
async function getColumns(cfg: ResourceConfig): Promise<string[]> {
  if (columnCache.has(cfg.table)) return columnCache.get(cfg.table)!
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${cfg.table}\``)
  const cols = (rows as any[]).map((r) => r.Field as string)
  columnCache.set(cfg.table, cols)
  return cols
}

export function clearColumnCache(table?: string) {
  if (table) columnCache.delete(table)
  else columnCache.clear()
}

// ---------- 内存存储 ----------
const memStore = new Map<ResourceKey, any[]>()
function memData(key: ResourceKey, cfg: ResourceConfig): any[] {
  if (!memStore.has(key)) {
    const arr = ((mock as Record<string, any>)[cfg.seed] as any[]) ?? []
    // 深拷贝，避免污染种子；补齐无 id 资源的主键
    const cloned = arr.map((it, i) => {
      const row = JSON.parse(JSON.stringify(it))
      if (cfg.id === "id" && row.id == null) row.id = `${cfg.table}_${i + 1}`
      return row
    })
    memStore.set(key, cloned)
  }
  return memStore.get(key)!
}

function stripMeta(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("__")) continue
    out[k] = v
  }
  return out
}

// ---------- 公共 API ----------
export async function list(key: ResourceKey): Promise<any[]> {
  const cfg = RESOURCES[key]
  const be = await detectBackend()
  if (be === "memory") return memData(key, cfg).map((r) => ({ ...r }))
  const [rows] = await pool.query(`SELECT * FROM \`${cfg.table}\``)
  return (rows as any[]).map((r) => decodeRow(cfg, r))
}

export async function get(key: ResourceKey, id: string): Promise<any | null> {
  const cfg = RESOURCES[key]
  const be = await detectBackend()
  if (be === "memory") {
    const found = memData(key, cfg).find((r) => String(r[cfg.id]) === String(id))
    return found ? { ...found } : null
  }
  const [rows] = await pool.query(`SELECT * FROM \`${cfg.table}\` WHERE \`${cfg.id}\` = ? LIMIT 1`, [id])
  const arr = rows as any[]
  return arr.length ? decodeRow(cfg, arr[0]) : null
}

export async function create(key: ResourceKey, data: Record<string, any>): Promise<any> {
  const cfg = RESOURCES[key]
  const record = stripMeta(data)
  if (record[cfg.id] == null || record[cfg.id] === "") record[cfg.id] = genId(cfg)
  const be = await detectBackend()
  if (be === "memory") {
    memData(key, cfg).unshift(record)
    return { ...record }
  }
  const cols = await getColumns(cfg)
  const keys = Object.keys(record).filter((k) => cols.includes(k))
  const colList = keys.map((k) => `\`${k}\``).join(", ")
  const placeholders = keys.map(() => "?").join(", ")
  const values = keys.map((k) => encodeValue(cfg, k, record[k]))
  await pool.query(`INSERT INTO \`${cfg.table}\` (${colList}) VALUES (${placeholders})`, values)
  return (await get(key, record[cfg.id])) ?? record
}

export async function update(key: ResourceKey, id: string, patch: Record<string, any>): Promise<any | null> {
  const cfg = RESOURCES[key]
  const clean = stripMeta(patch)
  const be = await detectBackend()
  if (be === "memory") {
    const arr = memData(key, cfg)
    const idx = arr.findIndex((r) => String(r[cfg.id]) === String(id))
    if (idx === -1) return null
    arr[idx] = { ...arr[idx], ...clean, [cfg.id]: arr[idx][cfg.id] }
    return { ...arr[idx] }
  }
  const cols = await getColumns(cfg)
  const keys = Object.keys(clean).filter((k) => cols.includes(k) && k !== cfg.id)
  if (keys.length === 0) return get(key, id)
  const setClause = keys.map((k) => `\`${k}\` = ?`).join(", ")
  const values = keys.map((k) => encodeValue(cfg, k, clean[k]))
  await pool.query(`UPDATE \`${cfg.table}\` SET ${setClause} WHERE \`${cfg.id}\` = ?`, [...values, id])
  return get(key, id)
}

export async function remove(key: ResourceKey, id: string): Promise<boolean> {
  const cfg = RESOURCES[key]
  const be = await detectBackend()
  if (be === "memory") {
    const arr = memData(key, cfg)
    const idx = arr.findIndex((r) => String(r[cfg.id]) === String(id))
    if (idx === -1) return false
    arr.splice(idx, 1)
    return true
  }
  const [res] = await pool.query(`DELETE FROM \`${cfg.table}\` WHERE \`${cfg.id}\` = ?`, [id])
  return (res as any).affectedRows > 0
}

export async function currentBackend(): Promise<"mysql" | "memory"> {
  return detectBackend()
}
