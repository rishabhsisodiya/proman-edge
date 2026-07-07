// ── Dispatch & Logistics Head homepage (HP-DSP-001) — single site (PISPL) ───
// Source: proman-docs/Dispatch_Head_SQL_Queries.md

// ── W-DSP-01..05 KPIs ─────────────────────────────────────────────────────────

export interface ReadyToDispatch {
  count: number
}

export interface DispatchBlocked {
  count: number
}

export interface DispatchedThisWeek {
  count: number
  dispatchValue: number
}

export interface EwayBillsExpiring {
  expiringWeek: number
  expiringToday: number
}

export interface RevenuePendingInvoice {
  count: number
  revenuePending: number
}

// ── W-DSP-06 Dispatch readiness pipeline (stage-flow + table) ───────────────

export interface DispatchStageFlow {
  qcPending: number
  qcCleared: number
  docsPending: number
  docsComplete: number
  vehicleBooked: number
  dispatched: number
}

export interface DispatchPipelineRow {
  dnNo: string
  customerName: string
  product: string
  targetDate: string | null
  blocker: 'QC pending' | 'Customer PO pending' | 'e-Way bill pending' | 'Vehicle pending' | 'Ready'
}

// ── W-DSP-07 Documentation checklist (per Delivery Note) ─────────────────────

export interface DocumentationChecklist {
  dnNo: string
  customerName: string
  qcCertificate: 'Done' | 'Pending'
  salesInvoiceApproved: 'Done' | 'Pending'
  ewayBillGenerated: 'Done' | 'Pending'
  vehicleBookingConfirmed: 'Done' | 'Pending'
  customerPoVerified: 'Done' | 'Pending'
  packingListAttached: 'Done' | 'Pending'
  customerSiteConfirmed: 'Manual'
  testCertificateAttached: 'Manual'
}

// ── W-DSP-08 e-Way bill status (table) ───────────────────────────────────────

export interface EwayBillRow {
  ewayBill: string
  linkedDoctype: string
  linkedDoc: string
  party: string
  validUpto: string
  status: 'Expired' | 'Extend (today)' | 'Expiring soon' | 'Valid'
}

// ── W-DSP-09 This week's dispatch schedule ───────────────────────────────────

export interface DispatchScheduleRow {
  deliveryDate: string
  soNo: string
  customerName: string
  product: string
  value: number
}

// ── W-DSP-10 On-time dispatch % (rolling 3 months) ───────────────────────────

export interface OnTimeDispatchMonth {
  month: string
  totalDispatches: number
  onTime: number
  onTimePct: number
}

// ── W-DSP-11 Action queue (2 tabs) ───────────────────────────────────────────

export interface DnToSubmitRow {
  dnNo: string
  customerName: string
  product: string
  targetDate: string | null
  value: number
}

export interface InvoiceAwaitingDispatchRow {
  invoiceNo: string
  customerName: string
  amount: number
  postingDate: string
  firstItem: string
}

export interface DispatchActionQueue {
  dnsToSubmit: DnToSubmitRow[]
  invoicesAwaitingDispatch: InvoiceAwaitingDispatchRow[]
}

// ── Full homepage payload ─────────────────────────────────────────────────────

export interface DispatchHomepageData {
  syncedAt: string
  erpBaseUrl: string
  readyToDispatch: ReadyToDispatch
  dispatchBlocked: DispatchBlocked
  dispatchedThisWeek: DispatchedThisWeek
  ewayBillsExpiring: EwayBillsExpiring
  revenuePendingInvoice: RevenuePendingInvoice
  stageFlow: DispatchStageFlow
  pipelineTable: DispatchPipelineRow[]
  scheduleThisWeek: DispatchScheduleRow[]
  onTimeDispatch: OnTimeDispatchMonth[]
  actionQueue: DispatchActionQueue
}
