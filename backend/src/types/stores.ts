// ── Stores Head homepage (HP-STR-001) — single site (PISPL) ─────────────────
// Source: proman-docs/Store_Head_Dashboard_SQL_Queries_v2.md

// ── W-STR-01..04 KPIs ─────────────────────────────────────────────────────────

export interface GrnsPendingToday {
  count: number
}

export interface MaterialIssuesPending {
  count: number
}

export interface StockBelowReorder {
  belowReorder: number
  stockOut: number
}

export interface SubcontractingOrders {
  count: number
}

// ── W-STR-06 Pending GRN list ─────────────────────────────────────────────────

export interface PendingGrnRow {
  poNo: string
  vendor: string
  firstItem: string
  itemCount: number
  orderedQty: number
  requiredBy: string
  daysOverdue: number   // +ve overdue, 0 today, -ve future
}

// ── W-STR-07 Material issue queue (Pick List) ────────────────────────────────

export interface PickListRow {
  pickListId: string
  workOrder: string | null
  pickedQty: number
  requiredQty: number
  status: string
  pickDate: string
}

// ── W-STR-08 Stock alerts ─────────────────────────────────────────────────────

export interface StockOutAlertRow {
  itemCode: string
  itemName: string
  workOrder: string | null
  plannedEnd: string | null
  neededQty: number
}

export interface BelowReorderNoPoRow {
  itemCode: string
  itemName: string
  currentStock: number
  reorderLevel: number
  warehouse: string
}

export interface StockAlerts {
  stockOutBlockingProduction: StockOutAlertRow[]
  belowReorderNoOpenPo: BelowReorderNoPoRow[]
}

// ── W-STR-09 Expected deliveries (PO + Subcontracting) ───────────────────────

export interface ExpectedDeliveryDay {
  deliveryDate: string
  poCount: number
  subcontractingCount: number
  totalCount: number
}

// ── W-STR-10 Slow-moving stock ────────────────────────────────────────────────

export interface SlowMovingStockRow {
  itemCode: string
  itemName: string
  category: string
  currentQty: number
  unitValue: number
  totalValue: number
  lastMovement: string
  daysIdle: number
}

// ── W-STR-11 Action queue (2 tabs) ───────────────────────────────────────────
// "Returns Pending" tab removed in v2, per the user.

export interface CountVarianceRow {
  postingDate: string
  itemCode: string
  systemQty: number
  physicalQty: number
  varianceQty: number
  varianceValue: number
  reconciliation: string
}

export interface GrnRaisedTodayRow {
  grnNo: string
  vendor: string
  firstItem: string
  itemCount: number
  value: number
  createdBy: string
}

export interface ActionQueue {
  countVariances: CountVarianceRow[]
  grnsRaisedToday: GrnRaisedTodayRow[]
}

// ── W-STR-12 Warehouse stock value ───────────────────────────────────────────

export interface WarehouseStockValueRow {
  warehouse: string
  items: number
  totalQty: number
  stockValue: number
}

// ── Full homepage payload ─────────────────────────────────────────────────────

export interface StoresHomepageData {
  syncedAt: string
  erpBaseUrl: string
  grnsPendingToday: GrnsPendingToday
  materialIssuesPending: MaterialIssuesPending
  stockBelowReorder: StockBelowReorder
  subcontractingOrders: SubcontractingOrders
  pendingGrnList: PendingGrnRow[]
  materialIssueQueue: PickListRow[]
  stockAlerts: StockAlerts
  expectedDeliveries: ExpectedDeliveryDay[]
  slowMovingStock: SlowMovingStockRow[]
  actionQueue: ActionQueue
  warehouseStockValue: WarehouseStockValueRow[]
}
