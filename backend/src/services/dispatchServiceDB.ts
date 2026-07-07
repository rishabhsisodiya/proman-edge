import { query } from '../db'
import { cacheGet, cacheSet } from '../cache/redis'
import type {
  DispatchHomepageData, ReadyToDispatch, DispatchBlocked, DispatchedThisWeek,
  EwayBillsExpiring, RevenuePendingInvoice, DispatchStageFlow, DispatchPipelineRow,
  DocumentationChecklist, EwayBillRow, DispatchScheduleRow, OnTimeDispatchMonth,
  DispatchActionQueue, DnToSubmitRow, InvoiceAwaitingDispatchRow,
} from '../types/dispatch'

// Single site (PISPL) — read-only, per proman-docs/Dispatch_Head_SQL_Queries.md.

const erpBaseUrl = () => (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '')

// ── W-DSP-01 — Ready to dispatch (KPI) ───────────────────────────────────────

async function getReadyToDispatch(): Promise<ReadyToDispatch> {
  const rows = await query<{ ready_to_dispatch: number }>(
    `SELECT COUNT(DISTINCT so.name) AS ready_to_dispatch
     FROM \`tabSales Order\` so
     WHERE so.docstatus = 1
       AND EXISTS (
         SELECT 1 FROM \`tabWork Order\` wo
         WHERE wo.sales_order = so.name
           AND wo.docstatus = 1
           AND EXISTS (SELECT 1 FROM \`tabJob Card\` jc WHERE jc.work_order = wo.name)
           AND NOT EXISTS (SELECT 1 FROM \`tabJob Card\` jc2
                           WHERE jc2.work_order = wo.name AND jc2.status <> 'Completed')
           AND NOT EXISTS (
             SELECT 1 FROM \`tabJob Card\` jc3
             WHERE jc3.work_order = wo.name
               AND NOT EXISTS (SELECT 1 FROM \`tabQuality Inspection\` qi
                               WHERE qi.reference_type = 'Job Card'
                                 AND qi.reference_name = jc3.name
                                 AND qi.status = 'Accepted')
           )
       )`,
  )
  return { count: Number(rows[0]?.ready_to_dispatch ?? 0) }
}

// ── W-DSP-02 — Dispatch blocked (KPI) ────────────────────────────────────────

async function getDispatchBlocked(): Promise<DispatchBlocked> {
  const rows = await query<{ dispatch_blocked: number }>(
    `SELECT COUNT(*) AS dispatch_blocked
     FROM \`tabDelivery Note\` dn
     WHERE dn.docstatus = 0 AND dn.is_return = 0
       AND (
             dn.per_billed < 100
          OR IFNULL(dn.ewaybill, '')   = ''
          OR IFNULL(dn.vehicle_no, '') = ''
          OR NOT EXISTS (
               SELECT 1 FROM \`tabDelivery Note Item\` dni
               JOIN \`tabSales Order\` so ON so.name = dni.against_sales_order
               WHERE dni.parent = dn.name AND IFNULL(so.po_no, '') <> '')
          OR NOT EXISTS (
               SELECT 1 FROM \`tabQuality Inspection\` qi
               WHERE qi.reference_type = 'Delivery Note' AND qi.reference_name = dn.name)
           )`,
  )
  return { count: Number(rows[0]?.dispatch_blocked ?? 0) }
}

// ── W-DSP-03 — Dispatched this week (KPI) ────────────────────────────────────

async function getDispatchedThisWeek(): Promise<DispatchedThisWeek> {
  const rows = await query<{ dispatched_this_week: number; dispatch_value: number }>(
    `SELECT
        COUNT(*)                                     AS dispatched_this_week,
        ROUND(COALESCE(SUM(base_grand_total), 0), 2) AS dispatch_value
     FROM \`tabDelivery Note\`
     WHERE docstatus = 1 AND is_return = 0
       AND posting_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
       AND posting_date <= CURDATE()`,
  )
  return {
    count: Number(rows[0]?.dispatched_this_week ?? 0),
    dispatchValue: Number(rows[0]?.dispatch_value ?? 0),
  }
}

// ── W-DSP-04 — e-Way bills expiring (KPI) ────────────────────────────────────

