import { query, queryBigSelect } from '../db'
import { cacheGet, cacheSet } from '../cache/redis'
import type {
  StoresHomepageData, GrnsPendingToday, MaterialIssuesPending, StockBelowReorder,
  ReturnNotesOpen, PendingGrnRow, PickListRow, StockAlerts, StockOutAlertRow,
  BelowReorderNoPoRow, ExpectedDeliveryDay, SlowMovingStockRow, ActionQueue,
  CountVarianceRow, ReturnPendingRow, GrnRaisedTodayRow, WarehouseStockValueRow,
} from '../types/stores'

// Single site (PISPL) — this DB connection is already scoped to the one
// manufacturing facility, so unlike Finance there is no company filter / fan-out.

const erpBaseUrl = () => (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '')

// ── W-STR-01 — GRNs pending today (KPI) ──────────────────────────────────────

// FAST: filter the INDEXED status first (schedule_date/per_received are NOT
// indexed — a bare filter scans all 46,739 POs, ~9s). status IN ('To Receive',
// 'To Receive and Bill') = exactly the submitted, GRN-pending POs. ~0.1s.
async function getGrnsPendingToday(): Promise<GrnsPendingToday> {
  const rows = await query<{ grns_pending_today: number }>(
    `SELECT COUNT(*) AS grns_pending_today
     FROM \`tabPurchase Order\`
     WHERE status IN ('To Receive', 'To Receive and Bill')
       AND schedule_date = CURDATE()`,
  )
  return { count: Number(rows[0]?.grns_pending_today ?? 0) }
}

// ── W-STR-02 — Material issues pending (KPI) ─────────────────────────────────
// Pick List (WO-linked, indexed status), not Material Request — see W-STR-07.

async function getMaterialIssuesPending(): Promise<MaterialIssuesPending> {
  const rows = await query<{ material_issues_pending: number }>(
    `SELECT COUNT(*) AS material_issues_pending
     FROM \`tabPick List\`
     WHERE purpose = 'Material Transfer for Manufacture'
       AND status IN ('Open', 'Draft')
       AND docstatus < 2`,
  )
  return { count: Number(rows[0]?.material_issues_pending ?? 0) }
}

// ── W-STR-03 — Stock below reorder (KPI) ─────────────────────────────────────

async function getStockBelowReorder(): Promise<StockBelowReorder> {
  const rows = await query<{ below_reorder: number; stock_out: number }>(
    `SELECT
        COUNT(*)                        AS below_reorder,
        SUM(IFNULL(b.actual_qty, 0) = 0) AS stock_out
     FROM \`tabItem Reorder\` ir
     LEFT JOIN \`tabBin\` b
         ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
     WHERE ir.warehouse_reorder_level > 0
       AND IFNULL(b.actual_qty, 0) < ir.warehouse_reorder_level`,
  )
  return { belowReorder: Number(rows[0]?.below_reorder ?? 0), stockOut: Number(rows[0]?.stock_out ?? 0) }
}

// ── W-STR-04 — Return notes open (KPI) ───────────────────────────────────────

async function getReturnNotesOpen(): Promise<ReturnNotesOpen> {
  const rows = await query<{ return_notes_open: number }>(
    `SELECT COUNT(DISTINCT wo.name) AS return_notes_open
     FROM \`tabWork Order\` wo
     JOIN \`tabWork Order Item\` woi ON woi.parent = wo.name
     WHERE wo.docstatus = 1
       AND wo.status IN ('Completed', 'Closed')
       AND woi.transferred_qty > (woi.consumed_qty + woi.returned_qty)`,
  )
  return { count: Number(rows[0]?.return_notes_open ?? 0) }
}

// ── W-STR-06 — Pending GRN list ───────────────────────────────────────────────

