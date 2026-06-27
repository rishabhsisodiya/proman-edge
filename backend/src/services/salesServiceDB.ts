import { query } from '../db'
import type { SalesHomepageData, KPI, FunnelStage } from '../types/sales'
import { rupees } from '../lib/format'

const erpBaseUrl = () => (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '')

// ── helpers ────────────────────────────────────────────────────────────────

function periodBounds(period: 'mtd' | 'qtr' | 'ytd'): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${y}-${pad(m + 1)}-${pad(now.getDate())}`

  if (period === 'mtd') {
    return { from: `${y}-${pad(m + 1)}-01`, to: today }
  }
  if (period === 'ytd') {
    return { from: `${y}-01-01`, to: today } // Calendar year to date
  }
  // qtr
  const qStart = m < 3 ? 0 : m < 6 ? 3 : m < 9 ? 6 : 9
  return { from: `${y}-${pad(qStart + 1)}-01`, to: today }
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-IN', { month: 'short' })
}

// Converts DB date (Date object, DATE string, or DATETIME/ISO string) → clean display label
function friendlyDate(raw: Date | string): string {
  let date: Date
  if (raw instanceof Date) {
    // mysql2 returns DATE columns as JS Date objects in UTC midnight
    date = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate())
  } else {
    const dateStr = String(raw).slice(0, 10)
    date = new Date(dateStr + 'T00:00:00')
  }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff <= 6) return date.toLocaleString('en-IN', { weekday: 'short' })
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short' })
}

// ── funnel ─────────────────────────────────────────────────────────────────

async function getFunnel(company: string, period: 'mtd' | 'qtr' | 'ytd'): Promise<FunnelStage[]> {
  const { from, to } = periodBounds(period)

  const [leads, opps, negs, quots, orders] = await Promise.all([
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM tabLead
       WHERE docstatus = 0
         AND creation BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`,
      [from, to],
    ),
    query<{ cnt: number; val: number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(opportunity_amount),0) AS val
       FROM tabOpportunity
       WHERE docstatus = 0
         AND transaction_date BETWEEN ? AND ?`,
      [from, to],
    ),
    query<{ cnt: number; val: number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(opportunity_amount),0) AS val
       FROM tabOpportunity
       WHERE docstatus = 0
         AND sales_stage = 'Negotiation/Review'
         AND transaction_date BETWEEN ? AND ?`,
      [from, to],
    ),
    query<{ cnt: number; val: number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS val
       FROM tabQuotation
       WHERE docstatus = 1 AND status != 'Cancelled'
         AND transaction_date BETWEEN ? AND ?`,
      [from, to],
    ),
    query<{ cnt: number; val: number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS val
       FROM \`tabSales Order\`
       WHERE docstatus = 1
         AND transaction_date BETWEEN ? AND ?`,
      [from, to],
    ),
  ])

  const stages = [
    { stage: 'Enquiry',     count: leads[0].cnt,  value: null },
    { stage: 'Qualified',   count: opps[0].cnt,   value: opps[0].val / 10_000_000 },
    { stage: 'Quoted',      count: quots[0].cnt,  value: quots[0].val / 10_000_000 },
    { stage: 'Negotiation', count: negs[0].cnt,   value: negs[0].val / 10_000_000 },
    { stage: 'Orders',      count: orders[0].cnt, value: orders[0].val / 10_000_000 },
  ]

  return stages.map((s, i) => {
    const prev = i === 0 ? null : stages[i - 1]
    // Only compute drop if prev stage has count — avoids Infinity/NaN
    const dropPct = prev === null ? null
      : prev.count > 0 ? Math.round((1 - s.count / prev.count) * 100)
      : null
    return {
      stage:      s.stage,
      count:      s.count,
      value:      s.value,
      avgDays:    null,
      isStalling: false,
      dropPct,
    }
  })
}

// ── KPIs ───────────────────────────────────────────────────────────────────

async function getMonthlyTrend(sql: string, params: (string | number | null)[] = []): Promise<number[]> {
  const rows = await query<{ m: string; val: number }>(sql, params)
  return rows.map(r => r.val)
}

