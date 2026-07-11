import { Router, Request, Response } from 'express'
import { getSalesHomepage, getQuotationDetail, extendQuotation, convertToSalesOrder } from '../services/salesService'
import { getSalesHomepageFromDB } from '../services/salesServiceDB'

const router = Router()
const useMock = () => process.env.USE_MOCK !== 'false'

function logErr(tag: string, id: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[${tag}] ${id} → ${msg}`)
  return msg
}

// GET /api/v1/sales/homepage?companies=PISPL,ACE,PROMAX
router.get('/homepage', async (req: Request, res: Response) => {
  try {
    const raw = (req.query.companies as string) || 'PISPL'
    const companies = raw.split(',').map(c => c.trim()).filter(Boolean)
    const data = useMock()
      ? await getSalesHomepage(companies)
      : await getSalesHomepageFromDB(companies[0])
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: logErr('homepage', '', err) })
  }
})

// GET /api/v1/sales/quotation/:id  — full detail for deal drawer
router.get('/quotation/:id', async (req: Request, res: Response) => {
  try {
    const data = await getQuotationDetail(req.params.id)
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: logErr('quotation', req.params.id, err) })
  }
})

// POST /api/v1/sales/quotation/:id/extend
router.post('/quotation/:id/extend', async (req: Request, res: Response) => {
  try {
    const { valid_till, days } = req.body as { valid_till?: string; days?: number }
    const result = await extendQuotation(req.params.id, { valid_till, days })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: logErr('extend', req.params.id, err) })
  }
})

// POST /api/v1/sales/quotation/:id/convert  — body: { delivery_date?: "YYYY-MM-DD" }
router.post('/quotation/:id/convert', async (req: Request, res: Response) => {
  try {
    const { delivery_date } = req.body as { delivery_date?: string }
    const result = await convertToSalesOrder(req.params.id, delivery_date)
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: logErr('convert', req.params.id, err) })
  }
})

export default router
