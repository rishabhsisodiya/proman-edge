'use client'
import useSWR from 'swr'
import api from '@/lib/api'
import type { FinanceHomepageData } from '@/types/finance'

function fetcher(): Promise<FinanceHomepageData> {
  return api
    .get<{ success: boolean; data: FinanceHomepageData }>('/api/v1/finance/homepage')
    .then(r => r.data.data)
}

export function useFinanceHomepage() {
  const { data, error, isLoading, mutate } = useSWR<FinanceHomepageData>(
    'finance/homepage',
    fetcher,
    { refreshInterval: 300_000 }, // 5 min
  )
  return { data: data ?? null, isLoading, isError: !!error, refresh: mutate }
}

export interface FinanceActionResult {
  ok: boolean
  summary?: {
    purchase_invoice?: string
    payment_entry?: string
    paid_amount?: number
    docstatus?: number
    journal_entry?: string
    name?: string
    [k: string]: unknown
  }
  deep_link?: string
  meta?: { note?: string }
  error?: { code?: string; message?: string }
}

export async function releasePayment(invoiceNo: string): Promise<FinanceActionResult> {
  const res = await api.post<{ success: boolean; data: FinanceActionResult }>(
    '/api/v1/finance/action-queue/release',
    { invoiceNo },
  )
  return res.data.data
}

export async function approvePurchaseOrder(poNo: string): Promise<FinanceActionResult> {
  const res = await api.post<{ success: boolean; data: FinanceActionResult }>(
    '/api/v1/finance/po-approval/approve',
    { poNo },
  )
  return res.data.data
}

export async function approveJournalEntry(journalEntry: string): Promise<FinanceActionResult> {
  const res = await api.post<{ success: boolean; data: FinanceActionResult }>(
    '/api/v1/finance/action-queue/approve-je',
    { journalEntry },
  )
  return res.data.data
}
