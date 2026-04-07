'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type ParsedRow = {
  row_no: number
  raw_phone: string
  full_name: string
  disbursement_amount: number | null
  repayment_amount: number | null
  park: string
}

type PreviewRow = ParsedRow & {
  normalized_phone: string
  hasAmount: boolean
}

type MatchInfoRow = {
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

type RpcResult = {
  success: boolean
  posted_disbursements: number
  posted_repayments: number
  skipped: number
  matched_by_name: MatchInfoRow[]
  unmatched: MatchInfoRow[]
  errors: MatchInfoRow[]
}

type ParkOption = {
  id: string
  name: string
}

type RegisterState = {
  isOpen: boolean
  row: MatchInfoRow | null
  fullName: string
  phone: string
  parkId: string
  specificPark: string
  categoryOfClient: string
  status: string
  loading: boolean
  message: string
  error: string
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function normalizePhone(raw: string) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (/^234\d+$/.test(digits)) digits = digits.replace(/^234/, '')
  else if (/^0\d+$/.test(digits)) digits = digits.replace(/^0/, '')
  return digits
}

function parseNumber(value: string) {
  const cleaned = String(value || '').replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function splitCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result.map((x) => x.trim())
}

function money(value: number | null | undefined) {
  return `₦${Number(value || 0).toLocaleString()}`
}

export default function BulkUploadPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [businessDate, setBusinessDate] = useState(getTodayDateString())
  const [tenureDays, setTenureDays] = useState('20')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [result, setResult] = useState<RpcResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [parks, setParks] = useState<ParkOption[]>([])

  const [registerState, setRegisterState] = useState<RegisterState>({
    isOpen: false,
    row: null,
    fullName: '',
    phone: '',
    parkId: '',
    specificPark: '',
    categoryOfClient: '',
    status: 'ACTIVE',
    loading: false,
    message: '',
    error: '',
  })

  const canAccess =
    ['admin', 'supervisor', 'officer'].includes(String(staff?.role || '').toLowerCase())

  useEffect(() => {
    async function loadParks() {
      const { data } = await supabase
        .from('parks')
        .select('id, name')
        .order('name', { ascending: true })

      setParks((data as ParkOption[]) || [])
    }

    loadParks()
  }, [])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setErrorText('')
    setSuccessText('')
    setResult(null)
    setFileName(file.name)

    try {
      const text = await file.text()
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      const parsed: ParsedRow[] = []

      for (let i = 0; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i])

        if (i === 0) {
          const maybeHeader = cols.map((c) => c.toLowerCase())
          const headerLike =
            maybeHeader.some((c) => c.includes('phone')) ||
            maybeHeader.some((c) => c.includes('name')) ||
            maybeHeader.some((c) => c.includes('loan')) ||
            maybeHeader.some((c) => c.includes('repayment')) ||
            maybeHeader.some((c) => c.includes('park'))

          if (headerLike) continue
        }

        const rawPhone = cols[0] || ''
        const fullName = cols[1] || ''
        const disbursementAmount = parseNumber(cols[2] || '')
        const repaymentAmount = parseNumber(cols[3] || '')
        const park = cols[4] || ''

        if (!rawPhone && !fullName && disbursementAmount === null && repaymentAmount === null && !park) {
          continue
        }

        parsed.push({
          row_no: parsed.length + 1,
          raw_phone: rawPhone,
          full_name: fullName,
          disbursement_amount: disbursementAmount,
          repayment_amount: repaymentAmount,
          park,
        })
      }

      setRows(parsed)
      setSuccessText(`Loaded ${parsed.length} row(s) from ${file.name}`)
    } catch (err: any) {
      setRows([])
      setErrorText(err?.message || 'Failed to read file.')
    } finally {
      setLoading(false)
    }
  }

  const previewRows = useMemo<PreviewRow[]>(() => {
    return rows.map((row) => ({
      ...row,
      normalized_phone: normalizePhone(row.raw_phone),
      hasAmount:
        (row.disbursement_amount ?? 0) > 0 || (row.repayment_amount ?? 0) > 0,
    }))
  }, [rows])

  const previewTotals = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.rows += 1
        if (row.hasAmount) acc.validRows += 1
        acc.disbursement += row.disbursement_amount ?? 0
        acc.repayment += row.repayment_amount ?? 0
        return acc
      },
      {
        rows: 0,
        validRows: 0,
        disbursement: 0,
        repayment: 0,
      }
    )
  }, [previewRows])

  async function handlePost() {
    if (!staff || !canAccess) return
    if (!rows.length) {
      setErrorText('Please upload a CSV file first.')
      return
    }

    const tenure = Number(tenureDays)
    if (!Number.isFinite(tenure) || tenure <= 0) {
      setErrorText('Tenure days must be greater than zero.')
      return
    }

    setPosting(true)
    setErrorText('')
    setSuccessText('')
    setResult(null)

    const payload = rows.map((row) => ({
      raw_phone: row.raw_phone,
      full_name: row.full_name,
      disbursement_amount: row.disbursement_amount,
      repayment_amount: row.repayment_amount,
      park: row.park,
    }))

    const { data, error } = await supabase.rpc('bulk_post_loan_upload', {
  p_requesting_staff_code: staff.staff_code,
  p_business_date: businessDate,
  p_tenure_days: tenure,
  p_rows: payload,
  p_source_file_name: fileName || null,
})

    if (error) {
      setErrorText(error.message || 'Bulk posting failed.')
      setPosting(false)
      return
    }

    const rpcResult = data as RpcResult
    setResult(rpcResult)
    setSuccessText('Bulk posting completed.')
    setPosting(false)
  }

  function openRegisterModal(row: MatchInfoRow) {
    const matchedPark = parks.find(
      (park) => park.name.trim().toLowerCase() === String(row.park || '').trim().toLowerCase()
    )

    setRegisterState({
      isOpen: true,
      row,
      fullName: row.full_name || '',
      phone: row.raw_phone || '',
      parkId: matchedPark?.id || '',
      specificPark: '',
      categoryOfClient: '',
      status: 'ACTIVE',
      loading: false,
      message: '',
      error: '',
    })
  }

  function closeRegisterModal() {
    setRegisterState({
      isOpen: false,
      row: null,
      fullName: '',
      phone: '',
      parkId: '',
      specificPark: '',
      categoryOfClient: '',
      status: 'ACTIVE',
      loading: false,
      message: '',
      error: '',
    })
  }

  async function handleRegisterMember() {
    if (!staff || !registerState.row) return

    setRegisterState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      message: '',
    }))

    const { data, error } = await supabase.rpc('register_bulk_upload_member', {
      p_requesting_staff_code: staff.staff_code,
      p_full_name: registerState.fullName,
      p_phone: registerState.phone,
      p_park_id: registerState.parkId,
      p_status: registerState.status,
      p_specific_park: registerState.specificPark,
      p_category_of_client: registerState.categoryOfClient,
    })

    if (error) {
      setRegisterState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to register member.',
      }))
      return
    }

    const rowResult = data?.[0]

    if (!rowResult?.success) {
      setRegisterState((prev) => ({
        ...prev,
        loading: false,
        error: rowResult?.message || 'Member registration failed.',
      }))
      return
    }

    setRegisterState((prev) => ({
      ...prev,
      loading: false,
      message: `${rowResult.full_name} registered successfully as ${rowResult.member_code}.`,
    }))
  }

  async function handleRetryRow(row: MatchInfoRow) {
  if (!staff) return

  const tenure = Number(tenureDays)
  if (!Number.isFinite(tenure) || tenure <= 0) {
    setErrorText('Tenure days must be greater than zero before retry.')
    return
  }

  setErrorText('')
  setSuccessText('Retrying selected row...')

  const { data, error } = await supabase.rpc('retry_bulk_upload_row', {
    p_requesting_staff_code: staff.staff_code,
    p_business_date: businessDate,
    p_tenure_days: tenure,
    p_full_name: row.full_name || '',
    p_raw_phone: row.raw_phone || '',
    p_disbursement_amount: row.disbursement_amount,
    p_repayment_amount: row.repayment_amount,
    p_park_name: row.park || '',
  })

  if (error) {
    setErrorText(error.message || 'Retry failed.')
    return
  }

  const retryResult = data as RpcResult

  const postedDisb = retryResult?.posted_disbursements || 0
  const postedRep = retryResult?.posted_repayments || 0
  const unmatchedCount = retryResult?.unmatched?.length || 0
  const errorCount = retryResult?.errors?.length || 0

  if (postedDisb === 0 && postedRep === 0) {
    if (errorCount > 0) {
      setErrorText(retryResult.errors[0]?.reason || 'Retry failed.')
    } else if (unmatchedCount > 0) {
      setErrorText(retryResult.unmatched[0]?.reason || 'Row still did not match.')
    } else {
      setErrorText('Retry did not post any transaction.')
    }
    return
  }

  setSuccessText(
    `Retry completed. Disbursements: ${postedDisb}, Repayments: ${postedRep}.`
  )

  setResult((prev) => {
    if (!prev) return prev

    const sameRow = (item: MatchInfoRow) =>
      (item.full_name || '').trim().toLowerCase() ===
        (row.full_name || '').trim().toLowerCase() &&
      (item.raw_phone || '').trim() === (row.raw_phone || '').trim() &&
      (item.park || '').trim().toLowerCase() ===
        (row.park || '').trim().toLowerCase() &&
      Number(item.disbursement_amount || 0) === Number(row.disbursement_amount || 0) &&
      Number(item.repayment_amount || 0) === Number(row.repayment_amount || 0)

    return {
      ...prev,
      posted_disbursements: (prev.posted_disbursements || 0) + postedDisb,
      posted_repayments: (prev.posted_repayments || 0) + postedRep,
      unmatched: (prev.unmatched || []).filter((item) => !sameRow(item)),
      errors: (prev.errors || []).filter((item) => !sameRow(item)),
    }
  })

  setRegisterState((prev) => ({
    ...prev,
    isOpen: false,
    row: null,
    message: '',
    error: '',
  }))
}

  if (staffLoading) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <p style={styles.noteText}>Loading access...</p>
        </div>
      </main>
    )
  }

  if (!staff) return null

  if (!canAccess) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <div style={styles.errorBox}>Only authorised staff can access this page.</div>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Bulk Loan Upload</h1>
            <p style={styles.subtitle}>
              Upload CSV with phone, full name, loan amount, repayment, and park
            </p>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.grid}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>Business Date</label>
              <input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Tenure Days (for disbursement)</label>
              <input
                type="number"
                min="1"
                value={tenureDays}
                onChange={(e) => setTenureDays(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.infoStrip}>
            <span><strong>Priority:</strong> phone + park first</span>
            <span><strong>Fallback:</strong> full name + park</span>
            <span><strong>Stage 3:</strong> register unmatched and retry</span>
          </div>
        </section>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}
        {successText ? <div style={styles.successBox}>{successText}</div> : null}

        <section style={styles.statGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Loaded Rows</p>
            <h2 style={styles.statValue}>{previewTotals.rows}</h2>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Rows With Amount</p>
            <h2 style={styles.statValue}>{previewTotals.validRows}</h2>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Disbursement Total</p>
            <h2 style={styles.statValue}>{money(previewTotals.disbursement)}</h2>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Repayment Total</p>
            <h2 style={styles.statValue}>{money(previewTotals.repayment)}</h2>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Preview</h2>
            <div style={styles.buttonRow}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setRows([])
                  setFileName('')
                  setResult(null)
                  setErrorText('')
                  setSuccessText('')
                }}
                disabled={loading || posting}
              >
                Clear
              </button>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handlePost}
                disabled={loading || posting || rows.length === 0}
              >
                {posting ? 'Posting...' : 'Post Bulk Upload'}
              </button>
            </div>
          </div>

          <p style={styles.noteText}>
            {fileName ? `Current file: ${fileName}` : 'No file selected yet.'}
          </p>

          {!previewRows.length ? (
            <p style={styles.noteText}>Upload a CSV to preview rows.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Row</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Normalized</th>
                    <th style={styles.th}>Full Name</th>
                    <th style={styles.th}>Park</th>
                    <th style={styles.thRight}>Loan Amount</th>
                    <th style={styles.thRight}>Repayment</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 100).map((row) => (
                    <tr key={row.row_no}>
                      <td style={styles.td}>{row.row_no}</td>
                      <td style={styles.td}>{row.raw_phone || '-'}</td>
                      <td style={styles.td}>{row.normalized_phone || '-'}</td>
                      <td style={styles.td}>{row.full_name || '-'}</td>
                      <td style={styles.td}>{row.park || '-'}</td>
                      <td style={styles.tdRight}>
                        {row.disbursement_amount?.toLocaleString() ?? '-'}
                      </td>
                      <td style={styles.tdRight}>
                        {row.repayment_amount?.toLocaleString() ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {result ? (
          <>
            <section style={styles.statGrid}>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Posted Disbursements</p>
                <h2 style={styles.statValue}>{result.posted_disbursements}</h2>
              </div>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Posted Repayments</p>
                <h2 style={styles.statValue}>{result.posted_repayments}</h2>
              </div>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Matched by Name</p>
                <h2 style={styles.statValue}>{result.matched_by_name?.length || 0}</h2>
              </div>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Unmatched</p>
                <h2 style={styles.statValue}>{result.unmatched?.length || 0}</h2>
              </div>
            </section>

            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Matched by Name Fallback</h2>
              {!result.matched_by_name?.length ? (
                <p style={styles.noteText}>No rows matched by name fallback.</p>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Full Name</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Park</th>
                        <th style={styles.th}>Matched Member</th>
                        <th style={styles.th}>Member Code</th>
                        <th style={styles.th}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.matched_by_name.map((item, index) => (
                        <tr key={`${item.full_name}-${index}`}>
                          <td style={styles.td}>{item.full_name || '-'}</td>
                          <td style={styles.td}>{item.raw_phone || '-'}</td>
                          <td style={styles.td}>{item.park || '-'}</td>
                          <td style={styles.td}>{item.matched_member_name || '-'}</td>
                          <td style={styles.td}>{item.member_code || '-'}</td>
                          <td style={styles.td}>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Unmatched Rows</h2>
              {!result.unmatched?.length ? (
                <p style={styles.noteText}>No unmatched rows.</p>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Full Name</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Normalized</th>
                        <th style={styles.th}>Park</th>
                        <th style={styles.thRight}>Loan Amount</th>
                        <th style={styles.thRight}>Repayment</th>
                        <th style={styles.th}>Attempt</th>
                        <th style={styles.th}>Reason</th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.unmatched.map((item, index) => (
                        <tr key={`${item.full_name}-${index}`}>
                          <td style={styles.td}>{item.full_name || '-'}</td>
                          <td style={styles.td}>{item.raw_phone || '-'}</td>
                          <td style={styles.td}>{item.normalized_phone || '-'}</td>
                          <td style={styles.td}>{item.park || '-'}</td>
                          <td style={styles.tdRight}>{money(item.disbursement_amount)}</td>
                          <td style={styles.tdRight}>{money(item.repayment_amount)}</td>
                          <td style={styles.td}>{item.match_attempted || '-'}</td>
                          <td style={styles.td}>{item.reason}</td>
                          <td style={styles.td}>
                            <div style={styles.inlineActions}>
                              <button
                                type="button"
                                style={styles.smallSecondaryButton}
                                onClick={() => openRegisterModal(item)}
                              >
                                Register Member
                              </button>
                              <button
                                type="button"
                                style={styles.smallPrimaryButton}
                                onClick={() => handleRetryRow(item)}
                              >
                                Retry
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Errors</h2>
              {!result.errors?.length ? (
                <p style={styles.noteText}>No row-level errors.</p>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Full Name</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Park</th>
                        <th style={styles.th}>Member Code</th>
                        <th style={styles.th}>Action</th>
                        <th style={styles.th}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((item, index) => (
                        <tr key={`${item.full_name}-${index}`}>
                          <td style={styles.td}>{item.full_name || '-'}</td>
                          <td style={styles.td}>{item.raw_phone || '-'}</td>
                          <td style={styles.td}>{item.park || '-'}</td>
                          <td style={styles.td}>{item.member_code || '-'}</td>
                          <td style={styles.td}>{item.action || '-'}</td>
                          <td style={styles.td}>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}

        {registerState.isOpen ? (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Register Unmatched Member</h2>
                <button type="button" style={styles.secondaryButton} onClick={closeRegisterModal}>
                  Close
                </button>
              </div>

              {registerState.error ? <div style={styles.errorBox}>{registerState.error}</div> : null}
              {registerState.message ? <div style={styles.successBox}>{registerState.message}</div> : null}

              <div style={styles.grid}>
                <div style={styles.fieldBox}>
                  <label style={styles.label}>Full Name</label>
                  <input
                    value={registerState.fullName}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Phone</label>
                  <input
                    value={registerState.phone}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Park</label>
                  <select
                    value={registerState.parkId}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, parkId: e.target.value }))
                    }
                    style={styles.input}
                  >
                    <option value="">Select park</option>
                    {parks.map((park) => (
                      <option key={park.id} value={park.id}>
                        {park.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Specific Park</label>
                  <input
                    value={registerState.specificPark}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, specificPark: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Category of Client</label>
                  <input
                    value={registerState.categoryOfClient}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, categoryOfClient: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Status</label>
                  <select
                    value={registerState.status}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, status: e.target.value }))
                    }
                    style={styles.input}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={handleRegisterMember}
                  disabled={registerState.loading}
                >
                  {registerState.loading ? 'Registering...' : 'Register Member'}
                </button>

                <button
  type="button"
  style={styles.secondaryButton}
  disabled={registerState.loading}
  onClick={async () => {
    if (registerState.row) {
      await handleRetryRow(registerState.row)
    }
  }}
>
  Retry Posting This Row
</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    padding: '16px',
  },
  pageInner: {
    maxWidth: '1280px',
    margin: '0 auto',
  },
  headerRow: {
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '32px',
    fontWeight: 800,
    color: '#4b2e83',
  },
  subtitle: {
    margin: '8px 0 0',
    color: '#6b6480',
    fontSize: '15px',
  },
  card: {
    background: '#fff',
    borderRadius: '18px',
    padding: '18px',
    border: '1px solid #ece7f7',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    marginBottom: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '12px',
  },
  fieldBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#4b2e83',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    fontSize: '15px',
    boxSizing: 'border-box',
  },
  infoStrip: {
    marginTop: '14px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    color: '#6b6480',
    fontSize: '14px',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  statCard: {
    background: '#fff',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #ece7f7',
    boxShadow: '0 8px 24px rgba(66, 37, 105, 0.08)',
  },
  statLabel: {
    margin: 0,
    color: '#7a7191',
    fontSize: '13px',
  },
  statValue: {
    margin: '8px 0 0',
    color: '#2d1b69',
    fontSize: '24px',
    fontWeight: 800,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#2d1b69',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  primaryButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontWeight: 800,
    cursor: 'pointer',
  },
  smallPrimaryButton: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '12px',
  },
  smallSecondaryButton: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '12px',
  },
  inlineActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
  errorBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
  },
  successBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#ecfdf3',
    border: '1px solid #abefc6',
    color: '#027a48',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '1200px',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    background: '#faf8fe',
    borderBottom: '1px solid #ece7f7',
    color: '#6b6480',
    fontSize: '13px',
  },
  thRight: {
    textAlign: 'right',
    padding: '12px',
    background: '#faf8fe',
    borderBottom: '1px solid #ece7f7',
    color: '#6b6480',
    fontSize: '13px',
  },
  td: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '1px solid #f1edf8',
    color: '#2d1b69',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  tdRight: {
    textAlign: 'right',
    padding: '12px',
    borderBottom: '1px solid #f1edf8',
    color: '#2d1b69',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000,
  },
  modalCard: {
    width: '100%',
    maxWidth: '900px',
    background: '#fff',
    borderRadius: '18px',
    padding: '18px',
    border: '1px solid #ece7f7',
    boxShadow: '0 20px 50px rgba(66, 37, 105, 0.2)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
}