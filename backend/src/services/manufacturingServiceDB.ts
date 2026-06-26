import { query } from '../db'
import type {
  ManufacturingHomepageData, DelayedWO, CompletingWO,
  PipelineStage, SubStage, MaterialShortage, DowntimeMachine,
} from '../types/manufacturing'

const GRACE_DAYS  = 3   // days past due before WO turns red
const ATRISK_DAYS = 5   // days ahead of due date that trigger amber

const erpBaseUrl = () => (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '')

// ── W-MH-01/02/03/04/05 ─────────────────────────────────────────────────────
async function getKpis() {
  const [active, completed, delayed, atRisk, onHold] = await Promise.all([

    // W-MH-01 Active: submitted, in progress
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status IN ('In Process','Not Started')`,
    ),

    // W-MH-02 Completed: no date filter — all-time per spec
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status = 'Completed'`,
    ),

    // W-MH-03 Delayed (Red): past expected_delivery_date by more than grace days, not stopped
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status IN ('In Process','Not Started')
         AND expected_delivery_date IS NOT NULL
         AND DATEDIFF(CURDATE(), expected_delivery_date) > ?`,
      [GRACE_DAYS],
    ),

    // W-MH-04 At Risk (Amber): not red, within at-risk window OR behind production pace
    query<{ cnt: number }>(
      `SELECT COUNT(DISTINCT wo.name) AS cnt
       FROM \`tabWork Order\` wo
       WHERE wo.docstatus = 1 AND wo.status IN ('In Process','Not Started')
         AND DATEDIFF(CURDATE(), wo.expected_delivery_date) <= ?
         AND (
           (wo.expected_delivery_date IS NOT NULL
            AND wo.expected_delivery_date BETWEEN
              DATE_SUB(CURDATE(), INTERVAL ? DAY) AND DATE_ADD(CURDATE(), INTERVAL ? DAY))
           OR EXISTS (
             SELECT 1 FROM \`tabJob Card\` jc
             WHERE jc.work_order = wo.name
               AND jc.docstatus = 1
               AND jc.for_quantity > 0
               AND jc.expected_start_date IS NOT NULL
               AND jc.expected_end_date IS NOT NULL
               AND jc.expected_end_date > jc.expected_start_date
               AND NOW() BETWEEN jc.expected_start_date AND jc.expected_end_date
               AND (jc.total_completed_qty / jc.for_quantity)
                   < (TIMESTAMPDIFF(SECOND, jc.expected_start_date, NOW())
                      / TIMESTAMPDIFF(SECOND, jc.expected_start_date, jc.expected_end_date))
           )
         )`,
      [GRACE_DAYS, GRACE_DAYS, ATRISK_DAYS],
    ),

    // W-MH-05 On Hold: status Stopped (ERPNext v15 has no On Hold WO status)
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status = 'Stopped'`,
    ),
  ])

  const activeVal   = active[0].cnt
  const delayedVal  = delayed[0].cnt
  const atRiskVal   = atRisk[0].cnt
  const onHoldVal   = onHold[0].cnt
  const greenVal    = Math.max(0, activeVal - delayedVal - atRiskVal - onHoldVal)

  // Trend data requires a daily snapshot table — not yet available.
  // All trends are null (rendered as "— vs yesterday" in neutral colour).
  const noTrend = null

  return {
    activeWOs:      { value: activeVal, sub: 'Work orders in progress', trend: noTrend, red: delayedVal, amber: atRiskVal, green: greenVal, hold: onHoldVal },
    completedToday: { value: completed[0].cnt, sub: 'Completed work orders today', trend: noTrend },
    delayedRed:     { value: delayedVal,  sub: 'Needs immediate action',             trend: noTrend },
    atRiskAmber:    { value: atRiskVal,   sub: `Due within ${ATRISK_DAYS} days`,     trend: noTrend },
    onHold:         { value: onHoldVal,   sub: 'Active holds',                        trend: noTrend },
  }
}

// ── W-MH-06 Delayed WOs list ─────────────────────────────────────────────────
async function getDelayedWOs(): Promise<DelayedWO[]> {
  const rows = await query<{
    name: string; customer_name: string
    pipeline_stage: string | null; pipeline_stage_name: string | null
    expected_delivery_date: string; status: string
  }>(
    `SELECT
       wo.name,
       COALESCE(so.customer_name, wo.sales_order, '—') AS customer_name,
       wo.status,
       op.stage                                         AS pipeline_stage,
       op.stage_name                                    AS pipeline_stage_name,
       wo.expected_delivery_date
     FROM \`tabWork Order\` wo
     LEFT JOIN \`tabSales Order\`    so ON so.name           = wo.sales_order
     LEFT JOIN \`tabOrder Pipeline\` op ON op.sales_order_id = wo.sales_order
     WHERE wo.docstatus = 1
       AND wo.status IN ('In Process','Not Started','Stopped')
       AND wo.expected_delivery_date IS NOT NULL
       AND (
         DATEDIFF(CURDATE(), wo.expected_delivery_date) > 0
         OR wo.status = 'Stopped'
         OR EXISTS (
           SELECT 1 FROM \`tabJob Card\` jc
           WHERE jc.work_order = wo.name AND jc.docstatus = 1
             AND jc.for_quantity > 0
             AND jc.expected_start_date IS NOT NULL
             AND jc.expected_end_date IS NOT NULL
             AND jc.expected_end_date > jc.expected_start_date
             AND NOW() BETWEEN jc.expected_start_date AND jc.expected_end_date
             AND (jc.total_completed_qty / jc.for_quantity)
                 < (TIMESTAMPDIFF(SECOND, jc.expected_start_date, NOW())
                    / TIMESTAMPDIFF(SECOND, jc.expected_start_date, jc.expected_end_date))
         )
       )
     ORDER BY
       CASE WHEN wo.status = 'Stopped' THEN 2
            WHEN DATEDIFF(CURDATE(), wo.expected_delivery_date) > ? THEN 0
            ELSE 1 END,
       wo.expected_delivery_date ASC
     LIMIT 10`,
    [GRACE_DAYS],
  )

  return rows.map(r => {
    const daysOver = Math.floor(
      (Date.now() - new Date(r.expected_delivery_date).getTime()) / 86_400_000,
    )
    let rag: 'red' | 'amber' | 'green'
    let label: string
    if (r.status === 'Stopped') {
      rag = 'amber'; label = 'On hold'
    } else if (daysOver > GRACE_DAYS) {
      rag = 'red'; label = `${daysOver}d over`
    } else {
      rag = 'amber'; label = 'At risk'
    }
    const stage = r.pipeline_stage && r.pipeline_stage_name
      ? `${r.pipeline_stage}·${r.pipeline_stage_name.split(' ')[0]}`
      : r.status === 'Stopped' ? 'On hold' : '—'
    return {
      wo:       r.name,
      customer: r.customer_name,
      stage,
      daysOver: rag === 'red' ? daysOver : 0,
      rag,
      label,
    }
  })
}

