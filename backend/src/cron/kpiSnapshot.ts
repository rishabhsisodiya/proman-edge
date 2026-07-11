import cron from 'node-cron'
import { query } from '../db'
import { writeSnapshot } from '../services/kpiSnapshotService'

const GRACE_DAYS = 3
const ATRISK_DAYS = 5

async function captureKpiSnapshot() {
  try {
    const [active, completed, delayed, atRisk, onHold] = await Promise.all([
      query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
         WHERE docstatus = 1 AND status IN ('In Process','Not Started')`,
      ),
      query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
         WHERE docstatus = 1 AND status = 'Completed' AND DATE(modified) = CURDATE()`,
      ),
      query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabWork Order\` wo
         WHERE wo.docstatus = 1 AND wo.status IN ('In Process','Not Started')
           AND wo.expected_delivery_date IS NOT NULL
           AND DATEDIFF(CURDATE(), wo.expected_delivery_date) > ?
           AND NOT EXISTS (
             SELECT 1 FROM \`tabJob Card\` jc
             WHERE jc.work_order = wo.name AND jc.status = 'On Hold'
           )`,
        [GRACE_DAYS],
      ),
      query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT wo.name) AS cnt
         FROM \`tabWork Order\` wo
         WHERE wo.docstatus = 1 AND wo.status IN ('In Process','Not Started')
           AND DATEDIFF(CURDATE(), wo.expected_delivery_date) <= ?
           AND NOT EXISTS (
             SELECT 1 FROM \`tabJob Card\` jc
             WHERE jc.work_order = wo.name AND jc.status = 'On Hold'
           )
           AND (
             DATEDIFF(CURDATE(), wo.expected_delivery_date) BETWEEN 1 AND ?
             OR wo.expected_delivery_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
           )`,
        [GRACE_DAYS, GRACE_DAYS, ATRISK_DAYS],
      ),
      query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabWork Order\` wo
         WHERE wo.docstatus = 1
           AND (
             wo.status = 'Stopped'
             OR EXISTS (
               SELECT 1 FROM \`tabJob Card\` jc
               WHERE jc.work_order = wo.name AND jc.status = 'On Hold'
             )
           )`,
      ),
    ])

    const today = new Date().toISOString().slice(0, 10)
    writeSnapshot({
      date:           today,
      activeWOs:      active[0].cnt,
      completedToday: completed[0].cnt,
      delayed:        delayed[0].cnt,
      atRisk:         atRisk[0].cnt,
      onHold:         onHold[0].cnt,
    })
    console.log(`[kpiSnapshot] Snapshot saved for ${today}`)
  } catch (err) {
    console.error('[kpiSnapshot] Failed to capture snapshot:', err)
  }
}

export function registerKpiSnapshotCron() {
  const schedule = process.env.KPI_SNAPSHOT_CRON ?? '55 23 * * *'
  cron.schedule(schedule, captureKpiSnapshot, { timezone: 'Asia/Kolkata' })
  console.log(`[kpiSnapshot] Cron registered — schedule: "${schedule}" IST`)
}
