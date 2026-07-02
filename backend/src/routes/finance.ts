import { Router, Request, Response } from 'express'
import { getFinanceHomepage } from '../services/financeServiceDB'

const router = Router()

// GET /api/v1/finance/homepage
router.get('/homepage', async (_req: Request, res: Response) => {
  try {
    const data = await getFinanceHomepage()
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
