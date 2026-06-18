'use client'
import useSWR from 'swr'
import api from '@/lib/api'
import type { ManufacturingHomepageData } from '@/types/manufacturing'

function fetcher(): Promise<ManufacturingHomepageData> {
  return api
    .get<{ success: boolean; data: ManufacturingHomepageData }>('/api/v1/manufacturing/homepage')
    .then(r => r.data.data)
}

export function useManufacturingHomepage() {
  const { data, error, isLoading, mutate } = useSWR<ManufacturingHomepageData>(
    'manufacturing/homepage',
    fetcher,
    { refreshInterval: 300_000 } // 5 min
  )
  return {
    data:      data ?? null,
    isLoading,
    isError:   !!error,
    refresh:   mutate,
  }
}
