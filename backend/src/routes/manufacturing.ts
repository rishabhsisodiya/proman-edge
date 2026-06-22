import { Router, Request, Response } from 'express'
import { manufacturingHomepageMock } from '../mock/manufacturing'
import { getManufacturingHomepageFromDB } from '../services/manufacturingServiceDB'

const router = Router()
const useMock = () => process.env.USE_MOCK !== 'false'

router.get('/homepage', async (_req: Request, res: Response) => {
  try {
    const data = useMock()
      ? { ...manufacturingHomepageMock, syncedAt: new Date().toISOString() }
      : await getManufacturingHomepageFromDB()
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
