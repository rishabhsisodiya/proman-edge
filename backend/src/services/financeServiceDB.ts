import { query } from '../db'
import { frappePost } from '../lib/frappeClient'
import { getFinanceSparkline } from './financeSnapshotService'
import { getGmTargetPct } from './financeSettingsService'
import { rupees } from '../lib/format'
import * as siteSheets from './financeSiteSheetService'
import { cacheGet, cacheSet } from '../cache/redis'

const HOMEPAGE_CACHE_TTL = 60 // seconds
import type {
  FinanceHomepageData, CashBank, CashBankAccount, EntityAmountWithTrend,
  Revenue, PeriodStat, Period, SparkPoint,
  OverdueReceivables, ReceivablesAgeing, AgeingBucket, TopDebtor,
  GstLiability, PayablesDue, PayablesInvoiceRow, ActionQueue,
  UnpaidInvoice, JournalEntryPending, FinanceAlert,
  GrossMargin, GrossMarginStat, PoApprovalItem, FinanceActionResult,
} from '../types/finance'

// ── Companies ────────────────────────────────────────────────────────────────
// Reads whatever Company records exist in the reachable DB — no hardcoded
// site list. Today that is PISPL only; the other 4 entities appear here
// automatically once their Company records / DB access exist.

export async function getCompanies(): Promise<string[]> {
  const rows = await query<{ name: string }>('SELECT name FROM `tabCompany`')
  return rows.map(r => r.name)
}

// ── Fiscal period helpers (Indian FY: April – March) ────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }
function iso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function currentFiscalYearRange(): { fyStart: string; fyEnd: string } {
  const now = new Date()
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return { fyStart: `${y}-04-01`, fyEnd: `${y + 1}-03-31` }
}

export function periodRange(period: Period, asOf: Date = new Date()): { start: string; end: string; label: string } {
  const end = iso(asOf)
  const y = asOf.getFullYear()
  const m = asOf.getMonth() // 0-indexed

  if (period === 'M') {
    const start = new Date(y, m, 1)
    return { start: iso(start), end, label: 'MTD' }
  }

  const fy = m >= 3 ? y : y - 1              // FY starts April
  if (period === 'Q') {
    const q = m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4
    const qStartMonth = q === 4 ? 0 : 3 + (q - 1) * 3   // Q4 = Jan(0), else Apr/Jul/Oct
    const qStartYear = q === 4 ? fy + 1 : fy
    const start = new Date(qStartYear, qStartMonth, 1)
    return { start: iso(start), end, label: 'QTD' }
  }

  // Y
  const start = new Date(fy, 3, 1)
  return { start: iso(start), end, label: 'YTD' }
}

// Last `count` calendar periods (M/Q/Y) ending at today — for the trend sparklines that
// follow the M/Q/Y toggle (per Shivam's v3 doc: calendar months/quarters/years, not fiscal).
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function trendBuckets(period: Period, count = 6): { start: string; end: string; label: string }[] {
  const now = new Date()
  const buckets: { start: string; end: string; label: string }[] = []

  if (period === 'M') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const isCurrent = i === 0
      const end = isCurrent ? iso(now) : iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      buckets.push({ start: iso(d), end, label: MONTH_LABELS[d.getMonth()] })
    }
  } else if (period === 'Q') {
    const curQStartMonth = Math.floor(now.getMonth() / 3) * 3
    for (let i = count - 1; i >= 0; i--) {
      const qStart = new Date(now.getFullYear(), curQStartMonth - i * 3, 1)
      const isCurrent = i === 0
      const end = isCurrent ? iso(now) : iso(new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0))
      const q = Math.floor(qStart.getMonth() / 3) + 1
      buckets.push({ start: iso(qStart), end, label: `Q${q}` })
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const yStart = new Date(now.getFullYear() - i, 0, 1)
      const isCurrent = i === 0
      const end = isCurrent ? iso(now) : iso(new Date(yStart.getFullYear(), 11, 31))
      buckets.push({ start: iso(yStart), end, label: String(yStart.getFullYear()) })
    }
  }
  return buckets
}

// ── W-FIN-01 / 06 — Cash & Bank ──────────────────────────────────────────────

export async function getCashBankTotalForCompanies(companies: string[], asOf: string): Promise<number> {
  if (!companies.length) return 0
  const placeholders = companies.map(() => '?').join(',')
  const rows = await query<{ cash_bank: number | null }>(
    `SELECT SUM(gle.debit - gle.credit) AS cash_bank
     FROM \`tabGL Entry\` gle
     JOIN \`tabAccount\` a
         ON a.name = gle.account
        AND a.account_type IN ('Bank', 'Cash')
        AND a.is_group = 0
     WHERE gle.is_cancelled = 0
       AND gle.company IN (${placeholders})
       AND gle.posting_date <= ?`,
    [...companies, asOf],
  )
  return Number(rows[0]?.cash_bank ?? 0)
}

async function getCashBankForEntity(company: string, asOf: string): Promise<number> {
  return getCashBankTotalForCompanies([company], asOf)
}

