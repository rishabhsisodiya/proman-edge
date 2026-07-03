import { Router, Request, Response } from 'express'
import { getStoresHomepage } from '../services/storesServiceDB'

const router = Router()

// GET /api/v1/stores/homepage
router.get('/homepage', async (_req: Request, res: Response) => {
  try {
    const data = await getStoresHomepage()
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
