import { cacheGet, cacheSet } from '../cache/redis'
import { salesHomepageMock } from '../mock/sales'
import type { SalesHomepageData, KPI, FunnelStage, QuotationDetail } from '../types/sales'
import { frappeGet, frappePost } from '../lib/frappeClient'
import { rupees, statusToDirection, statusToColor, dateLabel } from '../lib/format'
import type {
  FrappeEnvelope,
  FrappeKpiTile,
  FrappeFunnelStage,
  FrappeTargetGaugeSummary,
  FrappeFollowupItem,
  FrappeExpiringItem,
  FrappeLostItem,
  FrappeRegionItem,
  FrappeCustomerItem,
  FrappeAlertItem,
  FrappeQuotationDetail,
} from '../types/frappe'

const useMock = () => process.env.USE_MOCK !== 'false'
const CACHE_TTL = 300 // 5 minutes

const SALES         = 'proman_edge.api.sales'
const SALES_ACTIONS = 'proman_edge.api.actions'

// companies: ['PISPL'] | ['PISPL','ACE','PROMAX'] | all 5
// division param is used for single-site filtering; multi-company → 'all' aggregated server-side
export async function getSalesHomepage(companies: string[]): Promise<SalesHomepageData> {
  const cacheKey = `sales:homepage:${companies.sort().join(',')}`

  const cached = await cacheGet<SalesHomepageData>(cacheKey)
  if (cached) return cached

  let data: SalesHomepageData

  if (useMock()) {
    data = { ...salesHomepageMock, syncedAt: new Date().toISOString() }
  } else if (companies.length === 1) {
    data = await fetchFromERPNext('all') // division=all scoped to the single site's credentials
  } else {
    // Multiple companies — for now use 'all' division which Frappe aggregates on its side
    // TODO: fan out to separate Frappe sites when each company has its own site credentials
    data = await fetchFromERPNext('all')
  }

  await cacheSet(cacheKey, data, CACHE_TTL)
  return data
}

