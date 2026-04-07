import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type FailedRow = {
  full_name?: string
  raw_phone?: string
  normalized_phone?: string
  park?: string
  member_code?: string
  matched_member_name?: string
  disbursement_amount?: number | null
  repayment_amount?: number | null
  match_attempted?: string
  match_method?: string
  action?: string
  reason: string
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function rowsToHtmlTable(rows: FailedRow[]) {
  if (!rows.length) {
    return '<p>No rows.</p>'
  }

  const header = `
    <tr>
      <th align="left">Full Name</th>
      <th align="left">Raw Phone</th>
      <th align="left">Normalized Phone</th>
      <th align="left">Park</th>
      <th align="left">Member Code</th>
      <th align="left">Matched Member</th>
      <th align="right">Loan Amount</th>
      <th align="right">Repayment</th>
      <th align="left">Match Attempt</th>
      <th align="left">Match Method</th>
      <th align="left">Action</th>
      <th align="left">Reason</th>
    </tr>
  `

  const body = rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.full_name)}</td>
        <td>${escapeHtml(row.raw_phone)}</td>
        <td>${escapeHtml(row.normalized_phone)}</td>
        <td>${escapeHtml(row.park)}</td>
        <td>${escapeHtml(row.member_code)}</td>
        <td>${escapeHtml(row.matched_member_name)}</td>
        <td align="right">${escapeHtml(row.disbursement_amount ?? '')}</td>
        <td align="right">${escapeHtml(row.repayment_amount ?? '')}</td>
        <td>${escapeHtml(row.match_attempted)}</td>
        <td>${escapeHtml(row.match_method)}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml(row.reason)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead style="background: #f6f4fb;">${header}</thead>
      <tbody>${body}</tbody>
    </table>
  `
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      requestedByStaffCode,
      businessDate,
      fileName,
      postedDisbursements,
      postedRepayments,
      skipped,
      unmatched,
      errors,
      matchedByName,
    } = body as {
      requestedByStaffCode: string
      businessDate: string
      fileName?: string
      postedDisbursements: number
      postedRepayments: number
      skipped: number
      unmatched: FailedRow[]
      errors: FailedRow[]
      matchedByName: FailedRow[]
    }

    if (!requestedByStaffCode) {
      return NextResponse.json(
        { success: false, message: 'Missing requesting staff code.' },
        { status: 400 }
      )
    }

    const { data: requester, error: requesterError } = await supabaseAdmin
      .from('staff')
      .select('staff_code, full_name, email')
      .eq('staff_code', requestedByStaffCode)
      .eq('is_active', true)
      .maybeSingle()

    if (requesterError || !requester) {
      return NextResponse.json(
        { success: false, message: 'Requesting staff not found.' },
        { status: 404 }
      )
    }

    const { data: admins, error: adminsError } = await supabaseAdmin
      .from('staff')
      .select('full_name, email, role')
      .eq('is_active', true)
      .in('role', ['ADMIN'])

    if (adminsError) {
      return NextResponse.json(
        { success: false, message: adminsError.message },
        { status: 500 }
      )
    }

    const adminEmails = (admins || [])
      .map((row) => row.email)
      .filter((email): email is string => Boolean(email))

    if (!adminEmails.length) {
      return NextResponse.json(
        { success: false, message: 'No admin email found in staff table.' },
        { status: 400 }
      )
    }

    const totalFlagged =
      (unmatched?.length || 0) +
      (errors?.length || 0) +
      (matchedByName?.length || 0)

    const subject = `Bulk Upload Exceptions - ${businessDate} (${totalFlagged} flagged rows)`

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f1b2d;">
        <h2>Bulk Upload Exception Report</h2>

        <p><strong>Business Date:</strong> ${escapeHtml(businessDate)}</p>
        <p><strong>Uploaded By:</strong> ${escapeHtml(requester.full_name)} (${escapeHtml(requester.staff_code)})</p>
        <p><strong>File Name:</strong> ${escapeHtml(fileName || 'N/A')}</p>

        <h3>Summary</h3>
        <ul>
          <li>Posted Disbursements: ${escapeHtml(postedDisbursements)}</li>
          <li>Posted Repayments: ${escapeHtml(postedRepayments)}</li>
          <li>Skipped: ${escapeHtml(skipped)}</li>
          <li>Matched by Name Fallback: ${escapeHtml(matchedByName?.length || 0)}</li>
          <li>Unmatched: ${escapeHtml(unmatched?.length || 0)}</li>
          <li>Errors: ${escapeHtml(errors?.length || 0)}</li>
        </ul>

        <h3>Matched by Name Fallback</h3>
        ${rowsToHtmlTable(matchedByName || [])}

        <h3>Unmatched Rows</h3>
        ${rowsToHtmlTable(unmatched || [])}

        <h3>Errors</h3>
        ${rowsToHtmlTable(errors || [])}
      </div>
    `

    const { data, error } = await resend.emails.send({
      from: process.env.BULK_UPLOAD_FROM_EMAIL!,
      to: adminEmails,
      replyTo: requester.email || undefined,
      subject,
      html,
    })

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Exception email sent successfully.',
      emailId: data?.id,
      recipients: adminEmails,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Unexpected server error.' },
      { status: 500 }
    )
  }
}