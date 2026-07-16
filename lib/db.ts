import "server-only"
import mysql from "mysql2/promise"

/**
 * MySQL 8 连接池（单例）
 * 通过环境变量配置，见 .env.example
 */

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: mysql.Pool | undefined
}

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "container_biz",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "+00:00",
    // 让 DECIMAL/BIGINT 以字符串返回可能更安全，但本项目数值范围小，保持数字
    decimalNumbers: true,
  })
}

export const pool: mysql.Pool = global.__mysqlPool ?? createPool()
if (process.env.NODE_ENV !== "production") global.__mysqlPool = pool

/** 便捷查询：返回行数组 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}
