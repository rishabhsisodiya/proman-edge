import mysql from 'mysql2/promise'
import fs from 'fs'

let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (pool) return pool

  const host = process.env.DB_HOST || '127.0.0.1'
  const port = parseInt(process.env.DB_PORT || '3306')
  const database = process.env.DB_NAME || '_800ba922c4374766'
  const user = process.env.DB_USER || '_800ba922c4374766'

  console.log(`[db] creating pool → ${user}@${host}:${port}/${database}`)

  const sslOptions = process.env.DB_SSL_CA
    ? { ssl: { ca: fs.readFileSync(process.env.DB_SSL_CA) } }
    : {}

  pool = mysql.createPool({
    host,
    port,
    database,
    user,
    password: process.env.DB_PASS || '',
    connectionLimit: 10,
    waitForConnections: true,
    ...sslOptions,
  })

  return pool
}

export async function query<T = unknown>(sql: string, params?: (string | number | null)[]): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params)
  return rows as T[]
}
