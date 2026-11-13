import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { epiphanyRpc, STAFF_SESSION_COOKIE } from '@/lib/server/epiphany-db'

export const runtime = 'nodejs'

export async function GET() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  try {
    const result = await epiphanyRpc('epiphany_staff_session_info', {
      p_session_token: token,
    })
    const rows = Array.isArray(result.payload) ? result.payload : [result.payload]
    const current = rows[0] as { staff_id?: string; staff_code?: string; full_name?: string; role?: string; is_active?: boolean } | undefined
    if (!result.ok || !current?.staff_id || !current.is_active) {
      return NextResponse.json({ error: 'Session expired.' }, { status: 401 })
    }
    const response = NextResponse.json({ session: current })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'Unable to validate staff session.' }, { status: 503 })
  }
}
