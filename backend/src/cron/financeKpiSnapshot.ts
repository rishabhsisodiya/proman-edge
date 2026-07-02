import cron from 'node-cron'
import {
  getCompanies, getCashBankTotalForCompanies, getOverdueTotalForCompanies,
  getRevenueTotalForCompanies, getGstTotalForCompanies, getPayablesDueTotalForCompanies,
} from '../services/financeServiceDB'
import { writeFinanceSnapshot, writeFinanceSnapshots, readFinanceSnapshots, type FinanceKpiSnapshot } from '../services/financeSnapshotService'

function pad(n: number) { return String(n).padStart(2, '0') }
function iso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function lastDayOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }

async function snapshotAsOf(companies: string[], asOf: Date, monthStartDate: Date): Promise<FinanceKpiSnapshot> {
  const asOfIso = iso(asOf)
  const [cashBank, overdue, revenue, gst, payables] = await Promise.all([
    getCashBankTotalForCompanies(companies, asOfIso),
    getOverdueTotalForCompanies(companies, asOfIso),
    getRevenueTotalForCompanies(companies, iso(monthStartDate), asOfIso),
    getGstTotalForCompanies(companies, iso(monthStartDate), asOfIso),
    getPayablesDueTotalForCompanies(companies, asOfIso, 7),
  ])
  return {
    date: asOfIso,
    cashBank,
    overdueReceivables: overdue.total,
    revenueMtd: revenue,
    gstLiability: gst,
    payablesDue7d: payables.total,
  }
}

// Real historical backfill — GL Entry / Payment Ledger Entry / Sales Invoice are
// immutable ledgers, so "as of a past date" queries return genuine historical
// values (not fabricated placeholders) for the last 6 months, seeded once.
export async function backfillFinanceSnapshots() {
  try {
    const companies = await getCompanies()
    const today = new Date()
    const points: { asOf: Date; monthStart: Date }[] = []

    for (let i = 5; i >= 1; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1)
      points.push({ asOf: lastDayOfMonth(monthDate), monthStart: monthStart(monthDate) })
    }
    points.push({ asOf: today, monthStart: monthStart(today) })  // current month, partial (MTD)

    const snapshots = await Promise.all(points.map(p => snapshotAsOf(companies, p.asOf, p.monthStart)))
    writeFinanceSnapshots(snapshots)
    console.log(`[financeSnapshot] Backfilled ${snapshots.length} historical monthly snapshots`)
  } catch (err) {
    console.error('[financeSnapshot] Backfill failed:', err)
  }
}

export async function captureFinanceSnapshot() {
  try {
    const companies = await getCompanies()
    const today = new Date()
    const snapshot = await snapshotAsOf(companies, today, monthStart(today))
    writeFinanceSnapshot(snapshot)
    console.log(`[financeSnapshot] Snapshot saved for ${snapshot.date}`)
  } catch (err) {
    console.error('[financeSnapshot] Failed to capture snapshot:', err)
  }
}

export function registerFinanceKpiSnapshotCron() {
  const schedule = process.env.KPI_SNAPSHOT_CRON ?? '50 23 * * *'
  cron.schedule(schedule, captureFinanceSnapshot, { timezone: 'Asia/Kolkata' })
  console.log(`[financeSnapshot] Cron registered — schedule: "${schedule}" IST`)

  if (readFinanceSnapshots().length === 0) {
    console.log('[financeSnapshot] No snapshot data found — backfilling 6 months now…')
    backfillFinanceSnapshots().catch(err =>
      console.error('[financeSnapshot] Backfill failed:', err),
    )
  }
}