async function getCashBankAccounts(company: string): Promise<CashBankAccount[]> {
  const rows = await query<{ account: string; account_type: string | null; balance: number }>(
    `SELECT
         a.name AS account, MAX(a.account_type) AS account_type,
         SUM(gle.debit - gle.credit) AS balance
     FROM \`tabAccount\` a
     LEFT JOIN \`tabAccount\` p ON p.name = a.parent_account
     JOIN \`tabGL Entry\` gle
         ON gle.account = a.name AND gle.is_cancelled = 0
        AND gle.company = ? AND gle.posting_date <= CURDATE()
     WHERE a.is_group = 0
       AND (a.account_type IN ('Bank', 'Cash') OR p.account_type IN ('Bank', 'Cash'))
     GROUP BY a.name
     ORDER BY balance DESC`,
    [company],
  )
  return rows.map(r => ({ account: r.account, accountType: r.account_type ?? '—', balance: Number(r.balance) }))
}

async function getCashBank(companies: string[]): Promise<CashBank> {
  const today = iso(new Date())
  const weekAgo = iso(new Date(Date.now() - 7 * 86400_000))

  const perEntity = await Promise.all(companies.map(async c => ({
    entity: c,
    value: await getCashBankForEntity(c, today),
    prev:   await getCashBankForEntity(c, weekAgo),
  })))
  const accountsByEntity: Record<string, CashBankAccount[]> = {}
  await Promise.all(companies.map(async c => { accountsByEntity[c] = await getCashBankAccounts(c) }))

  const byEntity: EntityAmountWithTrend[] = perEntity.map(e => ({
    entity: e.entity, value: e.value, changeVs7d: e.value - e.prev,
  }))

  return {
    total:      perEntity.reduce((s, e) => s + e.value, 0),
    changeVs7d: perEntity.reduce((s, e) => s + (e.value - e.prev), 0),
    byEntity,
    accountsByEntity,
    spark: getFinanceSparkline('cashBank'),
  }
}

// ── W-FIN-02 — Revenue (period-aware: MTD / QTD / YTD) ──────────────────────

export async function getRevenueTotalForCompanies(companies: string[], start: string, end: string): Promise<number> {
  if (!companies.length) return 0
  const placeholders = companies.map(() => '?').join(',')
  const rows = await query<{ revenue: number | null }>(
    `SELECT SUM(base_grand_total) AS revenue
     FROM \`tabSales Invoice\`
     WHERE docstatus = 1 AND company IN (${placeholders})
       AND posting_date BETWEEN ? AND ?`,
    [...companies, start, end],
  )
  return Number(rows[0]?.revenue ?? 0)
}

// Per Shivam's v3 doc — the NEW 6-month trend query adds `is_return = 0` (the original
// W-FIN-02 KPI query above does not have it). Kept as a separate function since only the
// trend was marked as changed — not applied to the KPI value itself unless confirmed.
async function getRevenueTrendTotalForCompanies(companies: string[], start: string, end: string): Promise<number> {
  if (!companies.length) return 0
  const placeholders = companies.map(() => '?').join(',')
  const rows = await query<{ revenue: number | null }>(
    `SELECT SUM(base_grand_total) AS revenue
     FROM \`tabSales Invoice\`
     WHERE docstatus = 1 AND is_return = 0 AND company IN (${placeholders})
       AND posting_date BETWEEN ? AND ?`,
    [...companies, start, end],
  )
  return Number(rows[0]?.revenue ?? 0)
}

async function getPeriodStat(
  companies: string[], period: Period,
  totalFn: (companies: string[], start: string, end: string) => Promise<number>,
): Promise<PeriodStat> {
  const { start, end, label } = periodRange(period)
  const byEntity = await Promise.all(companies.map(async company => ({
    entity: company, value: await totalFn([company], start, end),
  })))
  return { total: byEntity.reduce((s, e) => s + e.value, 0), byEntity, periodLabel: label }
}

// Real per-period trend (last 6 M/Q/Y buckets), reusing the same total function the KPI
// itself uses — so the sparkline is always consistent with the number it sits under.
async function getTrendSpark(
  companies: string[],
  totalFn: (companies: string[], start: string, end: string) => Promise<number>,
): Promise<{ M: SparkPoint[]; Q: SparkPoint[]; Y: SparkPoint[] }> {
  async function oneperiod(period: Period): Promise<SparkPoint[]> {
    const buckets = trendBuckets(period)
    return Promise.all(buckets.map(async b => ({ label: b.label, value: await totalFn(companies, b.start, b.end) })))
  }
  const [M, Q, Y] = await Promise.all([oneperiod('M'), oneperiod('Q'), oneperiod('Y')])
  return { M, Q, Y }
}

async function getRevenue(companies: string[]): Promise<Revenue> {
  const [M, Q, Y, spark] = await Promise.all([
    getPeriodStat(companies, 'M', getRevenueTotalForCompanies),
    getPeriodStat(companies, 'Q', getRevenueTotalForCompanies),
    getPeriodStat(companies, 'Y', getRevenueTotalForCompanies),
    getTrendSpark(companies, getRevenueTrendTotalForCompanies),
  ])
  return { M, Q, Y, targetAvailable: false, spark }
}

