'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useCurrentStaff } from '../../../lib/useCurrentStaff'

type StaffSummaryRow = {
  staff_code: string
  staff_name: string
  role: string
  business_date: string
  loan_repayment_total: number
  regular_savings_total: number
  compulsory_savings_total: number
  card_fee_total: number
  processing_fee_total: number
  membership_fee_total: number
  total_cash_collected: number
  expense_total: number
  expected_remittance: number
  remitted_total: number
  variance: number
  balance_status: 'BALANCED' | 'SHORT' | 'EXCESS'
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

export default function AllAccountSummaryPage() {
  const { staff, loading: staffLoading, canUseSupervisorPages } = useCurrentStaff()

  const [businessDate, setBusinessDate] = useState(getTodayDateString())
  const [rows, setRows] = useState<StaffSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function loadAllSummaries() {
      if (!staff || !canUseSupervisorPages) return

      setLoading(true)

      const { data, error } = await supabase.rpc('get_all_daily_account_summaries', {
        p_business_date: businessDate,
      })

      console.log('all account summary data:', data)
      console.log('all account summary error:', error)

      setRows((data as StaffSummaryRow[]) || [])
      setLoading(false)
    }

    if (!staffLoading && staff && canUseSupervisorPages) {
      loadAllSummaries()
    }
  }, [staffLoading, staff, canUseSupervisorPages, businessDate])

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()

    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.staff_name.toLowerCase().includes(q) ||
        row.staff_code.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q) ||
        row.balance_status.toLowerCase().includes(q)

      const matchesStatus = !statusFilter || row.balance_status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [rows, search, statusFilter])

  const totals = useMemo(() => {
    return {
      staffCount: filteredRows.length,
      totalCollected: filteredRows.reduce(
        (sum, row) => sum + Number(row.total_cash_collected || 0),
        0
      ),
      totalExpected: filteredRows.reduce(
        (sum, row) => sum + Number(row.expected_remittance || 0),
        0
      ),
      totalRemitted: filteredRows.reduce(
        (sum, row) => sum + Number(row.remitted_total || 0),
        0
      ),
      shortCount: filteredRows.filter((row) => row.balance_status === 'SHORT').length,
      excessCount: filteredRows.filter((row) => row.balance_status === 'EXCESS').length,
      balancedCount: filteredRows.filter((row) => row.balance_status === 'BALANCED').length,
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

  if (!canUseSupervisorPages) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <div style={styles.sectionCard}>
            <h1 style={styles.title}>Access Denied</h1>
            <p style={styles.noteText}>
              Only ADMIN or SUPERVISOR can access all-staff account summaries.
            </p>
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
            <h1 style={styles.title}>All Staff Account Summary</h1>
            <p style={styles.subtitle}>
              Daily balancing view for all officers and field staff
            </p>
          </div>

          <div style={styles.dateBox}>
            <label style={styles.label}>Business Date</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Staff Count</p>
            <h2 style={styles.statValue}>{totals.staffCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Total Cash Collected</p>
            <h2 style={styles.statValue}>{money(totals.totalCollected)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Expected Remittance</p>
            <h2 style={styles.statValue}>{money(totals.totalExpected)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Actual Remitted</p>
            <h2 style={styles.statValue}>{money(totals.totalRemitted)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>SHORT</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>{totals.shortCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>EXCESS</p>
            <h2 style={{ ...styles.statValue, color: '#175cd3' }}>{totals.excessCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>BALANCED</p>
            <h2 style={{ ...styles.statValue, color: '#027a48' }}>{totals.balancedCount}</h2>
          </div>
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.filtersRow}>
            <input
              style={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by staff name, code, role, or status"
            />

            <select
              style={styles.input}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="BALANCED">BALANCED</option>
              <option value="SHORT">SHORT</option>
              <option value="EXCESS">EXCESS</option>
            </select>
          </div>

          {loading ? (
            <p style={styles.noteText}>Loading all staff summaries...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No staff summary records found.</p>
          ) : (
            <>
              <div style={styles.mobileList}>
                {filteredRows.map((row) => {
                  const totalFees =
                    Number(row.card_fee_total || 0) +
                    Number(row.processing_fee_total || 0) +
                    Number(row.membership_fee_total || 0)

                  return (
                    <div key={row.staff_code} style={styles.mobileCard}>
                      <div style={styles.mobileTopRow}>
                        <div>
                          <div style={styles.mobileStaffName}>{row.staff_name}</div>
                          <div style={styles.mobileStaffMeta}>
                            {row.staff_code} • {row.role}
                          </div>
                        </div>

                        <span
                          style={{
                            ...styles.statusBadge,
                            ...(row.balance_status === 'BALANCED'
                              ? styles.statusBalanced
                              : row.balance_status === 'SHORT'
                              ? styles.statusShort
                              : styles.statusExcess),
                          }}
                        >
                          {row.balance_status}
                        </span>
                      </div>

                      <div style={styles.mobileMetricsGrid}>
                        <MetricItem label="Repayment" value={money(row.loan_repayment_total)} />
                        <MetricItem label="Regular" value={money(row.regular_savings_total)} />
                        <MetricItem label="Compulsory" value={money(row.compulsory_savings_total)} />
                        <MetricItem label="Fees" value={money(totalFees)} />
                        <MetricItem label="Collected" value={money(row.total_cash_collected)} strong />
                        <MetricItem label="Expenses" value={money(row.expense_total)} />
                        <MetricItem label="Expected" value={money(row.expected_remittance)} />
                        <MetricItem label="Remitted" value={money(row.remitted_total)} />
                        <MetricItem
                          label="Variance"
                          value={money(row.variance)}
                          color={
                            Number(row.variance || 0) < 0
                              ? '#b42318'
                              : Number(row.variance || 0) > 0
                              ? '#175cd3'
                              : '#027a48'
                          }
                          strong
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={styles.desktopTableWrap}>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Staff</th>
                        <th style={styles.th}>Role</th>
                        <th style={styles.th}>Repayment</th>
                        <th style={styles.th}>Regular</th>
                        <th style={styles.th}>Compulsory</th>
                        <th style={styles.th}>Fees</th>
                        <th style={styles.th}>Collected</th>
                        <th style={styles.th}>Expenses</th>
                        <th style={styles.th}>Expected</th>
                        <th style={styles.th}>Remitted</th>
                        <th style={styles.th}>Variance</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const totalFees =
                          Number(row.card_fee_total || 0) +
                          Number(row.processing_fee_total || 0) +
                          Number(row.membership_fee_total || 0)

                        return (
                          <tr key={row.staff_code}>
                            <td style={styles.td}>
                              <strong>{row.staff_name}</strong>
                              <div style={styles.subText}>{row.staff_code}</div>
                            </td>
                            <td style={styles.td}>{row.role}</td>
                            <td style={styles.td}>{money(row.loan_repayment_total)}</td>
                            <td style={styles.td}>{money(row.regular_savings_total)}</td>
                            <td style={styles.td}>{money(row.compulsory_savings_total)}</td>
                            <td style={styles.td}>{money(totalFees)}</td>
                            <td style={styles.td}>{money(row.total_cash_collected)}</td>
                            <td style={styles.td}>{money(row.expense_total)}</td>
                            <td style={styles.td}>{money(row.expected_remittance)}</td>
                            <td style={styles.td}>{money(row.remitted_total)}</td>
                            <td
                              style={{
                                ...styles.td,
                                color:
                                  Number(row.variance || 0) < 0
                                    ? '#b42318'
                                    : Number(row.variance || 0) > 0
                                    ? '#175cd3'
                                    : '#027a48',
                                fontWeight: 700,
                              }}
                            >
                              {money(row.variance)}
                            </td>
                            <td style={styles.td}>
                              <span
                                style={{
                                  ...styles.statusBadge,
                                  ...(row.balance_status === 'BALANCED'
                                    ? styles.statusBalanced
                                    : row.balance_status === 'SHORT'
                                    ? styles.statusShort
                                    : styles.statusExcess),
                                }}
                              >
                                {row.balance_status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
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

const styles: Record<string, React.CSSProperties> = {
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
  dateBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: '220px',
    width: '100%',
    maxWidth: '280px',
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
    minWidth: 0,
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
  },
  filtersRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    marginBottom: '18px',
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
  desktopTableWrap: {
    marginTop: '18px',
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
    whiteSpace: 'nowrap',
  },
  subText: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  statusBalanced: {
    background: '#ecfdf3',
    color: '#027a48',
  },
  statusShort: {
    background: '#fef3f2',
    color: '#b42318',
  },
  statusExcess: {
    background: '#eff8ff',
    color: '#175cd3',
  },
}