'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/v1/auth/login', { username, password })
      const { token, user } = res.data.data
      localStorage.setItem('proman_token', token)
      localStorage.setItem('proman_user', JSON.stringify(user))
      // Cookie lets Next.js edge middleware read the role without accessing localStorage
      document.cookie = `proman_role=${user.roleSlug}; path=/; max-age=86400; SameSite=Lax`
      router.push(`/home/${user.roleSlug}`)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Login failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1A4A8A] mb-4">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Proman Edge</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. satheesh"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A4A8A]/30 focus:border-[#1A4A8A] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A4A8A]/30 focus:border-[#1A4A8A] transition"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#1A4A8A] text-white text-sm font-semibold hover:bg-[#153d73] disabled:opacity-60 transition mt-1"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Dev hint — visible only in mock mode */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">
              Dev mock users
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Sales Head', username: 'satheesh' },
                { label: 'Mfg Head', username: 'manoj' },
                { label: 'Finance Head', username: 'lakshman' },
                { label: 'MD', username: 'prashant' },
              ].map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => { setUsername(u.username); setPassword('password') }}
                  className="text-left px-2.5 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 text-[11px] text-gray-600 transition"
                >
                  <span className="font-medium text-gray-800">{u.label}</span>
                  <br />
                  <span className="text-gray-400">{u.username} / password</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Proman Infrastructure Services Group &mdash; Internal Tool
        </p>
      </div>
    </div>
  )
}
