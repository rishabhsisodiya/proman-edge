import useSWR from 'swr'
import api from '@/lib/api'

export interface MRDetailItem {
  itemCode: string
  itemName: string
  qty: number
  receivedQty: number
  short: number
  uom: string
  eta: string
}

export interface MRDetail {
  mr: string
  status: string
  purpose: string
  requestDate: string
  requiredBy: string
  requestedBy: string
  items: MRDetailItem[]
}

const fetcher = (url: string) =>
  api.get<{ success: boolean; data: MRDetail }>(url).then(r => r.data.data)

export function useMaterialRequestDetail(mr: string | null) {
  const { data, isLoading } = useSWR<MRDetail>(
    mr ? `/api/v1/manufacturing/material-request/${encodeURIComponent(mr)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  return { detail: data ?? null, isLoading }
}
