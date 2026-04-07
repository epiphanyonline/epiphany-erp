'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../../lib/supabase'
import { useCurrentStaff } from '../../../lib/useCurrentStaff'

type ExceptionRow = {
  id: string
  session_id: string
  upload_type: string
  exception_type: string
  row_no: number | null
  raw_phone: string | null
  normalized_phone: string | null
  full_name: string | null
  park: string | null
  disbursement_amount: number | null
  repayment_amount: number | null
  match_attempted: string | null
  match_method: string | null
  action: string | null
  reason: string
  member_id: string | null
  member_code: string | null
  matched_member_name: string | null
  resolution_status: string
  resolution_note: string | null
  retry_count: number
  last_retry_at: string | null
  created_at: string
  source_file_name: string | null
  business_date: string | null
  tenure_days: number | null
  uploaded_by_staff_code: string | null
  session_created_at: string | null
}

type ResolveResult = {
  success: boolean
  message: string
}

type RetryRpcResult = {
  success: boolean
  session_id?: string
  posted_disbursements: number
  posted_repayments: number
  skipped: number
  matched_by_name: any[]
  unmatched: any[]
  errors: any[]
}

function money(value: number | null | undefined) {
  return `₦${Number(value || 0).toLocaleString()}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString()
}

export default function BulkUploadExceptionsPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<ExceptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')

  const [search, setSearch] = useState('')
  const [exceptionType, setExceptionType] = useState('ALL')
  const [resolutionStatus, setResolutionStatus] = useState('OPEN')

  const [workingId, setWorkingId] = useState<string | null>(null)
  const [resolveNoteById, setResolveNoteById] = useState<Record<string, string>>({})

  const canAccess = useMemo(() => {
    const role = String(staff?.role || '').toLowerCase()
    return role === 'admin' || role === 'supervisor'
  }, [staff])

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  const loadExceptions = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setErrorText('')

    let query = supabase
      .from('vw_bulk_upload_open_exceptions')
      .select('*')
      .order('created_at', { ascending: false })

    if (resolutionStatus !== 'ALL') {
      query = query.eq('resolution_status', resolutionStatus)
    }

    if (exceptionType !== 'ALL') {
      query = query.eq('exception_type', exceptionType)
    }

    if (search.trim()) {
      const q = search.trim()
      query = query.or(
        [
          `full_name.ilike.%${q}%`,
          `raw_phone.ilike.%${q}%`,
          `normalized_phone.ilike.%${q}%`,
          `park.ilike.%${q}%`,
          `member_code.ilike.%${q}%`,
          `matched_member_name.ilike.%${q}%`,
          `source_file_name.ilike.%${q}%`,
          `uploaded_by_staff_code.ilike.%${q}%`,
          `reason.ilike.%${q}%`,
        ].join(',')
      )
    }

    const { data, error } = await query

    if (error) {
      setRows([])
      setErrorText(error.message || 'Failed to load exceptions.')
      setLoading(false)
      setRefreshing(false)
      return
    }

    setRows((data as ExceptionRow[]) || [])
    setLoading(false)
    setRefreshing(false)
  }, [exceptionType, resolutionStatus, search])

  useEffect(() => {
    if (!staffLoading && staff && canAccess) {
      loadExceptions()
    }
  }, [staffLoading, staff, canAccess, loadExceptions])

  async function handleRetry(row: ExceptionRow) {
    if (!staff) return

    setWorkingId(row.id)
    setErrorText('')
    setSuccessText('')

    const { data, error } = await supabase.rpc('retry_bulk_upload_row', {
      p_requesting_staff_code: staff.staff_code,
      p_business_date: row.business_date,
      p_tenure_days: row.tenure_days,
      p_full_name: row.full_name || '',
      p_raw_phone: row.raw_phone || '',
      p_disbursement_amount: row.disbursement_amount,
      p_repayment_amount: row.repayment_amount,
      p_park_name: row.park || '',
      p_exception_id: row.id,
    })

    if (error) {
      setErrorText(error.message || 'Retry failed.')
      setWorkingId(null)
      return
    }

    const result = data as RetryRpcResult

    const postedDisb = Number(result?.posted_disbursements || 0)
    const postedRep = Number(result?.posted_repayments || 0)
    const unmatchedCount = Array.isArray(result?.unmatched) ? result.unmatched.length : 0
    const errorCount = Array.isArray(result?.errors) ? result.errors.length : 0

    if (postedDisb > 0 || postedRep > 0) {
      setSuccessText(
        `Retry completed. Disbursements: ${postedDisb}, Repayments: ${postedRep}.`
      )
    } else if (errorCount > 0) {
      setErrorText(result.errors?.[0]?.reason || 'Retry failed.')
    } else if (unmatchedCount > 0) {
      setErrorText(result.unmatched?.[0]?.reason || 'Row is still unmatched.')
    } else {
      setErrorText('Retry did not post any transaction.')
    }

    await loadExceptions(true)
    setWorkingId(null)
  }

  async function handleResolve(row: ExceptionRow) {
    if (!staff) return

    setWorkingId(row.id)
    setErrorText('')
    setSuccessText('')

    const note = resolveNoteById[row.id] || null

    const { data, error } = await supabase.rpc('resolve_bulk_upload_exception', {
      p_exception_id: row.id,
      p_staff_code: staff.staff_code,
      p_resolution_note: note,
    })

    if (error) {
      setErrorText(error.message || 'Failed to resolve exception.')
      setWorkingId(null)
      return
    }

    const result = data?.[0] as ResolveResult | undefined

    if (!result?.success) {
      setErrorText(result?.message || 'Failed to resolve exception.')
      setWorkingId(null)
      return
    }

    setSuccessText(result.message || 'Exception resolved.')
    await loadExceptions(true)
    setWorkingId(null)
  }

  async function handleIgnore(row: ExceptionRow) {
    if (!staff) return

    setWorkingId(row.id)
    setErrorText('')
    setSuccessText('')

    const note = resolveNoteById[row.id] || null

    const { data, error } = await supabase.rpc('ignore_bulk_upload_exception', {
      p_exception_id: row.id,
      p_staff_code: staff.staff_code,
      p_resolution_note: note,
    })

    if (error) {
      setErrorText(error.message || 'Failed to ignore exception.')
      setWorkingId(null)
      return
    }

    const result = data?.[0] as ResolveResult | undefined

    if (!result?.success) {
      setErrorText(result?.message || 'Failed to ignore exception.')
      setWorkingId(null)
      return
    }

    setSuccessText(result.message || 'Exception ignored.')
    await loadExceptions(true)
    setWorkingId(null)
  }

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1
        if (row.exception_type === 'UNMATCHED') acc.unmatched += 1
        if (row.exception_type === 'ERROR') acc.errors += 1
        if (row.exception_type === 'MATCHED_BY_NAME') acc.matchedByName += 1
        return acc
      },
      {
        total: 0,
        unmatched: 0,
        errors: 0,
        matchedByName: 0,
      }
    )
  }, [rows])

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
          <div style={styles.errorBox}>
            Only ADMIN or SUPERVISOR can access bulk upload exceptions.
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Bulk Upload Exceptions</h1>
            <p style={styles.subtitle}>
              Track unmatched rows, retry failed postings, and keep a permanent audit trail.
            </p>
          </div>

          <div style={styles.headerActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => loadExceptions(true)}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => window.history.back()}
            >
              ← Back
            </button>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.filterGrid}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>Search</label>
              <input
                style={styles.input}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, park, file, reason..."
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Exception Type</label>
              <select
                style={styles.input}
                value={exceptionType}
                onChange={(e) => setExceptionType(e.target.value)}
              >
                <option value="ALL">All</option>
                <option value="UNMATCHED">UNMATCHED</option>
                <option value="ERROR">ERROR</option>
                <option value="MATCHED_BY_NAME">MATCHED_BY_NAME</option>
              </select>
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Resolution Status</label>
              <select
                style={styles.input}
                value={resolutionStatus}
                onChange={(e) => setResolutionStatus(e.target.value)}
              >
                <option value="OPEN">OPEN</option>
                <option value="ALL">ALL</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="IGNORED">IGNORED</option>
              </select>
            </div>
          </div>
        </section>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}
        {successText ? <div style={styles.successBox}>{successText}</div> : null}

        <section style={styles.statGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Visible Rows</p>
            <h2 style={styles.statValue}>{summary.total}</h2>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Unmatched</p>
            <h2 style={styles.statValue}>{summary.unmatched}</h2>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Errors</p>
            <h2 style={styles.statValue}>{summary.errors}</h2>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Matched By Name</p>
            <h2 style={styles.statValue}>{summary.matchedByName}</h2>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Exception Queue</h2>

          {loading ? (
            <p style={styles.noteText}>Loading exceptions...</p>
          ) : !rows.length ? (
            <p style={styles.noteText}>No exceptions found.</p>
          ) : (
            <div style={styles.listWrap}>
              {rows.map((row) => (
                <div key={row.id} style={styles.exceptionCard}>
                  <div style={styles.exceptionTopRow}>
                    <div style={styles.exceptionMain}>
                      <div style={styles.exceptionTitleRow}>
                        <h3 style={styles.exceptionTitle}>
                          {row.full_name || 'Unnamed row'}
                        </h3>

                        <span
                          style={{
                            ...styles.badge,
                            background:
                              row.exception_type === 'UNMATCHED'
                                ? '#fff4e5'
                                : row.exception_type === 'ERROR'
                                ? '#fef3f2'
                                : '#eff8ff',
                            color:
                              row.exception_type === 'UNMATCHED'
                                ? '#b54708'
                                : row.exception_type === 'ERROR'
                                ? '#b42318'
                                : '#175cd3',
                          }}
                        >
                          {row.exception_type}
                        </span>

                        <span
                          style={{
                            ...styles.badge,
                            background:
                              row.resolution_status === 'OPEN'
                                ? '#f2f4f7'
                                : row.resolution_status === 'RESOLVED'
                                ? '#ecfdf3'
                                : '#fff1f3',
                            color:
                              row.resolution_status === 'OPEN'
                                ? '#475467'
                                : row.resolution_status === 'RESOLVED'
                                ? '#027a48'
                                : '#c11574',
                          }}
                        >
                          {row.resolution_status}
                        </span>
                      </div>

                      <p style={styles.exceptionMeta}>
                        Row: {row.row_no ?? '-'} • Park: {row.park || '-'} • File:{' '}
                        {row.source_file_name || '-'} • Uploaded by:{' '}
                        {row.uploaded_by_staff_code || '-'}
                      </p>

                      <p style={styles.exceptionMeta}>
                        Phone: {row.raw_phone || '-'} • Normalized: {row.normalized_phone || '-'}
                      </p>

                      <p style={styles.exceptionMeta}>
                        Session date: {formatDate(row.business_date)} • Session created:{' '}
                        {formatDateTime(row.session_created_at)}
                      </p>
                    </div>
                  </div>

                  <div style={styles.infoGrid}>
                    <InfoMini label="Disbursement" value={money(row.disbursement_amount)} />
                    <InfoMini label="Repayment" value={money(row.repayment_amount)} />
                    <InfoMini label="Match Attempted" value={row.match_attempted || '-'} />
                    <InfoMini label="Match Method" value={row.match_method || '-'} />
                    <InfoMini label="Action" value={row.action || '-'} />
                    <InfoMini
                      label="Matched Member"
                      value={
                        row.member_code
                          ? `${row.matched_member_name || '-'} (${row.member_code})`
                          : row.matched_member_name || '-'
                      }
                    />
                    <InfoMini label="Retry Count" value={String(row.retry_count || 0)} />
                    <InfoMini label="Last Retry" value={formatDateTime(row.last_retry_at)} />
                  </div>

                  <div style={styles.reasonBox}>
                    <strong>Reason:</strong> {row.reason}
                  </div>

                  <div style={styles.noteBox}>
                    <label style={styles.label}>Resolution Note</label>
                    <input
                      style={styles.input}
                      value={resolveNoteById[row.id] || ''}
                      onChange={(e) =>
                        setResolveNoteById((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      placeholder="Optional note for resolve/ignore"
                    />
                  </div>

                  <div style={styles.buttonRow}>
                    <button
                      type="button"
                      style={styles.primaryButton}
                      onClick={() => handleRetry(row)}
                      disabled={workingId === row.id}
                    >
                      {workingId === row.id ? 'Working...' : 'Retry Row'}
                    </button>

                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => handleResolve(row)}
                      disabled={workingId === row.id}
                    >
                      Mark Resolved
                    </button>

                    <button
                      type="button"
                      style={styles.ghostDangerButton}
                      onClick={() => handleIgnore(row)}
                      disabled={workingId === row.id}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function InfoMini({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div style={styles.infoMini}>
      <p style={styles.infoMiniLabel}>{label}</p>
      <p style={styles.infoMiniValue}>{value}</p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    padding: '16px',
    color: '#1f1b2d',
  },
  pageInner: {
    maxWidth: '1280px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  headerActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
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
    lineHeight: 1.5,
  },
  card: {
    background: '#fff',
    borderRadius: '18px',
    padding: '18px',
    border: '1px solid #ece7f7',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    marginBottom: '20px',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
  sectionTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#2d1b69',
  },
  listWrap: {
    display: 'grid',
    gap: '14px',
    marginTop: '14px',
  },
  exceptionCard: {
    border: '1px solid #ece7f7',
    borderRadius: '16px',
    padding: '16px',
    background: '#fcfbff',
  },
  exceptionTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  exceptionMain: {
    flex: 1,
    minWidth: '260px',
  },
  exceptionTitleRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  exceptionTitle: {
    margin: 0,
    fontSize: '18px',
    color: '#2d1b69',
  },
  badge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  exceptionMeta: {
    margin: '8px 0 0',
    fontSize: '13px',
    color: '#6b6480',
    lineHeight: 1.5,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginTop: '14px',
  },
  infoMini: {
    background: '#fff',
    border: '1px solid #ece7f7',
    borderRadius: '12px',
    padding: '10px 12px',
  },
  infoMiniLabel: {
    margin: 0,
    fontSize: '11px',
    color: '#7a7191',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  infoMiniValue: {
    margin: '6px 0 0',
    fontSize: '14px',
    color: '#2d1b69',
    fontWeight: 700,
    wordBreak: 'break-word',
  },
  reasonBox: {
    marginTop: '14px',
    padding: '12px 14px',
    borderRadius: '12px',
    background: '#f8f5fd',
    border: '1px solid #e8def8',
    color: '#4b2e83',
    lineHeight: 1.5,
  },
  noteBox: {
    marginTop: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '16px',
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
  ghostDangerButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #fecdca',
    background: '#fff',
    color: '#b42318',
    fontWeight: 800,
    cursor: 'pointer',
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
}