async function getPendingGrnList(): Promise<PendingGrnRow[]> {
  const rows = await query<{
    po_no: string; vendor: string; first_item: string | null; item_count: number
    ordered_qty: number; required_by: string; days_overdue: number
  }>(
    `SELECT
        po.name                              AS po_no,
        po.supplier                          AS vendor,
        COALESCE(fi.item_name, fi.item_code) AS first_item,
        ic.n                                 AS item_count,
        fi.qty                               AS ordered_qty,
        po.schedule_date                     AS required_by,
        DATEDIFF(CURDATE(), po.schedule_date) AS days_overdue
     FROM \`tabPurchase Order\` po
     LEFT JOIN \`tabPurchase Order Item\` fi
         ON fi.parent = po.name AND fi.idx = 1
     LEFT JOIN (
         SELECT parent, COUNT(*) AS n FROM \`tabPurchase Order Item\` GROUP BY parent
     ) ic ON ic.parent = po.name
     WHERE po.status IN ('To Receive', 'To Receive and Bill')
     ORDER BY po.schedule_date ASC
     LIMIT 50`,
  )
  return rows.map(r => ({
    poNo: r.po_no, vendor: r.vendor, firstItem: r.first_item ?? '—', itemCount: Number(r.item_count ?? 1),
    orderedQty: Number(r.ordered_qty ?? 0), requiredBy: r.required_by, daysOverdue: Number(r.days_overdue),
  }))
}

// ── W-STR-07 — Material issue queue (Pick List) ──────────────────────────────
// Pick Lists are WO-linked and represent the material to pick/issue; Material
// Requests were not WO-linked on this data, so the doc moved this to Pick List.

async function getMaterialIssueQueue(): Promise<PickListRow[]> {
  const rows = await query<{
    pick_list_id: string; wo_id: string | null; picked_qty: number; required_qty: number; status: string
  }>(
    `SELECT
        pl.name AS pick_list_id,
        pl.work_order AS wo_id,
        ROUND(SUM(pli.picked_qty), 2) AS picked_qty,
        ROUND(SUM(pli.qty), 2) AS required_qty,
        pl.status
     FROM \`tabPick List\` pl
     JOIN \`tabPick List Item\` pli ON pli.parent = pl.name
     WHERE pl.purpose = 'Material Transfer for Manufacture'
       AND pl.status IN ('Open', 'Draft')
       AND pl.docstatus < 2
     GROUP BY pl.name, pl.work_order, pl.status
     ORDER BY pl.modified DESC`,
  )
  return rows.map(r => ({
    pickListId: r.pick_list_id, workOrder: r.wo_id, pickedQty: Number(r.picked_qty),
    requiredQty: Number(r.required_qty), status: r.status,
  }))
}

// ── W-STR-08 — Stock alerts (2 sections; needs SQL_BIG_SELECTS) ─────────────

async function getStockOutBlockingProduction(): Promise<StockOutAlertRow[]> {
  const rows = await queryBigSelect<{
    item_code: string; item_name: string; work_order: string; planned_end: string | null; needed_qty: number
  }>(
    `SELECT
        woi.item_code,
        MAX(it.item_name) AS item_name,
        SUBSTRING_INDEX(
            GROUP_CONCAT(DISTINCT wo.name ORDER BY wo.planned_end_date ASC), ',', 1
        ) AS work_order,
        MIN(wo.planned_end_date) AS planned_end,
        SUM(woi.required_qty - woi.transferred_qty) AS needed_qty
     FROM \`tabWork Order Item\` woi
     JOIN \`tabWork Order\` wo ON wo.name = woi.parent
     JOIN \`tabItem\` it ON it.name = woi.item_code
     WHERE wo.docstatus = 1
       AND wo.status IN ('Not Started', 'In Process')
       AND woi.transferred_qty < woi.required_qty
     GROUP BY woi.item_code
     HAVING IFNULL(
         (SELECT SUM(b.actual_qty) FROM \`tabBin\` b WHERE b.item_code = woi.item_code), 0
     ) = 0
     ORDER BY planned_end ASC`,
  )
  return rows.map(r => ({
    itemCode: r.item_code, itemName: r.item_name, workOrder: r.work_order || null,
    plannedEnd: r.planned_end, neededQty: Number(r.needed_qty),
  }))
}

