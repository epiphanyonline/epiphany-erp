'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type HistoryRow = {
  line_id: string
  line_ref: string
  batch_id: string
  batch_ref: string
  batch_status: string
  business_date: string
  park_name: string | null
  member_code: string
  member_name: string
  phone: string | null
  requesting_staff_code: string
  requesting_staff_name: string
  proposed_amount: number
  approved_amount: number | null
  tenure_days: number
  line_status: string
  request_note: string | null
  supervisor_note: string | null
  decline_reason: string | null
  posted: boolean
  posted_at: string | null
  posted_tx_ref: string | null
  created_at: string
}

function money(value: number | null | undefined) {
  return `₦${Number(value || 0).toLocaleString()}`
}

export default function DisbursementScheduleHistoryPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState('')

  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('ALL')
  const [selectedPark, setSelectedPark] = useState('ALL')
  const [selectedOfficer, setSelectedOfficer] = useState('ALL')

  const [staffRole, setStaffRole] = useState('')
  const [staffParkId, setStaffParkId] = useState<string | null>(null)
  const [scopeLoading, setScopeLoading] = useState(true)

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
      .select('role, park_id')
      .eq('staff_code', staff.staff_code)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) {
      setStaffRole('')
      setStaffParkId(null)
      setScopeLoading(false)
      return
    }

    setStaffRole(String((data as any).role || '').toUpperCase())
    setStaffParkId((data as any).park_id || null)
    setScopeLoading(false)
  }, [staff])

  const canSeeAll =
    staffRole === 'ADMIN' || staffRole === 'SUPERVISOR'

  const loadHistory = useCallback(async () => {
    if (!staff) return

    setLoading(true)
    setErrorText('')

    let query = supabase
      .from('vw_disbursement_schedule_history')
      .select('*')
      .order('business_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (!canSeeAll && staffParkId) {
      query = query.eq('park_id', staffParkId)
    }

    const { data, error } = await query

    if (error) {
      setRows([])
      setErrorText(error.message || 'Failed to load disbursement history.')
      setLoading(false)
      return
    }

    setRows(
      (((data as HistoryRow[]) || []).map((row) => ({
        ...row,
        proposed_amount: Number(row.proposed_amount || 0),
        approved_amount: row.approved_amount == null ? null : Number(row.approved_amount),
        tenure_days: Number(row.tenure_days || 0),
      })))
    )
    setLoading(false)
  }, [staff, canSeeAll, staffParkId])

  useEffect(() => {
    if (!staffLoading && staff) {
      loadStaffScope()
    }
  }, [staffLoading, staff, loadStaffScope])

  useEffect(() => {
    if (!staffLoading && !scopeLoading && staff) {
      loadHistory()
    }
  }, [staffLoading, scopeLoading, staff, loadHistory])

  const parkOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.park_name || '').filter(Boolean))).sort()
  }, [rows])

  const officerOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.requesting_staff_name || '').filter(Boolean))
    ).sort()
  }, [rows])

  const statusOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.line_status || '').filter(Boolean))).sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rows.filter((row) => {
      if (selectedStatus !== 'ALL' && row.line_status !== selectedStatus) return false
      if (selectedPark !== 'ALL' && (row.park_name || '') !== selectedPark) return false
      if (
        selectedOfficer !== 'ALL' &&
        (row.requesting_staff_name || '') !== selectedOfficer
      ) {
        return false
      }

      if (!q) return true

      return (
        (row.batch_ref || '').toLowerCase().includes(q) ||
        (row.line_ref || '').toLowerCase().includes(q) ||
        (row.member_code || '').toLowerCase().includes(q) ||
        (row.member_name || '').toLowerCase().includes(q) ||
        (row.phone || '').toLowerCase().includes(q) ||
        (row.requesting_staff_name || '').toLowerCase().includes(q) ||
        (row.posted_tx_ref || '').toLowerCase().includes(q) ||
        (row.request_note || '').toLowerCase().includes(q) ||
        (row.supervisor_note || '').toLowerCase().includes(q) ||
        (row.decline_reason || '').toLowerCase().includes(q)
      )
    })
  }, [rows, search, selectedStatus, selectedPark, selectedOfficer])

  const totals = useMemo(() => {
    return {
      count: filteredRows.length,
      proposed: filteredRows.reduce((sum, row) => sum + Number(row.proposed_amount || 0), 0),
      approved: filteredRows.reduce((sum, row) => sum + Number(row.approved_amount || 0), 0),
      postedCount: filteredRows.filter((row) => row.posted).length,
    }
  }, [filteredRows])

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

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div style={styles.headerTextWrap}>
            <h1 style={styles.title}>Disbursement Schedule History</h1>
            <p style={styles.subtitle}>
              Review all submitted, approved, declined, and posted schedules.
            </p>
          </div>

          <button
            style={styles.backButton}
            onClick={() => window.history.back()}
            type="button"
          >
            ← Back
          </button>
        </div>

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Rows</p>
            <h2 style={styles.statValue}>{totals.count}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Proposed</p>
            <h2 style={styles.statValue}>{money(totals.proposed)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Approved</p>
            <h2 style={styles.statValue}>{money(totals.approved)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Posted Lines</p>
            <h2 style={styles.statValue}>{totals.postedCount}</h2>
          </div>
        </section>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}

        <section style={styles.sectionCard}>
          <div style={styles.filtersGrid}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>Search</label>
              <input
                style={styles.input}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Batch, line, member, phone, officer, tx ref"
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={styles.input}
              >
                <option value="ALL">All Statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
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

          <div style={styles.actionsRow}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={loadHistory}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loading ? (
            <p style={styles.noteText}>Loading schedule history...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No schedule history found.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Business Date</th>
                    <th style={styles.th}>Batch</th>
                    <th style={styles.th}>Line</th>
                    <th style={styles.th}>Member</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Park</th>
                    <th style={styles.th}>Officer</th>
                    <th style={styles.th}>Proposed</th>
                    <th style={styles.th}>Approved</th>
                    <th style={styles.th}>Tenure</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Posted Tx Ref</th>
                    <th style={styles.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
  <tr key={`${row.line_id || 'no-id'}-${row.line_ref || 'no-ref'}-${index}`}>
                      <td style={styles.td}>{row.business_date}</td>
                      <td style={styles.td}>
                        {row.batch_ref}
                        <div style={styles.subText}>{row.batch_status}</div>
                      </td>
                      <td style={styles.td}>{row.line_ref}</td>
                      <td style={styles.td}>
                        {row.member_name}
                        <div style={styles.subText}>{row.member_code}</div>
                      </td>
                      <td style={styles.td}>{row.phone || '-'}</td>
                      <td style={styles.td}>{row.park_name || '-'}</td>
                      <td style={styles.td}>
                        {row.requesting_staff_name}
                        <div style={styles.subText}>{row.requesting_staff_code}</div>
                      </td>
                      <td style={styles.td}>{money(row.proposed_amount)}</td>
                      <td style={styles.td}>{money(row.approved_amount)}</td>
                      <td style={styles.td}>{row.tenure_days} days</td>
                      <td style={styles.td}>{row.line_status}</td>
                      <td style={styles.td}>{row.posted_tx_ref || '-'}</td>
                      <td style={styles.td}>
                        <div><strong>Officer:</strong> {row.request_note || '-'}</div>
                        <div><strong>Supervisor:</strong> {row.supervisor_note || '-'}</div>
                        <div><strong>Decline:</strong> {row.decline_reason || '-'}</div>
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

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    color: '#1f1b2d',
  },
  pageInner: {
    maxWidth: '1300px',
    margin: '0 auto',
    padding: '16px',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: '240px',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(28px, 5vw, 40px)',
    fontWeight: 700,
    color: '#4b2e83',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: '#6b6480',
    lineHeight: 1.5,
  },
  backButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  statCard: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 8px 24px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
  },
  statLabel: {
    margin: 0,
    fontSize: '13px',
    color: '#7a7191',
  },
  statValue: {
    margin: '10px 0 0',
    fontSize: '24px',
    color: '#2d1b69',
    lineHeight: 1.15,
    wordBreak: 'break-word',
  },
  sectionCard: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '16px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
    marginBottom: '20px',
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
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
  actionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '16px',
  },
  secondaryButton: {
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  errorBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
    lineHeight: 1.5,
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '1400px',
  },
  th: {
    textAlign: 'left',
    padding: '14px',
    background: '#f3effb',
    color: '#40246d',
    fontSize: '14px',
    borderBottom: '1px solid #ddd6f0',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '14px',
    borderBottom: '1px solid #eee8f8',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  subText: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
    wordBreak: 'break-word',
  },
}