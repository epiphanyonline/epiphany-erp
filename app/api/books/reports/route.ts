import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasBooksSession } from '@/lib/books-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const noStore = { 'Cache-Control': 'private, no-store' }

function dateOK(x: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) &&
    new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x
}

export async function GET(request: NextRequest) {
  if (!(await hasBooksSession())) {
    return NextResponse.json({ error: 'Enter your accounting PIN' }, { status: 401, headers: noStore })
  }
  const from = request.nextUrl.searchParams.get('from') ?? ''
  const to = request.nextUrl.searchParams.get('to') ?? ''
  if (!dateOK(from) || !dateOK(to) || from > to) {
    return NextResponse.json({ error: 'Choose valid start and end dates' }, { status: 400, headers: noStore })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Accounting database is not configured' }, { status: 503, headers: noStore })
  }
  // Call existing report functions without modifying live journals or creating new data.
  // Access to these functions in the underlying database must be audited separately:
  // a PIN on this HTTP endpoint cannot revoke existing direct anon access.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const [trial, income, balance] = await Promise.all([
    client.rpc('get_trial_balance', { p_from_date: from, p_to_date: to }),
    client.rpc('get_income_statement', { p_from_date: from, p_to_date: to }),
    client.rpc('get_balance_sheet', { p_as_of_date: to }),
  ])
  if (trial.error || income.error || balance.error) {
    return NextResponse.json({ error: 'Unable to load accounting reports' }, { status: 502, headers: noStore })
  }
  return NextResponse.json({
    from, to,
    trialBalance: trial.data ?? [],
    incomeStatement: income.data ?? [],
    balanceSheet: balance.data ?? [],
    source: 'EXISTING_ERP_REPORTS',
    warning: 'Existing ERP accounting reports. Not the new reconciled shadow ledger; financial figures may be provisional.',
  }, { headers: noStore })
}
