import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

// Staging-only read-only bridge. No journal writes, no new schema access, no client secret.
// Do NOT use custom localStorage staff sessions for server authorisation.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function equalSecret(a: string, b: string): boolean {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const ms = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}

const MAX_ROWS = 5000
const PAGE_SIZE = 500

export async function GET(request: NextRequest) {
  const noStore = { 'Cache-Control': 'no-store' }

  if (process.env.ACCOUNTING_V2_PREVIEW_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Accounting V2 preview is disabled.' }, { status: 404, headers: noStore })
  }

  const expected = process.env.ACCOUNTING_V2_PREVIEW_TOKEN
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!expected || expected.length < 32 || !equalSecret(supplied, expected)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401, headers: noStore })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Server configuration unavailable' }, { status: 503, headers: noStore })
  }

  const from = request.nextUrl.searchParams.get('from') ?? ''
  const to = request.nextUrl.searchParams.get('to') ?? ''
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    return NextResponse.json({ error: 'Valid from and to dates required (YYYY-MM-DD)' }, { status: 400, headers: noStore })
  }
  const days = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)
  if (days > 31) {
    return NextResponse.json({ error: 'Preview date range cannot exceed 32 days' }, { status: 400, headers: noStore })
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const summary: Record<string, { count: number; amount: number }> = {}
  let scanned = 0
  let truncated = false

  // Existing ERP remains source of truth; preview reads (does NOT classify or journal-post).
  while (scanned < MAX_ROWS) {
    const { data, error } = await db.from('transactions')
      .select('id,tx_type,amount')
      .gte('business_date', from)
      .lte('business_date', to)
      .order('id', { ascending: true })
      .range(scanned, scanned + PAGE_SIZE - 1)
    if (error) {
      // Avoid exposing raw DB errors or credentials to browser
      return NextResponse.json({ error: 'Unable to load operational preview.' }, { status: 502, headers: noStore })
    }
    const rows = data ?? []
    for (const row of rows) {
      const type = typeof row.tx_type === 'string' ? row.tx_type : 'UNKNOWN'
      const existing = summary[type] ?? { count: 0, amount: 0 }
      const amount = Number(row.amount)
      if (!Number.isFinite(amount)) {
        return NextResponse.json({ error: 'Invalid source amount detected.' }, { status: 422, headers: noStore })
      }
      existing.count++
      existing.amount += amount
      summary[type] = existing
    }
    scanned += rows.length
    if (rows.length < PAGE_SIZE) break
  }
  if (scanned === MAX_ROWS) truncated = true // conservative; might have exactly this many

  return NextResponse.json({
    mode: 'READ_ONLY_OPERATIONAL_PREVIEW',
    verified_bank_balances: false,
    journal_posting_enabled: false,
    report_is_profit_and_loss: false,
    from, to, scanned, truncated,
    groups: Object.entries(summary).sort(([a], [b]) => a.localeCompare(b))
      .map(([type, value]) => ({ type, ...value })),
    notice: 'Gross source movements only. Repayments contain principal; remittances are transfers; reversals not netted. Not an accounting statement.',
  }, { headers: noStore })
}
