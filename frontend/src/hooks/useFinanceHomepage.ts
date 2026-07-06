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

export interface ReleasePaymentResult {
  ok: boolean
  summary?: unknown
  error?: { code?: string; message?: string }
}

export async function releasePayment(invoiceNo: string): Promise<ReleasePaymentResult> {
  const res = await api.post<{ success: boolean; data: ReleasePaymentResult }>(
    '/api/v1/finance/action-queue/release',
    { invoiceNo },
  )
  return res.data.data
}