async function getEwayBillsExpiring(): Promise<EwayBillsExpiring> {
  const rows = await query<{ ewb_expiring_week: number; expiring_today: number }>(
    `SELECT
        COUNT(*)                                       AS ewb_expiring_week,
        COALESCE(SUM(DATE(valid_upto) = CURDATE()), 0) AS expiring_today
     FROM \`tabe-Waybill Log\`
     WHERE is_cancelled = 0
       AND reference_doctype IN ('Sales Invoice', 'Delivery Note')
       AND valid_upto >= NOW()
       AND valid_upto <  NOW() + INTERVAL 7 DAY`,
  )
  return {
    expiringWeek: Number(rows[0]?.ewb_expiring_week ?? 0),
    expiringToday: Number(rows[0]?.expiring_today ?? 0),
  }
}

// ── W-DSP-05 — Revenue pending invoice (KPI) ─────────────────────────────────

async function getRevenuePendingInvoice(): Promise<RevenuePendingInvoice> {
  const rows = await query<{ dns_pending_invoice: number; revenue_pending: number }>(
    `SELECT
        COUNT(*)                                                    AS dns_pending_invoice,
        ROUND(SUM(base_grand_total * (100 - per_billed) / 100), 2)  AS revenue_pending
     FROM \`tabDelivery Note\`
     WHERE docstatus = 1 AND is_return = 0
       AND per_billed < 100
       AND YEAR(posting_date) = YEAR(CURDATE())`,
  )
  return {
    count: Number(rows[0]?.dns_pending_invoice ?? 0),
    revenuePending: Number(rows[0]?.revenue_pending ?? 0),
  }
}

// ── W-DSP-06 — Dispatch readiness pipeline (stage-flow + table) ─────────────

async function getDispatchStageFlow(): Promise<DispatchStageFlow> {
  const rows = await query<{
    qc_pending: number; qc_cleared: number; docs_pending: number
    docs_complete: number; vehicle_booked: number; dispatched: number
  }>(
    `SELECT
        SUM(stage='QC pending')     AS qc_pending,
        SUM(stage='QC cleared')     AS qc_cleared,
        SUM(stage='Docs pending')   AS docs_pending,
        SUM(stage='Docs complete')  AS docs_complete,
        SUM(stage='Vehicle booked') AS vehicle_booked,
        SUM(stage='Dispatched')     AS dispatched
     FROM (
       SELECT
         CASE
           WHEN IFNULL(dn.vehicle_no,'') <> ''                              THEN 'Vehicle booked'
           WHEN f.has_si = 1 AND f.has_po = 1 AND f.has_eway = 1            THEN 'Docs complete'
           WHEN f.has_qc = 1 AND (f.has_si = 1 OR f.has_po = 1 OR f.has_eway = 1) THEN 'Docs pending'
           WHEN f.has_qc = 1                                                THEN 'QC cleared'
           ELSE 'QC pending'
         END AS stage
       FROM \`tabDelivery Note\` dn
       JOIN (
         SELECT dn2.name,
           EXISTS(SELECT 1 FROM \`tabQuality Inspection\` qi
                  WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn2.name AND qi.status='Accepted') AS has_qc,
           EXISTS(SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                  WHERE d2.parent=dn2.name AND IFNULL(s2.po_no,'')<>'') AS has_po,
           (IFNULL(dn2.ewaybill,'') <> '') AS has_eway,
           (dn2.per_billed >= 100)         AS has_si
         FROM \`tabDelivery Note\` dn2 WHERE dn2.docstatus=0 AND dn2.is_return=0
       ) f ON f.name = dn.name
       WHERE dn.docstatus=0 AND dn.is_return=0

       UNION ALL
       SELECT 'Dispatched'
       FROM \`tabDelivery Note\` dn
       WHERE dn.docstatus=1 AND dn.is_return=0
         AND dn.posting_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
         AND dn.posting_date <= CURDATE()
     ) x`,
  )
  const r = rows[0]
  return {
    qcPending: Number(r?.qc_pending ?? 0),
    qcCleared: Number(r?.qc_cleared ?? 0),
    docsPending: Number(r?.docs_pending ?? 0),
    docsComplete: Number(r?.docs_complete ?? 0),
    vehicleBooked: Number(r?.vehicle_booked ?? 0),
    dispatched: Number(r?.dispatched ?? 0),
  }
}