async function getBelowReorderNoOpenPo(): Promise<BelowReorderNoPoRow[]> {
  const rows = await query<{
    item_code: string; item_name: string; current_stock: number; reorder_level: number; warehouse: string
  }>(
    `SELECT
        ir.parent AS item_code, it.item_name,
        IFNULL(b.actual_qty, 0)        AS current_stock,
        ir.warehouse_reorder_level     AS reorder_level,
        ir.warehouse
     FROM \`tabItem Reorder\` ir
     JOIN \`tabItem\` it ON it.name = ir.parent
     LEFT JOIN \`tabBin\` b
         ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
     WHERE ir.warehouse_reorder_level > 0
       AND IFNULL(b.actual_qty, 0) < ir.warehouse_reorder_level
       AND ir.parent NOT IN (
           -- items with an open PO, computed ONCE (a per-row NOT EXISTS was ~10x slower)
           SELECT DISTINCT poi.item_code FROM \`tabPurchase Order Item\` poi
           JOIN \`tabPurchase Order\` po ON po.name = poi.parent
           WHERE po.status IN ('To Receive', 'To Receive and Bill')
       )
     ORDER BY (IFNULL(b.actual_qty, 0) = 0) DESC, ir.warehouse_reorder_level DESC
     LIMIT 50`,
  )
  return rows.map(r => ({
    itemCode: r.item_code, itemName: r.item_name, currentStock: Number(r.current_stock),
    reorderLevel: Number(r.reorder_level), warehouse: r.warehouse,
  }))
}

async function getStockAlerts(): Promise<StockAlerts> {
  const [stockOutBlockingProduction, belowReorderNoOpenPo] = await Promise.all([
    getStockOutBlockingProduction(),
    getBelowReorderNoOpenPo(),
  ])
  return { stockOutBlockingProduction, belowReorderNoOpenPo }
}

// ── W-STR-09 — Expected deliveries this week ──────────────────────────────────

async function getExpectedDeliveries(): Promise<ExpectedDeliveryDay[]> {
  const rows = await query<{
    delivery_date: string; po_count: number; total_value: number; top3_vendors: string; vendor_count: number
  }>(
    `SELECT
        po.schedule_date          AS delivery_date,
        COUNT(*)                  AS po_count,
        SUM(po.base_grand_total)  AS total_value,
        SUBSTRING_INDEX(
            GROUP_CONCAT(DISTINCT po.supplier ORDER BY po.base_grand_total DESC SEPARATOR ' | '),
            ' | ', 3
        )                         AS top3_vendors,
        COUNT(DISTINCT po.supplier) AS vendor_count
     FROM \`tabPurchase Order\` po
     WHERE po.status IN ('To Receive', 'To Receive and Bill')
       AND po.schedule_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY
     GROUP BY po.schedule_date
     ORDER BY po.schedule_date ASC`,
  )
  return rows.map(r => ({
    deliveryDate: r.delivery_date, poCount: Number(r.po_count), totalValue: Number(r.total_value),
    top3Vendors: r.top3_vendors, vendorCount: Number(r.vendor_count),
  }))
}

// ── W-STR-10 — Slow-moving stock ──────────────────────────────────────────────
// Last movement = MAX(Bin.modified) (a stock posting updates the Bin) — this is
// now the doc's official query, not a workaround: MAX(posting_date) over the
// whole Stock Ledger Entry was ~51-60s (867K rows, no usable index); Bin is
// 71,967 rows → ~0.9s, and returns the same top idle items.

