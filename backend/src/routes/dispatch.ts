import { Router, Request, Response } from 'express'
import { getDispatchHomepage, getDocumentationChecklist, getEwayBillStatus } from '../services/dispatchServiceDB'

const router = Router()

// GET /api/v1/dispatch/homepage
router.get('/homepage', async (_req: Request, res: Response) => {
  try {
    const data = await getDispatchHomepage()
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// GET /api/v1/dispatch/checklist/:dn
router.get('/checklist/:dn', async (req: Request, res: Response) => {
  try {
    const data = await getDocumentationChecklist(req.params.dn)
    if (!data) return res.status(404).json({ success: false, error: 'Delivery Note not found' })
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// GET /api/v1/dispatch/ewaybills
router.get('/ewaybills', async (_req: Request, res: Response) => {
  try {
    const data = await getEwayBillStatus()
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
