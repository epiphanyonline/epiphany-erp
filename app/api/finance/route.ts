import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { epiphanyRpc, isSameOrigin, STAFF_SESSION_COOKIE } from '@/lib/server/epiphany-db'

export const runtime = 'nodejs'

// No arbitrary Supabase function names are accepted from browsers.
const allowedActions = new Set([
  'post_loan_repayment', 'post_loan_disbursement',
  'post_savings_deposit', 'post_savings_withdrawal',
  'post_expense', 'post_cash_remittance', 'post_fee',
  'reverse_posted_transaction', 'close_staff_day',
  'approve_expense_and_post_accounting',
  'create_disbursement_schedule_batch', 'update_disbursement_schedule_line',
  'add_disbursement_schedule_line', 'remove_disbursement_schedule_line',
  'submit_disbursement_schedule_batch', 'delete_disbursement_schedule_batch',
  'approve_disbursement_schedule_line', 'decline_disbursement_schedule_line',
  'bulk_post_loan_upload', 'register_bulk_upload_member', 'retry_bulk_upload_row',
  'resolve_bulk_upload_exception', 'ignore_bulk_upload_exception',
  'bulk_register_members_upload', 'register_bulk_membership_row',
  'admin_supervisor_update_member_details', 'delete_duplicate_member',
])

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 })
  }
  if (Number(request.headers.get('content-length') || 0) > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }
  const cookieStore = await cookies()
  const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 })
  }
  let payload: { action?: unknown; args?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid financial request.' }, { status: 400 })
  }
  if (
    typeof payload?.action !== 'string' ||
    !allowedActions.has(payload.action) ||
    !payload.args || typeof payload.args !== 'object' ||
    Array.isArray(payload.args)
  ) {
    return NextResponse.json({ error: 'Financial operation is not permitted.' }, { status: 403 })
  }

  try {
    const result = await epiphanyRpc('epiphany_secure_financial_action', {
      p_session_token: token,
      p_action: payload.action,
      p_payload: payload.args,
    })
    if (!result.ok) {
      // Do not echo secrets, SQL details, or database context into the browser.
      const unauthorized = result.status === 401 || result.status === 403
      return NextResponse.json(
        { error: unauthorized ? 'Session expired or permission denied. Please sign in again.' : 'Financial request was rejected. No payment was confirmed.' },
        { status: unauthorized ? 401 : 400 }
      )
    }
    const response = NextResponse.json({ data: result.payload })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'Financial request could not be completed. Check transaction history before retrying.' }, { status: 503 })
  }
}
