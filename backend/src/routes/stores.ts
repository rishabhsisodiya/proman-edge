import { Router, Request, Response } from 'express'
import { getStoresHomepage, submitGrn, createMaterialRequest, createPoFromMr } from '../services/storesServiceDB'

const router = Router()

// GET /api/v1/stores/homepage
router.get('/homepage', async (req: Request, res: Response) => {
  try {
    const { fy_start, fy_end } = req.query
    if ((fy_start && !fy_end) || (!fy_start && fy_end)) {
      return res.status(400).json({ success: false, error: 'fy_start and fy_end must be provided together' })
    }
    const data = await getStoresHomepage(fy_start as string | undefined, fy_end as string | undefined)
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/stores/grn/:id/submit
router.post('/grn/:id/submit', async (req: Request, res: Response) => {
  try {
    const { action } = req.body as { action?: string }
    const result = await submitGrn(req.params.id, action)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/stores/material-request
router.post('/material-request', async (req: Request, res: Response) => {
  try {
    const { itemCode, qty, warehouse } = req.body as { itemCode?: string; qty?: number; warehouse?: string }
    if (!itemCode || !qty) {
      return res.status(400).json({ success: false, error: 'itemCode and qty are required' })
    }
    const result = await createMaterialRequest(itemCode, qty, warehouse)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/stores/purchase-order-from-mr
router.post('/purchase-order-from-mr', async (req: Request, res: Response) => {
  try {
    const { materialRequest, supplier } = req.body as { materialRequest?: string; supplier?: string }
    if (!materialRequest) {
      return res.status(400).json({ success: false, error: 'materialRequest is required' })
    }
    const result = await createPoFromMr(materialRequest, supplier)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