async function getDispatchPipelineTable(): Promise<DispatchPipelineRow[]> {
  const rows = await query<{
    dn_no: string; customer_name: string; product: string
    target_date: string | null; blocker: DispatchPipelineRow['blocker']
  }>(
    `SELECT
        dn.name AS dn_no,
        dn.customer_name,
        CONCAT(SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT di.item_name ORDER BY di.idx SEPARATOR '||'), '||', 1),
               IF(COUNT(DISTINCT di.item_code) > 1, ' …', '')) AS product,
        MIN(so.delivery_date) AS target_date,
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM \`tabQuality Inspection\` qi
                           WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn.name) THEN 'QC pending'
          WHEN NOT EXISTS (SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                           WHERE d2.parent=dn.name AND IFNULL(s2.po_no,'')<>'') THEN 'Customer PO pending'
          WHEN IFNULL(dn.ewaybill,'')  = '' THEN 'e-Way bill pending'
          WHEN IFNULL(dn.vehicle_no,'') = '' THEN 'Vehicle pending'
          ELSE 'Ready'
        END AS blocker
     FROM \`tabDelivery Note\` dn
     LEFT JOIN \`tabDelivery Note Item\` di ON di.parent = dn.name
     LEFT JOIN \`tabSales Order\` so ON so.name = di.against_sales_order
     WHERE dn.docstatus = 0 AND dn.is_return = 0
     GROUP BY dn.name, dn.customer_name, dn.ewaybill, dn.vehicle_no
     ORDER BY target_date ASC`,
  )
  return rows.map(r => ({
    dnNo: r.dn_no, customerName: r.customer_name, product: r.product,
    targetDate: r.target_date, blocker: r.blocker,
  }))
}

// ── W-DSP-07 — Documentation checklist (per Delivery Note) ──────────────────

export async function getDocumentationChecklist(dnName: string): Promise<DocumentationChecklist | null> {
  const rows = await query<{
    dn_no: string; customer_name: string; qc_certificate: 'Done' | 'Pending'
    sales_invoice_approved: 'Done' | 'Pending'; eway_bill_generated: 'Done' | 'Pending'
    vehicle_booking_confirmed: 'Done' | 'Pending'; customer_po_verified: 'Done' | 'Pending'
    packing_list_attached: 'Done' | 'Pending'
  }>(
    `SELECT
        dn.name          AS dn_no,
        dn.customer_name,
        IF(EXISTS(SELECT 1 FROM \`tabQuality Inspection\` qi
                  WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn.name AND qi.status='Accepted'),
           'Done','Pending')                                          AS qc_certificate,
        IF(dn.per_billed >= 100, 'Done','Pending')                    AS sales_invoice_approved,
        IF(IFNULL(dn.ewaybill,'')   <> '', 'Done','Pending')          AS eway_bill_generated,
        IF(IFNULL(dn.vehicle_no,'') <> '', 'Done','Pending')          AS vehicle_booking_confirmed,
        IF(EXISTS(SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                  WHERE d2.parent=dn.name AND IFNULL(s2.po_no,'')<>''),
           'Done','Pending')                                          AS customer_po_verified,
        IF(EXISTS(SELECT 1 FROM \`tabPacking Slip\` ps WHERE ps.delivery_note=dn.name AND ps.docstatus<2),
           'Done','Pending')                                          AS packing_list_attached
     FROM \`tabDelivery Note\` dn
     WHERE dn.name = ?`,
    [dnName],
  )
  const r = rows[0]
  if (!r) return null
  return {
    dnNo: r.dn_no,
    customerName: r.customer_name,
    qcCertificate: r.qc_certificate,
    salesInvoiceApproved: r.sales_invoice_approved,
    ewayBillGenerated: r.eway_bill_generated,
    vehicleBookingConfirmed: r.vehicle_booking_confirmed,
    customerPoVerified: r.customer_po_verified,
    packingListAttached: r.packing_list_attached,
    customerSiteConfirmed: 'Manual',
    testCertificateAttached: 'Manual',
  }
}

// ── W-DSP-08 — e-Way bill status (table) ─────────────────────────────────────