// Build a full padded series of exactly `count` slots keyed by label, filling missing with 0
function padSeries(rows: { m: string; val: number }[], keys: string[]): number[] {
  const map = new Map(rows.map(r => [r.m, Number(r.val)]))
  return keys.map(k => map.get(k) ?? 0)
}

// Generate the last N month keys in 'YYYY-MM' format ending this month
function monthKeys(n: number): string[] {
  const now = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1) + i, 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  })
}

// Generate the last N quarter keys in 'YYYY-QN' format ending this quarter
function quarterKeys(n: number): string[] {
  const now  = new Date()
  const absQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)
  return Array.from({ length: n }, (_, i) => {
    const q    = absQ - (n - 1) + i
    const year = Math.floor(q / 4)
    const qi   = q % 4 + 1   // QUARTER() returns 1-4
    return `${year}-Q${qi}`
  })
}

// Generate the last N year keys in 'YYYY' format ending this year
function yearKeys(n: number): string[] {
  const y = new Date().getFullYear()
  return Array.from({ length: n }, (_, i) => String(y - (n - 1) + i))
}

async function getKpis(company: string, period: 'mtd' | 'qtr' | 'ytd'): Promise<KPI[]> {
  const { from, to } = periodBounds(period)
  const label = { mtd: 'MTD', qtr: 'Quarter', ytd: 'YTD' }[period]

  // Sparkline SQL differs by period: monthly=6mo, qtr=4 quarters, ytd=3 years
  // YTD: cap each year to the same day-of-year as today so all bars are comparable
  const enqSparkSql = period === 'ytd'
    ? `SELECT DATE_FORMAT(creation,'%Y') AS m, COUNT(*) AS val FROM tabLead WHERE docstatus=0 AND creation >= DATE_SUB(CURDATE(), INTERVAL 3 YEAR) AND DATE_FORMAT(creation,'%m-%d') <= DATE_FORMAT(CURDATE(),'%m-%d') GROUP BY m ORDER BY m`
    : period === 'qtr'
    ? `SELECT CONCAT(YEAR(creation),'-Q',QUARTER(creation)) AS m, COUNT(*) AS val FROM tabLead WHERE docstatus=0 AND creation >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY m ORDER BY m`
    : `SELECT DATE_FORMAT(creation,'%Y-%m') AS m, COUNT(*) AS val FROM tabLead WHERE docstatus=0 AND creation >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY m ORDER BY m`

  // Spark shows order VALUE trend (₹ Cr) — YTD capped to same day-of-year
  const ordSparkSql = period === 'ytd'
    ? `SELECT DATE_FORMAT(transaction_date,'%Y') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 3 YEAR) AND DATE_FORMAT(transaction_date,'%m-%d') <= DATE_FORMAT(CURDATE(),'%m-%d') GROUP BY m ORDER BY m`
    : period === 'qtr'
    ? `SELECT CONCAT(YEAR(transaction_date),'-Q',QUARTER(transaction_date)) AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY m ORDER BY m`
    : `SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY m ORDER BY m`

  const revSparkSql = period === 'ytd'
    ? `SELECT DATE_FORMAT(posting_date,'%Y') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Invoice\` WHERE docstatus=1 AND posting_date >= DATE_SUB(CURDATE(), INTERVAL 3 YEAR) AND DATE_FORMAT(posting_date,'%m-%d') <= DATE_FORMAT(CURDATE(),'%m-%d') GROUP BY m ORDER BY m`
    : period === 'qtr'
    ? `SELECT CONCAT(YEAR(posting_date),'-Q',QUARTER(posting_date)) AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Invoice\` WHERE docstatus=1 AND posting_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY m ORDER BY m`
    : `SELECT DATE_FORMAT(posting_date,'%Y-%m') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Invoice\` WHERE docstatus=1 AND posting_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY m ORDER BY m`

  const now2 = new Date()
  const fy = now2.getMonth() >= 3
    ? `${now2.getFullYear()}-${now2.getFullYear() + 1}`
    : `${now2.getFullYear() - 1}-${now2.getFullYear()}`

  const [enqRows, ordRows, revRows, openQuotRows, convRows, enqSpark, ordSpark, quotSpark, convSparkRaw, revSparkRaw, targetRows] = await Promise.all([
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM tabLead
       WHERE docstatus = 0
         AND creation BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`,
      [from, to],
    ),
    query<{ cnt: number; val: number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS val
       FROM \`tabSales Order\`
       WHERE docstatus = 1
         AND transaction_date BETWEEN ? AND ?`,
      [from, to],
    ),
    query<{ val: number }>(
      `SELECT COALESCE(SUM(grand_total),0) AS val
       FROM \`tabSales Invoice\`
       WHERE docstatus = 1
         AND posting_date BETWEEN ? AND ?`,
      [from, to],
    ),
    query<{ cnt: number; pipeline: number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS pipeline
       FROM tabQuotation
       WHERE docstatus = 1 AND status = 'Open'`,
      [],
    ),
    // Conversion rate for current period: % of quotations with status = Ordered
    query<{ total: number; converted: number }>(
      `SELECT COUNT(*) AS total,
              SUM(status = 'Ordered') AS converted
       FROM tabQuotation
       WHERE docstatus = 1
         AND transaction_date BETWEEN ? AND ?`,
      [from, to],
    ),
    query<{ m: string; val: number }>(enqSparkSql),
    query<{ m: string; val: number }>(ordSparkSql),
    // Open quotations trend (always monthly — no toggle on this card)
    query<{ m: string; val: number }>(
      `SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS m, COUNT(*) AS val
       FROM tabQuotation WHERE docstatus=1 AND status='Open'
         AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY m ORDER BY m`,
    ),
    // Conversion rate sparkline: % of quotations (by submit month) that have status = Ordered
    query<{ m: string; val: number }>(
      `SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS m,
              ROUND(SUM(status = 'Ordered') / COUNT(*) * 100) AS val
       FROM tabQuotation
       WHERE docstatus = 1
         AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY m
       ORDER BY m`,
    ),
    query<{ m: string; val: string }>(revSparkSql),
    query<{ target_amount: number }>(
      `SELECT COALESCE(SUM(td.target_amount), 0) AS target_amount
       FROM \`tabTarget Detail\` td
       JOIN \`tabSales Person\` sp ON sp.name = td.parent
       WHERE td.fiscal_year = ? AND sp.is_group = 0`,
      [fy],
    ),
  ])

  const enq  = enqRows[0].cnt
  const ord  = ordRows[0].cnt
  const rev  = revRows[0].val
  const openQ = openQuotRows[0].cnt
  const openQPipeline = openQuotRows[0].pipeline

  // Pad spark series so missing periods fill with 0 and labels align correctly
  const sparkKeys = period === 'ytd' ? yearKeys(3) : period === 'qtr' ? quarterKeys(4) : monthKeys(6)
  const enqSparkPadded  = padSeries(enqSpark as { m: string; val: number }[], sparkKeys)
  const ordSparkPadded  = padSeries(
    (ordSpark as unknown as { m: string; val: string }[]).map(r => ({ m: r.m, val: parseFloat(r.val) })),
    sparkKeys,
  ).map(v => v / 10_000_000)
  const revSparkPadded  = padSeries(
    (revSparkRaw as { m: string; val: string }[]).map(r => ({ m: r.m, val: parseFloat(r.val) })),
    sparkKeys,
  ).map(v => v / 10_000_000)

  // Conversion: Quotations → Orders (current period)
  const conv = convRows[0].total > 0 ? Math.round((convRows[0].converted / convRows[0].total) * 100) : 0

  // Previous period bounds — differs per period type
  const pad = (n: number) => String(n).padStart(2, '0')
  const td  = new Date()
  let prevFrom: string
  let prevTo:   string
  if (period === 'ytd') {
    // Same Jan 1 → same day last year (calendar YoY)
    prevFrom = `${td.getFullYear() - 1}-01-01`
    prevTo   = `${td.getFullYear() - 1}-${pad(td.getMonth() + 1)}-${pad(td.getDate())}`
  } else if (period === 'qtr') {
    const curQStart = new Date(td.getFullYear(), Math.floor(td.getMonth() / 3) * 3, 1)
    const prevQStart = new Date(curQStart.getFullYear(), curQStart.getMonth() - 3, 1)
    const prevQEnd   = new Date(curQStart.getFullYear(), curQStart.getMonth(), 0)
    prevFrom = `${prevQStart.getFullYear()}-${pad(prevQStart.getMonth() + 1)}-01`
    prevTo   = `${prevQEnd.getFullYear()}-${pad(prevQEnd.getMonth() + 1)}-${pad(prevQEnd.getDate())}`
  } else {
    // MTD → same day range in prior month (apples-to-apples: 1st–today vs 1st–same-day last month)
    const prevStart = new Date(td.getFullYear(), td.getMonth() - 1, 1)
    const prevSameDay = new Date(td.getFullYear(), td.getMonth() - 1, td.getDate())
    prevFrom = `${prevStart.getFullYear()}-${pad(prevStart.getMonth() + 1)}-01`
    prevTo   = `${prevSameDay.getFullYear()}-${pad(prevSameDay.getMonth() + 1)}-${pad(prevSameDay.getDate())}`
  }

  const [prevLeadRows, prevOrdRows, prevConvRows] = await Promise.all([
    query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM tabLead WHERE docstatus=0 AND creation BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`, [prevFrom, prevTo]),
    query<{ cnt: number; val: number }>(`SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date BETWEEN ? AND ?`, [prevFrom, prevTo]),
    query<{ total: number; converted: number }>(`SELECT COUNT(*) AS total, SUM(status = 'Ordered') AS converted FROM tabQuotation WHERE docstatus=1 AND transaction_date BETWEEN ? AND ?`, [prevFrom, prevTo]),
  ])

  // Conversion delta: % of quotations with status=Ordered (same as current period formula)
  const prevConv = prevConvRows[0].total > 0 ? Math.round((prevConvRows[0].converted / prevConvRows[0].total) * 100) : 0
  const convDiff  = conv - prevConv
  const periodLabel = period === 'mtd' ? 'last month' : period === 'qtr' ? 'last quarter' : 'last year'
  const convDelta = convDiff === 0 ? `flat vs ${periodLabel}` : `${convDiff > 0 ? '+' : ''}${convDiff}% vs ${periodLabel}`
  const convDir: 'up' | 'dn' | 'neu' = convDiff > 0 ? 'up' : convDiff < 0 ? 'dn' : 'neu'

  // Enquiries vs correct previous period
  const prevEnq   = prevLeadRows[0].cnt
  const enqDiff   = enq - prevEnq
  const enqDelta  = enqDiff === 0 ? `flat vs ${periodLabel}` : `${enqDiff > 0 ? '+' : ''}${enqDiff} vs ${periodLabel}`
  const enqDir: 'up' | 'dn' | 'neu' = enqDiff > 0 ? 'up' : enqDiff < 0 ? 'dn' : 'neu'

  const mKeys = monthKeys(6)
  const quotSparkPadded = padSeries(quotSpark as { m: string; val: number }[], mKeys)
  const convSparkPadded = padSeries(convSparkRaw as { m: string; val: number }[], mKeys)

  const annualTarget = targetRows[0]?.target_amount ?? 0
  const periodTarget = period === 'mtd' ? annualTarget / 12
    : period === 'qtr' ? annualTarget / 4
    : annualTarget
  const revTargetCr = parseFloat((periodTarget / 10_000_000).toFixed(1))
  const revDelta = periodTarget > 0 ? `vs ${rupees(periodTarget)} target` : 'invoiced'
  const revDir: 'up' | 'dn' | 'neu' = periodTarget === 0 ? 'neu' : rev >= periodTarget ? 'up' : 'dn'

  return [
    { label: `Enquiries ${label}`,        value: String(enq),       delta: enqDelta,      direction: enqDir, color: '#1A4A8A', spark: enqSparkPadded },
    { label: 'Quotations open',           value: String(openQ),     delta: rupees(openQPipeline) + ' pipeline', direction: 'neu', color: '#854F0B', spark: quotSparkPadded },
    { label: `Orders confirmed ${label}`, value: String(ord),       delta: rupees(ordRows[0].val) + ' value', direction: ordRows[0].val >= prevOrdRows[0].val ? 'up' : 'dn', color: '#1A6B3A', spark: ordSparkPadded },
    { label: 'Conversion',                value: `${conv}%`,        delta: convDelta,              direction: convDir, color: '#A32D2D', spark: convSparkPadded },
    { label: `Revenue ${label}`,          value: rupees(rev),       delta: revDelta,               direction: revDir, color: '#C2410C', spark: revSparkPadded },
  ]
}

// ── Revenue sparkline ───────────────────────────────────────────────────────

async function getRevenueSparkline(company: string): Promise<{ month: string; value: number }[]> {
  const mKeys = monthKeys(6)
  const from6 = mKeys[0] + '-01'
  const rows = await query<{ m: string; val: number }>(
    `SELECT DATE_FORMAT(posting_date, '%Y-%m') AS m,
            COALESCE(SUM(grand_total), 0) AS val
     FROM \`tabSales Invoice\`
     WHERE docstatus = 1
       AND posting_date >= ?
     GROUP BY m ORDER BY m`,
    [from6],
  )
  const padded = padSeries(rows as { m: string; val: number }[], mKeys)
  return mKeys.map((k, i) => ({ month: monthLabel(k + '-01'), value: parseFloat((padded[i] / 10_000_000).toFixed(2)) }))
}

