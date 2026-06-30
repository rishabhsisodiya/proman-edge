export type Rag = 'red' | 'amber' | 'green'
export type SpendMode = 'M' | 'Q' | 'Y'
export type VendorMode = 'M' | 'Q' | 'Y'
export type SpendCategory = 'all' | 'raw' | 'cons' | 'capex' | 'serv'

// ── KPI tiles ────────────────────────────────────────────────────────────────

export interface ProcurementKpiTile {
  value: number
  sub: string
  spark: SparkPoint[]   // last 6 monthly snapshots
}

export interface SpendKpiTile {
  value: number         // spend MTD in paise / rupees raw
  budget: number        // budget for the month
  pct: number           // value / budget * 100
  spark: SparkPoint[]   // 6-month spend trend
  byMode: Record<SpendMode, SpendModeStat>
}

export interface SpendModeStat {
  label: string         // e.g. "June MTD", "Q1 FY27", "FY27"
  spent: number
  budget: number
  pct: number
  labels: string[]      // x-axis labels for sparkline
  vals: number[]        // pct values per bucket
  cur: number           // index of current bucket
}

export interface SparkPoint {
  label: string   // e.g. "Jan", "Feb"
  value: number
}

export interface ProcurementKpis {
  prsPending:    ProcurementKpiTile
  openPOs:       ProcurementKpiTile & { openValue: number }
  overduePOs:    ProcurementKpiTile
  criticalStock: ProcurementKpiTile
  spend:         SpendKpiTile
}

// ── W-PROC-06 Approval queue ─────────────────────────────────────────────────

export interface ApprovalQueueItem {
  poNo: string
  requester: string
  department: string
  firstItem: string
  supplier: string
  requiredBy: string      // ISO date string
  estValue: number
  workflowState: string
  daysPending: number
  rag: Rag
}

// ── W-PROC-07 Overdue PO tracker ─────────────────────────────────────────────

export interface OverduePO {
  poNo: string
  supplier: string
  poValue: number
  scheduleDate: string    // ISO date string
  daysOverdue: number
  perReceived: number
  lastFollowup: string | null  // ISO datetime or null
  rag: Rag
}

// ── W-PROC-08 Critical material shortage ─────────────────────────────────────

export interface CriticalShortage {
  woNo: string
  blockedItem: string
  requiredQty: number
  availableQty: number
  shortfall: number
  plannedEndDate: string | null
  etaFromPO: string | null
  rag: Rag
}

// ── W-PROC-09 Vendor delivery performance ────────────────────────────────────

export interface VendorBar {
  supplier: string
  totalPOs: number
  onTimePct: number
  rag: Rag
}

// ── W-PROC-10 Spend vs budget gauge ──────────────────────────────────────────

export interface SpendGauge {
  pct: number
  spent: number
  budget: number
  rag: Rag
  categoryBreakdown: Record<SpendCategory, { spent: number; budget: number; pct: number }>
  sixMonthTrend: SparkPoint[]
}

// ── W-PROC-11 Action queue ───────────────────────────────────────────────────

export interface GrnPendingRow {
  poNo: string
  supplier: string
  scheduleDate: string
  perReceived: number
}

export interface FollowUpRow {
  poNo: string
  supplier: string
  scheduleDate: string
  lastFollowup: string | null
  daysOverdue: number
}

export interface InvoiceUnmatchedRow {
  invoice: string
  supplier: string
  grandTotal: number
  postingDate: string
  daysSince: number
  rag: Rag
}

export interface ActionQueue {
  grnsPending:       GrnPendingRow[]
  followUpsDue:      FollowUpRow[]
  invoicesUnmatched: InvoiceUnmatchedRow[]
}

// ── W-PROC-12 Expected receipts ──────────────────────────────────────────────

export interface ExpectedReceipt {
  supplier: string
  poNo: string
  scheduleDate: string
  perReceived: number
  lastFollowup: string | null
  rag: Rag
}

// ── Alert banner ─────────────────────────────────────────────────────────────

export interface AlertBanner {
  level: 'red' | 'amber'
  message: string
  erpLink: string
}

// ── Homepage aggregate ───────────────────────────────────────────────────────

export interface ProcurementHomepageData {
  syncedAt:          string
  erpBaseUrl:        string
  alerts:            AlertBanner[]
  kpis:              ProcurementKpis
  approvalQueue:     ApprovalQueueItem[]
  overduePOs:        OverduePO[]
  criticalShortages: CriticalShortage[]
  vendorPerformance: Record<VendorMode, VendorBar[]>
  spendGauge:        SpendGauge
  actionQueue:       ActionQueue
  expectedReceipts:  ExpectedReceipt[]
}

// ── PO detail (drawer) ───────────────────────────────────────────────────────

export interface PODetail {
  poNo: string
  supplier: string
  requester: string
  department: string
  workflowState: string
  grandTotal: number
  scheduleDate: string
  perReceived: number
  items: PODetailItem[]
  lastFollowup: string | null
}

export interface PODetailItem {
  itemCode: string
  itemName: string
  qty: number
  rate: number
  amount: number
  uom: string
}

// ── Write-back API responses ─────────────────────────────────────────────────

export interface ProcurementActionResult {
  ok: boolean
  widget: string
  summary?: string
  deepLink?: string
  error?: {
    code: string
    message: string
  }
}