async function fetchFromERPNext(division: string): Promise<SalesHomepageData> {
  const div = division as 'all' | 'aggregate' | 'im' | 'bmh'

  // Fire all 13 endpoints in parallel — ~500ms total vs 5s+ sequential
  const [
    kpiStrip,
    funnelMtd, funnelQtr, funnelYtd,
    enquiriesMtd, enquiriesQtr, enquiriesYtd,
    ordersMtd,   ordersQtr,   ordersYtd,
    revenueMtd,  revenueQtr,  revenueYtd,
    targetGauge,
    followups,
    expiring,
    lostOrders,
    regionPipeline,
    topCustomers,
    alerts,
  ] = await Promise.all([
    frappeGet<FrappeEnvelope<{ tiles: number }, FrappeKpiTile>>(`${SALES}.get_kpi_strip`, { period: 'mtd', division: div }),

    frappeGet<FrappeEnvelope<Record<string,unknown>, FrappeFunnelStage>>(`${SALES}.get_sales_funnel`, { period: 'mtd', division: div }),
    frappeGet<FrappeEnvelope<Record<string,unknown>, FrappeFunnelStage>>(`${SALES}.get_sales_funnel`, { period: 'qtr', division: div }),
    frappeGet<FrappeEnvelope<Record<string,unknown>, FrappeFunnelStage>>(`${SALES}.get_sales_funnel`, { period: 'ytd', division: div }),

    frappeGet<FrappeEnvelope>(`${SALES}.get_enquiries`,      { period: 'mtd', division: div }),
    frappeGet<FrappeEnvelope>(`${SALES}.get_enquiries`,      { period: 'qtr', division: div }),
    frappeGet<FrappeEnvelope>(`${SALES}.get_enquiries`,      { period: 'ytd', division: div }),

    frappeGet<FrappeEnvelope>(`${SALES}.get_orders_confirmed`, { period: 'mtd', division: div }),
    frappeGet<FrappeEnvelope>(`${SALES}.get_orders_confirmed`, { period: 'qtr', division: div }),
    frappeGet<FrappeEnvelope>(`${SALES}.get_orders_confirmed`, { period: 'ytd', division: div }),

    frappeGet<FrappeEnvelope>(`${SALES}.get_revenue`,        { period: 'mtd', division: div }),
    frappeGet<FrappeEnvelope>(`${SALES}.get_revenue`,        { period: 'qtr', division: div }),
    frappeGet<FrappeEnvelope>(`${SALES}.get_revenue`,        { period: 'ytd', division: div }),

    frappeGet<FrappeEnvelope<FrappeTargetGaugeSummary>>(`${SALES}.get_target_gauge`, { division: div }),

    frappeGet<FrappeEnvelope<{ count: number; overdue_red: number }, FrappeFollowupItem>>(`${SALES}.get_followups_due`, { division: div, limit: 50 }),
    frappeGet<FrappeEnvelope<{ count: number }, FrappeExpiringItem>>(`${SALES}.get_quotations_expiring`, { division: div, limit: 50 }),
    frappeGet<FrappeEnvelope<{ lost_count: number; lost_value: number }, FrappeLostItem>>(`${SALES}.get_lost_orders`, { period: 'mtd', division: div, limit: 20 }),

    frappeGet<FrappeEnvelope<Record<string,unknown>, FrappeRegionItem>>(`${SALES}.get_regional_pipeline`, { division: div }),
    frappeGet<FrappeEnvelope<Record<string,unknown>, FrappeCustomerItem>>(`${SALES}.get_top_customers`, { period: 'mtd', division: div, limit: 10 }),
    frappeGet<FrappeEnvelope<{ count: number; red: number; amber: number }, FrappeAlertItem>>(`${SALES}.get_alerts`, { division: div }),
  ])

  /* ── transform KPI strip ── */
  const kpiTiles = kpiStrip.items
  function tileToKpi(tile: FrappeKpiTile): KPI {
    return {
      label:     tile.label,
      value:     tile.unit === 'count'    ? String(tile.value)
               : tile.unit === 'percent' ? `${Math.round(tile.value)}%`
               : rupees(tile.value),
      delta:     tile.sub,
      direction: statusToDirection(tile.status),
      color:     statusToColor(tile.status, tile.key),
      spark:     tile.trend_series.map(t => t.value),
    }
  }

  function periodTiles(
    enq: FrappeEnvelope,
    ord: FrappeEnvelope,
    rev: FrappeEnvelope,
    period: 'mtd' | 'qtr' | 'ytd',
  ): KPI[] {
    const label = { mtd: 'MTD', qtr: 'Quarter', ytd: 'YTD' }[period]
    const enqS  = enq.summary  as { count: number; trend: number; status: string }
    const ordS  = ord.summary  as { count: number; value: number; trend: number; status: string }
    const revS  = rev.summary  as { value: number; target_value: number; achieved_pct: number; status: string }
    return [
      { label: `Enquiries ${label}`,   value: String(enqS.count),       delta: enq.meta['sub'] as string ?? '', direction: statusToDirection(enqS.status), color: '#1A4A8A', spark: enq.items.map((i: unknown) => (i as {value:number}).value) },
      { label: 'Quotations open',       value: String(kpiTiles.find(t => t.key === 'quotations_open')?.value ?? 0), delta: 'open quotations', direction: 'neu', color: '#854F0B', spark: kpiTiles.find(t => t.key === 'quotations_open')?.trend_series.map(t => t.value) ?? [] },
      { label: `Orders confirmed ${label}`, value: String(ordS.count), delta: ord.meta['sub'] as string ?? '', direction: statusToDirection(ordS.status), color: '#1A6B3A', spark: ord.items.map((i: unknown) => (i as {value:number}).value) },
      { label: 'Conversion',            value: '—',                      delta: 'calculated from funnel', direction: 'neu', color: '#A32D2D', spark: [] },
      { label: `Revenue ${label}`,      value: rupees(revS.value),       delta: revS.achieved_pct != null ? `${revS.achieved_pct.toFixed(1)}% of target` : 'vs target', direction: statusToDirection(revS.status), color: '#C2410C', spark: rev.items.map((i: unknown) => (i as {value:number}).value) },
    ]
  }

  /* ── transform funnel ── */
  function transformFunnel(env: FrappeEnvelope<Record<string,unknown>, FrappeFunnelStage>): FunnelStage[] {
    return env.items.map((s, i) => ({
      stage:      s.stage,
      count:      s.count,
      value:      (s.value ?? 0) / 10_000_000, // raw rupees → Cr
      avgDays:    null,                          // ERPNext doesn't store stage timestamps
      isStalling: s.bottleneck,
      dropPct:    i === 0 ? null : (s.dropoff_pct ?? null),
    }))
  }

  /* ── transform target gauge → decision band ── */
  const g = targetGauge.summary
  const gItems = targetGauge.items as { month: string; value: number }[]

  /* ── transform follow-ups ── */
  const followUpItems = followups.items.map((r, i) => ({
    quotation:   r.quotation_id,
    customer:    r.customer_name,
    product:     r.product ?? '—',
    value:       rupees(r.value),
    daysOverdue: r.days_since_followup,
    validTill:   dateLabel(r.valid_till),
    owner:       r.owner_name ?? r.owner,
    region:      '—',   // not returned by get_followups_due; add territory filter later
    stage:       '—',   // not returned; use get_quotation_detail for full detail
    severity:    r.level,
    rank:        i + 1,
  }))

  /* ── transform expiring quotations ── */
  const expiringItems = expiring.items.map(r => ({
    quotation: r.quotation_id,
    customer:  r.customer_name,
    value:     rupees(r.value),
    validTill: r.expires_in_days === 0 ? 'Today' : dateLabel(r.valid_till),
  }))

  /* ── transform lost orders ── */
  const lostItems = lostOrders.items.map(r => ({
    quotation:  r.quotation_id,
    customer:   r.customer_name,
    value:      rupees(r.value),
    lostReason: r.lost_reason ?? '—',
    stageLost:  '—', // not returned by get_lost_orders
  }))

  // Summarise lost reasons from items
  const reasonMap: Record<string, { deals: number; total: number }> = {}
  lostOrders.items.forEach(r => {
    const reason = r.lost_reason ?? 'Unknown'
    if (!reasonMap[reason]) reasonMap[reason] = { deals: 0, total: 0 }
    reasonMap[reason].deals++
    reasonMap[reason].total += r.value
  })
  const totalLost = lostOrders.items.reduce((s, r) => s + r.value, 0)
  const lostSummary = Object.entries(reasonMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 4)
    .map(([reason, d]) => ({
      reason,
      deals: d.deals,
      value: rupees(d.total),
      pct:   totalLost > 0 ? Math.round((d.total / totalLost) * 100) : 0,
    }))

  /* ── transform region pipeline ── */
  const regionItems = regionPipeline.items.map(r => ({
    region:      r.region,
    quoted:      Math.round(r.quoted / 100_000),      // raw → L
    negotiation: Math.round(r.negotiation / 100_000),
    won:         Math.round(r.won / 100_000),
  }))

  /* ── transform top customers ── */
  const maxValue = Math.max(...topCustomers.items.map(c => c.value_mtd), 1)
  const customerItems = topCustomers.items.map((c, i) => ({
    rank:      i + 1,
    name:      c.customer,
    value:     rupees(c.value_mtd),
    orders:    c.orders_mtd,
    barPct:    Math.round((c.value_mtd / maxValue) * 100),
    trend:     'eq' as 'up' | 'dn' | 'eq', // trend vs last month not in this endpoint
    trendVs:   '',
    ytdValue:  rupees(c.value_ytd),
    lastOrder: dateLabel(c.last_order_date),
  }))

  /* ── transform alerts → attention strip ── */
  const attentionItems = alerts.items.slice(0, 3).map(a => ({
    type:     (a.key === 'expiring_today' ? 'expiring' : a.key === 'followup_overdue' ? 'followup' : 'conversion') as 'expiring' | 'followup' | 'conversion',
    count:    String(a.count),
    title:    a.title,
    sub:      a.detail,
    severity: a.severity,
  }))

  return {
    syncedAt:   new Date().toISOString(),
    erpBaseUrl: (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, ''),

    decisionBand: {
      day:          g.day_of_month,
      daysInMonth:  g.days_in_month,
      targetCr:     g.target / 10_000_000,
      achievedCr:   g.achieved / 10_000_000,
      gapCr:        parseFloat(((g.target - g.achieved) / 10_000_000).toFixed(2)),
      coverageX:    0,   // requires pipeline total — add when get_regional_pipeline total is used
      weightedCr:   0,   // requires stage win-rates — add when confirmed
      verdict:      g.status === 'green' ? 'ok' : g.status === 'red' ? 'bad' : 'warn',
      verdictLabel: g.pace_text,
      headline:     g.achieved_pct >= g.pace_pct ? 'Ahead of pace' : 'Needs attention',
      subtext:      `At day ${g.day_of_month ?? '?'} of ${g.days_in_month ?? '?'}, ${rupees(g.achieved ?? 0)} of the ${rupees(g.target ?? 0)} target is booked. ${g.vs_pace_pct != null ? `${g.vs_pace_pct.toFixed(1)}% ${(g.achieved_pct ?? 0) >= (g.pace_pct ?? 0) ? 'ahead of' : 'behind'} linear pace.` : 'Pace data unavailable.'}`,
    },

    attention: attentionItems,

    kpis: kpiTiles.map(tileToKpi),

    kpisAll: {
      month: periodTiles(enquiriesMtd, ordersMtd, revenueMtd, 'mtd'),
      q:     periodTiles(enquiriesQtr, ordersQtr, revenueQtr, 'qtr'),
      ytd:   periodTiles(enquiriesYtd, ordersYtd, revenueYtd, 'ytd'),
    },

    funnel: {
      month: transformFunnel(funnelMtd),
      q:     transformFunnel(funnelQtr),
      ytd:   transformFunnel(funnelYtd),
    },

    revenueTarget: {
      pct:           g.achieved_pct,
      achieved:      parseFloat((g.achieved / 10_000_000).toFixed(2)),
      target:        parseFloat((g.target  / 10_000_000).toFixed(2)),
      daysRemaining: g.days_left,
      trend: gItems.map(i => ({
        month: i.month.slice(5, 7),  // "2026-01" → "01" (show short month label)
        value: parseFloat((i.value / 10_000_000).toFixed(2)),
      })),
    },

    followUps:      followUpItems,
    followUpsTotal: followups.summary?.count ?? followUpItems.length,

    expiringQuotations: expiringItems,

    lostDeals: {
      summary: lostSummary,
      deals:   lostItems,
    },

    topCustomers: customerItems,

    regionPipeline: regionItems,

    // productRevenue and deliveryRisk not yet in ERPNext API — using mock fallback
    productRevenue: [],
    deliveryRisk:   [],
  }
}

