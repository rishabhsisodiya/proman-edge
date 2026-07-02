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
