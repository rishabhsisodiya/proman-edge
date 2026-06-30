import cron from 'node-cron'
import { query } from '../db'
import { writeProcurementSnapshot, readProcurementSnapshots } from '../services/procurementSnapshotService'

export async function captureProcurementSnapshot() {
  try {
    const [prsPending, openPOs, overduePOs, criticalStock, spendMtd] = await Promise.all([

      // W-PROC-01: POs awaiting any approval level
      query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
         WHERE workflow_state LIKE 'Awaiting%Approval'`,
      ),

      // W-PROC-02: Open POs (submitted, not fully received)
      query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
         WHERE docstatus = 1
           AND status IN ('To Receive', 'To Receive and Bill')`,
      ),

      // W-PROC-03: Overdue POs
      query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
         WHERE docstatus = 1
           AND status IN ('To Receive', 'To Receive and Bill')
           AND schedule_date < CURDATE()
           AND per_received < 100`,
      ),

      // W-PROC-05: Critical stock alerts (below reorder level + WO-linked)
      query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT b.item_code) AS cnt
         FROM \`tabBin\` b
         JOIN \`tabItem Reorder\` ir ON ir.parent = b.item_code AND ir.warehouse = b.warehouse
         WHERE ir.warehouse_reorder_level > 0
           AND b.actual_qty < ir.warehouse_reorder_level
           AND EXISTS (
             SELECT 1 FROM \`tabWork Order Item\` woi
             JOIN \`tabWork Order\` wo ON wo.name = woi.parent
               AND wo.docstatus = 1
               AND wo.status IN ('Not Started', 'In Process')
             WHERE woi.item_code = b.item_code
           )`,
      ),

      // W-PROC-04: Spend MTD
      query<{ spend: number }>(
        `SELECT COALESCE(SUM(grand_total), 0) AS spend
         FROM \`tabPurchase Invoice\`
         WHERE docstatus = 1
           AND posting_date BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE())`,
      ),
    ])

    const today = new Date().toISOString().slice(0, 10)
    writeProcurementSnapshot({
      date:          today,
      prsPending:    prsPending[0].cnt,
      openPOs:       openPOs[0].cnt,
      overduePOs:    overduePOs[0].cnt,
      criticalStock: criticalStock[0].cnt,
      spendMtd:      spendMtd[0].spend,
    })
    console.log(`[procurementSnapshot] Snapshot saved for ${today}`)
  } catch (err) {
    console.error('[procurementSnapshot] Failed to capture snapshot:', err)
  }
}

export function registerProcurementKpiSnapshotCron() {
  // Runs at 23:55 every day (same cadence as manufacturing snapshot)
  cron.schedule('55 23 * * *', captureProcurementSnapshot, { timezone: 'Asia/Kolkata' })
  console.log('[procurementSnapshot] Cron registered — runs at 23:55 IST daily')

  // Seed immediately on start if no snapshots exist yet
  if (readProcurementSnapshots().length === 0) {
    console.log('[procurementSnapshot] No snapshot data found — seeding now…')
    captureProcurementSnapshot().catch(err =>
      console.error('[procurementSnapshot] Seed failed:', err),
    )
  }
}