// ── Revenue target ──────────────────────────────────────────────────────────

async function getRevenueTarget(company: string): Promise<SalesHomepageData['revenueTarget']> {
  const now = new Date()
  const fy = now.getMonth() >= 3
    ? `${now.getFullYear()}-${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}-${now.getFullYear()}`

  const targetRows = await query<{ target_amount: number }>(
    `SELECT COALESCE(SUM(td.target_amount), 0) AS target_amount
     FROM \`tabTarget Detail\` td
     JOIN \`tabSales Person\` sp ON sp.name = td.parent
     WHERE td.fiscal_year = ?
       AND sp.is_group = 0`,
    [fy],
  )

  // Annual target (sum of all sales persons) → divide by 12 for monthly target
  const annualTarget = targetRows[0]?.target_amount ?? 0
  const monthlyTarget = annualTarget / 12

  const achievedRows = await query<{ val: number }>(
    `SELECT COALESCE(SUM(grand_total),0) AS val
     FROM \`tabSales Invoice\`
     WHERE docstatus = 1
       AND YEAR(posting_date) = ? AND MONTH(posting_date) = ?`,
    [now.getFullYear(), now.getMonth() + 1],
  )
  const achieved = achievedRows[0].val

  const sparkline = await getRevenueSparkline(company)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = daysInMonth - now.getDate()

  return {
    pct:           monthlyTarget > 0 ? Math.round((achieved / monthlyTarget) * 100) : 0,
    achieved:      parseFloat((achieved / 10_000_000).toFixed(2)),
    target:        parseFloat((monthlyTarget / 10_000_000).toFixed(2)),
    daysRemaining,
    trend: sparkline,
  }
}

