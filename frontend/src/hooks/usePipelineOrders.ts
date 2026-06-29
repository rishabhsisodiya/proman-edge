'use client'
import useSWR from 'swr'
import api from '@/lib/api'
import type { PipelineOrder } from '@/types/manufacturing'

function fetcher(stage: string): Promise<PipelineOrder[]> {
  return api
    .get<{ success: boolean; data: PipelineOrder[] }>(`/api/v1/manufacturing/pipeline-orders/${stage}`)
    .then(r => r.data.data)
}

export function usePipelineOrders(stage: string | null) {
  const { data, error, isLoading } = useSWR<PipelineOrder[]>(
    stage ? `pipeline-orders/${stage}` : null,
    () => fetcher(stage!),
  )
  return {
    orders:    data ?? [],
    isLoading,
    isError:   !!error,
  }
}
