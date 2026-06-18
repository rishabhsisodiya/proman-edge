import Redis from 'ioredis'

let client: Redis | null = null

function getClient(): Redis | null {
  if (process.env.REDIS_URL) {
    if (!client) client = new Redis(process.env.REDIS_URL)
    return client
  }
  return null // Redis optional — falls back to no cache in dev
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient()
  if (!redis) return null
  const val = await redis.get(key)
  return val ? (JSON.parse(val) as T) : null
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getClient()
  if (!redis) return
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
}
