import { Router, Request, Response } from 'express'
import { getManufacturingHomepageFromDB, getWorkOrderDetail, getMaterialRequestDetail, getPipelineOrdersByStage } from '../services/manufacturingServiceDB'

const router = Router()

router.get('/homepage', async (_req: Request, res: Response) => {
  try {
    const data = await getManufacturingHomepageFromDB()
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

router.get('/pipeline-orders/:stage', async (req: Request, res: Response) => {
  try {
    const orders = await getPipelineOrdersByStage(req.params.stage)
    res.json({ success: true, data: orders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