// ── W-FIN-03 — Overdue receivables (net, via Payment Ledger Entry) ──────────

interface OverdueRow { overdue_total: number | null; over_90_value: number | null; over_90_count: number | null }

export async function getOverdueTotalForCompanies(
  companies: string[], asOf: string, fyStart?: string,
): Promise<{ total: number; over90: number; over90Count: number }> {
  if (!companies.length) return { total: 0, over90: 0, over90Count: 0 }
  const placeholders = companies.map(() => '?').join(',')
  const rows = await query<OverdueRow>(
    `SELECT
        ROUND(overdue_gross + adv_signed, 2)             AS overdue_total,
        ROUND(GREATEST(over90_gross + adv_signed, 0), 2) AS over_90_value,
        over_90_count
     FROM (
         SELECT
             SUM(CASE WHEN is_inv = 1 AND age > 0  THEN net ELSE 0 END) AS overdue_gross,
             SUM(CASE WHEN is_inv = 1 AND age > 90 THEN net ELSE 0 END) AS over90_gross,
             SUM(CASE WHEN is_inv = 0              THEN net ELSE 0 END) AS adv_signed,
             SUM(CASE WHEN is_inv = 1 AND age > 90 AND net > 0 THEN 1 ELSE 0 END) AS over_90_count
         FROM (
             SELECT
                 (MAX(ple.against_voucher_type) IN ('Sales Invoice', 'Debit Note')) AS is_inv,
                 DATEDIFF(?, MIN(ple.due_date)) AS age,
                 SUM(ple.amount) AS net
             FROM \`tabPayment Ledger Entry\` ple
             WHERE ple.delinked = 0
               AND ple.party_type = 'Customer'
               AND ple.company    IN (${placeholders})
               AND ple.posting_date BETWEEN ? AND ?
             GROUP BY ple.against_voucher_no
             HAVING ABS(net) > 0.01
         ) per_ref
     ) agg`,
    [asOf, ...companies, fyStart ?? '1900-01-01', asOf],
  )
  const r = rows[0]
  return { total: Number(r?.overdue_total ?? 0), over90: Number(r?.over_90_value ?? 0), over90Count: Number(r?.over_90_count ?? 0) }
}

async function getOverdueForEntity(company: string, fyStart: string, fyEnd: string) {
  return getOverdueTotalForCompanies([company], fyEnd, fyStart)
}

async function getOverdueReceivables(companies: string[], fyStart: string, fyEnd: string): Promise<OverdueReceivables> {
  const perEntity = await Promise.all(companies.map(async c => ({ entity: c, ...(await getOverdueForEntity(c, fyStart, fyEnd)) })))
  return {
    total:       perEntity.reduce((s, e) => s + e.total, 0),
    over90:      perEntity.reduce((s, e) => s + e.over90, 0),
    over90Count: perEntity.reduce((s, e) => s + e.over90Count, 0),
    byEntity:    perEntity.map(e => ({ entity: e.entity, value: e.total, over90: e.over90 })),
    spark:       getFinanceSparkline('overdueReceivables'),
  }
}

// ── W-FIN-07 — Receivables ageing (buckets + top debtors + per-customer split) ─

async function getAgeingBucketsForEntity(company: string): Promise<AgeingBucket[]> {
  const rows = await query<{ bucket: string; amount: number }>(
    `SELECT IFNULL(bucket, 'TOTAL') AS bucket, ROUND(SUM(net), 2) AS amount
     FROM (
         SELECT
             CASE
                 WHEN avt NOT IN ('Sales Invoice', 'Debit Note') THEN 'Advance / credit'
                 WHEN age <= 30 THEN '0-30'
                 WHEN age <= 60 THEN '31-60'
                 WHEN age <= 90 THEN '61-90'
                 ELSE '90+'
             END AS bucket,
             net
         FROM (
             SELECT
                 ple.against_voucher_no          AS ref,
                 MAX(ple.against_voucher_type)   AS avt,
                 DATEDIFF(CURDATE(), MIN(ple.due_date)) AS age,
                 SUM(ple.amount)                 AS net
             FROM \`tabPayment Ledger Entry\` ple
             WHERE ple.delinked = 0
               AND ple.party_type = 'Customer'
               AND ple.company    = ?
               AND ple.posting_date <= CURDATE()
             GROUP BY ple.against_voucher_no
             HAVING ABS(net) > 0.01
         ) per_ref
     ) labelled
     GROUP BY bucket WITH ROLLUP`,
    [company],
  )
  return rows.map(r => ({ bucket: r.bucket as AgeingBucket['bucket'], amount: Number(r.amount) }))
}

