import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'epiphany_books_access'
const MAX_AGE_SECONDS = 30 * 60

function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

function signingKey(): string | null {
  const key = process.env.EPIPHANY_BOOKS_SESSION_SECRET
  return key && key.length >= 32 ? key : null
}

export function verifyBooksPin(candidate: string): boolean {
  const stored = process.env.EPIPHANY_BOOKS_PIN
  if (!stored || !/^\d{4,12}$/.test(stored) || !/^\d{4,12}$/.test(candidate)) {
    return false
  }
  return constantTimeEqual(candidate, stored)
}

export function makeBooksSession(): string {
  const key = signingKey()
  if (!key) throw new Error('Books signing key is missing or too short')
  const expires = String(Date.now() + MAX_AGE_SECONDS * 1000)
  const digest = createHmac('sha256', key).update(expires).digest('hex')
  return expires + '.' + digest
}

export async function hasBooksSession(): Promise<boolean> {
  const key = signingKey()
  if (!key) return false
  const raw = (await cookies()).get(COOKIE)?.value
  if (!raw || raw.length > 120) return false
  const [expiry, signature, ...extra] = raw.split('.')
  if (extra.length || !/^\d{13}$/.test(expiry ?? '') || !/^[a-f0-9]{64}$/.test(signature ?? '')) return false
  const timestamp = Number(expiry)
  if (!Number.isSafeInteger(timestamp) || timestamp < Date.now() || timestamp > Date.now() + MAX_AGE_SECONDS * 1000) return false
  const expected = createHmac('sha256', key).update(expiry).digest('hex')
  return constantTimeEqual(signature, expected)
}

export const BOOKS_COOKIE_NAME = COOKIE
export const BOOKS_TTL = MAX_AGE_SECONDS
