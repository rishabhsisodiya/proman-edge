/** Raw Frappe API types — shapes returned by proman_edge.api.sales.* */

export type Period   = 'mtd' | 'qtr' | 'ytd'
export type Division = 'all' | 'aggregate' | 'im' | 'bmh'

export interface FrappeEnvelope<TSummary = Record<string, unknown>, TItem = unknown> {
  ok: boolean
  widget: string
  as_of: string
  period: Period | null
  filters_applied: Record<string, unknown>
  summary: TSummary
  items: TItem[]
  total_count: number
  deep_link: string | null
  alert: unknown | null
  meta: Record<string, unknown>
  error?: { code: string; message: string }
}

/* ── per-endpoint item shapes ── */

export interface FrappeKpiTile {
  key: string
  label: string
  value: number
  unit: string
  sub: string
  status: 'green' | 'amber' | 'red' | 'neutral'
  period?: string
  has_toggle?: boolean
  trend_series: { label: string; value: number }[]
  pipeline_value?: number
  deep_link: string | null
}

export interface FrappeFunnelStage {
  stage: string
  count: number
  value: number | null
  dropoff_pct: number | null
  bottleneck: boolean
}

export interface FrappeTargetGaugeSummary {
  achieved: number
  target: number
  achieved_pct: number
  status: string
  day_of_month: number
  days_in_month: number
  days_left: number
  pace_pct: number
  vs_pace_pct: number
  pace_text: string
}

export interface FrappeFollowupItem {
  quotation_id: string
  customer_name: string
  product: string
  value: number
  quoted_date: string
  valid_till: string
  days_since_followup: number
  level: 'red' | 'amber'
  owner: string
  owner_name: string
  deep_link: string
}

export interface FrappeExpiringItem {
  quotation_id: string
  customer_name: string
  product: string
  value: number
  valid_till: string
  expires_in_days: number
  deep_link: string
}

export interface FrappeLostItem {
  quotation_id: string
  customer_name: string
  value: number
  lost_reason: string
  deep_link: string
}

export interface FrappeRegionItem {
  region: string
  quoted: number
  negotiation: number
  won: number
  total: number
}

export interface FrappeCustomerItem {
  customer: string
  orders_mtd: number
  value_mtd: number
  value_ytd: number
  last_order_date: string
  deep_link: string
  orders_link: string
}

export interface FrappeAlertItem {
  key: string
  severity: 'red' | 'amber'
  count: number
  title: string
  detail: string
  widget: string
  deep_link: string
}

export interface FrappeQuotationDetail {
  quotation_id: string
  customer_name: string
  product: string
  value: number
  status: string
  territory: string
  quoted_date: string
  valid_till: string
  days_since_followup: number
  level: 'red' | 'amber'
  owner: string
  owner_name: string
  contact: string | null
  timeline: { date: string; event: string }[]
  suggested_next_action: string
  deep_link: string
}
