import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { epiphanyRpc, isSameOrigin, STAFF_SESSION_COOKIE } from '@/lib/server/epiphany-db'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site logout is not permitted.' }, { status: 403 })
  }
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value
  if (token) {
    // Best effort revocation; clearing the browser cookie happens regardless.
    try {
      await epiphanyRpc('epiphany_revoke_staff_session', { p_session_token: token })
    } catch {
      // Token expiry protects the session if the database is temporarily unavailable.
    }
  }
  const response = NextResponse.json({ success: true })
  response.cookies.set(STAFF_SESSION_COOKIE, '', {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 0,
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
