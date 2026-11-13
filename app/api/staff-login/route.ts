import { NextResponse } from 'next/server'
import { epiphanyRpc, isSameOrigin, STAFF_SESSION_COOKIE } from '@/lib/server/epiphany-db'

export const runtime = 'nodejs'

type LoginResponse = {
  success: boolean
  message?: string
  staff_id?: string
  staff_code?: string
  full_name?: string
  role?: string
  is_active?: boolean
  session_token?: string
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site sign-in is not permitted.' }, { status: 403 })
  }
  if (Number(request.headers.get('content-length') || 0) > 4096) {
    return NextResponse.json({ error: 'Invalid sign-in request.' }, { status: 413 })
  }
  let body: { staffCode?: unknown; pin?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid sign-in request.' }, { status: 400 })
  }
  const code = typeof body?.staffCode === 'string' ? body.staffCode.trim() : ''
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  if (!code || !pin || code.length > 80 || pin.length > 128) {
    return NextResponse.json({ error: 'Staff code and PIN are required.' }, { status: 400 })
  }

  try {
    const result = await epiphanyRpc('epiphany_issue_staff_session', {
      p_staff_code: code, p_pin: pin,
    })
    if (!result.ok) {
      return NextResponse.json({ error: 'Unable to complete staff sign-in.' }, { status: 503 })
    }
    const login = (Array.isArray(result.payload)
      ? result.payload[0] : result.payload) as LoginResponse | undefined

    if (!login?.success || !login?.session_token) {
      return NextResponse.json({ error: login?.message || 'Invalid staff credentials.' }, { status: 401 })
    }

    const response = NextResponse.json({
      success: true,
      staff_id: login.staff_id,
      staff_code: login.staff_code,
      full_name: login.full_name,
      role: login.role,
      is_active: login.is_active,
    })
    response.cookies.set(STAFF_SESSION_COOKIE, login.session_token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'Unable to complete staff sign-in.' }, { status: 503 })
  }
}
