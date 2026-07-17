'use client'
import useSWR from 'swr'
import api from '@/lib/api'
import type { StoresHomepageData, StoresActionResult } from '@/types/stores'
import { fiscalYearRange } from '@/lib/fiscalYear'

// Cold cache can take 60-90s+ on this DB (several widgets scan large ERPNext
// tables — see storesServiceDB.ts). Override the default 10s client timeout so
// a cache-miss load doesn't error out before the backend responds.
function fetcher(fyStart: string, fyEnd: string): Promise<StoresHomepageData> {
  return api
    .get<{ success: boolean; data: StoresHomepageData }>('/api/v1/stores/homepage', {
      timeout: 120_000, params: { fy_start: fyStart, fy_end: fyEnd },
    })
    .then(r => r.data.data)
}

export function useStoresHomepage(fyStartYear: number) {
  const { fyStart, fyEnd } = fiscalYearRange(fyStartYear)
  const { data, error, isLoading, mutate } = useSWR<StoresHomepageData>(
    ['stores/homepage', fyStart, fyEnd],
    () => fetcher(fyStart, fyEnd),
    { refreshInterval: 300_000 }, // 5 min
  )
  return { data: data ?? null, isLoading, isError: !!error, refresh: mutate }
}

export async function submitGrn(grnNo: string, action?: string): Promise<StoresActionResult> {
  const res = await api.post<{ success: boolean; data: StoresActionResult }>(
    `/api/v1/stores/grn/${encodeURIComponent(grnNo)}/submit`,
    action ? { action } : {},
  )
  return res.data.data
}

export async function createMaterialRequest(itemCode: string, qty: number, warehouse?: string): Promise<StoresActionResult> {
  const res = await api.post<{ success: boolean; data: StoresActionResult }>(
    '/api/v1/stores/material-request',
    { itemCode, qty, warehouse },
  )
  return res.data.data
}

export async function createPoFromMr(materialRequest: string, supplier?: string): Promise<StoresActionResult> {
  const res = await api.post<{ success: boolean; data: StoresActionResult }>(
    '/api/v1/stores/purchase-order-from-mr',
    { materialRequest, supplier },
  )
  return res.data.data
}
