import fs from 'fs'
import path from 'path'
import type { SparkPoint } from '../types/procurement'

const SNAPSHOT_FILE = path.resolve(__dirname, '../../data/procurement_kpi_snapshots.json')
const MAX_DAYS = 90

export interface ProcurementKpiSnapshot {
  date:          string   // YYYY-MM-DD
  prsPending:    number
  openPOs:       number
  overduePOs:    number
  criticalStock: number
  spendMtd:      number
}

export function readProcurementSnapshots(): ProcurementKpiSnapshot[] {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return []
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8')
    return JSON.parse(raw) as ProcurementKpiSnapshot[]
  } catch {
    return []
  }
}

export function writeProcurementSnapshot(snapshot: ProcurementKpiSnapshot): void {
  try {
    const snapshots = readProcurementSnapshots()
    const filtered  = snapshots.filter(s => s.date !== snapshot.date)
    filtered.push(snapshot)
    filtered.sort((a, b) => a.date.localeCompare(b.date))
    const pruned = filtered.slice(-MAX_DAYS)
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true })
    const tmp = SNAPSHOT_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(pruned, null, 2), 'utf8')
    fs.renameSync(tmp, SNAPSHOT_FILE)
  } catch (err) {
    console.error('[procurementSnapshot] write failed:', err)
  }
}

// Returns last 6 monthly snapshots as spark points for a given KPI field.
// One point per calendar month (last entry per month), labelled "Jan", "Feb" etc.
export function getProcurementSparkline(
  field: keyof Omit<ProcurementKpiSnapshot, 'date'>,
): SparkPoint[] {
  const snapshots = readProcurementSnapshots()
  if (!snapshots.length) return []

  // Group by YYYY-MM, keep the last snapshot per month
  const byMonth = new Map<string, ProcurementKpiSnapshot>()
  for (const s of snapshots) {
    const monthKey = s.date.slice(0, 7) // YYYY-MM
    byMonth.set(monthKey, s)
  }

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, s]) => ({
      label: MONTH_LABELS[parseInt(key.slice(5, 7), 10) - 1],
      value: s[field] as number,
    }))
}