// ── Expiring quotations ─────────────────────────────────────────────────────

async function getExpiringQuotations(company: string) {
  const rows = await query<{ name: string; customer_name: string; grand_total: number; valid_till: Date | string }>(
    `SELECT name, customer_name, grand_total, valid_till
     FROM tabQuotation
     WHERE docstatus = 1 AND status = 'Open'
       AND valid_till BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
     ORDER BY valid_till ASC`,
  )
  return rows.map(r => ({
    quotation: r.name,
    customer:  r.customer_name,
    value:     rupees(r.grand_total),
    validTill: friendlyDate(r.valid_till),
  }))
}

// ── Follow-up queue ─────────────────────────────────────────────────────────

async function getFollowUps(company: string) {
  const [rows, countRows] = await Promise.all([
    query<{
      name: string; customer_name: string; base_grand_total: number
      valid_till: Date | string; owner: string; transaction_date: string
      product: string; days_since_followup: number
    }>(
      `SELECT q.name, q.customer_name, q.base_grand_total, q.transaction_date, q.valid_till, q.owner,
              (SELECT item_name FROM \`tabQuotation Item\` WHERE parent=q.name ORDER BY idx LIMIT 1) AS product,
              DATEDIFF(CURDATE(), COALESCE(MAX(c.communication_date), q.transaction_date)) AS days_since_followup
       FROM \`tabQuotation\` q
       LEFT JOIN \`tabCommunication\` c ON c.reference_doctype='Quotation' AND c.reference_name=q.name
       WHERE q.docstatus=1 AND q.status='Open'
       GROUP BY q.name, q.customer_name, q.base_grand_total, q.transaction_date, q.valid_till, q.owner
       ORDER BY days_since_followup DESC
       LIMIT 10`,
    ),
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM tabQuotation
       WHERE docstatus = 1 AND status = 'Open'`,
    ),
  ])

  const totalOpen = countRows[0]?.cnt ?? 0

  const items = rows.map((r, i) => {
    const days = Number(r.days_since_followup)
    return {
      quotation:   r.name,
      customer:    r.customer_name,
      product:     r.product ?? '—',
      value:       rupees(r.base_grand_total),
      daysOverdue: days,
      validTill:   friendlyDate(r.valid_till),
      owner:       r.owner,
      region:      '—',
      stage:       'Quoted',
      severity:    (days > 7 ? 'red' : days >= 4 ? 'amber' : 'green') as 'red' | 'amber' | 'green',
      rank:        i + 1,
    }
  })

  return { items, totalOpen }
}

// ── Lost deals ──────────────────────────────────────────────────────────────

async function getLostDeals(company: string) {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const rows = await query<{ name: string; customer: string; grand_total: number; reason: string }>(
    `SELECT q.name, COALESCE(q.customer, q.party_name, q.title, '—') AS customer,
            q.grand_total,
            COALESCE(lr.order_lost_reason, 'Not specified') AS reason
     FROM tabQuotation q
     LEFT JOIN \`tabQuotation Lost Reason\` lr ON lr.parent = q.name
     WHERE q.docstatus = 1 AND q.status = 'Lost'
       AND q.modified >= ?
     ORDER BY q.modified DESC
     LIMIT 20`,
    [from],
  )

  const deals = rows.map(r => ({
    quotation:  r.name,
    customer:   r.customer ?? '—',
    value:      rupees(r.grand_total),
    lostReason: r.reason,
    stageLost:  'Quotation',
  }))

  // Summary by reason
  const reasonMap = new Map<string, { deals: number; value: number }>()
  rows.forEach(r => {
    const key = r.reason
    const cur = reasonMap.get(key) ?? { deals: 0, value: 0 }
    reasonMap.set(key, { deals: cur.deals + 1, value: cur.value + r.grand_total })
  })
  const totalVal = rows.reduce((s, r) => s + r.grand_total, 0)
  const summary = Array.from(reasonMap.entries()).map(([reason, v]) => ({
    reason,
    deals: v.deals,
    value: rupees(v.value),
    pct:   totalVal > 0 ? Math.round((v.value / totalVal) * 100) : 0,
  }))

  return { deals, summary }
}

// ── Region pipeline ─────────────────────────────────────────────────────────

async function getRegionPipeline(_company: string) {
  const fyStart = new Date().getMonth() >= 3
    ? `${new Date().getFullYear()}-04-01`
    : `${new Date().getFullYear() - 1}-04-01`

  const [quotedRows, negotiationRows, wonRows] = await Promise.all([
    query<{ territory: string; amount: number }>(
      `SELECT territory, COALESCE(SUM(base_grand_total), 0) AS amount
       FROM \`tabQuotation\`
       WHERE docstatus = 1 AND status = 'Open'
         AND territory IS NOT NULL AND territory != '' AND territory != 'All Territories'
       GROUP BY territory`,
    ),
    query<{ territory: string; amount: number }>(
      `SELECT territory, COALESCE(SUM(opportunity_amount), 0) AS amount
       FROM \`tabOpportunity\`
       WHERE sales_stage = 'Negotiation/Review'
         AND status IN ('Open', 'Quotation', 'Replied')
         AND territory IS NOT NULL AND territory != '' AND territory != 'All Territories'
       GROUP BY territory`,
    ),
    query<{ territory: string; amount: number }>(
      `SELECT territory, COALESCE(SUM(base_grand_total), 0) AS amount
       FROM \`tabSales Order\`
       WHERE docstatus = 1
         AND transaction_date BETWEEN ? AND CURDATE()
         AND territory IS NOT NULL AND territory != '' AND territory != 'All Territories'
       GROUP BY territory`,
      [fyStart],
    ),
  ])

  // Merge by territory
  const map: Record<string, { quoted: number; negotiation: number; won: number }> = {}
  const ensure = (t: string) => { if (!map[t]) map[t] = { quoted: 0, negotiation: 0, won: 0 } }

  quotedRows.forEach(r      => { ensure(r.territory); map[r.territory].quoted      += Number(r.amount) })
  negotiationRows.forEach(r => { ensure(r.territory); map[r.territory].negotiation += Number(r.amount) })
  wonRows.forEach(r         => { ensure(r.territory); map[r.territory].won         += Number(r.amount) })

  return Object.entries(map)
    .map(([region, v]) => ({
      region,
      quoted:      Math.round(v.quoted      / 100000),
      negotiation: Math.round(v.negotiation / 100000),
      won:         Math.round(v.won         / 100000),
    }))
    .sort((a, b) => (b.quoted + b.negotiation + b.won) - (a.quoted + a.negotiation + a.won))
    .slice(0, 9)
}

// ── Top customers ───────────────────────────────────────────────────────────

async function getTopCustomers(company: string) {
  const { from, to } = periodBounds('mtd')
  const rows = await query<{ customer_name: string; cnt: number; val: number }>(
    `SELECT customer_name, COUNT(*) AS cnt, SUM(grand_total) AS val
     FROM \`tabSales Order\`
     WHERE docstatus = 1
       AND transaction_date BETWEEN ? AND ?
     GROUP BY customer_name
     ORDER BY val DESC
     LIMIT 10`,
    [from, to],
  )

  const maxVal = Math.max(...rows.map(r => r.val), 1)
  return rows.map((r, i) => ({
    rank:      i + 1,
    name:      r.customer_name,
    value:     rupees(r.val),
    orders:    r.cnt,
    barPct:    Math.round((r.val / maxVal) * 100),
    trend:     'eq' as const,
    trendVs:   '',
    ytdValue:  rupees(r.val),
    lastOrder: '—',
  }))
}

// ── Alerts ──────────────────────────────────────────────────────────────────

async function getAttention(company: string) {
  const [expToday, overdueFollowup] = await Promise.all([
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM tabQuotation
       WHERE docstatus = 1 AND status = 'Open' AND valid_till = CURDATE()`,
    ),
    query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM tabQuotation
       WHERE docstatus = 1 AND status = 'Open' AND valid_till < CURDATE()`,
    ),
  ])

  const items = []
  if (expToday[0].cnt > 0) {
    items.push({ type: 'expiring' as const, count: String(expToday[0].cnt), title: 'Quotations expiring today', sub: 'Extend or convert before EOD', severity: 'red' as const })
  }
  if (overdueFollowup[0].cnt > 0) {
    items.push({ type: 'followup' as const, count: String(overdueFollowup[0].cnt), title: 'Overdue follow-ups', sub: 'Past validity date', severity: 'amber' as const })
  }
  return items
}