// Per-customer, per-bucket net amount — feeds the stacked ageing bar per debtor.
async function getDebtorBucketsForEntity(company: string): Promise<TopDebtor[]> {
  const rows = await query<{ customer: string; bucket: string; amount: number }>(
    `SELECT customer, bucket, ROUND(SUM(net), 2) AS amount
     FROM (
         SELECT
             per_ref.party AS customer,
             CASE
                 WHEN avt NOT IN ('Sales Invoice', 'Debit Note') THEN 'Advance / credit'
                 WHEN age <= 30 THEN '0-30'
                 WHEN age <= 60 THEN '31-60'
                 WHEN age <= 90 THEN '61-90'
                 ELSE '90+'
             END AS bucket,
             net
         FROM (
             SELECT
                 ple.party, ple.against_voucher_no AS ref,
                 MAX(ple.against_voucher_type)     AS avt,
                 DATEDIFF(CURDATE(), MIN(ple.due_date)) AS age,
                 SUM(ple.amount)                   AS net
             FROM \`tabPayment Ledger Entry\` ple
             WHERE ple.delinked = 0
               AND ple.party_type = 'Customer'
               AND ple.company    = ?
               AND ple.posting_date <= CURDATE()
             GROUP BY ple.party, ple.against_voucher_no
             HAVING ABS(net) > 0.01
         ) per_ref
     ) labelled
     GROUP BY customer, bucket`,
    [company],
  )

  const byCustomer = new Map<string, TopDebtor>()
  for (const r of rows) {
    if (!byCustomer.has(r.customer)) {
      byCustomer.set(r.customer, { customer: r.customer, netReceivable: 0, entity: company, buckets: [] })
    }
    const d = byCustomer.get(r.customer)!
    d.netReceivable += Number(r.amount)
    if (r.bucket !== 'Advance / credit') {
      d.buckets.push({ bucket: r.bucket as '0-30' | '31-60' | '61-90' | '90+', amount: Number(r.amount) })
    }
  }
  return [...byCustomer.values()].filter(d => d.netReceivable > 0.01)
}

function mergeBuckets(all: AgeingBucket[][]): AgeingBucket[] {
  const totals = new Map<string, number>()
  for (const perEntityBuckets of all) {
    for (const b of perEntityBuckets) {
      totals.set(b.bucket, (totals.get(b.bucket) ?? 0) + b.amount)
    }
  }
  return [...totals.entries()].map(([bucket, amount]) => ({ bucket: bucket as AgeingBucket['bucket'], amount }))
}

async function getReceivablesAgeing(companies: string[]): Promise<ReceivablesAgeing> {
  const byEntity: Record<string, AgeingBucket[]> = {}
  const bucketsPerEntity: AgeingBucket[][] = []
  const debtorLists = await Promise.all(companies.map(async company => {
    const [buckets, debtors] = await Promise.all([
      getAgeingBucketsForEntity(company),
      getDebtorBucketsForEntity(company),
    ])
    byEntity[company] = buckets
    bucketsPerEntity.push(buckets)
    return debtors
  }))

  const topDebtors = debtorLists.flat().sort((a, b) => b.netReceivable - a.netReceivable)

  return {
    buckets: mergeBuckets(bucketsPerEntity),
    byEntity,
    topDebtors,
  }
}

// ── W-FIN-05 — GST liability (period-aware) ──────────────────────────────────

export async function getGstTotalForCompanies(companies: string[], start: string, end: string): Promise<number> {
  if (!companies.length) return 0
  const placeholders = companies.map(() => '?').join(',')
  const rows = await query<{ gst: number | null }>(
    `SELECT SUM(gle.credit - gle.debit) AS gst
     FROM \`tabGL Entry\` gle
     JOIN \`tabAccount\` a ON a.name = gle.account
     WHERE a.name LIKE 'Output Tax%'
       AND gle.is_cancelled = 0
       AND gle.company IN (${placeholders})
       AND gle.posting_date BETWEEN ? AND ?`,
    [...companies, start, end],
  )
  return Number(rows[0]?.gst ?? 0)
}

async function getGstLiability(companies: string[]): Promise<GstLiability> {
  const [M, Q, Y, spark] = await Promise.all([
    getPeriodStat(companies, 'M', getGstTotalForCompanies),
    getPeriodStat(companies, 'Q', getGstTotalForCompanies),
    getPeriodStat(companies, 'Y', getGstTotalForCompanies),
    getTrendSpark(companies, getGstTotalForCompanies),
  ])
  return { M, Q, Y, spark }
}

// ── W-FIN-12 — Gross Margin, blended (Decision 5: GM = Direct Income − Direct
// Expenses; target defaults to 24% per Shivam but is configurable per entity via
// financeSettingsService — see GET/PUT /api/v1/finance/settings/gross-margin-target).
// Division split is still blocked — see divisionGrossMarginSplit below (Decision 3).

