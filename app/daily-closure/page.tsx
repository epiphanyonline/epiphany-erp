'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type ClosureResult = {
  success?: boolean
  message?: string
  staff_code?: string | null
  staff_name?: string | null
  park_name?: string | null
  business_date?: string | null
  opening_balance?: number | null
  cash_in?: number | null
  cash_out?: number | null
  remitted_amount?: number | null
  expected_cash_at_hand?: number | null
  counted_cash?: number | null
  variance?: number | null
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function money(value: number | null | undefined) {
  return `₦${Number(value || 0).toLocaleString()}`
}

export default function DailyClosurePage() {
  const { staff, loading: staffLoading, canUseSupervisorPages } = useCurrentStaff()

  const [staffCode, setStaffCode] = useState('')
  const [closedByCode, setClosedByCode] = useState('')
  const [businessDate, setBusinessDate] = useState(getTodayDateString())
  const [openingBalance, setOpeningBalance] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [result, setResult] = useState<ClosureResult | null>(null)

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    if (!staff) return

    const savedStaffCode = localStorage.getItem('epiphany_daily_closure_staff_code')
    if (savedStaffCode) {
      setStaffCode(savedStaffCode)
    }

    setClosedByCode(staff.staff_code)
  }, [staff])

  useEffect(() => {
    if (staffCode.trim()) {
      localStorage.setItem('epiphany_daily_closure_staff_code', staffCode.trim())
    }
  }, [staffCode])

  const canSubmit = useMemo(() => {
    return (
      !!staffCode.trim() &&
      !!closedByCode.trim() &&
      !!businessDate &&
      openingBalance !== '' &&
      countedCash !== ''
    )
  }, [staffCode, closedByCode, businessDate, openingBalance, countedCash])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorText('')
    setResult(null)

    const numericOpening = Number(openingBalance)
    const numericCounted = Number(countedCash)

    if (!staffCode.trim()) {
      setErrorText('Staff code is required.')
      setLoading(false)
      return
    }

    if (!closedByCode.trim()) {
      setErrorText('Closed by staff code is required.')
      setLoading(false)
      return
    }

    if (Number.isNaN(numericOpening) || numericOpening < 0) {
      setErrorText('Opening balance must be zero or greater.')
      setLoading(false)
      return
    }

    if (Number.isNaN(numericCounted) || numericCounted < 0) {
      setErrorText('Counted cash must be zero or greater.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc('close_staff_day', {
      p_staff_code: staffCode.trim(),
      p_business_date: businessDate,
      p_opening_balance: numericOpening,
      p_counted_cash: numericCounted,
      p_closed_by_staff_code: closedByCode.trim(),
    })

    console.log('daily closure data:', data)
    console.log('daily closure error:', error)

    if (error) {
      setErrorText(error.message)
      setLoading(false)
      return
    }

    if (data && data.length > 0) {
      setResult(data[0] as ClosureResult)
    } else {
      setErrorText('No response returned from close_staff_day.')
    }

    setLoading(false)
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

  if (!canUseSupervisorPages) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <section style={styles.card}>
            <h1 style={styles.title}>Access Denied</h1>
            <p style={styles.subtitle}>
              Only ADMIN or SUPERVISOR can access daily closure.
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Daily Closure</h1>
            <p style={styles.subtitle}>
              Close out a staff cash day and calculate variance
            </p>
            <p style={styles.sessionText}>
              Signed in as <strong>{staff.full_name}</strong> ({staff.staff_code}) • {staff.role}
            </p>
          </div>

          <button style={styles.backButton} onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>

        <section style={styles.card}>
          <form onSubmit={handleSubmit}>
            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>Staff Code</label>
                <input
                  style={styles.input}
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value)}
                  placeholder="e.g. EC00006"
                />
                <p style={styles.helperText}>
                  Staff whose day is being closed.
                </p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Closed By Staff Code</label>
                <input
                  style={{ ...styles.input, background: '#f8f5fd' }}
                  value={closedByCode}
                  onChange={(e) => setClosedByCode(e.target.value)}
                  placeholder="e.g. EC00001"
                />
                <p style={styles.helperText}>
                  Usually supervisor or admin. Prefilled from logged-in session.
                </p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Business Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Opening Balance</label>
                <input
                  style={styles.input}
                  type="number"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="e.g. 5000"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Counted Cash</label>
                <input
                  style={styles.input}
                  type="number"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="e.g. 7250"
                />
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="submit"
                  style={{
                    ...styles.submitButton,
                    opacity: canSubmit && !loading ? 1 : 0.7,
                  }}
                  disabled={!canSubmit || loading}
                >
                  {loading ? 'Closing...' : 'Close Staff Day'}
                </button>
              </div>
            </div>
          </form>

          {errorText ? (
            <div style={styles.errorBox}>
              <strong>Error:</strong> {errorText}
            </div>
          ) : null}

          {result ? (
            <div style={styles.resultBox}>
              <h3 style={styles.resultTitle}>Daily Closure Result</h3>

              <div style={styles.resultGrid}>
                <ResultItem label="Staff" value={result.staff_name || '-'} />
                <ResultItem label="Staff Code" value={result.staff_code || '-'} />
                <ResultItem label="Park" value={result.park_name || '-'} />
                <ResultItem label="Business Date" value={result.business_date || '-'} />
                <ResultItem label="Opening Balance" value={money(result.opening_balance)} />
                <ResultItem label="Cash In" value={money(result.cash_in)} />
                <ResultItem label="Cash Out" value={money(result.cash_out)} />
                <ResultItem label="Remitted Amount" value={money(result.remitted_amount)} />
                <ResultItem
                  label="Expected Cash"
                  value={money(result.expected_cash_at_hand)}
                />
                <ResultItem label="Counted Cash" value={money(result.counted_cash)} />
                <ResultItem
                  label="Variance"
                  value={money(result.variance)}
                  danger={Number(result.variance || 0) !== 0}
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function ResultItem({
  label,
  value,
  danger = false,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div style={styles.resultItem}>
      <p style={styles.resultLabel}>{label}</p>
      <p
        style={{
          ...styles.resultValue,
          color: danger ? '#b42318' : '#2d1b69',
        }}
      >
        {value}
      </p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    color: '#1f1b2d',
    padding: '16px',
  },
  pageInner: {
    maxWidth: '1100px',
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
  sessionText: {
    margin: '10px 0 0',
    fontSize: '14px',
    color: '#4b2e83',
    lineHeight: 1.5,
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
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
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
  helperText: {
    margin: 0,
    fontSize: '12px',
    color: '#7a7191',
    lineHeight: 1.5,
  },
  buttonRow: {
    gridColumn: '1 / -1',
    marginTop: '6px',
  },
  submitButton: {
    width: '100%',
    maxWidth: '260px',
    padding: '12px 18px',
    borderRadius: '12px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '15px',
  },
  errorBox: {
    marginTop: '20px',
    padding: '14px',
    borderRadius: '12px',
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
    lineHeight: 1.5,
  },
  resultBox: {
    marginTop: '20px',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #e8def8',
    background: '#faf8fe',
  },
  resultTitle: {
    marginTop: 0,
    marginBottom: '14px',
    color: '#2d1b69',
  },
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  resultItem: {
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid #ece7f7',
    padding: '12px',
    minWidth: 0,
  },
  resultLabel: {
    margin: 0,
    fontSize: '13px',
    color: '#7a7191',
  },
  resultValue: {
    margin: '8px 0 0',
    fontSize: '16px',
    fontWeight: 700,
    wordBreak: 'break-word',
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
}