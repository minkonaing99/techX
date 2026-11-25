import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from './schema'
import { getDatabaseUrl } from './url'

const globalForDb = globalThis as unknown as {
  __mysqlPool?: mysql.Pool
}

// Conditional writes across the app read `affectedRows` as rows MATCHED, which
// is mysql2's default (the FOUND_ROWS client flag). A `flags` option here that
// drops it would turn every same-value guarded write into a false conflict.
const pool =
  globalForDb.__mysqlPool ??
  mysql.createPool({
    uri: getDatabaseUrl(),
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__mysqlPool = pool

export const db = drizzle(pool, { schema, mode: 'default' })