async function getGrossMarginForCompany(company: string, start: string, end: string): Promise<{ income: number; expense: number }> {
  const rows = await query<{ income: number | null; expense: number | null }>(
    `SELECT
        (SELECT IFNULL(SUM(g.credit - g.debit), 0)
           FROM \`tabGL Entry\` g
           JOIN \`tabAccount\` a   ON a.name = g.account AND a.is_group = 0
           JOIN \`tabAccount\` grp ON grp.is_group = 1 AND grp.root_type = 'Income'
                                AND grp.name LIKE 'Direct Income%' AND grp.company = ?
          WHERE g.is_cancelled = 0 AND g.company = ? AND a.lft > grp.lft AND a.rgt < grp.rgt
            AND g.posting_date BETWEEN ? AND ?
        ) AS income,
        (SELECT IFNULL(SUM(g.debit - g.credit), 0)
           FROM \`tabGL Entry\` g
           JOIN \`tabAccount\` a   ON a.name = g.account AND a.is_group = 0
           JOIN \`tabAccount\` grp ON grp.is_group = 1 AND grp.root_type = 'Expense'
                                AND grp.name LIKE 'Direct Expenses%' AND grp.company = ?
          WHERE g.is_cancelled = 0 AND g.company = ? AND a.lft > grp.lft AND a.rgt < grp.rgt
            AND g.posting_date BETWEEN ? AND ?
        ) AS expense`,
    [company, company, start, end, company, company, start, end],
  )
  return { income: Number(rows[0]?.income ?? 0), expense: Number(rows[0]?.expense ?? 0) }
}

function gmPct(income: number, expense: number): number | null {
  return income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : null
}

async function getGrossMarginStat(companies: string[], period: Period): Promise<GrossMarginStat> {
  const { start, end, label } = periodRange(period)
  const byEntity = await Promise.all(companies.map(async company => {
    const { income, expense } = await getGrossMarginForCompany(company, start, end)
    return { entity: company, income, expense, gmPct: gmPct(income, expense), targetPct: getGmTargetPct(company) }
  }))
  const income = byEntity.reduce((s, e) => s + e.income, 0)
  const expense = byEntity.reduce((s, e) => s + e.expense, 0)
  // Income-weighted blend of each entity's own target, so the group figure stays meaningful
  // even if entities have different targets configured. Falls back to a plain average when
  // there's no income yet to weight by (e.g. current month before any invoices post).
  const weightedTarget = income > 0
    ? byEntity.reduce((s, e) => s + e.targetPct * e.income, 0) / income
    : byEntity.reduce((s, e) => s + e.targetPct, 0) / (byEntity.length || 1)
  return {
    income, expense, grossMargin: income - expense,
    gmPct: gmPct(income, expense), targetPct: Math.round(weightedTarget * 10) / 10,
    byEntity, periodLabel: label,
  }
}

async function getGrossMargin(companies: string[]): Promise<GrossMargin> {
  const [M, Q, Y] = await Promise.all([
    getGrossMarginStat(companies, 'M'),
    getGrossMarginStat(companies, 'Q'),
    getGrossMarginStat(companies, 'Y'),
  ])
  return { M, Q, Y }
}

// ── W-FIN-04 / 10 — Payables ─────────────────────────────────────────────────

export async function getPayablesDueTotalForCompanies(
  companies: string[], asOf: string, windowDays: number,
): Promise<{ total: number; vendors: number; lastDueDate: string | null }> {
  if (!companies.length) return { total: 0, vendors: 0, lastDueDate: null }
  const placeholders = companies.map(() => '?').join(',')
  const rows = await query<{ total: number | null; vendors: number | null; last_due_date: string | null }>(
    `SELECT SUM(outstanding_amount) AS total, COUNT(DISTINCT supplier) AS vendors, MAX(due_date) AS last_due_date
     FROM \`tabPurchase Invoice\`
     WHERE docstatus = 1 AND company IN (${placeholders})
       AND outstanding_amount > 0
       AND due_date BETWEEN ? AND DATE_ADD(?, INTERVAL ? DAY)`,
    [...companies, asOf, asOf, windowDays],
  )
  return { total: Number(rows[0]?.total ?? 0), vendors: Number(rows[0]?.vendors ?? 0), lastDueDate: rows[0]?.last_due_date ?? null }
}

async function getPayablesDue7d(companies: string[]): Promise<PayablesDue> {
  const today = iso(new Date())
  const perEntity = await Promise.all(companies.map(async company => {
    const r = await getPayablesDueTotalForCompanies([company], today, 7)
    return { entity: company, value: r.total, vendors: r.vendors, lastDueDate: r.lastDueDate }
  }))
  const lastDueDate = perEntity
    .map(e => e.lastDueDate)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1) ?? null

  return {
    total: perEntity.reduce((s, e) => s + e.value, 0),
    vendors: perEntity.reduce((s, e) => s + e.vendors, 0),
    byEntity: perEntity.map(e => ({ entity: e.entity, value: e.value })),
    lastDueDate,
    spark: getFinanceSparkline('payablesDue7d'),
  }
}

