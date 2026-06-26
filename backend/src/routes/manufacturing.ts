import { Router, Request, Response } from 'express'
import { manufacturingHomepageMock } from '../mock/manufacturing'
import { getManufacturingHomepageFromDB, getWorkOrderDetail, getMaterialRequestDetail } from '../services/manufacturingServiceDB'

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

router.get('/material-request/:mr', async (req: Request, res: Response) => {
  try {
    const detail = await getMaterialRequestDetail(req.params.mr)
    if (!detail) return res.status(404).json({ success: false, error: 'Material request not found' })
    res.json({ success: true, data: detail })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

router.get('/work-order/:wo', async (req: Request, res: Response) => {
  try {
    const detail = await getWorkOrderDetail(req.params.wo)
    if (!detail) return res.status(404).json({ success: false, error: 'Work order not found' })
    res.json({ success: true, data: detail })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
