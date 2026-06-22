import { query } from '../db'
import { salesHomepageMock } from '../mock/sales'
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
    { stage: 'Order Won',   count: orders[0].cnt, value: orders[0].val / 10_000_000 },
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
  const enqSparkSql = period === 'ytd'
    ? `SELECT DATE_FORMAT(creation,'%Y') AS m, COUNT(*) AS val FROM tabLead WHERE docstatus=0 AND creation >= DATE_SUB(CURDATE(), INTERVAL 3 YEAR) GROUP BY m ORDER BY m`
    : period === 'qtr'
    ? `SELECT CONCAT(YEAR(creation),'-Q',QUARTER(creation)) AS m, COUNT(*) AS val FROM tabLead WHERE docstatus=0 AND creation >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY m ORDER BY m`
    : `SELECT DATE_FORMAT(creation,'%Y-%m') AS m, COUNT(*) AS val FROM tabLead WHERE docstatus=0 AND creation >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY m ORDER BY m`

  // Spark shows order VALUE trend (₹ Cr) so SFMT[2]=fmtRupee lines up with the bars
  const ordSparkSql = period === 'ytd'
    ? `SELECT DATE_FORMAT(transaction_date,'%Y') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 3 YEAR) GROUP BY m ORDER BY m`
    : period === 'qtr'
    ? `SELECT CONCAT(YEAR(transaction_date),'-Q',QUARTER(transaction_date)) AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY m ORDER BY m`
    : `SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY m ORDER BY m`

  const revSparkSql = period === 'ytd'
    ? `SELECT DATE_FORMAT(posting_date,'%Y') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Invoice\` WHERE docstatus=1 AND posting_date >= DATE_SUB(CURDATE(), INTERVAL 3 YEAR) GROUP BY m ORDER BY m`
    : period === 'qtr'
    ? `SELECT CONCAT(YEAR(posting_date),'-Q',QUARTER(posting_date)) AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Invoice\` WHERE docstatus=1 AND posting_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) GROUP BY m ORDER BY m`
    : `SELECT DATE_FORMAT(posting_date,'%Y-%m') AS m, CAST(COALESCE(SUM(grand_total),0) AS CHAR) AS val FROM \`tabSales Invoice\` WHERE docstatus=1 AND posting_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY m ORDER BY m`

  const now2 = new Date()
  const fy = now2.getMonth() >= 3
    ? `${now2.getFullYear()}-${now2.getFullYear() + 1}`
    : `${now2.getFullYear() - 1}-${now2.getFullYear()}`

  const [enqRows, ordRows, revRows, openQuotRows, enqSpark, ordSpark, quotSpark, convSparkRaw, revSparkRaw, targetRows] = await Promise.all([
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
    query<{ m: string; val: number }>(enqSparkSql),
    query<{ m: string; val: number }>(ordSparkSql),
    // Open quotations trend (always monthly — no toggle on this card)
    query<{ m: string; val: number }>(
      `SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS m, COUNT(*) AS val
       FROM tabQuotation WHERE docstatus=1 AND status='Open'
         AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY m ORDER BY m`,
    ),
    // Conversion rate sparkline (always monthly)
    query<{ m: string; val: number }>(
      `SELECT o.m, ROUND(COALESCE(o.cnt / NULLIF(l.cnt, 0) * 100, 0)) AS val
       FROM (
         SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS m, COUNT(*) AS cnt
         FROM \`tabSales Order\` WHERE docstatus=1
           AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
         GROUP BY m
       ) o
       LEFT JOIN (
         SELECT DATE_FORMAT(creation,'%Y-%m') AS m, COUNT(*) AS cnt
         FROM tabLead WHERE docstatus=0
           AND creation >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
         GROUP BY m
       ) l ON l.m = o.m
       ORDER BY o.m`,
    ),
    query<{ m: string; val: string }>(revSparkSql),
    query<{ target_amount: number }>(
      `SELECT td.target_amount FROM \`tabTarget Detail\` td
       JOIN \`tabSales Person\` sp ON sp.name = td.parent
       WHERE td.fiscal_year = ? LIMIT 1`,
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
    (ordSpark as { m: string; val: string }[]).map(r => ({ m: r.m, val: parseFloat(r.val) })),
    sparkKeys,
  ).map(v => parseFloat((v / 10_000_000).toFixed(2)))
  const revSparkPadded  = padSeries(
    (revSparkRaw as { m: string; val: string }[]).map(r => ({ m: r.m, val: parseFloat(r.val) })),
    sparkKeys,
  ).map(v => parseFloat((v / 10_000_000).toFixed(2)))

  // Conversion: Leads → Orders (current period)
  const conv = enq > 0 ? Math.round((ord / enq) * 100) : 0

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

  const [prevLeadRows, prevOrdRows] = await Promise.all([
    query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM tabLead WHERE docstatus=0 AND creation BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`, [prevFrom, prevTo]),
    query<{ cnt: number; val: number }>(`SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS val FROM \`tabSales Order\` WHERE docstatus=1 AND transaction_date BETWEEN ? AND ?`, [prevFrom, prevTo]),
  ])

  // Conversion delta — uses same period label as enquiries
  const prevConv = prevLeadRows[0].cnt > 0 ? Math.round((prevOrdRows[0].cnt / prevLeadRows[0].cnt) * 100) : 0
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
  const rows = await query<{ m: string; val: number }>(
    `SELECT DATE_FORMAT(posting_date, '%Y-%m') AS m,
            COALESCE(SUM(grand_total), 0) AS val
     FROM \`tabSales Invoice\`
     WHERE docstatus = 1
       AND posting_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY m ORDER BY m`,
  )
  return rows.map(r => ({ month: monthLabel(r.m + '-01'), value: parseFloat((r.val / 10_000_000).toFixed(2)) }))
}