// Per-invoice rows (not just a daily count) so the calendar can show vendor names.
async function getPayablesInvoices14d(companies: string[]): Promise<PayablesInvoiceRow[]> {
  const perEntity = await Promise.all(companies.map(async company => {
    const rows = await query<{ due_date: string; supplier: string; outstanding_amount: number }>(
      `SELECT due_date, supplier, outstanding_amount
       FROM \`tabPurchase Invoice\`
       WHERE docstatus = 1 AND company = ?
         AND outstanding_amount > 0
         AND due_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 14 DAY
       ORDER BY due_date, outstanding_amount DESC`,
      [company],
    )
    return rows.map(r => ({ dueDate: r.due_date, supplier: r.supplier, amount: Number(r.outstanding_amount), entity: company }))
  }))
  return perEntity.flat().sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

// ── W-FIN-11 — Action queue (2 tabs; AP Reconciliation removed per template) ─

async function getActionQueue(companies: string[]): Promise<ActionQueue> {
  const [paymentsToRelease, paymentsToReleaseTotal, journalEntriesPending] = await Promise.all([
    // Tab 1 — per Shivam's v2 doc: fully-unpaid Purchase Invoices (no Payment Entry
    // made yet), last 12 months. 'Release' calls proman_edge.api.finance.make_payment_entry
    // to create a draft Payment Entry (see releasePayment() below).
    // Capped at 100/company for display — the true count (for the tab badge) is
    // fetched separately below since it's normally far higher than what's rendered.
    Promise.all(companies.map(async company => {
      const rows = await query<{ invoice_no: string; vendor: string; amount: number; due_date: string; days_overdue: number }>(
        `SELECT
            pi.name AS invoice_no, pi.supplier AS vendor, pi.outstanding_amount AS amount,
            pi.due_date, DATEDIFF(CURDATE(), pi.due_date) AS days_overdue
         FROM \`tabPurchase Invoice\` pi
         WHERE pi.posting_date >= CURDATE() - INTERVAL 12 MONTH
           AND pi.docstatus = 1 AND pi.company = ? AND pi.is_return = 0
           AND pi.outstanding_amount > 0
           AND ROUND(pi.outstanding_amount, 0) >= ROUND(pi.grand_total, 0)
         ORDER BY pi.outstanding_amount DESC
         LIMIT 100`,
        [company],
      )
      return rows.map((r): UnpaidInvoice => ({
        invoiceNo: r.invoice_no, vendor: r.vendor, amount: Number(r.amount),
        dueDate: r.due_date, daysOverdue: Number(r.days_overdue), entity: company,
      }))
    })),

    Promise.all(companies.map(async company => {
      const rows = await query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM \`tabPurchase Invoice\` pi
         WHERE pi.posting_date >= CURDATE() - INTERVAL 12 MONTH
           AND pi.docstatus = 1 AND pi.company = ? AND pi.is_return = 0
           AND pi.outstanding_amount > 0
           AND ROUND(pi.outstanding_amount, 0) >= ROUND(pi.grand_total, 0)`,
        [company],
      )
      return Number(rows[0]?.cnt ?? 0)
    })),

    Promise.all(companies.map(async company => {
      const rows = await query<{ name: string; user_remark: string; total_debit: number; voucher_type: string; days_pending: number }>(
        `SELECT name, user_remark, total_debit, voucher_type,
                DATEDIFF(CURDATE(), creation) AS days_pending
         FROM \`tabJournal Entry\`
         WHERE docstatus = 0 AND company = ?
           AND posting_date < CURDATE()
           AND total_debit > 100000
         ORDER BY total_debit DESC`,
        [company],
      )
      return rows.map((r): JournalEntryPending => ({
        name: r.name, userRemark: r.user_remark, totalDebit: Number(r.total_debit),
        voucherType: r.voucher_type, daysPending: Number(r.days_pending), entity: company,
      }))
    })),
  ])

  return {
    paymentsToRelease: paymentsToRelease.flat(),
    paymentsToReleaseTotal: paymentsToReleaseTotal.reduce((s, n) => s + n, 0),
    journalEntriesPending: journalEntriesPending.flat(),
  }
}

// ── Alerts ────────────────────────────────────────────────────────────────────

const LOW_CASH_THRESHOLD = 2_000_000 // ₹20L — matches the design template's critical liquidity alert

const LOW_CASH_ENTITY_THRESHOLD = 5_000_000 // ₹50L — A-FIN-A1, per-entity warning (dashboard only, no email)

// A-FIN-R3 (per v4 doc — final spec, no longer a PROXY): fixed government due dates —
// GST 20th, TDS 7th, PF 14th of the month. "Released" = a payment JE debits the payable,
// clearing it, so amount owed > 0 means not released. Fires 2 days before each fixed date.
const STATUTORY_ACCOUNTS: { pattern: string; label: string; dueDay: number }[] = [
  { pattern: 'GST Payable%', label: 'GST', dueDay: 20 },
  { pattern: 'TDS Payable%', label: 'TDS', dueDay: 7 },
  { pattern: 'PF%',          label: 'PF',  dueDay: 14 },
]

