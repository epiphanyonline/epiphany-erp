'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type CoreMember = {
  id: string
  member_code: string
  full_name: string
}

type Loan = {
  member_id: string
  principal_amount: number
  outstanding_balance: number
  tenure_days: number
  expected_daily_amount: number | null
  disbursed_at: string | null
  due_date: string | null
  status: string
}

type OverdueRow = {
  member_id: string
  member_code: string
  member_name: string
  principal_amount: number
  outstanding_balance: number
  expected_daily_amount: number
  tenure_days: number
  disbursed_at: string | null
  due_date: string | null
  status: string
  display_status: string
  days_overdue: number
}

function getDisplayLoanStatus(loan: Loan) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dueDate = loan.due_date ? new Date(loan.due_date) : null
  if (dueDate) dueDate.setHours(0, 0, 0, 0)

  if (
    loan.status === 'ACTIVE' &&
    loan.outstanding_balance > 0 &&
    dueDate &&
    dueDate < today
  ) {
    return 'OVERDUE'
  }

  return loan.status
}

function getDaysOverdue(dueDateStr: string | null) {
  if (!dueDateStr) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dueDate = new Date(dueDateStr)
  dueDate.setHours(0, 0, 0, 0)

  const diffMs = today.getTime() - dueDate.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  return days > 0 ? days : 0
}

function formatMoney(value: number) {
  return `₦${Number(value || 0).toLocaleString()}`
}

