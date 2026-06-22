import { query } from '../db'
import { manufacturingHomepageMock } from '../mock/manufacturing'
import type { ManufacturingHomepageData, DelayedWO, CompletingWO } from '../types/manufacturing'

const erpBaseUrl = () => (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '')

function ragColor(daysOver: number): 'red' | 'amber' | 'green' {
  return daysOver > 7 ? 'red' : daysOver > 0 ? 'amber' : 'green'
}

async function getKpis() {
  const [active, completedToday, delayed, atRisk, onHold] = await Promise.all([
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status IN ('In Process','Not Started')`,
    ),
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status = 'Completed'
         AND modified >= CURDATE()`,
    ),
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status IN ('In Process','Not Started')
         AND planned_end_date < CURDATE()`,
    ),
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status IN ('In Process','Not Started')
         AND planned_end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
         AND planned_end_date >= CURDATE()`,
    ),
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
       WHERE docstatus = 1 AND status = 'Stopped'`,
    ),
  ])

  return {
    activeWOs:      { value: active[0].cnt,        sub: 'Work orders in progress' },
    completedToday: { value: completedToday[0].cnt, sub: 'Completed today' },
    delayedRed:     { value: delayed[0].cnt,        sub: 'Past planned end date' },
    atRiskAmber:    { value: atRisk[0].cnt,         sub: 'Due in 3 days' },
    onHold:         { value: onHold[0].cnt,         sub: 'Stopped / on hold' },
  }
}

async function getDelayedWOs(): Promise<DelayedWO[]> {
  const rows = await query<{
    name: string; sales_order: string; production_item: string
    planned_end_date: string; status: string
  }>(
    `SELECT name, sales_order, production_item, planned_end_date, status
     FROM \`tabWork Order\`
     WHERE docstatus = 1 AND status IN ('In Process','Not Started')
       AND planned_end_date < CURDATE()
     ORDER BY planned_end_date ASC
     LIMIT 20`,
  )

  return rows.map(r => {
    const daysOver = Math.floor((Date.now() - new Date(r.planned_end_date).getTime()) / 86_400_000)
    const rag = ragColor(daysOver)
    return {
      wo:       r.name,
      customer: r.sales_order || '—',
      stage:    r.status,
      daysOver,
      rag,
      label:    `${daysOver}d over`,
    }
  })
}

async function getCompletingThisWeek(): Promise<CompletingWO[]> {
  const rows = await query<{
    name: string; sales_order: string; production_item: string
    planned_end_date: string; status: string; qty: number; produced_qty: number
  }>(
    `SELECT name, sales_order, production_item, planned_end_date, status, qty, produced_qty
     FROM \`tabWork Order\`
     WHERE docstatus = 1 AND status IN ('In Process','Not Started')
       AND planned_end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
     ORDER BY planned_end_date ASC
     LIMIT 10`,
  )

  return rows.map(r => {
    const completion = r.qty > 0 ? Math.round((r.produced_qty / r.qty) * 100) : 0
    const daysLeft = Math.ceil((new Date(r.planned_end_date).getTime() - Date.now()) / 86_400_000)
    return {
      wo:         r.name,
      customer:   r.sales_order || '—',
      product:    r.production_item,
      due:        r.planned_end_date,
      stage:      r.status,
      completion,
      rag:        daysLeft <= 1 ? 'red' : daysLeft <= 3 ? 'amber' : 'green',
    }
  })
}

async function getAttendance() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await query<{ department: string; status: string; cnt: number }>(
      `SELECT department, status, COUNT(*) AS cnt
       FROM tabAttendance
       WHERE attendance_date = ? AND docstatus = 1
       GROUP BY department, status`,
      [today],
    )

    const deptMap: Record<string, { present: number; total: number }> = {}
    let present = 0, total = 0
    rows.forEach(r => {
      if (!deptMap[r.department]) deptMap[r.department] = { present: 0, total: 0 }
      deptMap[r.department].total += r.cnt
      total += r.cnt
      if (r.status === 'Present') {
        deptMap[r.department].present += r.cnt
        present += r.cnt
      }
    })

    const byDept = Object.entries(deptMap).map(([dept, d]) => ({ dept, ...d }))
    const absent = total - present
    return { present, absent, onLeave: 0, pct: total > 0 ? Math.round((present / total) * 100) : 0, byDept }
  } catch {
    // HR module not installed — return mock attendance
    return manufacturingHomepageMock.attendance
  }
}

async function getMaterialShortages() {
  const rows = await query<{
    wo: string; item_code: string; required_qty: number
    transferred_qty: number; planned_end_date: string
  }>(
    `SELECT wo.name AS wo, woi.item_code, woi.required_qty, woi.transferred_qty,
            wo.planned_end_date
     FROM \`tabWork Order Item\` woi
     JOIN \`tabWork Order\` wo ON wo.name = woi.parent
     WHERE wo.docstatus = 1 AND wo.status IN ('In Process','Not Started')
       AND woi.required_qty > woi.transferred_qty
     ORDER BY wo.planned_end_date ASC
     LIMIT 10`,
  )

  return rows.map(r => {
    const short = r.required_qty - r.transferred_qty
    const daysLeft = Math.ceil((new Date(r.planned_end_date).getTime() - Date.now()) / 86_400_000)
    return {
      wo:    r.wo,
      item:  r.item_code,
      short: `${short.toFixed(0)} units`,
      eta:   r.planned_end_date,
      rag:   (daysLeft <= 1 ? 'red' : daysLeft <= 3 ? 'amber' : 'green') as 'red' | 'amber' | 'green',
    }
  })
}

export async function getManufacturingHomepageFromDB(): Promise<ManufacturingHomepageData> {
  const [kpis, delayedWOs, completingThisWeek, attendance, materialShortages] = await Promise.all([
    getKpis(),
    getDelayedWOs(),
    getCompletingThisWeek(),
    getAttendance(),
    getMaterialShortages(),
  ])

  return {
    syncedAt:   new Date().toISOString(),
    erpBaseUrl: erpBaseUrl(),
    alert:      delayedWOs.length > 0 ? `${delayedWOs.length} work orders are past their planned end date` : '',
    kpis,
    // Pipeline stages require custom stage tracking — using mock until Pipeline Stage DocType is built
    pipelineStages:  manufacturingHomepageMock.pipelineStages,
    mfgSubStages:    manufacturingHomepageMock.mfgSubStages,
    downtime:        manufacturingHomepageMock.downtime,
    delayedWOs,
    materialShortages,
    attendance,
    completingThisWeek,
  }
}