function daysUntilNextDue(dueDay: number, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let target = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (target < today) target = new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

async function getStatutoryDuesSoon(companies: string[]): Promise<{ label: string; amount: number; daysUntil: number }[]> {
  const results: { label: string; amount: number; daysUntil: number }[] = []
  for (const { pattern, label, dueDay } of STATUTORY_ACCOUNTS) {
    const daysUntil = daysUntilNextDue(dueDay)
    if (daysUntil > 2) continue // only check accounts whose fixed due date is within 2 days
    let total = 0
    for (const company of companies) {
      const rows = await query<{ amount: number | null }>(
        `SELECT ROUND(SUM(gle.credit - gle.debit), 2) AS amount
         FROM \`tabGL Entry\` gle
         JOIN \`tabAccount\` a ON a.name = gle.account
         WHERE a.name LIKE ? AND gle.company = ?
           AND gle.is_cancelled = 0 AND gle.posting_date <= CURDATE()`,
        [pattern, company],
      )
      total += Number(rows[0]?.amount ?? 0)
    }
    if (total > 0) results.push({ label, amount: total, daysUntil })
  }
  return results
}

// A-FIN-A3: Payment Entry advances (Supplier/Employee) unallocated > 30 days.
// Placement resolved (per user, 2026-07): shown as an alert, not a removed Action Queue tab.
async function getUnreconciledAdvances(companies: string[]): Promise<{ count: number; total: number }> {
  const perEntity = await Promise.all(companies.map(async company => {
    const rows = await query<{ cnt: number; total: number | null }>(
      `SELECT COUNT(*) AS cnt, SUM(pe.unallocated_amount) AS total
       FROM \`tabPayment Entry\` pe
       WHERE pe.docstatus = 1 AND pe.payment_type = 'Pay' AND pe.company = ?
         AND pe.party_type IN ('Supplier', 'Employee')
         AND pe.unallocated_amount > 0
         AND pe.posting_date < CURDATE() - INTERVAL 30 DAY`,
      [company],
    )
    return { count: Number(rows[0]?.cnt ?? 0), total: Number(rows[0]?.total ?? 0) }
  }))
  return {
    count: perEntity.reduce((s, e) => s + e.count, 0),
    total: perEntity.reduce((s, e) => s + e.total, 0),
  }
}

async function buildAlerts(overdue: OverdueReceivables, cashBank: CashBank, erpBaseUrl: string, companies: string[]): Promise<FinanceAlert[]> {
  const alerts: FinanceAlert[] = []

  if (overdue.over90 > 0) {
    alerts.push({
      level: 'red',
      title: `${rupees(overdue.over90)} overdue 90+ days`,
      subtitle: `Across ${overdue.over90Count} invoice${overdue.over90Count === 1 ? '' : 's'}. Immediate escalation required.`,
      entityLabel: 'Group',
      link: erpBaseUrl ? `${erpBaseUrl}/app/query-report/Accounts Receivable` : undefined,
    })
  }

  if (cashBank.total < LOW_CASH_THRESHOLD) {
    alerts.push({
      level: 'red',
      title: `Group cash balance below ${rupees(LOW_CASH_THRESHOLD)}`,
      subtitle: 'Critical liquidity threshold breached.',
      entityLabel: 'Group',
      link: erpBaseUrl ? `${erpBaseUrl}/app/query-report/Cash Flow` : undefined,
    })
  }

  // A-FIN-A1: per-entity cash warning — one consolidated box, comma-separated (per v4 doc: "[NEW]")
  const lowCashEntities = cashBank.byEntity.filter(e => e.value < LOW_CASH_ENTITY_THRESHOLD)
  if (lowCashEntities.length > 0) {
    alerts.push({
      level: 'amber',
      title: `Cash balance below ${rupees(LOW_CASH_ENTITY_THRESHOLD)}`,
      subtitle: lowCashEntities.length === 1 ? '' : lowCashEntities.map(e => e.entity).join(', '),
      entityLabel: lowCashEntities.length === 1 ? lowCashEntities[0].entity : `${lowCashEntities.length} entities`,
    })
  }

  const advances = await getUnreconciledAdvances(companies)
  if (advances.count > 0) {
    alerts.push({
      level: 'amber',
      title: `${rupees(advances.total)} in advances unreconciled beyond 30 days`,
      subtitle: `${advances.count} supplier/employee advance${advances.count === 1 ? '' : 's'} still unallocated.`,
      entityLabel: 'Group',
      link: erpBaseUrl ? `${erpBaseUrl}/app/payment-entry` : undefined,
    })
  }

  // A-FIN-R3: real, per v4 doc — fixed statutory due dates, no longer blocked/PROXY
  const statutoryDues = await getStatutoryDuesSoon(companies)
  if (statutoryDues.length > 0) {
    alerts.push({
      level: 'red',
      title: statutoryDues.map(d => `${d.label} ${rupees(d.amount)} due in ${d.daysUntil}d`).join(', '),
      subtitle: 'Statutory payment not yet released.',
      entityLabel: 'Group',
      link: erpBaseUrl ? `${erpBaseUrl}/app/payment-entry` : undefined,
    })
  }

  return alerts
}

// ── W-FIN-08 — Approval Queue, Purchase Orders ──────────────────────────────

async function getPoApprovalQueue(companies: string[]): Promise<PoApprovalItem[]> {
  const perEntity = await Promise.all(companies.map(async company => {
    // status='Draft' is indexed and narrows the scan before the un-indexed workflow_state filter.
    const rows = await query<{ po_no: string; vendor: string; value: number; approval_stage: string; po_date: string; days_pending: number }>(
      `SELECT
          po.name AS po_no, po.supplier AS vendor, po.base_grand_total AS value,
          po.workflow_state AS approval_stage, po.transaction_date AS po_date,
          DATEDIFF(CURDATE(), po.transaction_date) AS days_pending
       FROM \`tabPurchase Order\` po
       WHERE po.status = 'Draft' AND po.company = ?
         AND po.workflow_state = 'Awaiting AM Approval'
       ORDER BY po.base_grand_total DESC`,
      [company],
    )
    return rows.map((r): PoApprovalItem => ({
      poNo: r.po_no, vendor: r.vendor, value: Number(r.value), approvalStage: r.approval_stage,
      poDate: r.po_date, daysPending: Number(r.days_pending), entity: company,
    }))
  }))
  return perEntity.flat().sort((a, b) => b.value - a.value)
}

// Write-back: creates a draft Payment Entry for an unpaid Purchase Invoice (Tab 1 'Release').
// Method path confirmed by Shivam (2026-07): proman_edge.api.finance.make_payment_entry
// (not proman_edge.api.make_payment_entry, which is what the v2 doc originally said).
export async function releasePayment(invoiceNo: string): Promise<FinanceActionResult> {
  return frappePost('proman_edge.api.finance.make_payment_entry', { invoice: invoiceNo })
}

// Write-back: advances a Purchase Order's workflow_state (W-FIN-08 'Approve'). Reused
// from the Procurement dashboard's existing endpoint — same {ok, summary, error} envelope.
export async function approvePurchaseOrder(poNo: string): Promise<FinanceActionResult> {
  return frappePost('proman_edge.api.procurement.approve_purchase_order', { name: poNo })
}

// Write-back: submits a draft Journal Entry (W-FIN-11 Tab 2 'Approve' — JE has no workflow,
// so 'approve' here just means submit the draft, docstatus 0 -> 1).
export async function submitJournalEntry(jeNo: string): Promise<FinanceActionResult> {
  return frappePost('proman_edge.api.finance.submit_journal_entry', { journal_entry: jeNo })
}

// ── Main homepage aggregate ───────────────────────────────────────────────────

export async function getFinanceHomepage(fyStart?: string, fyEnd?: string): Promise<FinanceHomepageData> {
  const cacheKey = `finance:homepage:${fyStart ?? 'default'}:${fyEnd ?? 'default'}`
  const cached = await cacheGet<FinanceHomepageData>(cacheKey)
  if (cached) return cached

  const companies = await getCompanies()
  const fy = fyStart && fyEnd ? { fyStart, fyEnd } : currentFiscalYearRange()

  const [
    cashBank, revenue, overdueReceivables, receivablesAgeing,
    gstLiability, payablesDue7d, payablesInvoices14d, actionQueue, grossMargin, poApprovalQueue,
  ] = await Promise.all([
    getCashBank(companies),
    getRevenue(companies),
    getOverdueReceivables(companies, fy.fyStart, fy.fyEnd),
    getReceivablesAgeing(companies),
    getGstLiability(companies),
    getPayablesDue7d(companies),
    getPayablesInvoices14d(companies),
    getActionQueue(companies),
    getGrossMargin(companies),
    getPoApprovalQueue(companies),
  ])

  const erpBaseUrl = (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '')
  const alerts = await buildAlerts(overdueReceivables, cashBank, erpBaseUrl, companies)

  const homepage: FinanceHomepageData = {
    syncedAt: new Date().toISOString(),
    erpBaseUrl,
    entities: companies,
    alerts,
    cashBank,
    revenue,
    overdueReceivables,
    receivablesAgeing,
    gstLiability,
    payablesDue7d,
    payablesInvoices14d,
    actionQueue,
    grossMargin,
    poApprovalQueue,
    // Blocked — see Finance_Dashboard_SQL_Queries.md + Shivam message (ERP-side work required)
    revenueVsTarget:          { blocked: true, reason: 'No Revenue Target doctype exists yet. Awaiting ERP-side setup.' },
    divisionGrossMarginSplit: { blocked: true, reason: 'Sales Invoice.cost_center is populated on <1% of records — no usable division split. Blended Gross Margin above is real (Decision 5 resolved); the division-wise breakdown is still blocked on cost_center coverage (Decision 3).' },
  }

  // ACE / PROMAX / QMS Pro / Dynatek — no DB access, client pastes data into an xlsx per
  // site (backend/data/site-sheets/). Merged in here, isolated in financeSiteSheetService.ts
  // so this ingestion path can be swapped out later without touching the DB queries above.
  const result = siteSheets.mergeSiteSheetsIntoHomepage(homepage)
  await cacheSet(cacheKey, result, HOMEPAGE_CACHE_TTL)
  return result
}
