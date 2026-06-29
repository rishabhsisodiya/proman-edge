import fs from 'fs'
import path from 'path'
import type { KpiTrend } from '../types/manufacturing'

const SNAPSHOT_FILE = path.resolve(__dirname, '../../data/kpi_snapshots.json')
const MAX_DAYS = 90

export interface KpiSnapshot {
  date: string          // YYYY-MM-DD
  activeWOs: number
  completedToday: number
  delayed: number
  atRisk: number
  onHold: number
}

export function readSnapshots(): KpiSnapshot[] {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return []
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8')
    return JSON.parse(raw) as KpiSnapshot[]
  } catch {
    return []
  }
}

export function writeSnapshot(snapshot: KpiSnapshot): void {
  try {
    const snapshots = readSnapshots()
    const filtered = snapshots.filter(s => s.date !== snapshot.date)
    filtered.push(snapshot)
    filtered.sort((a, b) => a.date.localeCompare(b.date))
    const pruned = filtered.slice(-MAX_DAYS)
    const tmp = SNAPSHOT_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(pruned, null, 2), 'utf8')
    fs.renameSync(tmp, SNAPSHOT_FILE)
  } catch (err) {
    console.error('[kpiSnapshot] write failed:', err)
  }
}

export function getYesterdaySnapshot(): KpiSnapshot | null {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().slice(0, 10)
  const snapshots = readSnapshots()
  return snapshots.find(s => s.date === dateStr) ?? null
}

// dir and colour semantics differ per card:
// active: up=good(green), down=neutral, completed: up=good, delayed/atRisk/onHold: up=bad(red)
type CardKey = 'activeWOs' | 'completedToday' | 'delayed' | 'atRisk' | 'onHold'

const TREND_LABELS: Record<CardKey, string> = {
  activeWOs:      'vs yesterday',
  completedToday: 'vs yesterday',
  delayed:        'needs action',
  atRisk:         'monitor',
  onHold:         'active holds',
}

export function computeTrend(
  todayVal: number,
  yesterdayVal: number,
  card: CardKey,
): KpiTrend {
  const diff = todayVal - yesterdayVal
  const absDiff = Math.abs(diff)
  const label = TREND_LABELS[card]

  if (diff === 0) {
    return { dir: 'neutral', delta: `– 0`, label }
  }

  const isIncreaseBad = card === 'delayed' || card === 'atRisk' || card === 'onHold'

  if (diff > 0) {
    return {
      dir: isIncreaseBad ? 'down' : 'up',
      delta: `▲ ${absDiff}`,
      label,
    }
  } else {
    return {
      dir: isIncreaseBad ? 'up' : 'down',
      delta: `▼ ${absDiff}`,
      label,
    }
  }
}
