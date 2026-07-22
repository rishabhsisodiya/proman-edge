import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { pbkdf2 } from 'crypto'
import { query } from '../db'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'proman-edge-dev-secret'
const JWT_EXPIRES_IN = '24h'

// Priority order — first match wins if user has multiple roles
const ROLE_PRIORITY = [
  'Managing Director',
  'Sales Head',
  'Sales Master Manager',
  'Manufacturing Head',
  'Manufacturing Manager',
  'Finance Head',
  'Engineering Head',
  'Procurement Head',
  'Stores Head',
]

const ROLE_SLUG: Record<string, string> = {
  'Managing Director':   'md',
  'Sales Head':          'sales-head',
  'Sales Master Manager': 'sales-head',
  'Manufacturing Head':  'manufacturing-head',
  'Manufacturing Manager': 'manufacturing-head',
  'Finance Head':        'finance-head',
  'Engineering Head':    'engineering-head',
  'Procurement Head':    'procurement-head',
  'Stores Head':         'stores-head',
}

interface DBUser {
  name: string
  full_name: string
  email: string
  role: string
}

// Verify password against Frappe's $pbkdf2-sha256$<iterations>$<salt>$<hash> format
async function verifyFrappePassword(password: string, storedHash: string): Promise<boolean> {
  // Format: $pbkdf2-sha256$29000$<base64url-salt>$<base64url-hash>
  const parts = storedHash.split('$')
  if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha256') return false
  const iterations = parseInt(parts[2])
  // Frappe uses base64url (- and _ instead of + and /), with . as padding sometimes
  const salt   = Buffer.from(parts[3].replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const stored = Buffer.from(parts[4].replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '+'), 'base64')
  return new Promise(resolve => {
    pbkdf2(password, salt, iterations, stored.length, 'sha256', (err, derived) => {
      if (err) { resolve(false); return }
      resolve(derived.equals(stored))
    })
  })
}

async function getUserFromDB(username: string): Promise<DBUser | null> {
  const roleList = ROLE_PRIORITY.map(() => '?').join(',')
  // First try role_profile_name (set when a Role Profile is assigned to the user)
  const profileRows = await query<DBUser>(
    `SELECT name, full_name, email, role_profile_name AS role
     FROM tabUser
     WHERE name = ?
       AND role_profile_name IN (${roleList})
     ORDER BY FIELD(role_profile_name, ${roleList})
     LIMIT 1`,
    [username, ...ROLE_PRIORITY, ...ROLE_PRIORITY],
  )
  if (profileRows[0]) return profileRows[0]

  // Fallback: direct role in tabHas Role (if individual roles were assigned instead)
  const roleRows = await query<DBUser>(
    `SELECT u.name, u.full_name, u.email, hr.role
     FROM tabUser u
     JOIN \`tabHas Role\` hr ON hr.parent = u.name
     WHERE u.name = ?
       AND hr.role IN (${roleList})
     ORDER BY FIELD(hr.role, ${roleList})
     LIMIT 1`,
    [username, ...ROLE_PRIORITY, ...ROLE_PRIORITY],
  )
  return roleRows[0] ?? null
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string }

  if (!username || !password) {
    res.status(400).json({ success: false, error: 'username and password are required' })
    return
  }

  // Demo login — bypasses ERPNext DB auth entirely, only for local testing when the DB
  // connection budget is contended. Must never be enabled outside dev (ALLOW_DEMO_LOGIN unset in prod).
  if (process.env.ALLOW_DEMO_LOGIN === 'true' && username === 'admin' && password === 'rishabh') {
    console.log('[auth] demo login used')
    const token = jwt.sign(
      { username: 'admin', fullName: 'Demo Admin', role: 'Managing Director', roleSlug: 'md', email: 'admin@demo.local', companies: [] },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    )
    res.json({ success: true, data: { token, user: { username: 'admin', fullName: 'Demo Admin', role: 'Managing Director', roleSlug: 'md', companies: [] } } })
    return
  }

  // All auth goes directly through MariaDB — no Frappe process required
  console.log(`[auth] login attempt: ${username}`)
  let authRow: { password: string } | undefined
  let dbUser: DBUser | null = null
  try {
    const [authRows, dbUserResult] = await Promise.all([
      query<{ password: string }>(
        `SELECT password FROM \`__Auth\` WHERE doctype='User' AND name=? AND password LIKE '$pbkdf2%' LIMIT 1`,
        [username],
      ),
      getUserFromDB(username),
    ])
    authRow = authRows[0]
    dbUser  = dbUserResult
    console.log(`[auth] DB lookup — authRow: ${authRow ? 'found' : 'not found'}, dbUser: ${dbUser ? dbUser.role : 'not found'}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[auth] DB error: ${msg}`)
    res.status(503).json({ success: false, error: 'Database unavailable', detail: msg })
    return
  }

  if (!authRow || !dbUser) {
    console.log(`[auth] rejected — missing ${!authRow ? 'password hash' : 'role profile'}`)
    res.status(401).json({ success: false, error: 'Invalid credentials' })
    return
  }

  const valid = await verifyFrappePassword(password, authRow.password)
  console.log(`[auth] password verification: ${valid ? 'passed' : 'failed'}`)
  if (!valid) {
    res.status(401).json({ success: false, error: 'Invalid credentials' })
    return
  }

  const roleSlug = ROLE_SLUG[dbUser.role]
  if (!roleSlug) {
    console.log(`[auth] no slug mapping for role: ${dbUser.role}`)
    res.status(403).json({ success: false, error: `Role '${dbUser.role}' is not mapped in Proman Edge` })
    return
  }

  const token = jwt.sign(
    { username: dbUser.name, fullName: dbUser.full_name, role: dbUser.role, roleSlug, email: dbUser.email, companies: [] },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
  res.json({ success: true, data: { token, user: { username: dbUser.name, fullName: dbUser.full_name, role: dbUser.role, roleSlug, companies: [] } } })
})

router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' })
    return
  }
  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    res.json({ success: true, data: payload })
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
})

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true })
})

export default router