export async function getEwayBillStatus(): Promise<EwayBillRow[]> {
  const rows = await query<{
    eway_bill: string; linked_doctype: string; linked_doc: string
    party: string; valid_upto: string; status: EwayBillRow['status']
  }>(
    `SELECT
        ewb.e_waybill_number  AS eway_bill,
        ewb.reference_doctype AS linked_doctype,
        ewb.reference_name    AS linked_doc,
        COALESCE(si.customer_name, dn.customer_name) AS party,
        ewb.valid_upto,
        CASE
          WHEN ewb.valid_upto <  NOW()                  THEN 'Expired'
          WHEN DATE(ewb.valid_upto) = CURDATE()         THEN 'Extend (today)'
          WHEN ewb.valid_upto <  NOW() + INTERVAL 2 DAY THEN 'Expiring soon'
          ELSE 'Valid'
        END AS status
     FROM \`tabe-Waybill Log\` ewb
     LEFT JOIN \`tabSales Invoice\` si ON ewb.reference_doctype = 'Sales Invoice' AND si.name = ewb.reference_name
     LEFT JOIN \`tabDelivery Note\` dn ON ewb.reference_doctype = 'Delivery Note' AND dn.name = ewb.reference_name
     WHERE ewb.is_cancelled = 0
       AND ewb.reference_doctype IN ('Sales Invoice','Delivery Note')
       AND ewb.valid_upto >= NOW() - INTERVAL 3 DAY
     ORDER BY ewb.valid_upto ASC
     LIMIT 50`,
  )
  return rows.map(r => ({
    ewayBill: r.eway_bill, linkedDoctype: r.linked_doctype, linkedDoc: r.linked_doc,
    party: r.party, validUpto: r.valid_upto, status: r.status,
  }))
}

// ── W-DSP-09 — This week's dispatch schedule ─────────────────────────────────

async function getDispatchScheduleThisWeek(): Promise<DispatchScheduleRow[]> {
  const rows = await query<{
    delivery_date: string; so_no: string; customer_name: string; product: string; value: number
  }>(
    `SELECT
        so.delivery_date,
        so.name           AS so_no,
        so.customer_name,
        (SELECT soi.item_name FROM \`tabSales Order Item\` soi
         WHERE soi.parent = so.name ORDER BY soi.idx LIMIT 1) AS product,
        ROUND(so.base_grand_total, 0) AS value
     FROM \`tabSales Order\` so
     WHERE so.docstatus = 1
       AND so.status IN ('To Deliver','To Deliver and Bill')
       AND so.per_delivered < 100
       AND so.delivery_date BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
                                AND DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) + INTERVAL 6 DAY
     ORDER BY so.delivery_date ASC`,
  )
  return rows.map(r => ({
    deliveryDate: r.delivery_date, soNo: r.so_no, customerName: r.customer_name,
    product: r.product, value: Number(r.value),
  }))
}

// ── W-DSP-10 — On-time dispatch % (rolling 3 months) ─────────────────────────

async function getOnTimeDispatch(): Promise<OnTimeDispatchMonth[]> {
  const rows = await query<{
    month: string; total_dispatches: number; on_time: number; on_time_pct: number
  }>(
    `SELECT
        DATE_FORMAT(x.posting_date, '%Y-%m')                         AS month,
        COUNT(*)                                                     AS total_dispatches,
        SUM(x.posting_date <= x.promised)                           AS on_time,
        ROUND(SUM(x.posting_date <= x.promised) / COUNT(*) * 100, 0) AS on_time_pct
     FROM (
       SELECT dn.name, dn.posting_date, MAX(so.delivery_date) AS promised
       FROM \`tabDelivery Note\` dn
       JOIN \`tabDelivery Note Item\` dni ON dni.parent = dn.name
       JOIN \`tabSales Order\` so ON so.name = dni.against_sales_order
       WHERE dn.docstatus = 1 AND dn.is_return = 0
         AND dn.posting_date >= DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-01')
       GROUP BY dn.name, dn.posting_date
     ) x
     WHERE x.promised IS NOT NULL
     GROUP BY month
     ORDER BY month`,
  )
  return rows.map(r => ({
    month: r.month, totalDispatches: Number(r.total_dispatches),
    onTime: Number(r.on_time), onTimePct: Number(r.on_time_pct),
  }))
}

// ── W-DSP-11 — Action queue (2 tabs) ─────────────────────────────────────────