async function getSlowMovingStock(): Promise<SlowMovingStockRow[]> {
  const rows = await query<{
    item_code: string; item_name: string; category: string; current_qty: number
    unit_value: number | null; total_value: number; last_movement: string; days_idle: number
  }>(
    `SELECT
        b.item_code, it.item_name, it.item_group AS category,
        ROUND(SUM(b.actual_qty), 2)                              AS current_qty,
        ROUND(SUM(b.stock_value) / NULLIF(SUM(b.actual_qty), 0), 2) AS unit_value,
        ROUND(SUM(b.stock_value), 2)                             AS total_value,
        MAX(b.modified)                                          AS last_movement,
        DATEDIFF(CURDATE(), MAX(b.modified))                     AS days_idle
     FROM \`tabBin\` b
     JOIN \`tabItem\` it ON it.name = b.item_code
     WHERE b.actual_qty > 0
     GROUP BY b.item_code
     ORDER BY days_idle DESC
     LIMIT 10`,
  )
  return rows.map(r => ({
    itemCode: r.item_code, itemName: r.item_name, category: r.category, currentQty: Number(r.current_qty),
    unitValue: Number(r.unit_value ?? 0), totalValue: Number(r.total_value),
    lastMovement: r.last_movement, daysIdle: Number(r.days_idle),
  }))
}

// ── W-STR-11 — Action queue, tab 3 only: GRNs raised today ───────────────────
// Tab 1: open (draft) Stock Reconciliations where physical count != system stock.

async function getCountVariances(): Promise<CountVarianceRow[]> {
  const rows = await query<{
    item_code: string; system_qty: number; physical_qty: number
    variance_qty: number; variance_value: number; reconciliation: string
  }>(
    `SELECT
        sri.item_code,
        sri.current_qty AS system_qty,
        sri.qty AS physical_qty,
        ROUND(sri.qty - sri.current_qty, 2) AS variance_qty,
        ROUND(sri.amount_difference, 2) AS variance_value,
        sr.name AS reconciliation
     FROM \`tabStock Reconciliation\` sr
     JOIN \`tabStock Reconciliation Item\` sri ON sri.parent = sr.name
     WHERE sr.docstatus = 0 AND sri.amount_difference <> 0
     ORDER BY ABS(sri.amount_difference) DESC
     LIMIT 50`,
  )
  return rows.map(r => ({
    itemCode: r.item_code, systemQty: Number(r.system_qty), physicalQty: Number(r.physical_qty),
    varianceQty: Number(r.variance_qty), varianceValue: Number(r.variance_value), reconciliation: r.reconciliation,
  }))
}

// Tab 2: excess material not returned from completed/closed WOs — no "Material
// Transfer Back" Stock Entry type exists here, so WO-based (same condition as W-STR-04).

async function getReturnsPending(): Promise<ReturnPendingRow[]> {
  const rows = await query<{
    work_order: string; item_returned: string; return_pending_qty: number; status: string
  }>(
    `SELECT
        wo.name AS work_order,
        COALESCE(woi.item_name, woi.item_code) AS item_returned,
        ROUND(woi.transferred_qty - woi.consumed_qty - woi.returned_qty, 2) AS return_pending_qty,
        wo.status
     FROM \`tabWork Order\` wo
     JOIN \`tabWork Order Item\` woi ON woi.parent = wo.name
     WHERE wo.docstatus = 1 AND wo.status IN ('Completed', 'Closed')
       AND woi.transferred_qty > (woi.consumed_qty + woi.returned_qty)
     ORDER BY return_pending_qty DESC
     LIMIT 50`,
  )
  return rows.map(r => ({
    workOrder: r.work_order, itemReturned: r.item_returned,
    returnPendingQty: Number(r.return_pending_qty), status: r.status,
  }))
}

