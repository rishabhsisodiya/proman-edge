import useSWR from 'swr'
import api from '@/lib/api'
import type { QuotationDetail } from '@/types/sales'

const fetcher = (url: string) =>
  api.get<{ success: boolean; data: QuotationDetail }>(url).then(r => r.data.data)

export function useQuotationDetail(quotation: string | null) {
  const { data, isLoading } = useSWR<QuotationDetail>(
    quotation ? `/api/v1/sales/quotation/${encodeURIComponent(quotation)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  return { detail: data ?? null, isLoading }
}

export async function extendQuotation(
  quotation: string,
  opts: { valid_till?: string; days?: number } = {},
): Promise<{ validTill?: string }> {
  const res = await api.post<{ success: boolean; validTill?: string }>(
    `/api/v1/sales/quotation/${encodeURIComponent(quotation)}/extend`,
    opts,
  )
  return { validTill: res.data.validTill }
}

export async function convertToSalesOrder(quotation: string, deliveryDate?: string): Promise<{ salesOrder?: string }> {
  try {
    const res = await api.post<{ success: boolean; salesOrder?: string; error?: string }>(
      `/api/v1/sales/quotation/${encodeURIComponent(quotation)}/convert`,
      deliveryDate ? { delivery_date: deliveryDate } : {},
    )
    if (!res.data.success) throw new Error(res.data.error ?? 'Conversion failed')
    return { salesOrder: res.data.salesOrder }
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } }; message?: string }
    const msg = axiosError?.response?.data?.error ?? axiosError?.message ?? 'Conversion failed'
    throw new Error(msg)
  }
}
