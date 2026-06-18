'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import api from '@/lib/api'

export interface CurrentUser {
  username:  string
  fullName:  string
  role:      string
  roleSlug:  string
  companies: string[]
  email:     string
}

function fetchMe(): Promise<CurrentUser> {
  return api
    .get<{ success: boolean; data: CurrentUser }>('/api/v1/auth/me')
    .then(r => r.data.data)
}

export function useCurrentUser() {
  const router = useRouter()
  const { data, error, isLoading } = useSWR<CurrentUser>('auth/me', fetchMe, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (error) {
      // Token missing or expired — clear storage and go to login
      localStorage.removeItem('proman_token')
      localStorage.removeItem('proman_user')
      document.cookie = 'proman_role=; path=/; max-age=0'
      router.replace('/')
    }
  }, [error, router])

  return { user: data ?? null, isLoading, isError: !!error }
}
