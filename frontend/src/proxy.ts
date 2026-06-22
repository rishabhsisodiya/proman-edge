import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Strategic roles that can access other dashboards freely
const CROSS_DASHBOARD_ROLES = new Set(['md', 'sales-head'])

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const roleSlug = request.cookies.get('proman_role')?.value

  // Not logged in → redirect to login
  if (!roleSlug) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Extract the slug from /home/:slug
  const match = pathname.match(/^\/home\/([^/]+)/)
  if (!match) return NextResponse.next()

  const targetSlug = match[1]

  // Same role or strategic role with cross-dashboard access → allow
  if (targetSlug === roleSlug || CROSS_DASHBOARD_ROLES.has(roleSlug)) {
    return NextResponse.next()
  }

  // Wrong role → redirect to their own dashboard
  return NextResponse.redirect(new URL(`/home/${roleSlug}`, request.url))
}

export const config = {
  matcher: ['/home/:path*'],
}