// ── Decision band ───────────────────────────────────────────────────────────

async function getDecisionBand(company: string): Promise<SalesHomepageData['decisionBand']> {
  const now = new Date()
  const fy = now.getMonth() >= 3
    ? `${now.getFullYear()}-${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}-${now.getFullYear()}`
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const day = now.getDate()

  const targetRows = await query<{ target_amount: number }>(
    `SELECT COALESCE(SUM(td.target_amount), 0) AS target_amount
     FROM \`tabTarget Detail\` td
     JOIN \`tabSales Person\` sp ON sp.name = td.parent
     WHERE td.fiscal_year = ? AND sp.is_group = 0`,
    [fy],
  )
  const monthlyTarget = (targetRows[0]?.target_amount ?? 0) / 12

  const achievedRows = await query<{ val: number }>(
    `SELECT COALESCE(SUM(grand_total),0) AS val FROM \`tabSales Invoice\`
     WHERE docstatus = 1
       AND YEAR(posting_date) = ? AND MONTH(posting_date) = ?`,
    [now.getFullYear(), now.getMonth() + 1],
  )
  const achieved = achievedRows[0].val
  const pacePct = Math.round((day / daysInMonth) * 100)
  const achievedPct = monthlyTarget > 0 ? Math.round((achieved / monthlyTarget) * 100) : 0
  const verdict = achievedPct >= pacePct ? 'ok' : achievedPct >= pacePct - 10 ? 'warn' : 'bad'

  return {
    day,
    daysInMonth,
    targetCr:    parseFloat((monthlyTarget / 10_000_000).toFixed(2)),
    achievedCr:  parseFloat((achieved / 10_000_000).toFixed(2)),
    gapCr:       parseFloat(((monthlyTarget - achieved) / 10_000_000).toFixed(2)),
    coverageX:   0,
    weightedCr:  0,
    verdict,
    verdictLabel: verdict === 'ok' ? 'Ahead of pace' : verdict === 'warn' ? 'On track' : 'Behind pace',
    headline:     achievedPct >= pacePct ? 'Ahead of pace' : 'Needs attention',
    subtext:      `Day ${day} of ${daysInMonth}. ${rupees(achieved)} of ${rupees(monthlyTarget)} target booked.`,
  }
}

