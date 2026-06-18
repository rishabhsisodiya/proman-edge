import { Router, Request, Response } from 'express'
import { manufacturingHomepageMock } from '../mock/manufacturing'

const router = Router()
const useMock = () => process.env.USE_MOCK !== 'false'

router.get('/homepage', (_req: Request, res: Response) => {
  const data = useMock()
    ? { ...manufacturingHomepageMock, syncedAt: new Date().toISOString() }
    : { ...manufacturingHomepageMock, syncedAt: new Date().toISOString() } // real ERPNext API — TODO when Work Order endpoints are ready

  res.json({ success: true, data })
})

export default router