// Merge results from multiple sites (Finance Head / MD)
function mergeResults(results: SalesHomepageData[]): SalesHomepageData {
  // TODO: sum KPIs, union queues, dedupe customers once multi-site is confirmed
  return { ...results[0], syncedAt: new Date().toISOString() }
}

// Export for write actions (extend quotation, convert to SO)
export { mergeResults }

// ── quotation detail ──────────────────────────────────────────────────────

export async function getQuotationDetail(quotation: string): Promise<QuotationDetail> {
  if (useMock()) {
    const fu = salesHomepageMock.followUps.find(f => f.quotation === quotation)
    return {
      quotation,
      customer:  fu?.customer ?? 'Unknown Customer',
      product:   fu?.product  ?? '—',
      value:     fu?.value    ?? '—',
      status:    fu?.stage    ?? 'Quoted',
      region:    fu?.region   ?? '—',
      quotedDate: `${fu?.daysOverdue ?? 5}d ago`,
      validTill:  fu?.validTill ?? '—',
      daysOverdue: fu?.daysOverdue ?? 0,
      severity:   fu?.severity ?? 'amber',
      owner:      fu?.owner ?? '—',
      contact:    null,
      timeline: [
        { date: `${fu?.daysOverdue ?? 5}d ago`, event: `Quotation sent — ${fu?.product ?? 'product'} for ${fu?.customer ?? 'customer'}` },
        { date: `${(fu?.daysOverdue ?? 5) - 2}d ago`, event: 'Technical clarification document shared' },
        { date: `${(fu?.daysOverdue ?? 5) - 1}d ago`, event: 'Customer requested revised delivery schedule' },
        { date: 'No activity since', event: 'Awaiting customer response' },
      ],
      suggestedNextAction: fu && fu.daysOverdue > 7
        ? `No contact in ${fu.daysOverdue} days. Call ${fu.owner} contact today and extend validity before ${fu.validTill}.`
        : `Follow up to keep momentum before validity lapses on ${fu?.validTill ?? '—'}.`,
      deepLink: `https://pispl.frappe.cloud/app/quotation/${quotation}`,
    }
  }

  // get_quotation_detail returns standard envelope; deal is in items[0]
  const env = await frappeGet<FrappeEnvelope<Record<string,unknown>, FrappeQuotationDetail>>(
    `${SALES}.get_quotation_detail`,
    { quotation },
  )
  const raw = env.items[0]
  if (!raw) throw new Error(`Quotation ${quotation} not found`)
  return {
    quotation:   raw.quotation_id,
    customer:    raw.customer_name,
    product:     raw.product ?? '—',
    value:       rupees(raw.value),
    status:      raw.status,
    region:      raw.territory ?? '—',
    quotedDate:  dateLabel(raw.quoted_date),
    validTill:   dateLabel(raw.valid_till),
    daysOverdue: raw.days_since_followup,
    severity:    raw.level,
    owner:       raw.owner_name ?? raw.owner,
    contact:     raw.contact,
    timeline:    raw.timeline.map((t: { date: string; event: string }) => ({ date: dateLabel(t.date), event: t.event })),
    suggestedNextAction: raw.suggested_next_action,
    deepLink:    env.deep_link ?? raw.deep_link ?? `https://pispl.frappe.cloud/app/quotation/${quotation}`,
  }
}

