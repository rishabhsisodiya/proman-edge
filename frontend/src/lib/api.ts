import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_MIDDLEWARE_URL || 'http://localhost:4000',
  timeout: 10000,
})

// Attach JWT from localStorage to every request
api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('proman_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
