import type { FrappeEnvelope } from '../types/frappe'

export type { FrappeEnvelope }

function buildToken(): string {
  const key    = process.env.FRAPPE_API_KEY    ?? ''
  const secret = process.env.FRAPPE_API_SECRET ?? ''
  return `token ${key}:${secret}`
}

function baseUrl(): string {
  return (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '')
}

// Frappe returns errors as HTTP 200 with ok:false — throw so callers don't need to check
function assertOk<T>(msg: T, method: string): T {
  if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).ok === false) {
    const err = (msg as Record<string, unknown>).error as { code?: string; message?: string } | undefined
    throw new Error(`Frappe ${method} → ${err?.code ?? 'ERROR'}: ${err?.message ?? 'Unknown error'}`)
  }
  return msg
}

function log(verb: string, method: string, ms: number, status: number | 'ok' | 'err') {
  const tag = status === 'err' ? '✗' : '✓'
  console.log(`[frappe] ${tag} ${verb} ${method.split('.').pop()} — ${ms}ms (${method})`)
}

export async function frappeGet<T = FrappeEnvelope>(
  method: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]): [string, string] => [k, String(v)])

  const qs = new URLSearchParams(entries).toString()
  const url = `${baseUrl()}/api/method/${method}${qs ? `?${qs}` : ''}`

  const t0 = Date.now()
  const res = await fetch(url, {
    headers: { Authorization: buildToken(), Accept: 'application/json' },
  })
  const ms = Date.now() - t0

  if (!res.ok) {
    log('GET', method, ms, 'err')
    throw new Error(`Frappe ${method} → HTTP ${res.status}`)
  }

  const json = (await res.json()) as { message: T }
  log('GET', method, ms, res.status)
  return assertOk(json.message, method)
}

export async function frappePost<T = FrappeEnvelope>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${baseUrl()}/api/method/${method}`

  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: buildToken(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - t0

  if (!res.ok) {
    log('POST', method, ms, 'err')
    throw new Error(`Frappe POST ${method} → HTTP ${res.status}`)
  }

  const json = (await res.json()) as { message: T }
  log('POST', method, ms, res.status)
  return assertOk(json.message, method)
}