// ── write actions ─────────────────────────────────────────────────────────

// opts: pass nothing for server default (+7 days), or { days } or { valid_till }
export async function extendQuotation(
  quotation: string,
  opts: { valid_till?: string; days?: number } = {},
): Promise<{ ok: boolean; validTill?: string }> {
  if (useMock()) {
    const d = new Date(); d.setDate(d.getDate() + (opts.days ?? 7))
    return { ok: true, validTill: opts.valid_till ?? d.toISOString().slice(0, 10) }
  }
  const env = await frappePost<FrappeEnvelope<{ valid_till?: string }, unknown>>(
    `${SALES_ACTIONS}.extend_quotation`,
    { quotation, ...opts },
  )
  return { ok: true, validTill: env.summary.valid_till }
}

export async function convertToSalesOrder(
  quotation: string,
  deliveryDate?: string,
): Promise<{ ok: boolean; salesOrder?: string }> {
  if (useMock()) return { ok: true, salesOrder: 'SAL-SO-2026-MOCK' }

  const body: Record<string, unknown> = { source_name: quotation }
  if (deliveryDate) body.delivery_date = deliveryDate

  const result = await frappePost<Record<string, unknown>>(
    'erpnext.selling.doctype.quotation.quotation.make_sales_order',
    body,
  )
  // make_sales_order returns an unsaved doc — set delivery_date on header + all items then save
  const doc = result as Record<string, unknown>
  if (deliveryDate) {
    doc.delivery_date = deliveryDate
    const items = doc.items as Record<string, unknown>[] | undefined
    if (Array.isArray(items)) {
      items.forEach(item => { item.delivery_date = deliveryDate })
    }
  }
  const saved = await frappePost<Record<string, unknown>>('frappe.client.save', { doc })
  const soName = saved?.name as string | undefined
  return { ok: true, salesOrder: soName }
}
