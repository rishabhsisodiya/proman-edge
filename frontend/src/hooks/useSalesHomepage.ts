import useSWR from 'swr'
import api from '@/lib/api'
import type { SalesHomepageData } from '@/types/sales'

const fetcher = (url: string) =>
  api.get<{ success: boolean; data: SalesHomepageData }>(url).then(r => r.data.data)

// companies: single string or array — ['PISPL'] | ['PISPL','ACE','PROMAX']
export function useSalesHomepage(companies: string | string[] = ['PISPL']) {
  const param = Array.isArray(companies) ? companies.join(',') : companies

  const { data, error, isLoading, mutate } = useSWR<SalesHomepageData>(
    `/api/v1/sales/homepage?companies=${param}`,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )

  return {
    data,
    isLoading,
    isError: !!error,
    refresh: () => mutate(),
  }
}