// ── W-MH-07 Mfg sub-stages ──────────────────────────────────────────────────
async function getMfgSubStages(): Promise<SubStage[]> {
  const rows = await query<{
    label: string; red: number; amber: number; green: number; hold: number
  }>(
    `SELECT
       op.name AS label,
       SUM(CASE
         WHEN jc.status = 'Open'
          AND jc.expected_start_date IS NOT NULL
          AND jc.expected_end_date IS NOT NULL
          AND jc.expected_end_date > jc.expected_start_date
          AND jc.expected_end_date < NOW()
          AND jc.for_quantity > 0
          AND (jc.total_completed_qty / jc.for_quantity)
              < (TIMESTAMPDIFF(SECOND, jc.expected_start_date, NOW())
                 / TIMESTAMPDIFF(SECOND, jc.expected_start_date, jc.expected_end_date))
         THEN 1 ELSE 0 END) AS red,
       SUM(CASE
         WHEN jc.status = 'Open'
          AND jc.expected_start_date IS NOT NULL
          AND jc.expected_end_date IS NOT NULL
          AND jc.expected_end_date > jc.expected_start_date
          AND jc.expected_end_date >= NOW()
          AND jc.for_quantity > 0
          AND (jc.total_completed_qty / jc.for_quantity)
              < (TIMESTAMPDIFF(SECOND, jc.expected_start_date, NOW())
                 / TIMESTAMPDIFF(SECOND, jc.expected_start_date, jc.expected_end_date))
         THEN 1 ELSE 0 END) AS amber,
       SUM(CASE
         WHEN jc.status = 'Completed'
          OR (jc.status = 'Open' AND NOT (
            jc.expected_start_date IS NOT NULL
            AND jc.expected_end_date IS NOT NULL
            AND jc.expected_end_date > jc.expected_start_date
            AND jc.for_quantity > 0
            AND (jc.total_completed_qty / jc.for_quantity)
                < (TIMESTAMPDIFF(SECOND, jc.expected_start_date, NOW())
                   / TIMESTAMPDIFF(SECOND, jc.expected_start_date, jc.expected_end_date))
          ))
         THEN 1 ELSE 0 END) AS green,
       0 AS hold
     FROM \`tabOperation\` op
     LEFT JOIN \`tabJob Card\` jc
       ON  jc.operation = op.name
       AND jc.docstatus  = 1
       AND EXISTS (
         SELECT 1 FROM \`tabWork Order\` wo
         WHERE wo.name = jc.work_order AND wo.status IN ('In Process','Not Started')
       )
     GROUP BY op.name
     ORDER BY op.name`,
  )

  return rows
}

