'use client'

type FinancialPostResult<T> = {
  data: T | null
  error: { message: string } | null
}

/**
 * Financial writes must go through the same-origin Next.js server endpoint.
 * The browser never receives the HttpOnly staff session token, and the server
 * cannot post until the database has verified that session.
 */
export async function postFinancial<T = any>(
  action: string,
  args: Record<string, unknown>
): Promise<FinancialPostResult<T>> {
  try {
    const response = await fetch('/api/finance', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ action, args }),
    })
    const body = await response.json()
    if (!response.ok) {
      return {
        data: null,
        error: { message: body?.error || 'Financial request could not be authorised.' },
      }
    }
    return { data: body.data as T, error: null }
  } catch {
    return { data: null, error: { message: 'Unable to reach the secure transaction service.' } }
  }
}
