export type Period = 'M' | 'Q' | 'Y'

export interface SparkPoint {
  label: string
  value: number
}

export interface EntityAmount {
  entity: string          // Company name (abbr or full name)
  value: number
}

export interface EntityAmountWithTrend extends EntityAmount {
  changeVs7d: number
}

// ── W-FIN-01 / 06 Cash & Bank ────────────────────────────────────────────────

export interface CashBankAccount {
  account: string
  accountType: string
  balance: number
}

export interface CashBank {
  total: number
  changeVs7d: number
  byEntity: EntityAmountWithTrend[]
  accountsByEntity: Record<string, CashBankAccount[]>
  spark: SparkPoint[]
}

// ── W-FIN-02 Revenue ──────────────────────────────────────────────────────────

export interface PeriodStat {
  total: number
  byEntity: EntityAmount[]
  periodLabel: string     // e.g. "June MTD", "Q1 FY27", "FY27"
}

export interface Revenue {
  M: PeriodStat
  Q: PeriodStat
  Y: PeriodStat
  targetAvailable: false   // blocked — Decision 4 (Revenue Target doctype)
  spark: SparkPoint[]
}

// ── W-FIN-03 Overdue receivables ─────────────────────────────────────────────

export interface OverdueReceivables {
  total: number
  over90: number
  over90Count: number
  byEntity: (EntityAmount & { over90: number })[]
  spark: SparkPoint[]
}

// ── W-FIN-07 Receivables ageing ──────────────────────────────────────────────

export interface AgeingBucket {
  bucket: '0-30' | '31-60' | '61-90' | '90+' | 'Advance / credit' | 'TOTAL'
  amount: number
}

export interface TopDebtor {
  customer: string
  netReceivable: number
  entity: string
  buckets: { bucket: '0-30' | '31-60' | '61-90' | '90+'; amount: number }[]
}

export interface ReceivablesAgeing {
  buckets: AgeingBucket[]           // group total (all entities merged)
  byEntity: Record<string, AgeingBucket[]>
  topDebtors: TopDebtor[]           // merged, sorted desc
}

// ── W-FIN-05 GST liability ───────────────────────────────────────────────────

export interface GstLiability {
  M: PeriodStat
  Q: PeriodStat
  Y: PeriodStat
  spark: SparkPoint[]
}

// ── W-FIN-12 Gross Margin (blended — Decision 5 resolved by Shivam) ─────────
// Division split (division bars) is STILL blocked — see Decision 3 (cost_center coverage).

export interface GrossMarginEntity {
  entity: string
  income: number
  expense: number
  gmPct: number | null
  targetPct: number       // per-entity target — configurable, see financeSettingsService
}

export interface GrossMarginStat {
  income: number
  expense: number
  grossMargin: number
  gmPct: number | null
  targetPct: number       // income-weighted blend of each entity's own target
  byEntity: GrossMarginEntity[]
  periodLabel: string
}

export interface GrossMargin {
  M: GrossMarginStat
  Q: GrossMarginStat
  Y: GrossMarginStat
}

// ── W-FIN-04 / 10 Payables ───────────────────────────────────────────────────

export interface PayablesDue {
  total: number
  vendors: number
  lastDueDate: string | null
  byEntity: EntityAmount[]
  spark: SparkPoint[]
}

export interface PayablesInvoiceRow {
  dueDate: string
  supplier: string
  amount: number
  entity: string
}

// ── W-FIN-11 Action queue ────────────────────────────────────────────────────

// Tab 1 — redefined per Shivam's v2 doc: fully-unpaid Purchase Invoices (last 12
// months), with a 'Release' write-back that creates a draft Payment Entry.
export interface UnpaidInvoice {
  invoiceNo: string
  vendor: string
  amount: number
  dueDate: string
  daysOverdue: number
  entity: string
}

export interface JournalEntryPending {
  name: string
  userRemark: string
  totalDebit: number
  voucherType: string
  daysPending: number
  entity: string
}

export interface ApReconciliationItem {
  source: string
  item: string
  party: string
  partyType: string
  amount: number
  daysOut: number
  aging: string
  status: string
  entity: string
}

export interface ActionQueue {
  paymentsToRelease: UnpaidInvoice[]
  paymentsToReleaseTotal: number   // true count — paymentsToRelease is capped at 100/company for display
  journalEntriesPending: JournalEntryPending[]
  apReconciliation: ApReconciliationItem[]
}

// ── W-FIN-08 Approval Queue — Purchase Orders ───────────────────────────────

export interface PoApprovalItem {
  poNo: string
  vendor: string
  value: number
  approvalStage: string
  poDate: string
  daysPending: number
  entity: string
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export interface FinanceAlert {
  level: 'red' | 'amber'
  message: string
  reason?: string   // present when part of the alert could not be computed (e.g. statutory due dates)
}

// ── Write-back action results (Release / Approve PO / Submit JE) ────────────

export interface FinanceActionResult {
  ok: boolean
  summary?: { purchase_invoice?: string; payment_entry?: string; paid_amount?: number; docstatus?: number; journal_entry?: string; name?: string; [k: string]: unknown }
  deep_link?: string
  meta?: { note?: string }
  error?: { code?: string; message?: string }
}

// ── Blocked widgets (need ERP-side work — see Shivam message) ───────────────

export interface BlockedWidget {
  blocked: true
  reason: string
}

// ── Full homepage payload ────────────────────────────────────────────────────

export interface FinanceHomepageData {
  syncedAt: string
  erpBaseUrl: string
  entities: string[]
  alerts: FinanceAlert[]
  cashBank: CashBank
  revenue: Revenue
  overdueReceivables: OverdueReceivables
  receivablesAgeing: ReceivablesAgeing
  gstLiability: GstLiability
  payablesDue7d: PayablesDue
  payablesInvoices14d: PayablesInvoiceRow[]
  actionQueue: ActionQueue
  poApprovalQueue: PoApprovalItem[]
  revenueVsTarget: BlockedWidget
  grossMargin: GrossMargin
  divisionGrossMarginSplit: BlockedWidget
}