// ── W-MH-08 Material shortages ───────────────────────────────────────────────
async function getMaterialShortages(): Promise<MaterialShortage[]> {
  const rows = await query<{
    wo: string; item_code: string; qty: number; received_qty: number
    schedule_date: string; eta: string | null; earliest_jc_start: string | null
  }>(
    `SELECT
       COALESCE(wo.name, mr.name, '—') AS wo,
       mri.item_code,
       mri.qty,
       mri.received_qty,
       mri.schedule_date,
       poi.expected_delivery_date                AS eta,
       MIN(jc.expected_start_date)               AS earliest_jc_start
     FROM \`tabMaterial Request\`     mr
     JOIN \`tabMaterial Request Item\` mri ON mri.parent = mr.name
     LEFT JOIN \`tabWork Order\`       wo  ON wo.sales_order = mri.sales_order
                                          AND wo.docstatus   = 1
                                          AND wo.status IN ('In Process','Not Started')
     LEFT JOIN \`tabJob Card\`         jc  ON jc.work_order  = wo.name AND jc.docstatus = 1
     LEFT JOIN \`tabPurchase Order Item\` poi
       ON poi.material_request      = mr.name
      AND poi.material_request_item = mri.name
      AND poi.docstatus             = 1
     WHERE mr.docstatus = 1
       AND mri.received_qty < mri.qty
     GROUP BY mr.name, mri.name
     ORDER BY wo.expected_delivery_date ASC
     LIMIT 10`,
  )

  return rows.map(r => {
    const short    = r.qty - r.received_qty
    const etaStr   = r.eta ?? r.schedule_date ?? ''
    const etaMs    = etaStr ? new Date(etaStr).getTime() : null
    const jcStartMs = r.earliest_jc_start ? new Date(r.earliest_jc_start).getTime() : null
    const isBlocking = etaMs && jcStartMs ? etaMs > jcStartMs : false
    return {
      wo:    r.wo,
      item:  r.item_code,
      short: `${Math.ceil(short)} units`,
      eta:   etaStr ? new Date(etaStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—',
      rag:   (isBlocking ? 'red' : 'amber') as 'red' | 'amber' | 'green',
    }
  })
}

// ── W-MH-09 Operations pipeline ──────────────────────────────────────────────
async function getPipelineStages(): Promise<PipelineStage[]> {
  const rows = await query<{
    stage_id: string; stage_name: string; stage_color: string; planned_days: number
    total: number; red: number; amber: number; green: number
  }>(
    `SELECT
       ops.stage_id,
       ops.stage_name,
       COALESCE(ops.stage_color, '#2A2F69') AS stage_color,
       ops.planned_days,
       COUNT(op.name)                        AS total,
       SUM(CASE
         WHEN ph.stage_start_date IS NOT NULL
          AND DATEDIFF(NOW(), ph.stage_start_date) > ops.planned_days + ?
         THEN 1 ELSE 0 END)                  AS red,
       SUM(CASE
         WHEN ph.stage_start_date IS NOT NULL
          AND DATEDIFF(NOW(), ph.stage_start_date) BETWEEN ops.planned_days AND ops.planned_days + ?
         THEN 1 ELSE 0 END)                  AS amber,
       SUM(CASE
         WHEN ph.stage_start_date IS NULL
          OR DATEDIFF(NOW(), ph.stage_start_date) < ops.planned_days
         THEN 1 ELSE 0 END)                  AS green
     FROM \`tabOrder Pipeline Stage\` ops
     LEFT JOIN \`tabOrder Pipeline\`   op  ON op.stage           = ops.stage_id
     LEFT JOIN \`tabPipeline History\` ph  ON ph.parent          = op.name
                                          AND ph.stage_id        = op.stage
                                          AND ph.stage_end_date  IS NULL
     GROUP BY ops.stage_id, ops.stage_name, ops.stage_color, ops.planned_days
     ORDER BY ops.idx`,
    [GRACE_DAYS, GRACE_DAYS],
  )

  return rows.map(r => ({
    label: r.stage_name,
    short: r.stage_id,
    color: r.stage_color,
    red:   Number(r.red),
    amber: Number(r.amber),
    green: Number(r.green),
    hold:  0,
  }))
}

// ── W-MH-11 Machine downtime today ──────────────────────────────────────────
async function getDowntime(): Promise<{ totalHrs: number; machines: DowntimeMachine[] }> {
  const rows = await query<{
    machine: string; downtime: number; reason: string; to_time: string | null
  }>(
    `SELECT
       workstation AS machine,
       downtime,
       COALESCE(NULLIF(TRIM(remarks), ''), stop_reason, '') AS reason,
       to_time
     FROM \`tabDowntime Entry\`
     WHERE DATE(from_time) = CURDATE()
     ORDER BY from_time DESC`,
  )

  const machines: DowntimeMachine[] = rows.map(r => ({
    machine: r.machine,
    hrs:     Math.round((r.downtime / 60) * 10) / 10,
    reason:  r.reason,
    status:  r.to_time ? 'resolved' : 'open',
  }))

  const totalHrs = Math.round(machines.reduce((s, m) => s + m.hrs, 0) * 10) / 10
  return { totalHrs, machines }
}

// ── W-MH-12 WOs completing this week ────────────────────────────────────────
async function getCompletingThisWeek(): Promise<CompletingWO[]> {
  const rows = await query<{
    name: string; customer_name: string; production_item: string
    expected_delivery_date: string; stage_name: string
    qty: number; produced_qty: number
  }>(
    `SELECT
       wo.name,
       COALESCE(so.customer_name, '—')    AS customer_name,
       wo.production_item,
       wo.expected_delivery_date,
       COALESCE(op.stage_name, '—')       AS stage_name,
       wo.qty,
       wo.produced_qty
     FROM \`tabWork Order\`    wo
     LEFT JOIN \`tabSales Order\`    so ON so.name          = wo.sales_order
     LEFT JOIN \`tabOrder Pipeline\` op ON op.sales_order_id = wo.sales_order
     WHERE wo.docstatus = 1
       AND wo.status IN ('In Process','Not Started')
       AND wo.expected_delivery_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
     ORDER BY wo.expected_delivery_date ASC
     LIMIT 10`,
  )

  return rows.map(r => {
    const completion = r.qty > 0 ? Math.round((r.produced_qty / r.qty) * 100) : 0
    const isOverdue  = new Date(r.expected_delivery_date).getTime() < Date.now()
    const rag: 'red' | 'amber' | 'green' = isOverdue ? 'red' : completion >= 95 ? 'green' : 'amber'
    return {
      wo:         r.name,
      customer:   r.customer_name,
      product:    r.production_item,
      due:        new Date(r.expected_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      stage:      r.stage_name,
      completion,
      rag,
    }
  })
}

// ── Attendance (W-MH-10 — from HRMS) ────────────────────────────────────────
async function getAttendance() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await query<{ department: string; status: string; cnt: number }>(
      `SELECT department, status, COUNT(*) AS cnt
       FROM tabAttendance
       WHERE attendance_date = ? AND docstatus = 1
         AND status IN ('Present','Half Day','Absent','On Leave','Work From Home')
       GROUP BY department, status`,
      [today],
    )

    const deptMap: Record<string, { present: number; total: number }> = {}
    let present = 0, onLeave = 0, total = 0

    rows.forEach(r => {
      // Normalise long auto-generated department names
      const dept = r.department.replace(/\s*-\s*PISPL$/i, '').trim()
      if (!deptMap[dept]) deptMap[dept] = { present: 0, total: 0 }
      deptMap[dept].total += r.cnt
      total += r.cnt
      if (r.status === 'Present' || r.status === 'Work From Home') {
        deptMap[dept].present += r.cnt; present += r.cnt
      } else if (r.status === 'Half Day') {
        // count half-day as 0.5 present
        deptMap[dept].present += r.cnt * 0.5; present += r.cnt * 0.5
      } else if (r.status === 'On Leave') {
        onLeave += r.cnt
      }
    })

    const byDept = Object.entries(deptMap)
      .map(([dept, d]) => ({ dept, present: Math.round(d.present), total: d.total }))
      .sort((a, b) => b.total - a.total)

    const absent = total - present - onLeave
    return {
      present: Math.round(present),
      absent:  Math.round(absent),
      onLeave,
      pct: total > 0 ? Math.round((present / total) * 100) : 0,
      byDept,
    }
  } catch {
    return { present: 0, absent: 0, onLeave: 0, pct: 0, byDept: [] }
  }
}

