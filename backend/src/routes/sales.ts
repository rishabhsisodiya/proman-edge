import { Router, Request, Response } from 'express'
import { getSalesHomepage, getQuotationDetail, extendQuotation, convertToSalesOrder } from '../services/salesService'

const router = Router()

// GET /api/v1/sales/homepage?companies=PISPL,ACE,PROMAX
// or  ?companies=PISPL  (single)
// Frontend sends the user's companies array joined by comma
router.get('/homepage', async (req: Request, res: Response) => {
  try {
    const raw = (req.query.companies as string) || 'PISPL'
    const companies = raw.split(',').map(c => c.trim()).filter(Boolean)
    const data = await getSalesHomepage(companies)
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// GET /api/v1/sales/quotation/:id  — full detail for deal drawer
router.get('/quotation/:id', async (req: Request, res: Response) => {
  try {
    const data = await getQuotationDetail(req.params.id)
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/sales/quotation/:id/extend
// body: {} (server default +7 days)  |  { days: 14 }  |  { valid_till: "YYYY-MM-DD" }
router.post('/quotation/:id/extend', async (req: Request, res: Response) => {
  try {
    const { valid_till, days } = req.body as { valid_till?: string; days?: number }
    const result = await extendQuotation(req.params.id, { valid_till, days })
    res.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/sales/quotation/:id/convert  — body: { delivery_date?: "YYYY-MM-DD" }
router.post('/quotation/:id/convert', async (req: Request, res: Response) => {
  try {
    const { delivery_date } = req.body as { delivery_date?: string }
    const result = await convertToSalesOrder(req.params.id, delivery_date)
    res.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
