import 'server-only'

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Calls only defined PostgreSQL RPCs with the public key.
 * The DB functions are responsible for verifying signed-in staff sessions and
 * enforcing the current staff role. No service-role credentials are used.
 */
export async function epiphanyRpc(
  functionName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; status: number; payload: unknown; message: string }> {
  if (!projectUrl || !publicKey) {
    return { ok: false, status: 503, payload: null, message: 'ERP database is not configured.' }
  }
  const response = await fetch(
    `${projectUrl.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    }
  )
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Failure details returned as a safe generic error below.
  }
  const message =
    !response.ok && payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message?: unknown }).message || 'Database rejected request.')
      : 'Database rejected request.'
  return { ok: response.ok, status: response.status, payload, message }
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true // Non-browser clients must still prove session possession.
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

export const STAFF_SESSION_COOKIE = '__Host-epiphany-staff-session'
