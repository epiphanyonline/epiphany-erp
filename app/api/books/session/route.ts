import { NextRequest, NextResponse } from 'next/server'
import { BOOKS_COOKIE_NAME, BOOKS_TTL, hasBooksSession, makeBooksSession, verifyBooksPin } from '@/lib/books-access'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store' }
// Per-instance throttle is defence in depth only. Production needs shared WAF / rate limits.
const attempts = new Map<string, { count: number, until: number }>()
const WINDOW = 15 * 60 * 1000
const LIMIT = 5

export async function GET() {
  return NextResponse.json({ authenticated: await hasBooksSession() }, { headers })
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
  }
  if (!process.env.EPIPHANY_BOOKS_PIN || !process.env.EPIPHANY_BOOKS_SESSION_SECRET) {
    return NextResponse.json({ error: 'Accounting access is not configured.' }, { status: 503, headers })
  }
  let body: { pin?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers })
  }
  const pin = typeof body.pin === 'string' ? body.pin : ''
  if (pin.length > 16) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401, headers })

  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const now = Date.now()
  if (attempts.size > 10000) attempts.clear()
  const existing = attempts.get(ip)
  const hit = existing && existing.until > now ? existing : { count: 0, until: now + WINDOW }
  if (hit.count >= LIMIT) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers })
  }
  if (!verifyBooksPin(pin)) {
    attempts.set(ip, { count: hit.count + 1, until: hit.until })
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401, headers })
  }
  attempts.delete(ip)

  let token: string
  try { token = makeBooksSession() } catch {
    return NextResponse.json({ error: 'Accounting access is not configured.' }, { status: 503, headers })
  }
  const response = NextResponse.json({ authenticated: true }, { headers })
  response.cookies.set(BOOKS_COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/books', maxAge: BOOKS_TTL,
  })
  // Path /books cookie is not sent to /api/books; use root for the report service.
  response.cookies.set(BOOKS_COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: BOOKS_TTL,
  })
  return response
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
  }
  const response = NextResponse.json({ authenticated: false }, { headers })
  response.cookies.set(BOOKS_COOKIE_NAME, '', { maxAge: 0, path: '/', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' })
  response.cookies.set(BOOKS_COOKIE_NAME, '', { maxAge: 0, path: '/books', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' })
  return response
}
