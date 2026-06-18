/** Format raw rupee values from ERPNext into display strings */

export function rupees(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`
  if (value >= 100_000)    return `₹${Math.round(value / 100_000)}L`
  if (value >= 1_000)      return `₹${Math.round(value / 1_000)}K`
  return `₹${Math.round(value)}`
}

/** ERPNext status string → dashboard direction */
export function statusToDirection(status: string): 'up' | 'dn' | 'neu' {
  if (status === 'green')  return 'up'
  if (status === 'red')    return 'dn'
  return 'neu'
}

/** ERPNext status → KPI accent color */
export function statusToColor(status: string, key: string): string {
  const COLOR_MAP: Record<string, string> = {
    enquiries_mtd:    '#1A4A8A',
    quotations_open:  '#854F0B',
    orders_confirmed: '#1A6B3A',
    conversion_rate:  '#A32D2D',
    revenue_mtd:      '#C2410C',
  }
  return COLOR_MAP[key] ?? '#1A4A8A'
}

/** Convert YYYY-MM-DD to human label like "13 Jun" or "Today" */
export function dateLabel(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