// ── Revenue target ──────────────────────────────────────────────────────────

async function getRevenueTarget(company: string): Promise<SalesHomepageData['revenueTarget']> {
  const now = new Date()
  const fy = now.getMonth() >= 3
    ? `${now.getFullYear()}-${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}-${now.getFullYear()}`

  const targetRows = await query<{ target_amount: number }>(
    `SELECT td.target_amount
     FROM \`tabTarget Detail\` td
     JOIN \`tabSales Person\` sp ON sp.name = td.parent
     WHERE td.fiscal_year = ?
     LIMIT 1`,
    [fy],
  )

  // Annual target → divide by 12 for monthly target
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
  const rows = await query<{
    name: string; customer_name: string; grand_total: number
    valid_till: Date | string; owner: string; transaction_date: string
  }>(
    `SELECT name, customer_name, grand_total, valid_till, owner, transaction_date
     FROM tabQuotation
     WHERE docstatus = 1 AND status = 'Open'
       AND valid_till < DATE_ADD(CURDATE(), INTERVAL 30 DAY)
     ORDER BY valid_till ASC
     LIMIT 50`,
  )

  return rows.map((r, i) => {
    const days = Math.floor((new Date(r.valid_till).getTime() - Date.now()) / 86_400_000)
    return {
      quotation:   r.name,
      customer:    r.customer_name,
      product:     '—',
      value:       rupees(r.grand_total),
      daysOverdue: Math.abs(days),
      validTill:   friendlyDate(r.valid_till),
      owner:       r.owner,
      region:      '—',
      stage:       'Quoted',
      severity:    (days < 0 ? 'red' : days <= 3 ? 'amber' : 'red') as 'red' | 'amber',
      rank:        i + 1,
    }
  })
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
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const day = now.getDate()

  const targetRows = await query<{ target_amount: number }>(
    `SELECT td.target_amount FROM \`tabTarget Detail\` td
     JOIN \`tabSales Person\` sp ON sp.name = td.parent
     LIMIT 1`,
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
    followUps,
    expiringQuotations,
    topCustomers,
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
    followUps,
    expiringQuotations,
    lostDeals: salesHomepageMock.lostDeals,       // not yet in DB query — use mock
    topCustomers,
    regionPipeline: salesHomepageMock.regionPipeline, // territory aggregation — use mock
    productRevenue: [],
    deliveryRisk:   [],
  }
}
