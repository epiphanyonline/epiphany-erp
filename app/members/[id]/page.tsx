'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { useCurrentStaff } from '../../../lib/useCurrentStaff'

type MemberRow = {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  nickname: string | null
  sex: string | null
  date_of_birth: string | null
  marital_status: string | null
  category_of_client: string | null
  specific_park: string | null
  park_destination: string | null
  status: string | null
  main_park_id: string | null
  service_officer_id: string | null
}

type MemberProfile = MemberRow & {
  park_name: string | null
  service_officer_name: string | null
}

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

type SavingsAccount = {
  id: string
  member_id: string
  account_type: string
  balance: number
  status: string
}

type TransactionRow = {
  id: string
  tx_ref: string
  business_date: string
  posted_at: string | null
  tx_type: string
  sub_type: string | null
  direction: string
  amount: number
  channel: string | null
  reference_text: string | null
  notes: string | null
  correction_reason: string | null
  staff_name: string | null
  park_name: string | null
  member_code: string | null
  member_name: string | null
}

type TabKey = 'overview' | 'loans' | 'savings' | 'transactions'

function getDisplayLoanStatus(loan: Loan) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dueDate = loan.due_date ? new Date(loan.due_date) : null
  if (dueDate) dueDate.setHours(0, 0, 0, 0)

  if (
    loan.status === 'ACTIVE' &&
    Number(loan.outstanding_balance || 0) > 0 &&
    dueDate &&
    dueDate < today
  ) {
    return 'OVERDUE'
  }

  return loan.status
}

