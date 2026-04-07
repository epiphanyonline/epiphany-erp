'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../../lib/supabase'
import { useCurrentStaff } from '../../../lib/useCurrentStaff'

type ProfitRow = {
  staff_code: string
  staff_name: string
  role: string
  park_name: string
  date_from: string
  date_to: string
  card_fee_total: number | null
  processing_fee_total: number | null
  membership_fee_total: number | null
  total_fee_income: number | null
  expense_total: number | null
  net_profit: number | null
  profit_margin: number | null
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getFirstDayOfMonth() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}-01`
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number | null | undefined) {
  return `₦${toNumber(value).toLocaleString()}`
}

export default function AllProfitPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [dateFrom, setDateFrom] = useState(getFirstDayOfMonth())
  const [dateTo, setDateTo] = useState(getTodayDateString())
  const [rows, setRows] = useState<ProfitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [errorText, setErrorText] = useState('')

  const isSupervisor = String(staff?.role || '').toLowerCase() === 'supervisor'

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function loadProfit() {
      if (!staff || !isSupervisor) return

      setLoading(true)
      setErrorText('')

      const { data, error } = await supabase.rpc(
        'get_supervisor_profit_range_summary',
        {
          p_requesting_staff_code: staff.staff_code,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        }
      )

      if (error) {
        setRows([])
        setErrorText(error.message || 'Failed to load profit summaries.')
        setLoading(false)
        return
      }

      setRows((data as ProfitRow[]) || [])
      setLoading(false)
    }

    if (!staffLoading && staff && isSupervisor) {
      loadProfit()
    }

    if (!staffLoading && staff && !isSupervisor) {
      setRows([])
      setLoading(false)
      setErrorText('Access denied. This page is available to supervisors only.')
    }
  }, [staffLoading, staff, isSupervisor, dateFrom, dateTo])

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows

    return rows.filter((row) => {
      return (
        String(row.staff_name || '').toLowerCase().includes(q) ||
        String(row.staff_code || '').toLowerCase().includes(q) ||
        String(row.role || '').toLowerCase().includes(q) ||
        String(row.park_name || '').toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const totals = useMemo(() => {
    return {
      staffCount: filteredRows.length,
      totalCardFees: filteredRows.reduce((sum, row) => sum + toNumber(row.card_fee_total), 0),
      totalProcessingFees: filteredRows.reduce((sum, row) => sum + toNumber(row.processing_fee_total), 0),
      totalMembershipFees: filteredRows.reduce((sum, row) => sum + toNumber(row.membership_fee_total), 0),
      totalFees: filteredRows.reduce((sum, row) => sum + toNumber(row.total_fee_income), 0),
      totalExpenses: filteredRows.reduce((sum, row) => sum + toNumber(row.expense_total), 0),
      totalProfit: filteredRows.reduce((sum, row) => sum + toNumber(row.net_profit), 0),
    }
  }, [filteredRows])

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

  if (!isSupervisor) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <div style={styles.sectionCard}>
            <h1 style={styles.title}>Access Denied</h1>
            <p style={styles.noteText}>Only supervisors can access this page.</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div style={styles.headerTextWrap}>
            <h1 style={styles.title}>Profit Tracking</h1>
            <p style={styles.subtitle}>
              Track staff profit across any selected date range
            </p>
          </div>
        </div>

        <section style={styles.sectionCard}>
          <div style={styles.rangeRow}>
            <div style={styles.dateBox}>
              <label style={styles.label}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.dateBox}>
              <label style={styles.label}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.quickButtonsWrap}>
              <button type="button" style={styles.quickButton} onClick={() => {
                setDateFrom(getTodayDateString())
                setDateTo(getTodayDateString())
              }}>
                Today
              </button>

              <button type="button" style={styles.quickButton} onClick={() => {
                const today = new Date()
                const past = new Date()
                past.setDate(today.getDate() - 6)
                const yyyy = past.getFullYear()
                const mm = String(past.getMonth() + 1).padStart(2, '0')
                const dd = String(past.getDate()).padStart(2, '0')
                setDateFrom(`${yyyy}-${mm}-${dd}`)
                setDateTo(getTodayDateString())
              }}>
                7 Days
              </button>

              <button type="button" style={styles.quickButton} onClick={() => {
                setDateFrom(getFirstDayOfMonth())
                setDateTo(getTodayDateString())
              }}>
                This Month
              </button>
            </div>
          </div>

          <div style={styles.filtersRow}>
            <input
              style={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by staff, code, role, or park"
            />
          </div>
        </section>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Staff Count</p>
            <h2 style={styles.statValue}>{totals.staffCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Total Fees</p>
            <h2 style={styles.statValue}>{money(totals.totalFees)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Total Expenses</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {money(totals.totalExpenses)}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Net Profit</p>
            <h2
              style={{
                ...styles.statValue,
                color:
                  totals.totalProfit < 0
                    ? '#b42318'
                    : totals.totalProfit > 0
                    ? '#027a48'
                    : '#2d1b69',
              }}
            >
              {money(totals.totalProfit)}
            </h2>
          </div>
        </section>

        <section style={styles.sectionCard}>
          {loading ? (
            <p style={styles.noteText}>Loading profit summaries...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No profit records found for this range.</p>
          ) : (
            <div style={styles.mobileList}>
              {filteredRows.map((row, index) => (
                <div key={`${row.staff_code}-${index}`} style={styles.mobileCard}>
                  <div style={styles.mobileTopRow}>
                    <div>
                      <div style={styles.mobileStaffName}>{row.staff_name}</div>
                      <div style={styles.mobileStaffMeta}>
                        {row.staff_code} • {row.role} • {row.park_name}
                      </div>
                    </div>
                  </div>

                  <div style={styles.mobileMetricsGrid}>
                    <MetricItem label="Card Fee" value={money(row.card_fee_total)} />
                    <MetricItem label="Processing" value={money(row.processing_fee_total)} />
                    <MetricItem label="Membership" value={money(row.membership_fee_total)} />
                    <MetricItem label="Fees Total" value={money(row.total_fee_income)} strong />
                    <MetricItem label="Expenses" value={money(row.expense_total)} color="#b42318" />
                    <MetricItem
                      label="Net Profit"
                      value={money(row.net_profit)}
                      strong
                      color={
                        toNumber(row.net_profit) < 0
                          ? '#b42318'
                          : toNumber(row.net_profit) > 0
                          ? '#027a48'
                          : '#2d1b69'
                      }
                    />
                    <MetricItem
                      label="Margin"
                      value={`${toNumber(row.profit_margin)}%`}
                      color={
                        toNumber(row.profit_margin) < 0
                          ? '#b42318'
                          : toNumber(row.profit_margin) > 0
                          ? '#027a48'
                          : '#2d1b69'
                      }
                    />
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

function MetricItem({
  label,
  value,
  strong = false,
  color,
}: {
  label: string
  value: string
  strong?: boolean
  color?: string
}) {
  return (
    <div style={styles.metricItem}>
      <p style={styles.metricLabel}>{label}</p>
      <p
        style={{
          ...styles.metricValue,
          fontWeight: strong ? 800 : 700,
          color: color || '#2d1b69',
        }}
      >
        {value}
      </p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    color: '#1f1b2d',
    padding: '16px',
  },
  pageInner: {
    maxWidth: '1180px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '24px',
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
    fontSize: '15px',
    color: '#6b6480',
    lineHeight: 1.5,
  },
  rangeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
    alignItems: 'end',
  },
  dateBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  quickButtonsWrap: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  quickButton: {
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
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
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '14px',
    marginBottom: '24px',
  },
  statCard: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 8px 24px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
  },
  statLabel: {
    margin: 0,
    fontSize: '14px',
    color: '#7a7191',
    lineHeight: 1.4,
  },
  statValue: {
    margin: '10px 0 0',
    fontSize: '24px',
    color: '#2d1b69',
    lineHeight: 1.2,
    wordBreak: 'break-word',
  },
  sectionCard: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
    marginBottom: '20px',
  },
  filtersRow: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '12px',
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
    lineHeight: 1.5,
  },
  mobileList: {
    display: 'grid',
    gap: '12px',
  },
  mobileCard: {
    border: '1px solid #ece7f7',
    borderRadius: '16px',
    padding: '14px',
    background: '#fcfbff',
  },
  mobileTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '14px',
  },
  mobileStaffName: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#2d1b69',
  },
  mobileStaffMeta: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
    fontWeight: 700,
    lineHeight: 1.4,
  },
  mobileMetricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  },
  metricItem: {
    minWidth: 0,
  },
  metricLabel: {
    margin: 0,
    fontSize: '11px',
    color: '#7a7191',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  metricValue: {
    margin: '4px 0 0',
    fontSize: '14px',
    color: '#2d1b69',
    wordBreak: 'break-word',
  },
}