async function getGrnsRaisedToday(): Promise<GrnRaisedTodayRow[]> {
  const rows = await query<{
    grn_no: string; vendor: string; first_item: string | null; item_count: number; value: number; created_by: string
  }>(
    `SELECT
        pr.name                              AS grn_no,
        pr.supplier                          AS vendor,
        COALESCE(fi.item_name, fi.item_code) AS first_item,
        ic.n                                 AS item_count,
        pr.base_grand_total                  AS value,
        pr.owner                             AS created_by
     FROM \`tabPurchase Receipt\` pr
     LEFT JOIN \`tabPurchase Receipt Item\` fi
         ON fi.parent = pr.name AND fi.idx = 1
     LEFT JOIN (
         SELECT parent, COUNT(*) AS n FROM \`tabPurchase Receipt Item\` GROUP BY parent
     ) ic ON ic.parent = pr.name
     WHERE pr.docstatus = 1
       AND pr.posting_date = CURDATE()
     ORDER BY pr.creation DESC`,
  )
  return rows.map(r => ({
    grnNo: r.grn_no, vendor: r.vendor, firstItem: r.first_item ?? '—', itemCount: Number(r.item_count ?? 1),
    value: Number(r.value), createdBy: r.created_by,
  }))
}

async function getActionQueue(): Promise<ActionQueue> {
  const [countVariances, returnsPending, grnsRaisedToday] = await Promise.all([
    getCountVariances(),
    getReturnsPending(),
    getGrnsRaisedToday(),
  ])
  return { countVariances, returnsPending, grnsRaisedToday }
}

// ── W-STR-12 — Warehouse stock value ─────────────────────────────────────────

async function getWarehouseStockValue(): Promise<WarehouseStockValueRow[]> {
  const rows = await query<{ warehouse: string; items: number; total_qty: number; stock_value: number }>(
    `SELECT
        b.warehouse,
        COUNT(DISTINCT b.item_code)  AS items,
        ROUND(SUM(b.actual_qty), 2)  AS total_qty,
        ROUND(SUM(b.stock_value), 2) AS stock_value
     FROM \`tabBin\` b
     WHERE b.actual_qty <> 0
     GROUP BY b.warehouse
     HAVING stock_value <> 0
     ORDER BY stock_value DESC`,
  )
  return rows.map(r => ({
    warehouse: r.warehouse, items: Number(r.items), totalQty: Number(r.total_qty), stockValue: Number(r.stock_value),
  }))
}

// ── Main homepage aggregate ───────────────────────────────────────────────────
// Cached — several of these queries run multi-second full scans against large
// ERPNext tables (e.g. Stock Ledger Entry) on this DB; we cannot add indexes
// ourselves (schema changes are ERP-side/Shivam's call), so Redis absorbs the
// cost across the 5-minute frontend poll window instead of recomputing every load.

const CACHE_KEY = 'stores:homepage'
const CACHE_TTL = 300 // 5 minutes — matches frontend refreshInterval

export async function getStoresHomepage(): Promise<StoresHomepageData> {
  const cached = await cacheGet<StoresHomepageData>(CACHE_KEY)
  if (cached) return cached

  const data = await computeStoresHomepage()
  await cacheSet(CACHE_KEY, data, CACHE_TTL)
  return data
}

async function computeStoresHomepage(): Promise<StoresHomepageData> {
  const [
    grnsPendingToday, materialIssuesPending, stockBelowReorder, returnNotesOpen,
    pendingGrnList, materialIssueQueue, stockAlerts, expectedDeliveries,
    slowMovingStock, actionQueue, warehouseStockValue,
  ] = await Promise.all([
    getGrnsPendingToday(),
    getMaterialIssuesPending(),
    getStockBelowReorder(),
    getReturnNotesOpen(),
    getPendingGrnList(),
    getMaterialIssueQueue(),
    getStockAlerts(),
    getExpectedDeliveries(),
    getSlowMovingStock(),
    getActionQueue(),
    getWarehouseStockValue(),
  ])

  return {
    syncedAt: new Date().toISOString(),
    erpBaseUrl: erpBaseUrl(),
    grnsPendingToday,
    materialIssuesPending,
    stockBelowReorder,
    returnNotesOpen,
    pendingGrnList,
    materialIssueQueue,
    stockAlerts,
    expectedDeliveries,
    slowMovingStock,
    actionQueue,
    warehouseStockValue,
  }
}