function formatMoney(value: number | null | undefined) {
  return `₦${Number(value || 0).toLocaleString()}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return value.slice(0, 10)
}

export default function MemberPage() {
  const params = useParams()
  const memberCode = params.id as string

  const { staff, loading: staffLoading } = useCurrentStaff()

  const [member, setMember] = useState<MemberProfile | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [savings, setSavings] = useState<SavingsAccount[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function loadData() {
      if (!memberCode) {
        setErrorText('Member code is missing from the URL.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorText('')

      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select(`
          id,
          member_code,
          full_name,
          phone,
          nickname,
          sex,
          date_of_birth,
          marital_status,
          category_of_client,
          specific_park,
          park_destination,
          status,
          main_park_id,
          service_officer_id
        `)
        .eq('member_code', memberCode)
        .single()

      console.log('memberData:', memberData)
      console.log('memberError:', memberError)

      if (memberError || !memberData) {
        setMember(null)
        setLoans([])
        setSavings([])
        setTransactions([])
        setErrorText('Member not found.')
        setLoading(false)
        return
      }

      const baseMember = memberData as MemberRow

      let parkName: string | null = null
      let serviceOfficerName: string | null = null

      if (baseMember.main_park_id) {
        const { data: parkData, error: parkError } = await supabase
          .from('parks')
          .select('name')
          .eq('id', baseMember.main_park_id)
          .single()

        console.log('parkData:', parkData)
        console.log('parkError:', parkError)

        parkName = parkData?.name || null
      }

      if (baseMember.service_officer_id) {
        const { data: officerData, error: officerError } = await supabase
          .from('staff')
          .select('full_name')
          .eq('id', baseMember.service_officer_id)
          .single()

        console.log('officerData:', officerData)
        console.log('officerError:', officerError)

        serviceOfficerName = officerData?.full_name || null
      }

      const fullMember: MemberProfile = {
        ...baseMember,
        park_name: parkName,
        service_officer_name: serviceOfficerName,
      }

      setMember(fullMember)

      const [loansRes, savingsRes, txRes] = await Promise.all([
        supabase
          .from('loan_accounts')
          .select(
            'id, member_id, principal_amount, outstanding_balance, tenure_days, expected_daily_amount, disbursed_at, due_date, status'
          )
          .eq('member_id', baseMember.id)
          .order('disbursed_at', { ascending: false }),

        supabase
          .from('savings_accounts')
          .select('id, member_id, account_type, balance, status')
          .eq('member_id', baseMember.id)
          .order('account_type', { ascending: true }),

        supabase
          .from('vw_transaction_report')
          .select('*')
          .eq('member_code', baseMember.member_code)
          .order('business_date', { ascending: false })
          .order('posted_at', { ascending: false })
          .limit(100),
      ])

      console.log('loansRes:', loansRes.data, loansRes.error)
      console.log('savingsRes:', savingsRes.data, savingsRes.error)
      console.log('txRes:', txRes.data, txRes.error)

      setLoans((loansRes.data as Loan[]) || [])
      setSavings((savingsRes.data as SavingsAccount[]) || [])
      setTransactions((txRes.data as TransactionRow[]) || [])
      setLoading(false)
    }

    if (!staffLoading && staff) {
      loadData()
    }
  }, [memberCode, staffLoading, staff])

  const loanSummary = useMemo(() => {
    return {
      totalBorrowed: loans.reduce(
        (sum, loan) => sum + Number(loan.principal_amount || 0),
        0
      ),
      totalOutstanding: loans.reduce(
        (sum, loan) => sum + Number(loan.outstanding_balance || 0),
        0
      ),
      overdueCount: loans.filter(
        (loan) => getDisplayLoanStatus(loan) === 'OVERDUE'
      ).length,
      activeCount: loans.filter(
        (loan) => getDisplayLoanStatus(loan) === 'ACTIVE'
      ).length,
    }
  }, [loans])

  const savingsSummary = useMemo(() => {
    const regular =
      savings.find((s) => s.account_type === 'REGULAR')?.balance || 0
    const compulsory =
      savings.find((s) => s.account_type === 'COMPULSORY')?.balance || 0

    return {
      regular,
      compulsory,
      total: Number(regular) + Number(compulsory),
    }
  }, [savings])

  if (staffLoading || loading) {
    return (
      <main style={styles.page}>
        <p style={styles.noteText}>Loading member profile...</p>
      </main>
    )
  }

  if (!staff) return null

  if (errorText) {
    return (
      <main style={styles.page}>
        <div style={styles.sectionCard}>
          <h1 style={styles.title}>Member Profile</h1>
          <p style={styles.noteText}>{errorText}</p>
        </div>
      </main>
    )
  }

  if (!member) {
    return (
      <main style={styles.page}>
        <div style={styles.sectionCard}>
          <h1 style={styles.title}>Member Profile</h1>
          <p style={styles.noteText}>Member not found.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Member Profile</h1>
          <p style={styles.subtitle}>Full member account view</p>
        </div>

        <button
          style={styles.backButton}
          type="button"
          onClick={() => window.history.back()}
        >
          ← Back
        </button>
      </div>

      <section style={styles.sectionCard}>
        <div style={styles.infoGrid}>
          <InfoBox label="Member Code" value={member.member_code} />
          <InfoBox label="Name" value={member.full_name} />
          <InfoBox label="Phone" value={member.phone || '-'} />
          <InfoBox label="Nickname" value={member.nickname || '-'} />
          <InfoBox label="Sex" value={member.sex || '-'} />
          <InfoBox label="Date of Birth" value={formatDate(member.date_of_birth)} />
          <InfoBox label="Marital Status" value={member.marital_status || '-'} />
          <InfoBox label="Category" value={member.category_of_client || '-'} />
          <InfoBox
            label="Park"
            value={member.park_name || member.specific_park || '-'}
          />
          <InfoBox label="Specific Park" value={member.specific_park || '-'} />
          <InfoBox label="Destination" value={member.park_destination || '-'} />
          <InfoBox
            label="Service Officer"
            value={member.service_officer_name || '-'}
          />
          <InfoBox label="Status" value={member.status || '-'} />
        </div>
      </section>

      <section style={styles.tabsWrap}>
        <TabButton
          label="Overview"
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        />
        <TabButton
          label={`Loans (${loans.length})`}
          active={activeTab === 'loans'}
          onClick={() => setActiveTab('loans')}
        />
        <TabButton
          label={`Savings (${savings.length})`}
          active={activeTab === 'savings'}
          onClick={() => setActiveTab('savings')}
        />
        <TabButton
          label={`Transactions (${transactions.length})`}
          active={activeTab === 'transactions'}
          onClick={() => setActiveTab('transactions')}
        />
      </section>

      {activeTab === 'overview' && (
        <>
          <section style={styles.cardGrid}>
            <StatCard
              label="Total Borrowed"
              value={formatMoney(loanSummary.totalBorrowed)}
            />
            <StatCard
              label="Outstanding Balance"
              value={formatMoney(loanSummary.totalOutstanding)}
            />
            <StatCard
              label="Overdue Loans"
              value={String(loanSummary.overdueCount)}
              danger={loanSummary.overdueCount > 0}
            />
            <StatCard
              label="Active Loans"
              value={String(loanSummary.activeCount)}
            />
            <StatCard
              label="Savings Total"
              value={formatMoney(savingsSummary.total)}
            />
          </section>

          <section style={styles.sectionCard}>
            <h2 style={styles.sectionTitle}>Savings Breakdown</h2>
            <div style={styles.infoGrid}>
              <InfoBox
                label="Regular Savings"
                value={formatMoney(savingsSummary.regular)}
              />
              <InfoBox
                label="Compulsory Savings"
                value={formatMoney(savingsSummary.compulsory)}
              />
              <InfoBox
                label="Total Savings"
                value={formatMoney(savingsSummary.total)}
              />
            </div>
          </section>
        </>
      )}

      {activeTab === 'loans' && (
        <section style={styles.sectionCard}>
          <h2 style={styles.sectionTitle}>Loan Accounts</h2>
          {!loans.length ? (
            <p style={styles.noteText}>No loans found for this member.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Principal</th>
                    <th style={styles.th}>Outstanding</th>
                    <th style={styles.th}>Daily Expected</th>
                    <th style={styles.th}>Tenure</th>
                    <th style={styles.th}>Disbursed</th>
                    <th style={styles.th}>Due Date</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => {
                    const status = getDisplayLoanStatus(loan)
                    return (
                      <tr key={loan.id}>
                        <td style={styles.td}>{formatMoney(loan.principal_amount)}</td>
                        <td style={styles.td}>{formatMoney(loan.outstanding_balance)}</td>
                        <td style={styles.td}>
                          {formatMoney(loan.expected_daily_amount)}
                        </td>
                        <td style={styles.td}>{loan.tenure_days} days</td>
                        <td style={styles.td}>{formatDate(loan.disbursed_at)}</td>
                        <td style={styles.td}>{loan.due_date || '-'}</td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.statusBadge,
                              ...(status === 'OVERDUE'
                                ? styles.statusOverdue
                                : status === 'COMPLETED'
                                ? styles.statusCompleted
                                : styles.statusActive),
                            }}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'savings' && (
        <section style={styles.sectionCard}>
          <h2 style={styles.sectionTitle}>Savings Accounts</h2>
          {!savings.length ? (
            <p style={styles.noteText}>
              No savings accounts found for this member.
            </p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Account Type</th>
                    <th style={styles.th}>Balance</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {savings.map((account) => (
                    <tr key={account.id}>
                      <td style={styles.td}>{account.account_type}</td>
                      <td style={styles.td}>{formatMoney(account.balance)}</td>
                      <td style={styles.td}>{account.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'transactions' && (
        <section style={styles.sectionCard}>
          <h2 style={styles.sectionTitle}>Member Transactions</h2>
          {!transactions.length ? (
            <p style={styles.noteText}>No transactions found for this member.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Ref</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Direction</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Staff</th>
                    <th style={styles.th}>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={styles.td}>{tx.business_date || '-'}</td>
                      <td style={styles.td}>{tx.tx_ref || '-'}</td>
                      <td style={styles.td}>
                        {tx.tx_type}
                        {tx.sub_type ? (
                          <div style={styles.subText}>{tx.sub_type}</div>
                        ) : null}
                      </td>
                      <td
                        style={{
                          ...styles.td,
                          color: tx.direction === 'IN' ? '#027a48' : '#b42318',
                          fontWeight: 700,
                        }}
                      >
                        {tx.direction}
                      </td>
                      <td style={styles.td}>{formatMoney(tx.amount)}</td>
                      <td style={styles.td}>{tx.staff_name || '-'}</td>
                      <td style={styles.td}>{tx.reference_text || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoBox}>
      <p style={styles.infoLabel}>{label}</p>
      <p style={styles.infoValue}>{value}</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  danger = false,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statLabel}>{label}</p>
      <h2
        style={{
          ...styles.statValue,
          color: danger ? '#b42318' : '#2d1b69',
        }}
      >
        {value}
      </h2>
    </div>
  )
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.tabButton,
        ...(active ? styles.tabButtonActive : {}),
      }}
    >
      {label}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    padding: '20px',
    color: '#1f1b2d',
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
    fontSize: '32px',
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
    borderRadius: '10px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    cursor: 'pointer',
  },
  sectionCard: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '20px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
    marginBottom: '24px',
  },
  sectionTitle: {
    margin: 0,
    marginBottom: '16px',
    fontSize: '22px',
    color: '#2d1b69',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
  },
  infoBox: {
    background: '#faf8fe',
    border: '1px solid #ece7f7',
    borderRadius: '14px',
    padding: '14px',
  },
  infoLabel: {
    margin: 0,
    fontSize: '13px',
    color: '#7a7191',
  },
  infoValue: {
    margin: '8px 0 0',
    fontSize: '16px',
    color: '#2d1b69',
    fontWeight: 600,
  },
  tabsWrap: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  tabButton: {
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    cursor: 'pointer',
    fontWeight: 600,
  },
  tabButtonActive: {
    background: '#4b2e83',
    color: '#fff',
    border: '1px solid #4b2e83',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '20px',
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
    fontSize: '28px',
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
  },
  statusBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  statusActive: {
    background: '#ecfdf3',
    color: '#027a48',
  },
  statusCompleted: {
    background: '#eff8ff',
    color: '#175cd3',
  },
  statusOverdue: {
    background: '#fef3f2',
    color: '#b42318',
  },
}