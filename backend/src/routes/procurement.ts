import { Router, Request, Response } from 'express'
import {
  getProcurementHomepage,
  getPODetail,
  approvePO,
  returnPO,
  logFollowUp,
  makeGRN,
} from '../services/procurementServiceDB'

const router = Router()

// GET /api/v1/procurement/homepage
router.get('/homepage', async (req: Request, res: Response) => {
  try {
    const { fy_start, fy_end } = req.query
    if ((fy_start && !fy_end) || (!fy_start && fy_end)) {
      return res.status(400).json({ success: false, error: 'fy_start and fy_end must be provided together' })
    }
    const data = await getProcurementHomepage(fy_start as string | undefined, fy_end as string | undefined)
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// GET /api/v1/procurement/po/:id
router.get('/po/:id', async (req: Request, res: Response) => {
  try {
    const detail = await getPODetail(req.params.id)
    if (!detail) return res.status(404).json({ success: false, error: 'Purchase Order not found' })
    res.json({ success: true, data: detail })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/procurement/po/:id/approve
router.post('/po/:id/approve', async (req: Request, res: Response) => {
  try {
    const result = await approvePO(req.params.id)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/procurement/po/:id/return
router.post('/po/:id/return', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) {
      return res.status(400).json({ success: false, error: 'reason is required' })
    }
    const result = await returnPO(req.params.id, reason.trim())
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/procurement/po/:id/followup
router.post('/po/:id/followup', async (req: Request, res: Response) => {
  try {
    const { comment } = req.body as { comment?: string }
    if (!comment?.trim()) {
      return res.status(400).json({ success: false, error: 'comment is required' })
    }
    const result = await logFollowUp(req.params.id, comment)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/procurement/po/:id/grn
router.post('/po/:id/grn', async (req: Request, res: Response) => {
  try {
    const result = await makeGRN(req.params.id)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
