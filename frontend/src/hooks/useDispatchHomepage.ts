'use client'
import useSWR from 'swr'
import api from '@/lib/api'
import type { DispatchHomepageData, DocumentationChecklist, EwayBillRow } from '@/types/dispatch'
import { fiscalYearRange } from '@/lib/fiscalYear'

function fetcher(fyStart: string, fyEnd: string): Promise<DispatchHomepageData> {
  return api
    .get<{ success: boolean; data: DispatchHomepageData }>('/api/v1/dispatch/homepage', {
      timeout: 120_000, params: { fy_start: fyStart, fy_end: fyEnd },
    })
    .then(r => r.data.data)
}

export function useDispatchHomepage(fyStartYear: number) {
  const { fyStart, fyEnd } = fiscalYearRange(fyStartYear)
  const { data, error, isLoading, mutate } = useSWR<DispatchHomepageData>(
    ['dispatch/homepage', fyStart, fyEnd],
    () => fetcher(fyStart, fyEnd),
    { refreshInterval: 300_000 }, // 5 min
  )
  return { data: data ?? null, isLoading, isError: !!error, refresh: mutate }
}

export async function getDocumentationChecklist(dnNo: string): Promise<DocumentationChecklist> {
  const res = await api.get<{ success: boolean; data: DocumentationChecklist }>(
    `/api/v1/dispatch/checklist/${encodeURIComponent(dnNo)}`,
  )
  return res.data.data
}

export function useEwayBillStatus() {
  const { data, error, isLoading } = useSWR<EwayBillRow[]>(
    'dispatch/ewaybills',
    () => api.get<{ success: boolean; data: EwayBillRow[] }>('/api/v1/dispatch/ewaybills').then(r => r.data.data),
    { refreshInterval: 300_000 },
  )
  return { data: data ?? [], isLoading, isError: !!error }
}
