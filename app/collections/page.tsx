'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type Loan = {
  id: string
  member_id: string
  principal_amount: number
  outstanding_balance: number
  tenure_days: number
  expected_daily_amount: number | null
  disbursed_at: string | null
  due_date: string | null
  status: string
}

type Member = {
  id: string
  member_code: string
  full_name: string
}

type RepaymentTransaction = {
  loan_account_id: string | null
  amount: number | null
  business_date: string
  tx_type: string
}

type CollectionRow = {
  loan_id: string
  member_id: string
  member_code: string
  member_name: string
  expected_daily_amount: number
  actual_paid_today: number
  variance: number
  outstanding_balance: number
  due_date: string | null
  display_status: 'PAID' | 'PARTIAL' | 'MISSED' | 'OVERDUE'
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getCollectionStatus(
  dueDate: string | null,
  outstandingBalance: number,
  expected: number,
  actual: number
): 'PAID' | 'PARTIAL' | 'MISSED' | 'OVERDUE' {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = dueDate ? new Date(dueDate) : null
  if (due) due.setHours(0, 0, 0, 0)

  if (due && due < today && outstandingBalance > 0) {
    return 'OVERDUE'
  }

  if (actual >= expected && expected > 0) {
    return 'PAID'
  }

  if (actual > 0 && actual < expected) {
    return 'PARTIAL'
  }

  if (actual === 0 && expected > 0) {
    return 'MISSED'
  }

  return 'MISSED'
}

function formatMoney(value: number) {
  return `₦${Number(value || 0).toLocaleString()}`
}

export default function CollectionsPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<CollectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function loadCollections() {
      if (!staff) return

      setLoading(true)

      const todayStr = getTodayDateString()

      const { data: loansData, error: loansError } = await supabase
        .from('loan_accounts')
        .select(
          'id, member_id, principal_amount, outstanding_balance, tenure_days, expected_daily_amount, disbursed_at, due_date, status'
        )
        .in('status', ['ACTIVE', 'OVERDUE'])
        .gt('outstanding_balance', 0)

      console.log('loansData:', loansData)
      console.log('loansError:', loansError)

      if (!loansData || loansError) {
        setRows([])
        setLoading(false)
        return
      }

      const loans = loansData as Loan[]
      const memberIds = [...new Set(loans.map((loan) => loan.member_id))]
      const loanIds = loans.map((loan) => loan.id)

      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('id, member_code, full_name')
        .in('id', memberIds)

      console.log('membersData:', membersData)
      console.log('membersError:', membersError)

      const { data: txData, error: txError } = await supabase
        .from('vw_transaction_report')
        .select('loan_account_id, amount, business_date, tx_type')
        .eq('tx_type', 'LOAN_REPAYMENT')
        .eq('business_date', todayStr)
        .in('loan_account_id', loanIds)

      console.log('txData:', txData)
      console.log('txError:', txError)

      const memberMap = new Map<string, Member>()
      ;(membersData as Member[] | null)?.forEach((member) => {
        memberMap.set(member.id, member)
      })

      const repaymentMap = new Map<string, number>()
      ;(txData as RepaymentTransaction[] | null)?.forEach((tx) => {
        if (!tx.loan_account_id) return
        const current = repaymentMap.get(tx.loan_account_id) || 0
        repaymentMap.set(tx.loan_account_id, current + Number(tx.amount || 0))
      })

      const result: CollectionRow[] = loans.map((loan) => {
        const member = memberMap.get(loan.member_id)
        const expected = Number(loan.expected_daily_amount || 0)
        const actual = Number(repaymentMap.get(loan.id) || 0)
        const variance = actual - expected

        return {
          loan_id: loan.id,
          member_id: loan.member_id,
          member_code: member?.member_code || '-',
          member_name: member?.full_name || 'Unknown Member',
          expected_daily_amount: expected,
          actual_paid_today: actual,
          variance,
          outstanding_balance: Number(loan.outstanding_balance || 0),
          due_date: loan.due_date,
          display_status: getCollectionStatus(
            loan.due_date,
            Number(loan.outstanding_balance || 0),
            expected,
            actual
          ),
        }
      })

      setRows(result)
      setLoading(false)
    }

    if (!staffLoading) {
      loadCollections()
    }
  }, [staffLoading, staff])

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
      loansCount: filteredRows.length,
      expectedTotal: filteredRows.reduce(
        (sum, row) => sum + row.expected_daily_amount,
        0
      ),
      actualTotal: filteredRows.reduce(
        (sum, row) => sum + row.actual_paid_today,
        0
      ),
      missedCount: filteredRows.filter(
        (row) => row.display_status === 'MISSED'
      ).length,
      overdueCount: filteredRows.filter(
        (row) => row.display_status === 'OVERDUE'
      ).length,
    }
  }, [filteredRows])

  function openMember(row: CollectionRow) {
    if (row.member_code && row.member_code !== '-') {
      window.location.href = `/members/${row.member_code}`
    }
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

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Daily Collection System</h1>
            <p style={styles.subtitle}>
              Expected vs actual repayment tracking for today
            </p>
          </div>

          <button style={styles.backButton} onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Loans Tracked</p>
            <h2 style={styles.statValue}>{totals.loansCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Expected Today</p>
            <h2 style={styles.statValue}>
              {formatMoney(totals.expectedTotal)}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Actual Today</p>
            <h2 style={styles.statValue}>
              {formatMoney(totals.actualTotal)}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Missed</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {totals.missedCount}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Overdue</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {totals.overdueCount}
            </h2>
          </div>
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.filterRow}>
            <input
              type="text"
              placeholder="Search member code, name, or status"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          {loading ? (
            <p style={styles.noteText}>Loading daily collections...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No collection records found.</p>
          ) : (
            <>
              <div style={styles.mobileList}>
                {filteredRows.map((row, index) => (
                  <button
                    key={`${row.loan_id}-${index}`}
                    type="button"
                    style={styles.mobileCard}
                    onClick={() => openMember(row)}
                  >
                    <div style={styles.mobileTopRow}>
                      <div>
                        <div style={styles.mobileMemberName}>{row.member_name}</div>
                        <div style={styles.mobileMemberCode}>{row.member_code}</div>
                      </div>

                      <span
                        style={{
                          ...styles.statusBadge,
                          ...(row.display_status === 'PAID'
                            ? styles.statusPaid
                            : row.display_status === 'PARTIAL'
                            ? styles.statusPartial
                            : row.display_status === 'OVERDUE'
                            ? styles.statusOverdue
                            : styles.statusMissed),
                        }}
                      >
                        {row.display_status}
                      </span>
                    </div>

                    <div style={styles.mobileMetricsGrid}>
                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Expected</p>
                        <p style={styles.metricValue}>
                          {formatMoney(row.expected_daily_amount)}
                        </p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Actual</p>
                        <p style={styles.metricValue}>
                          {formatMoney(row.actual_paid_today)}
                        </p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Variance</p>
                        <p
                          style={{
                            ...styles.metricValue,
                            color: row.variance < 0 ? '#b42318' : '#027a48',
                          }}
                        >
                          {formatMoney(row.variance)}
                        </p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Outstanding</p>
                        <p style={styles.metricValue}>
                          {formatMoney(row.outstanding_balance)}
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
                        <th style={styles.th}>Expected</th>
                        <th style={styles.th}>Actual</th>
                        <th style={styles.th}>Variance</th>
                        <th style={styles.th}>Outstanding</th>
                        <th style={styles.th}>Due Date</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, index) => (
                        <tr
                          key={`${row.loan_id}-${index}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openMember(row)}
                        >
                          <td style={styles.td}>{row.member_code}</td>
                          <td style={styles.td}>{row.member_name}</td>
                          <td style={styles.td}>
                            {formatMoney(row.expected_daily_amount)}
                          </td>
                          <td style={styles.td}>
                            {formatMoney(row.actual_paid_today)}
                          </td>
                          <td
                            style={{
                              ...styles.td,
                              color: row.variance < 0 ? '#b42318' : '#027a48',
                              fontWeight: 700,
                            }}
                          >
                            {formatMoney(row.variance)}
                          </td>
                          <td style={styles.td}>
                            {formatMoney(row.outstanding_balance)}
                          </td>
                          <td style={styles.td}>{row.due_date || '-'}</td>
                          <td style={styles.td}>
                            <span
                              style={{
                                ...styles.statusBadge,
                                ...(row.display_status === 'PAID'
                                  ? styles.statusPaid
                                  : row.display_status === 'PARTIAL'
                                  ? styles.statusPartial
                                  : row.display_status === 'OVERDUE'
                                  ? styles.statusOverdue
                                  : styles.statusMissed),
                              }}
                            >
                              {row.display_status}
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
    minWidth: '900px',
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
    verticalAlign: 'top',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  statusPaid: {
    background: '#ecfdf3',
    color: '#027a48',
  },
  statusPartial: {
    background: '#fffaeb',
    color: '#b54708',
  },
  statusMissed: {
    background: '#fef3f2',
    color: '#b42318',
  },
  statusOverdue: {
    background: '#fef3f2',
    color: '#b42318',
  },
}