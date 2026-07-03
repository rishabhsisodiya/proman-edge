// ── Stores Head homepage (HP-STR-001) — single site (PISPL) ─────────────────

export interface PendingGrnRow {
  poNo: string
  vendor: string
  firstItem: string
  itemCount: number
  orderedQty: number
  requiredBy: string
  daysOverdue: number
}

export interface PickListRow {
  pickListId: string
  workOrder: string | null
  pickedQty: number
  requiredQty: number
  status: string
}

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

export interface ExpectedDeliveryDay {
  deliveryDate: string
  poCount: number
  totalValue: number
  top3Vendors: string
  vendorCount: number
}

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

export interface CountVarianceRow {
  itemCode: string
  systemQty: number
  physicalQty: number
  varianceQty: number
  varianceValue: number
  reconciliation: string
}

export interface ReturnPendingRow {
  workOrder: string
  itemReturned: string
  returnPendingQty: number
  status: string
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
  returnsPending: ReturnPendingRow[]
  grnsRaisedToday: GrnRaisedTodayRow[]
}

export interface WarehouseStockValueRow {
  warehouse: string
  items: number
  totalQty: number
  stockValue: number
}

export interface StoresHomepageData {
  syncedAt: string
  erpBaseUrl: string
  grnsPendingToday: { count: number }
  materialIssuesPending: { count: number }
  stockBelowReorder: { belowReorder: number; stockOut: number }
  returnNotesOpen: { count: number }
  pendingGrnList: PendingGrnRow[]
  materialIssueQueue: PickListRow[]
  stockAlerts: StockAlerts
  expectedDeliveries: ExpectedDeliveryDay[]
  slowMovingStock: SlowMovingStockRow[]
  actionQueue: ActionQueue
  warehouseStockValue: WarehouseStockValueRow[]
}