export default function OverdueDashboardPage() {
  const [rows, setRows] = useState<OverdueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function loadOverdueData() {
      setLoading(true)

      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Lagos' })
      const { data, error } = await supabase.rpc('epiphany_collection_report', {
        p_date_from: today,
        p_date_to: today,
        p_park_id: null,
      })

      if (error) {
        console.error('Unable to load working-day overdue report', error)
        setRows([])
        setLoading(false)
        return
      }

      const mergedRows: OverdueRow[] = ((data || []) as any[])
        .filter((loan) => loan.display_status === 'OVERDUE')
        .map((loan) => ({
          member_id: loan.member_id,
          member_code: loan.member_code || '-',
          member_name: loan.member_name || 'Unknown Member',
          principal_amount: Number(loan.principal_amount || 0),
          outstanding_balance: Number(loan.outstanding_balance || 0),
          expected_daily_amount: Number(loan.actual_paid_for_range || 0),
          tenure_days: Number(loan.tenure_days || 0),
          disbursed_at: loan.disbursed_at,
          due_date: loan.due_date,
          status: loan.loan_status,
          display_status: 'OVERDUE',
          days_overdue: Number(loan.working_days_overdue || 0),
        }))

      setRows(mergedRows)
      setLoading(false)
    }

    loadOverdueData()
  }, [])

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows

    return rows.filter((row) => {
      return (
        row.member_code.toLowerCase().includes(q) ||
        row.member_name.toLowerCase().includes(q) ||
        row.display_status.toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const totals = useMemo(() => {
    return {
      overdueCount: rows.length,
      totalOutstanding: rows.reduce((sum, row) => sum + row.outstanding_balance, 0),
      totalDailyExpected: rows.reduce((sum, row) => sum + row.expected_daily_amount, 0),
    }
  }, [rows])

  function openMember(row: OverdueRow) {
    if (row.member_code && row.member_code !== '-') {
      window.location.href = `/members/${row.member_code}`
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Overdue Dashboard</h1>
            <p style={styles.subtitle}>Outstanding arrears and actual recoveries — scheduled repayment expectations stop at maturity.</p>
          </div>

          <button style={styles.backButton} onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Overdue Loans</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {totals.overdueCount}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Outstanding Exposure</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {formatMoney(totals.totalOutstanding)}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Overdue Recoveries Today</p>
            <h2 style={styles.statValue}>
              {formatMoney(totals.totalDailyExpected)}
            </h2>
          </div>
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.filterRow}>
            <input
              type="text"
              placeholder="Search member code or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          {loading ? (
            <p style={styles.noteText}>Loading overdue loans...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No overdue loans found.</p>
          ) : (
            <>
              <div style={styles.mobileList}>
                {filteredRows.map((row, index) => (
                  <button
                    key={`${row.member_id}-${index}`}
                    type="button"
                    style={styles.mobileCard}
                    onClick={() => openMember(row)}
                  >
                    <div style={styles.mobileTopRow}>
                      <div>
                        <div style={styles.mobileMemberName}>{row.member_name}</div>
                        <div style={styles.mobileMemberCode}>{row.member_code}</div>
                      </div>

                      <span style={{ ...styles.statusBadge, ...styles.statusOverdue }}>
                        OVERDUE
                      </span>
                    </div>

                    <div style={styles.mobileMetricsGrid}>
                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Principal</p>
                        <p style={styles.metricValue}>
                          {formatMoney(row.principal_amount)}
                        </p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Outstanding</p>
                        <p style={{ ...styles.metricValue, color: '#b42318' }}>
                          {formatMoney(row.outstanding_balance)}
                        </p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Recovered Today</p>
                        <p style={styles.metricValue}>
                          {formatMoney(row.expected_daily_amount)}
                        </p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Working Days Overdue</p>
                        <p style={{ ...styles.metricValue, color: '#b42318' }}>
                          {row.days_overdue}
                        </p>
                      </div>
                    </div>

                    <div style={styles.mobileFooterRow}>
                      <span style={styles.footerLabel}>Due Date</span>
                      <span style={styles.footerValue}>{row.due_date || '-'}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div style={styles.desktopTableWrap}>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Member Code</th>
                        <th style={styles.th}>Member Name</th>
                        <th style={styles.th}>Principal</th>
                        <th style={styles.th}>Outstanding</th>
                        <th style={styles.th}>Recovered Today</th>
                        <th style={styles.th}>Due Date</th>
                        <th style={styles.th}>Working Days Overdue</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, index) => (
                        <tr
                          key={`${row.member_id}-${index}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openMember(row)}
                        >
                          <td style={styles.td}>{row.member_code}</td>
                          <td style={styles.td}>{row.member_name}</td>
                          <td style={styles.td}>{formatMoney(row.principal_amount)}</td>
                          <td style={styles.td}>{formatMoney(row.outstanding_balance)}</td>
                          <td style={styles.td}>{formatMoney(row.expected_daily_amount)}</td>
                          <td style={styles.td}>{row.due_date || '-'}</td>
                          <td style={styles.td}>{row.days_overdue}</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.statusBadge, ...styles.statusOverdue }}>
                              OVERDUE
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    padding: '16px',
    color: '#1f1b2d',
  },
  pageInner: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '24px',
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
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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
  },
  filterRow: {
    marginBottom: '18px',
  },
  searchInput: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    outline: 'none',
    fontSize: '16px',
    boxSizing: 'border-box',
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
  mobileList: {
    display: 'grid',
    gap: '12px',
  },
  mobileCard: {
    width: '100%',
    textAlign: 'left',
    border: '1px solid #ece7f7',
    borderRadius: '16px',
    padding: '14px',
    background: '#fcfbff',
    cursor: 'pointer',
  },
  mobileTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
    marginBottom: '14px',
  },
  mobileMemberName: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#2d1b69',
  },
  mobileMemberCode: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
    fontWeight: 700,
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
    fontWeight: 700,
    color: '#2d1b69',
    wordBreak: 'break-word',
  },
  mobileFooterRow: {
    marginTop: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #eee8f8',
  },
  footerLabel: {
    fontSize: '12px',
    color: '#7a7191',
  },
  footerValue: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#2d1b69',
  },
  desktopTableWrap: {
    marginTop: '18px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '860px',
  },
  th: {
    textAlign: 'left',
    padding: '14px',
    background: '#f3effb',
    color: '#40246d',
    fontSize: '14px',
    borderBottom: '1px solid #ddd6f0',
  },
  td: {
    padding: '14px',
    borderBottom: '1px solid #eee8f8',
    fontSize: '14px',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  statusOverdue: {
    background: '#fef3f2',
    color: '#b42318',
  },
}