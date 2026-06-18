import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { MOCK_USERS } from '../mock/auth'

const router = Router()
const USE_MOCK = process.env.USE_MOCK !== 'false'
const JWT_SECRET = process.env.JWT_SECRET || 'proman-edge-dev-secret'
const JWT_EXPIRES_IN = '24h'

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string }

  if (!username || !password) {
    res.status(400).json({ success: false, error: 'username and password are required' })
    return
  }

  if (USE_MOCK) {
    const user = MOCK_USERS.find(
      (u) => u.username === username && u.password === password
    )
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' })
      return
    }
    const token = jwt.sign(
      {
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        roleSlug: user.roleSlug,
        companies: user.companies,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )
    res.json({
      success: true,
      data: {
        token,
        user: {
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          roleSlug: user.roleSlug,
          companies: user.companies,
        },
      },
    })
    return
  }

  // Real ERPNext auth — implement when test site access is available
  res.status(501).json({ success: false, error: 'Real ERPNext auth not yet implemented. Set USE_MOCK=true.' })
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
  // JWT is stateless — client discards token; nothing server-side for now
  res.json({ success: true })
})

export default router
