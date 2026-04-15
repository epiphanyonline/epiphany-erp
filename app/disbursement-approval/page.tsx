'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type PendingLineRow = {
  id: string
  line_ref: string
  batch_id: string
  batch_ref: string
  business_date: string
  member_id: string
  member_code: string
  member_name_snapshot: string
  phone_snapshot: string | null
  park_id: string | null
  park_name_snapshot: string | null
  requesting_staff_id: string
  requesting_staff_code: string
  requesting_staff_name: string
  proposed_amount: number
  approved_amount: number | null
  tenure_days: number
  request_note: string | null
  supervisor_note: string | null
  status: string
  created_at: string
}

type ApproveResult = {
  success: boolean
  message: string
  posted_tx_ref: string | null
  posted_loan_account_id: string | null
}

type DeclineResult = {
  success: boolean
  message: string
}

function money(value: number | null | undefined) {
  return `₦${Number(value || 0).toLocaleString()}`
}

export default function DisbursementApprovalPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<PendingLineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [staffRole, setStaffRole] = useState('')
  const [scopeLoading, setScopeLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selectedPark, setSelectedPark] = useState('ALL')
  const [selectedOfficer, setSelectedOfficer] = useState('ALL')

  const [selectedLine, setSelectedLine] = useState<PendingLineRow | null>(null)
  const [approvedAmount, setApprovedAmount] = useState('')
  const [supervisorNote, setSupervisorNote] = useState('')
  const [declineReason, setDeclineReason] = useState('')

  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  const loadStaffScope = useCallback(async () => {
    if (!staff?.staff_code) {
      setScopeLoading(false)
      return
    }

    setScopeLoading(true)

    const { data, error } = await supabase
      .from('staff')
      .select('role')
      .eq('staff_code', staff.staff_code)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) {
      setStaffRole('')
      setScopeLoading(false)
      return
    }

    setStaffRole(String((data as any).role || '').toUpperCase())
    setScopeLoading(false)
  }, [staff])

  const canApprove =
    staffRole === 'SUPERVISOR' || staffRole === 'ADMIN'

  const loadPending = useCallback(async () => {
    setLoading(true)
    setActionError('')

    const { data, error } = await supabase
      .from('vw_disbursement_schedule_pending')
      .select('*')
      .order('business_date', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      setRows([])
      setActionError(error.message || 'Failed to load pending schedules.')
      setLoading(false)
      return
    }

    setRows(
      (((data as PendingLineRow[]) || []).map((row) => ({
        ...row,
        proposed_amount: Number(row.proposed_amount || 0),
        approved_amount: row.approved_amount == null ? null : Number(row.approved_amount),
        tenure_days: Number(row.tenure_days || 0),
      })))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!staffLoading && staff) {
      loadStaffScope()
    }
  }, [staffLoading, staff, loadStaffScope])

  useEffect(() => {
    if (!staffLoading && !scopeLoading && staff && canApprove) {
      loadPending()
    }
  }, [staffLoading, scopeLoading, staff, canApprove, loadPending])

  const parkOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.park_name_snapshot || '').filter(Boolean))
    ).sort()
  }, [rows])

  const officerOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.requesting_staff_name || '').filter(Boolean))
    ).sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rows.filter((row) => {
      if (selectedPark !== 'ALL' && (row.park_name_snapshot || '') !== selectedPark) {
        return false
      }

      if (
        selectedOfficer !== 'ALL' &&
        (row.requesting_staff_name || '') !== selectedOfficer
      ) {
        return false
      }

      if (!q) return true

      return (
        (row.line_ref || '').toLowerCase().includes(q) ||
        (row.batch_ref || '').toLowerCase().includes(q) ||
        (row.member_code || '').toLowerCase().includes(q) ||
        (row.member_name_snapshot || '').toLowerCase().includes(q) ||
        (row.phone_snapshot || '').toLowerCase().includes(q) ||
        (row.park_name_snapshot || '').toLowerCase().includes(q) ||
        (row.requesting_staff_name || '').toLowerCase().includes(q) ||
        (row.request_note || '').toLowerCase().includes(q)
      )
    })
  }, [rows, search, selectedPark, selectedOfficer])

  const totals = useMemo(() => {
    return {
      count: filteredRows.length,
      totalRequested: filteredRows.reduce(
        (sum, row) => sum + Number(row.proposed_amount || 0),
        0
      ),
    }
  }, [filteredRows])

  function openApprove(line: PendingLineRow) {
    setSelectedLine(line)
    setApprovedAmount(String(line.proposed_amount || ''))
    setSupervisorNote('')
    setDeclineReason('')
    setActionError('')
    setActionMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleApprove() {
    if (!staff?.staff_code || !selectedLine) return

    const amount = Number(approvedAmount)

    if (!amount || amount <= 0) {
      setActionError('Approved amount must be greater than zero.')
      return
    }

    setBusyId(selectedLine.id)
    setActionError('')
    setActionMessage('')

    const { data, error } = await supabase.rpc('approve_disbursement_schedule_line', {
      p_line_id: selectedLine.id,
      p_supervisor_staff_code: staff.staff_code,
      p_approved_amount: amount,
      p_supervisor_note: supervisorNote.trim() || null,
    })

    if (error) {
      setActionError(error.message || 'Approval failed.')
      setBusyId(null)
      return
    }

    const result = data?.[0] as ApproveResult | undefined

    if (!result?.success) {
      setActionError(result?.message || 'Approval failed.')
      setBusyId(null)
      return
    }

    setActionMessage(
      result.posted_tx_ref
        ? `${result.message} Tx Ref: ${result.posted_tx_ref}`
        : result.message || 'Approved successfully.'
    )

    setSelectedLine(null)
    setApprovedAmount('')
    setSupervisorNote('')
    setDeclineReason('')
    setBusyId(null)
    await loadPending()
  }

  async function handleDecline() {
    if (!staff?.staff_code || !selectedLine) return

    if (!declineReason.trim()) {
      setActionError('Decline reason is required.')
      return
    }

    setBusyId(selectedLine.id)
    setActionError('')
    setActionMessage('')

    const { data, error } = await supabase.rpc('decline_disbursement_schedule_line', {
      p_line_id: selectedLine.id,
      p_supervisor_staff_code: staff.staff_code,
      p_decline_reason: declineReason.trim(),
    })

    if (error) {
      setActionError(error.message || 'Decline failed.')
      setBusyId(null)
      return
    }

    const result = data?.[0] as DeclineResult | undefined

    if (!result?.success) {
      setActionError(result?.message || 'Decline failed.')
      setBusyId(null)
      return
    }

    setActionMessage(result.message || 'Schedule declined successfully.')
    setSelectedLine(null)
    setApprovedAmount('')
    setSupervisorNote('')
    setDeclineReason('')
    setBusyId(null)
    await loadPending()
  }

  if (staffLoading || scopeLoading) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <p style={styles.noteText}>Loading access...</p>
        </div>
      </main>
    )
  }

  if (!staff) return null

  if (!canApprove) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <div style={styles.errorBox}>
            Only supervisor or admin can access disbursement approval.
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
            <h1 style={styles.title}>Disbursement Approval</h1>
            <p style={styles.subtitle}>
              Review submitted schedules, approve, reduce amount, or decline.
            </p>
          </div>

          <button
            style={styles.backButton}
            type="button"
            onClick={() => window.history.back()}
          >
            ← Back
          </button>
        </div>

        {actionMessage ? <div style={styles.successBox}>{actionMessage}</div> : null}
        {actionError ? <div style={styles.errorBox}>{actionError}</div> : null}

        {selectedLine ? (
          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Review Schedule Line</h2>
            </div>

            <div style={styles.reviewGrid}>
              <InfoMini label="Batch Ref" value={selectedLine.batch_ref} />
              <InfoMini label="Line Ref" value={selectedLine.line_ref} />
              <InfoMini label="Business Date" value={selectedLine.business_date} />
              <InfoMini label="Officer" value={selectedLine.requesting_staff_name} />
              <InfoMini label="Member" value={selectedLine.member_name_snapshot} />
              <InfoMini label="Member Code" value={selectedLine.member_code} />
              <InfoMini label="Phone" value={selectedLine.phone_snapshot || '-'} />
              <InfoMini label="Park" value={selectedLine.park_name_snapshot || '-'} />
              <InfoMini
                label="Proposed Amount"
                value={money(selectedLine.proposed_amount)}
              />
              <InfoMini label="Tenure" value={`${selectedLine.tenure_days} days`} />
            </div>

            <div style={styles.notePanel}>
              <strong>Officer Note:</strong>{' '}
              {selectedLine.request_note?.trim() || 'No note provided.'}
            </div>

            <div style={styles.formGrid}>
              <div style={styles.fieldBox}>
                <label style={styles.label}>Approved Amount</label>
                <input
                  type="number"
                  value={approvedAmount}
                  onChange={(e) => setApprovedAmount(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBox}>
                <label style={styles.label}>Supervisor Note</label>
                <textarea
                  value={supervisorNote}
                  onChange={(e) => setSupervisorNote(e.target.value)}
                  style={styles.textarea}
                  placeholder="Optional approval note"
                />
              </div>

              <div style={styles.fieldBox}>
                <label style={styles.label}>Decline Reason</label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  style={styles.textarea}
                  placeholder="Required only if declining"
                />
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleApprove}
                disabled={busyId === selectedLine.id}
              >
                {busyId === selectedLine.id ? 'Processing...' : 'Approve / Post'}
              </button>

              <button
                type="button"
                style={styles.dangerButton}
                onClick={handleDecline}
                disabled={busyId === selectedLine.id}
              >
                {busyId === selectedLine.id ? 'Processing...' : 'Decline'}
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setSelectedLine(null)
                  setApprovedAmount('')
                  setSupervisorNote('')
                  setDeclineReason('')
                  setActionError('')
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Pending Schedule Lines</h2>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={loadPending}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div style={styles.filterGrid}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>Search</label>
              <input
                style={styles.input}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search batch, line, member, phone, officer"
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Park</label>
              <select
                value={selectedPark}
                onChange={(e) => setSelectedPark(e.target.value)}
                style={styles.input}
              >
                <option value="ALL">All Parks</option>
                {parkOptions.map((park) => (
                  <option key={park} value={park}>
                    {park}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Officer</label>
              <select
                value={selectedOfficer}
                onChange={(e) => setSelectedOfficer(e.target.value)}
                style={styles.input}
              >
                <option value="ALL">All Officers</option>
                {officerOptions.map((officer) => (
                  <option key={officer} value={officer}>
                    {officer}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.summaryRow}>
            <span>{totals.count} pending lines</span>
            <span>{money(totals.totalRequested)} requested</span>
          </div>

          {loading ? (
            <p style={styles.noteText}>Loading pending approvals...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No pending schedule lines found.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Batch</th>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Officer</th>
                    <th style={styles.th}>Member</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Park</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Tenure</th>
                    <th style={styles.th}>Note</th>
                    <th style={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.td}>
                        {row.batch_ref}
                        <div style={styles.subText}>{row.line_ref}</div>
                      </td>
                      <td style={styles.td}>{row.business_date}</td>
                      <td style={styles.td}>
                        {row.requesting_staff_name}
                        <div style={styles.subText}>{row.requesting_staff_code}</div>
                      </td>
                      <td style={styles.td}>
                        {row.member_name_snapshot}
                        <div style={styles.subText}>{row.member_code}</div>
                      </td>
                      <td style={styles.td}>{row.phone_snapshot || '-'}</td>
                      <td style={styles.td}>{row.park_name_snapshot || '-'}</td>
                      <td style={styles.td}>{money(row.proposed_amount)}</td>
                      <td style={styles.td}>{row.tenure_days} days</td>
                      <td style={styles.td}>{row.request_note || '-'}</td>
                      <td style={styles.td}>
                        <button
                          type="button"
                          style={styles.rowButton}
                          onClick={() => openApprove(row)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoMini}>
      <div style={styles.infoMiniLabel}>{label}</div>
      <div style={styles.infoMiniValue}>{value}</div>
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
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(28px, 5vw, 40px)',
    fontWeight: 700,
    color: '#4b2e83',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '15px',
    color: '#6b6480',
  },
  backButton: {
    padding: '10px 16px',
    borderRadius: '12px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  card: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
    marginBottom: '20px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '14px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#2d1b69',
  },
  successBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#ecfdf3',
    border: '1px solid #abefc6',
    color: '#027a48',
  },
  errorBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginBottom: '14px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '14px',
  },
  fieldBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#4b2e83',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    outline: 'none',
    fontSize: '16px',
    background: '#fff',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    minHeight: '96px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    outline: 'none',
    fontSize: '16px',
    background: '#fff',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  reviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginBottom: '14px',
  },
  infoMini: {
    background: '#fcfbff',
    border: '1px solid #ece7f7',
    borderRadius: '12px',
    padding: '12px',
  },
  infoMiniLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#7a7191',
    fontWeight: 700,
  },
  infoMiniValue: {
    marginTop: '6px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#2d1b69',
    wordBreak: 'break-word',
  },
  notePanel: {
    marginBottom: '14px',
    padding: '12px 14px',
    borderRadius: '12px',
    background: '#faf8fe',
    border: '1px solid #ece7f7',
    color: '#4b2e83',
    lineHeight: 1.5,
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
  dangerButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: 'none',
    background: '#fef3f2',
    color: '#b42318',
    fontWeight: 800,
    cursor: 'pointer',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '14px',
    color: '#6b6480',
    fontSize: '14px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '1100px',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    background: '#faf8fe',
    borderBottom: '1px solid #ece7f7',
    color: '#6b6480',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  td: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '1px solid #f1edf8',
    color: '#2d1b69',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  subText: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
  },
  rowButton: {
    padding: '8px 12px',
    borderRadius: '10px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '12px',
  },
}