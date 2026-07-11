'use client'
import useSWR from 'swr'
import api from '@/lib/api'
import type { ProcurementHomepageData, PODetail, ProcurementActionResult } from '@/types/procurement'

function fetcher(): Promise<ProcurementHomepageData> {
  return api
    .get<{ success: boolean; data: ProcurementHomepageData }>('/api/v1/procurement/homepage')
    .then(r => r.data.data)
}

export function useProcurementHomepage() {
  const { data, error, isLoading, mutate } = useSWR<ProcurementHomepageData>(
    'procurement/homepage',
    fetcher,
    { refreshInterval: 300_000 }, // 5 min
  )
  return { data: data ?? null, isLoading, isError: !!error, refresh: mutate }
}

export async function fetchPODetail(poNo: string): Promise<PODetail | null> {
  try {
    const res = await api.get<{ success: boolean; data: PODetail }>(
      `/api/v1/procurement/po/${encodeURIComponent(poNo)}`,
    )
    return res.data.data
  } catch {
    return null
  }
}

export async function approvePO(poNo: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/procurement/po/${encodeURIComponent(poNo)}/approve`,
  )
  return res.data.data
}

export async function returnPO(poNo: string, reason: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/procurement/po/${encodeURIComponent(poNo)}/return`,
    { reason },
  )
  return res.data.data
}

export async function logFollowUp(poNo: string, comment: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/procurement/po/${encodeURIComponent(poNo)}/followup`,
    { comment },
  )
  return res.data.data
}

export async function makeGRN(poNo: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/procurement/po/${encodeURIComponent(poNo)}/grn`,
  )
  return res.data.data
}
