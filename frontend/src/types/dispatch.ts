// ── Dispatch & Logistics Head homepage (HP-DSP-001) — single site (PISPL) ───

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

export interface EwayBillRow {
  ewayBill: string
  linkedDoctype: string
  linkedDoc: string
  party: string
  validUpto: string
  status: 'Expired' | 'Extend (today)' | 'Expiring soon' | 'Valid'
}

export interface DispatchScheduleRow {
  deliveryDate: string
  soNo: string
  customerName: string
  product: string
  value: number
}

export interface OnTimeDispatchMonth {
  month: string
  totalDispatches: number
  onTime: number
  onTimePct: number
}

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

export interface DispatchHomepageData {
  syncedAt: string
  erpBaseUrl: string
  readyToDispatch: { count: number }
  dispatchBlocked: { count: number }
  dispatchedThisWeek: { count: number; dispatchValue: number }
  ewayBillsExpiring: { expiringWeek: number; expiringToday: number }
  revenuePendingInvoice: { count: number; revenuePending: number }
  stageFlow: DispatchStageFlow
  pipelineTable: DispatchPipelineRow[]
  scheduleThisWeek: DispatchScheduleRow[]
  onTimeDispatch: OnTimeDispatchMonth[]
  actionQueue: DispatchActionQueue
}
