'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type StaffScope = {
  role: string
  park_id: string | null
}

type DailyCollectionBaseRow = {
  loan_id: string
  member_id: string
  member_code: string
  member_name: string
  park_id: string | null
  park_name: string | null
  expected_daily_amount: number | null
  outstanding_balance: number | null
  due_date: string | null
  loan_status: string | null
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
  park_id: string | null
  park_name: string | null
  expected_daily_amount: number
  expected_total_for_range: number
  actual_paid_for_range: number
  variance: number
  outstanding_balance: number
  due_date: string | null
  missed_count: number
  partial_count: number
  paid_count: number
  display_status: 'PAID' | 'PARTIAL' | 'MISSED' | 'OVERDUE'
}

type ParkSummaryRow = {
  park_id: string | null
  park_name: string
  loans_tracked: number
  expected_total: number
  actual_total: number
  variance_total: number
  missed_count: number
  overdue_count: number
  paid_count: number
  partial_count: number
  collection_rate: number
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getYesterdayDateString() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function formatMoney(value: number) {
  return `₦${Number(value || 0).toLocaleString()}`
}

function countDaysInclusive(from: string, to: string) {
  const start = new Date(from)
  const end = new Date(to)

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const diffMs = end.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  return diffDays >= 0 ? diffDays + 1 : 0
}

function buildDateList(from: string, to: string) {
  const dates: string[] = []
  const start = new Date(from)
  const end = new Date(to)

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  if (start > end) return dates

  const current = new Date(start)
  while (current <= end) {
    const yyyy = current.getFullYear()
    const mm = String(current.getMonth() + 1).padStart(2, '0')
    const dd = String(current.getDate()).padStart(2, '0')
    dates.push(`${yyyy}-${mm}-${dd}`)
    current.setDate(current.getDate() + 1)
  }

  return dates
}

function getDayStatus(
  dueDate: string | null,
  outstandingBalance: number,
  expected: number,
  actual: number,
  day: string
): 'PAID' | 'PARTIAL' | 'MISSED' | 'OVERDUE' {
  const checkDate = new Date(day)
  checkDate.setHours(0, 0, 0, 0)

  const due = dueDate ? new Date(dueDate) : null
  if (due) due.setHours(0, 0, 0, 0)

  if (due && due < checkDate && outstandingBalance > 0 && actual < expected) {
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

export default function CollectionsPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<CollectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState('')
  const [search, setSearch] = useState('')
  const [staffScope, setStaffScope] = useState<StaffScope | null>(null)
  const [scopeLoading, setScopeLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(getTodayDateString())
  const [dateTo, setDateTo] = useState(getTodayDateString())

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function loadStaffScope() {
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
        setStaffScope(null)
        setErrorText(error?.message || 'Failed to load staff scope.')
        setScopeLoading(false)
        return
      }

      setStaffScope({
        role: String((data as any).role || '').toUpperCase(),
        park_id: (data as any).park_id || null,
      })

      setScopeLoading(false)
    }

    if (!staffLoading && staff) {
      loadStaffScope()
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function loadCollections() {
      if (!staff || !staffScope) return

      if (!dateFrom || !dateTo) {
        setRows([])
        setErrorText('Please select both From and To dates.')
        setLoading(false)
        return
      }

      if (dateFrom > dateTo) {
        setRows([])
        setErrorText('From date cannot be later than To date.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorText('')

      const canSeeAll =
        staffScope.role === 'ADMIN' || staffScope.role === 'SUPERVISOR'

      let baseQuery = supabase
        .from('vw_daily_collections')
        .select(
          'loan_id, member_id, member_code, member_name, park_id, park_name, expected_daily_amount, outstanding_balance, due_date, loan_status'
        )
        .order('member_name', { ascending: true })

      if (!canSeeAll) {
        if (!staffScope.park_id) {
          setRows([])
          setErrorText('Your staff account is not linked to a park.')
          setLoading(false)
          return
        }

        baseQuery = baseQuery.eq('park_id', staffScope.park_id)
      }

      const { data: baseData, error: baseError } = await baseQuery

      if (baseError || !baseData) {
        setRows([])
        setErrorText(baseError?.message || 'Failed to load collection base data.')
        setLoading(false)
        return
      }

      const baseRows = (baseData || []) as DailyCollectionBaseRow[]
      const loanIds = baseRows.map((row) => row.loan_id)

      if (!loanIds.length) {
        setRows([])
        setLoading(false)
        return
      }

      const repaymentByLoanAndDate = new Map<string, number>()
      const loanIdChunks = chunkArray(loanIds, 100)

      for (const chunk of loanIdChunks) {
        const { data: txData, error: txError } = await supabase
          .from('vw_transaction_report')
          .select('loan_account_id, amount, business_date, tx_type')
          .eq('tx_type', 'LOAN_REPAYMENT')
          .gte('business_date', dateFrom)
          .lte('business_date', dateTo)
          .in('loan_account_id', chunk)

        if (txError) {
          setErrorText(txError.message || 'Failed to load repayment transactions.')
          continue
        }

        ;(txData as RepaymentTransaction[] | null)?.forEach((tx) => {
          if (!tx.loan_account_id || !tx.business_date) return
          const key = `${tx.loan_account_id}__${tx.business_date}`
          const current = repaymentByLoanAndDate.get(key) || 0
          repaymentByLoanAndDate.set(key, current + Number(tx.amount || 0))
        })
      }

      const selectedDates = buildDateList(dateFrom, dateTo)
      const dayCount = countDaysInclusive(dateFrom, dateTo)

      const result: CollectionRow[] = baseRows.map((row) => {
        const expectedDaily = Number(row.expected_daily_amount || 0)
        const expectedTotal = expectedDaily * dayCount
        const outstandingBalance = Number(row.outstanding_balance || 0)

        let actualTotal = 0
        let missedCount = 0
        let partialCount = 0
        let paidCount = 0
        let overdueSeen = false

        for (const day of selectedDates) {
          const key = `${row.loan_id}__${day}`
          const actualForDay = Number(repaymentByLoanAndDate.get(key) || 0)
          actualTotal += actualForDay

          const dayStatus = getDayStatus(
            row.due_date,
            outstandingBalance,
            expectedDaily,
            actualForDay,
            day
          )

          if (dayStatus === 'MISSED') missedCount += 1
          if (dayStatus === 'PARTIAL') partialCount += 1
          if (dayStatus === 'PAID') paidCount += 1
          if (dayStatus === 'OVERDUE') overdueSeen = true
        }

        const variance = actualTotal - expectedTotal

        let displayStatus: 'PAID' | 'PARTIAL' | 'MISSED' | 'OVERDUE' = 'MISSED'

        if (overdueSeen) {
          displayStatus = 'OVERDUE'
        } else if (actualTotal >= expectedTotal && expectedTotal > 0) {
          displayStatus = 'PAID'
        } else if (actualTotal > 0 && actualTotal < expectedTotal) {
          displayStatus = 'PARTIAL'
        } else {
          displayStatus = 'MISSED'
        }

        return {
          loan_id: row.loan_id,
          member_id: row.member_id,
          member_code: row.member_code || '-',
          member_name: row.member_name || 'Unknown Member',
          park_id: row.park_id,
          park_name: row.park_name || '-',
          expected_daily_amount: expectedDaily,
          expected_total_for_range: expectedTotal,
          actual_paid_for_range: actualTotal,
          variance,
          outstanding_balance: outstandingBalance,
          due_date: row.due_date,
          missed_count: missedCount,
          partial_count: partialCount,
          paid_count: paidCount,
          display_status: displayStatus,
        }
      })

      setRows(result)
      setLoading(false)
    }

    if (!staffLoading && !scopeLoading && staff && staffScope) {
      loadCollections()
    }
  }, [staffLoading, scopeLoading, staff, staffScope, dateFrom, dateTo])

  const canSeeAllParks =
    staffScope?.role === 'ADMIN' || staffScope?.role === 'SUPERVISOR'

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows

    return rows.filter((row) => {
      return (
        row.member_code.toLowerCase().includes(q) ||
        row.member_name.toLowerCase().includes(q) ||
        row.display_status.toLowerCase().includes(q) ||
        (row.park_name || '').toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const totals = useMemo(() => {
    return {
      loansCount: filteredRows.length,
      expectedTotal: filteredRows.reduce(
        (sum, row) => sum + row.expected_total_for_range,
        0
      ),
      actualTotal: filteredRows.reduce(
        (sum, row) => sum + row.actual_paid_for_range,
        0
      ),
      missedCount: filteredRows.reduce(
        (sum, row) => sum + row.missed_count,
        0
      ),
      overdueCount: filteredRows.filter(
        (row) => row.display_status === 'OVERDUE'
      ).length,
    }
  }, [filteredRows])

  const parkSummaries = useMemo<ParkSummaryRow[]>(() => {
    const map = new Map<string, ParkSummaryRow>()

    for (const row of filteredRows) {
      const key = row.park_id || row.park_name || 'UNASSIGNED'
      const existing = map.get(key)

      if (!existing) {
        map.set(key, {
          park_id: row.park_id,
          park_name: row.park_name || 'Unassigned',
          loans_tracked: 1,
          expected_total: row.expected_total_for_range,
          actual_total: row.actual_paid_for_range,
          variance_total: row.variance,
          missed_count: row.missed_count,
          overdue_count: row.display_status === 'OVERDUE' ? 1 : 0,
          paid_count: row.paid_count,
          partial_count: row.partial_count,
          collection_rate:
            row.expected_total_for_range > 0
              ? (row.actual_paid_for_range / row.expected_total_for_range) * 100
              : 0,
        })
      } else {
        existing.loans_tracked += 1
        existing.expected_total += row.expected_total_for_range
        existing.actual_total += row.actual_paid_for_range
        existing.variance_total += row.variance
        existing.missed_count += row.missed_count
        existing.overdue_count += row.display_status === 'OVERDUE' ? 1 : 0
        existing.paid_count += row.paid_count
        existing.partial_count += row.partial_count
        existing.collection_rate =
          existing.expected_total > 0
            ? (existing.actual_total / existing.expected_total) * 100
            : 0
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.park_name.localeCompare(b.park_name)
    )
  }, [filteredRows])

  function openMember(row: CollectionRow) {
    if (row.member_code && row.member_code !== '-') {
      window.location.href = `/members/${row.member_code}`
    }
  }

  function setYesterday() {
    const yesterday = getYesterdayDateString()
    setDateFrom(yesterday)
    setDateTo(yesterday)
  }

  function setToday() {
    const today = getTodayDateString()
    setDateFrom(today)
    setDateTo(today)
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

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Daily Collection System</h1>
            <p style={styles.subtitle}>
              Expected vs actual repayment tracking by selected date range
            </p>
          </div>

          <button style={styles.backButton} onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>

        <section style={styles.filterCard}>
          <div style={styles.filterGrid}>
            <div style={styles.fieldBox}>
              <label style={styles.fieldLabel}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.fieldLabel}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.fieldLabel}>Search</label>
              <input
                type="text"
                placeholder="Search member code, name, park, or status"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.searchInput}
              />
            </div>
          </div>

          <div style={styles.quickButtonRow}>
            <button type="button" style={styles.quickButton} onClick={setToday}>
              Today
            </button>
            <button type="button" style={styles.quickButton} onClick={setYesterday}>
              Yesterday
            </button>
          </div>
        </section>

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Loans Tracked</p>
            <h2 style={styles.statValue}>{totals.loansCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Expected</p>
            <h2 style={styles.statValue}>{formatMoney(totals.expectedTotal)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Actual</p>
            <h2 style={styles.statValue}>{formatMoney(totals.actualTotal)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Total Missed</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {totals.missedCount}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Overdue Loans</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {totals.overdueCount}
            </h2>
          </div>
        </section>

        {canSeeAllParks ? (
          <section style={styles.sectionCard}>
            <div style={styles.sectionTitle}>All Parks Collection Summary</div>

            {parkSummaries.length ? (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Park</th>
                      <th style={styles.th}>Loans</th>
                      <th style={styles.th}>Expected</th>
                      <th style={styles.th}>Actual</th>
                      <th style={styles.th}>Variance</th>
                      <th style={styles.th}>Missed</th>
                      <th style={styles.th}>Partial</th>
                      <th style={styles.th}>Paid</th>
                      <th style={styles.th}>Overdue</th>
                      <th style={styles.th}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parkSummaries.map((park) => (
                      <tr key={`${park.park_id || 'no-park'}-${park.park_name}`}>
                        <td style={styles.td}>{park.park_name}</td>
                        <td style={styles.td}>{park.loans_tracked}</td>
                        <td style={styles.td}>{formatMoney(park.expected_total)}</td>
                        <td style={styles.td}>{formatMoney(park.actual_total)}</td>
                        <td
                          style={{
                            ...styles.td,
                            color: park.variance_total < 0 ? '#b42318' : '#027a48',
                            fontWeight: 700,
                          }}
                        >
                          {formatMoney(park.variance_total)}
                        </td>
                        <td style={styles.td}>{park.missed_count}</td>
                        <td style={styles.td}>{park.partial_count}</td>
                        <td style={styles.td}>{park.paid_count}</td>
                        <td style={styles.td}>{park.overdue_count}</td>
                        <td style={styles.td}>{park.collection_rate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={styles.noteText}>No park summary available.</p>
            )}
          </section>
        ) : null}

        <section style={styles.sectionCard}>
          {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}

          {loading ? (
            <p style={styles.noteText}>Loading collections...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No collection records found.</p>
          ) : (
            <>
              <div style={styles.mobileList}>
                {filteredRows.map((row) => (
                  <button
                    key={row.loan_id}
                    type="button"
                    style={styles.mobileCard}
                    onClick={() => openMember(row)}
                  >
                    <div style={styles.mobileTopRow}>
                      <div>
                        <div style={styles.mobileMemberName}>{row.member_name}</div>
                        <div style={styles.mobileMemberCode}>
                          {row.member_code} • {row.park_name || '-'}
                        </div>
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
                          {formatMoney(row.expected_total_for_range)}
                        </p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Actual</p>
                        <p style={styles.metricValue}>
                          {formatMoney(row.actual_paid_for_range)}
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

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Missed Count</p>
                        <p style={styles.metricValue}>{row.missed_count}</p>
                      </div>

                      <div style={styles.metricItem}>
                        <p style={styles.metricLabel}>Paid Count</p>
                        <p style={styles.metricValue}>{row.paid_count}</p>
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
                        <th style={styles.th}>Park</th>
                        <th style={styles.th}>Expected</th>
                        <th style={styles.th}>Actual</th>
                        <th style={styles.th}>Variance</th>
                        <th style={styles.th}>Outstanding</th>
                        <th style={styles.th}>Missed</th>
                        <th style={styles.th}>Partial</th>
                        <th style={styles.th}>Paid</th>
                        <th style={styles.th}>Due Date</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr
                          key={row.loan_id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openMember(row)}
                        >
                          <td style={styles.td}>{row.member_code}</td>
                          <td style={styles.td}>{row.member_name}</td>
                          <td style={styles.td}>{row.park_name || '-'}</td>
                          <td style={styles.td}>
                            {formatMoney(row.expected_total_for_range)}
                          </td>
                          <td style={styles.td}>
                            {formatMoney(row.actual_paid_for_range)}
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
                          <td style={styles.td}>{row.missed_count}</td>
                          <td style={styles.td}>{row.partial_count}</td>
                          <td style={styles.td}>{row.paid_count}</td>
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
    maxWidth: '1280px',
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
  filterCard: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
    marginBottom: '20px',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    marginBottom: '14px',
  },
  fieldBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#4b2e83',
  },
  quickButtonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  quickButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
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
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#2d1b69',
    marginBottom: '14px',
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
    minWidth: '1200px',
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