// ── W-MH-13 Quality rejections / rework today ───────────────────────────────
async function getQualityRejections() {
  const rows = await query<{
    reference_name: string; item_code: string; status: string
  }>(
    `SELECT reference_name, item_code, status
     FROM \`tabQuality Inspection\`
     WHERE report_date = CURDATE()
       AND docstatus = 1
       AND status IN ('Rejected','Rework')
     ORDER BY creation DESC
     LIMIT 10`,
  )

  const rejections = rows.filter(r => r.status === 'Rejected').length
  const rework     = rows.filter(r => r.status === 'Rework').length

  return {
    rejections,
    rework,
    items: rows.map(r => ({
      wo:          r.reference_name,
      product:     r.item_code,
      stage:       '—',
      defect:      '—',
      disposition: r.status,
      rag:         (r.status === 'Rejected' ? 'red' : 'amber') as 'red' | 'amber',
    })),
  }
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function getManufacturingHomepageFromDB(): Promise<ManufacturingHomepageData> {
  const [kpis, pipelineStages, delayedWOs, mfgSubStages, materialShortages, downtime, attendance, completingThisWeek, qualityRejections] =
    await Promise.all([
      getKpis(),
      getPipelineStages(),
      getDelayedWOs(),
      getMfgSubStages(),
      getMaterialShortages(),
      getDowntime(),
      getAttendance(),
      getCompletingThisWeek(),
      getQualityRejections(),
    ])

  const delayedCount = kpis.delayedRed.value
  return {
    syncedAt:   new Date().toISOString(),
    erpBaseUrl: erpBaseUrl(),
    alert:      delayedCount > 0 ? `${delayedCount} work order${delayedCount > 1 ? 's are' : ' is'} past the delivery date` : '',
    kpis,
    pipelineStages,
    delayedWOs,
    mfgSubStages,
    materialShortages,
    downtime,
    attendance,
    completingThisWeek,
    qualityRejections,
  }
}