// ── Main export ─────────────────────────────────────────────────────────────

export async function getSalesHomepageFromDB(company: string): Promise<SalesHomepageData> {
  const [
    decisionBand,
    attention,
    kpisMtd, kpisQtr, kpisYtd,
    funnelMtd, funnelQtr, funnelYtd,
    revenueTarget,
    followUpsResult,
    expiringQuotations,
    topCustomers,
    lostDeals,
    regionPipeline,
  ] = await Promise.all([
    getDecisionBand(company),
    getAttention(company),
    getKpis(company, 'mtd'),
    getKpis(company, 'qtr'),
    getKpis(company, 'ytd'),
    getFunnel(company, 'mtd'),
    getFunnel(company, 'qtr'),
    getFunnel(company, 'ytd'),
    getRevenueTarget(company),
    getFollowUps(company),
    getExpiringQuotations(company),
    getTopCustomers(company),
    getLostDeals(company),
    getRegionPipeline(company),
  ])

  return {
    syncedAt:   new Date().toISOString(),
    erpBaseUrl: erpBaseUrl(),
    decisionBand,
    attention,
    kpis:    kpisMtd,
    kpisAll: { month: kpisMtd, q: kpisQtr, ytd: kpisYtd },
    funnel:  { month: funnelMtd, q: funnelQtr, ytd: funnelYtd },
    revenueTarget,
    followUps: followUpsResult.items,
    followUpsTotal: followUpsResult.totalOpen,
    expiringQuotations,
    lostDeals,
    topCustomers,
    regionPipeline,
    productRevenue: [],
    deliveryRisk:   [],
  }
}
