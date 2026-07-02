export type Period = 'M' | 'Q' | 'Y'

export interface SparkPoint {
  label: string
  value: number
}

export interface EntityAmount {
  entity: string
  value: number
}

export interface EntityAmountWithTrend extends EntityAmount {
  changeVs7d: number
}

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

export interface PeriodStat {
  total: number
  byEntity: EntityAmount[]
  periodLabel: string
}

export interface Revenue {
  M: PeriodStat
  Q: PeriodStat
  Y: PeriodStat
  targetAvailable: false
  spark: SparkPoint[]
}

export interface OverdueReceivables {
  total: number
  over90: number
  over90Count: number
  byEntity: (EntityAmount & { over90: number })[]
  spark: SparkPoint[]
}

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
  buckets: AgeingBucket[]
  byEntity: Record<string, AgeingBucket[]>
  topDebtors: TopDebtor[]
}

export interface GstLiability {
  M: PeriodStat
  Q: PeriodStat
  Y: PeriodStat
  spark: SparkPoint[]
}

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

export interface PaymentToRelease {
  name: string
  party: string
  paidAmount: number
  modeOfPayment: string
  postingDate: string
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
  paymentsToRelease: PaymentToRelease[]
  journalEntriesPending: JournalEntryPending[]
  apReconciliation: ApReconciliationItem[]
}

export interface FinanceAlert {
  level: 'red' | 'amber'
  message: string
  reason?: string
}

export interface BlockedWidget {
  blocked: true
  reason: string
}

export interface FinanceHomepageData {
  syncedAt: string
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
  cfoApprovalQueue: BlockedWidget
  revenueVsTarget: BlockedWidget
  divisionGrossMargin: BlockedWidget
}
