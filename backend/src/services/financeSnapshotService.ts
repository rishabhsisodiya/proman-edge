import fs from 'fs'
import path from 'path'
import type { SparkPoint } from '../types/finance'

const SNAPSHOT_FILE = path.resolve(__dirname, '../../data/finance_kpi_snapshots.json')
const MAX_DAYS = 400

export interface FinanceKpiSnapshot {
  date:               string   // YYYY-MM-DD
  cashBank:           number
  overdueReceivables: number
  revenueMtd:         number   // that calendar month's revenue (only meaningful for month-end dates)
  gstLiability:       number   // that calendar month's GST output liability
  payablesDue7d:      number
}

export function readFinanceSnapshots(): FinanceKpiSnapshot[] {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return []
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8')
    return JSON.parse(raw) as FinanceKpiSnapshot[]
  } catch {
    return []
  }
}

export function writeFinanceSnapshot(snapshot: FinanceKpiSnapshot): void {
  try {
    const snapshots = readFinanceSnapshots()
    const filtered = snapshots.filter(s => s.date !== snapshot.date)
    filtered.push(snapshot)
    filtered.sort((a, b) => a.date.localeCompare(b.date))
    const pruned = filtered.slice(-MAX_DAYS)
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true })
    const tmp = SNAPSHOT_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(pruned, null, 2), 'utf8')
    fs.renameSync(tmp, SNAPSHOT_FILE)
  } catch (err) {
    console.error('[financeSnapshot] write failed:', err)
  }
}

export function writeFinanceSnapshots(snapshots: FinanceKpiSnapshot[]): void {
  for (const s of snapshots) writeFinanceSnapshot(s)
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Returns last 6 monthly snapshots as spark points for a given KPI field.
// One point per calendar month (last entry per month).
export function getFinanceSparkline(field: keyof Omit<FinanceKpiSnapshot, 'date'>): SparkPoint[] {
  const snapshots = readFinanceSnapshots()
  if (!snapshots.length) return []

  const byMonth = new Map<string, FinanceKpiSnapshot>()
  for (const s of snapshots) {
    byMonth.set(s.date.slice(0, 7), s)  // YYYY-MM, keep last snapshot per month
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, s]) => ({
      label: MONTH_LABELS[parseInt(key.slice(5, 7), 10) - 1],
      value: s[field] as number,
    }))
}