async function getDnsToSubmit(): Promise<DnToSubmitRow[]> {
  const rows = await query<{
    dn_no: string; customer_name: string; product: string | null; target_date: string | null; value: number
  }>(
    `SELECT
        dn.name AS dn_no, dn.customer_name,
        (SELECT di.item_name FROM \`tabDelivery Note Item\` di WHERE di.parent=dn.name ORDER BY di.idx LIMIT 1) AS product,
        MIN(so.delivery_date)         AS target_date,
        ROUND(dn.base_grand_total, 0) AS value
     FROM \`tabDelivery Note\` dn
     LEFT JOIN \`tabDelivery Note Item\` dni ON dni.parent = dn.name
     LEFT JOIN \`tabSales Order\` so ON so.name = dni.against_sales_order
     WHERE dn.docstatus = 0 AND dn.is_return = 0
       AND IFNULL(dn.ewaybill,'')   <> ''
       AND IFNULL(dn.vehicle_no,'') <> ''
       AND EXISTS (SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                   WHERE d2.parent=dn.name AND IFNULL(s2.po_no,'')<>'')
       AND EXISTS (SELECT 1 FROM \`tabQuality Inspection\` qi
                   WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn.name AND qi.status='Accepted')
     GROUP BY dn.name, dn.customer_name, dn.base_grand_total
     ORDER BY target_date ASC`,
  )
  return rows.map(r => ({
    dnNo: r.dn_no, customerName: r.customer_name, product: r.product ?? '—',
    targetDate: r.target_date, value: Number(r.value),
  }))
}

async function getInvoicesAwaitingDispatch(): Promise<InvoiceAwaitingDispatchRow[]> {
  const rows = await query<{
    invoice_no: string; customer_name: string; amount: number; posting_date: string; first_item: string | null
  }>(
    `SELECT
        si.name AS invoice_no, si.customer_name,
        ROUND(si.base_grand_total, 0) AS amount, si.posting_date,
        (SELECT sii.item_name FROM \`tabSales Invoice Item\` sii WHERE sii.parent=si.name ORDER BY sii.idx LIMIT 1) AS first_item
     FROM \`tabSales Invoice\` si
     WHERE si.docstatus = 1 AND si.is_return = 0 AND IFNULL(si.update_stock,0) = 0
       AND si.posting_date >= CURDATE() - INTERVAL 12 MONTH
       AND NOT EXISTS (SELECT 1 FROM \`tabSales Invoice Item\` sii
                       WHERE sii.parent=si.name AND IFNULL(sii.delivery_note,'')<>'')
       AND EXISTS (SELECT 1 FROM \`tabSales Invoice Item\` s3 JOIN \`tabItem\` it ON it.name=s3.item_code
                   WHERE s3.parent=si.name AND IFNULL(it.is_stock_item,0)=1)
     ORDER BY si.posting_date DESC`,
  )
  return rows.map(r => ({
    invoiceNo: r.invoice_no, customerName: r.customer_name, amount: Number(r.amount),
    postingDate: r.posting_date, firstItem: r.first_item ?? '—',
  }))
}

async function getDispatchActionQueue(): Promise<DispatchActionQueue> {
  const [dnsToSubmit, invoicesAwaitingDispatch] = await Promise.all([
    getDnsToSubmit(),
    getInvoicesAwaitingDispatch(),
  ])
  return { dnsToSubmit, invoicesAwaitingDispatch }
}

// ── Main homepage aggregate ───────────────────────────────────────────────────

const CACHE_KEY = 'dispatch:homepage'
const CACHE_TTL = 300 // 5 minutes — matches frontend refreshInterval

export async function getDispatchHomepage(): Promise<DispatchHomepageData> {
  const cached = await cacheGet<DispatchHomepageData>(CACHE_KEY)
  if (cached) return cached

  const data = await computeDispatchHomepage()
  await cacheSet(CACHE_KEY, data, CACHE_TTL)
  return data
}

async function computeDispatchHomepage(): Promise<DispatchHomepageData> {
  const [
    readyToDispatch, dispatchBlocked, dispatchedThisWeek, ewayBillsExpiring,
    revenuePendingInvoice, stageFlow, pipelineTable, scheduleThisWeek,
    onTimeDispatch, actionQueue,
  ] = await Promise.all([
    getReadyToDispatch(),
    getDispatchBlocked(),
    getDispatchedThisWeek(),
    getEwayBillsExpiring(),
    getRevenuePendingInvoice(),
    getDispatchStageFlow(),
    getDispatchPipelineTable(),
    getDispatchScheduleThisWeek(),
    getOnTimeDispatch(),
    getDispatchActionQueue(),
  ])

  return {
    syncedAt: new Date().toISOString(),
    erpBaseUrl: erpBaseUrl(),
    readyToDispatch,
    dispatchBlocked,
    dispatchedThisWeek,
    ewayBillsExpiring,
    revenuePendingInvoice,
    stageFlow,
    pipelineTable,
    scheduleThisWeek,
    onTimeDispatch,
    actionQueue,
  }
}
