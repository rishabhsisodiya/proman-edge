import { Router, Request, Response } from 'express'
import { getFinanceHomepage, releasePayment, approvePurchaseOrder, submitJournalEntry } from '../services/financeServiceDB'
import { readFinanceSettings, setGmTargetPct, clearGmTargetPctOverride } from '../services/financeSettingsService'

const router = Router()

// GET /api/v1/finance/settings
router.get('/settings', (_req: Request, res: Response) => {
  res.json({ success: true, data: readFinanceSettings() })
})

// PUT /api/v1/finance/settings/gross-margin-target  { entity: string | null, value: number }
// entity: null updates the default (applies to any entity without its own override)
router.put('/settings/gross-margin-target', (req: Request, res: Response) => {
  const { entity, value } = req.body as { entity: string | null; value: number }
  if (typeof value !== 'number' || value < 0 || value > 100) {
    res.status(400).json({ success: false, error: 'value must be a number between 0 and 100' })
    return
  }
  const settings = setGmTargetPct(entity ?? null, value)
  res.json({ success: true, data: settings })
})

// DELETE /api/v1/finance/settings/gross-margin-target/:entity — remove a per-entity override
router.delete('/settings/gross-margin-target/:entity', (req: Request, res: Response) => {
  const settings = clearGmTargetPctOverride(req.params.entity)
  res.json({ success: true, data: settings })
})

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

// POST /api/v1/finance/po-approval/approve  { poNo }
// W-FIN-08 'Approve' — advances the PO's workflow_state via proman_edge.api.procurement.approve_purchase_order
router.post('/po-approval/approve', async (req: Request, res: Response) => {
  try {
    const { poNo } = req.body as { poNo?: string }
    if (!poNo) {
      res.status(400).json({ success: false, error: 'poNo is required' })
      return
    }
    const result = await approvePurchaseOrder(poNo)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

// POST /api/v1/finance/action-queue/approve-je  { journalEntry }
// Tab 2 'Approve' — submits the draft Journal Entry via proman_edge.api.finance.submit_journal_entry
router.post('/action-queue/approve-je', async (req: Request, res: Response) => {
  try {
    const { journalEntry } = req.body as { journalEntry?: string }
    if (!journalEntry) {
      res.status(400).json({ success: false, error: 'journalEntry is required' })
      return
    }
    const result = await submitJournalEntry(journalEntry)
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, error: message })
  }
})

export default router
