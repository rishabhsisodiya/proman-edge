import { Router, Request, Response } from 'express'
import { getFinanceHomepage, releasePayment } from '../services/financeServiceDB'

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

// POST /api/v1/finance/action-queue/release  { invoiceNo }
// Tab 1 'Release' — creates a draft Payment Entry via proman_edge.api.make_payment_entry
router.post('/action-queue/release', async (req: Request, res: Response) => {
  try {
    const { invoiceNo } = req.body as { invoiceNo?: string }
    if (!invoiceNo) {
      res.status(400).json({ success: false, error: 'invoiceNo is required' })
      return
    }
    const result = await releasePayment(invoiceNo)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
