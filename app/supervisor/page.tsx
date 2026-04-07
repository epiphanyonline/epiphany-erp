'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

/* ---------------- TYPES ---------------- */

type Park = { id: string; name: string }

type Member = {
  id: string
  member_code: string
  full_name: string
  main_park_id: string | null
}

type Loan = {
  id: string
  member_id: string
  outstanding_balance: number
  expected_daily_amount: number | null
  due_date: string | null
  status: string
}

type Transaction = {
  loan_account_id: string | null
  amount: number
  tx_type: string
  business_date: string
}

type StaffPresence = {
  id: string
  staff_code: string
  full_name: string
  role: string
  last_active: string | null
  is_active: boolean
}

type ParkRow = {
  park_id: string
  park_name: string
  members_count: number
  active_loans_count: number
  overdue_loans_count: number
  total_exposure: number
  expected_today: number
  actual_today: number
  variance_today: number
}

/* ---------------- HELPERS ---------------- */

function getTodayDateString() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

function isOverdue(loan: Loan) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = loan.due_date ? new Date(loan.due_date) : null
  if (due) due.setHours(0, 0, 0, 0)

  return (
    loan.status === 'ACTIVE' &&
    loan.outstanding_balance > 0 &&
    due &&
    due < today
  )
}

function getPresenceStatus(lastActive: string | null) {
  if (!lastActive) return 'OFFLINE'

  const diff = (Date.now() - new Date(lastActive).getTime()) / (1000 * 60)

  if (diff <= 2) return 'ONLINE'
  if (diff <= 15) return 'RECENT'
  return 'OFFLINE'
}

function money(v: number) {
  return `₦${Number(v || 0).toLocaleString()}`
}

/* ---------------- PAGE ---------------- */

export default function SupervisorDashboardPage() {
  const { staff, loading: staffLoading, canUseSupervisorPages } = useCurrentStaff()

  const [rows, setRows] = useState<ParkRow[]>([])
  const [staffPresence, setStaffPresence] = useState<StaffPresence[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function load() {
      if (!staff || !canUseSupervisorPages) return

      setLoading(true)
      const today = getTodayDateString()

      const { data: parks } = await supabase.from('parks').select('*')
      const { data: members } = await supabase.from('members').select('*')
      const { data: loans } = await supabase
        .from('loan_accounts')
        .select('*')
        .gt('outstanding_balance', 0)

      const loanIds = loans?.map((l) => l.id) || []

      const { data: tx } = await supabase
        .from('transactions')
        .select('*')
        .eq('tx_type', 'LOAN_REPAYMENT')
        .eq('business_date', today)
        .in('loan_account_id', loanIds.length ? loanIds : ['000'])

      const { data: staffData } = await supabase
        .from('staff')
        .select('*')
        .eq('is_active', true)

      const repaymentMap = new Map<string, number>()
      tx?.forEach((t: Transaction) => {
        if (!t.loan_account_id) return
        repaymentMap.set(
          t.loan_account_id,
          (repaymentMap.get(t.loan_account_id) || 0) + t.amount
        )
      })

      const result: ParkRow[] =
        parks?.map((park: Park) => {
          const parkMembers = members?.filter(
            (m: Member) => m.main_park_id === park.id
          ) || []

          const ids = new Set(parkMembers.map((m) => m.id))

          const parkLoans =
            loans?.filter((l: Loan) => ids.has(l.member_id)) || []

          const expected = parkLoans.reduce(
            (s, l) => s + Number(l.expected_daily_amount || 0),
            0
          )

          const actual = parkLoans.reduce(
            (s, l) => s + Number(repaymentMap.get(l.id) || 0),
            0
          )

          return {
            park_id: park.id,
            park_name: park.name,
            members_count: parkMembers.length,
            active_loans_count: parkLoans.length,
            overdue_loans_count: parkLoans.filter(isOverdue).length,
            total_exposure: parkLoans.reduce(
              (s, l) => s + Number(l.outstanding_balance || 0),
              0
            ),
            expected_today: expected,
            actual_today: actual,
            variance_today: actual - expected,
          }
        }) || []

      setRows(result)
      setStaffPresence(staffData || [])
      setLoading(false)
    }

    if (!staffLoading) load()
  }, [staffLoading, staff, canUseSupervisorPages])

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter((r) => r.park_name.toLowerCase().includes(q))
  }, [rows, search])

  if (staffLoading) return <main style={styles.page}>Loading...</main>
  if (!staff) return null

  /* ---------------- UI ---------------- */

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Supervisor Dashboard</h1>

        {/* SEARCH */}
        <input
          style={styles.search}
          placeholder="Search park..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* PARK CARDS (MOBILE FIRST) */}
        <div style={styles.mobileGrid}>
          {filteredRows.map((row) => (
            <div key={row.park_id} style={styles.card}>
              <h3 style={styles.cardTitle}>{row.park_name}</h3>

              <div style={styles.grid2}>
                <p>Members: {row.members_count}</p>
                <p>Loans: {row.active_loans_count}</p>
                <p style={{ color: 'red' }}>
                  Overdue: {row.overdue_loans_count}
                </p>
                <p>Exposure: {money(row.total_exposure)}</p>
                <p>Expected: {money(row.expected_today)}</p>
                <p>Actual: {money(row.actual_today)}</p>
              </div>

              <p
                style={{
                  color: row.variance_today < 0 ? 'red' : 'green',
                  fontWeight: 'bold',
                }}
              >
                Variance: {money(row.variance_today)}
              </p>
            </div>
          ))}
        </div>

        {/* STAFF PRESENCE (MOBILE CARDS) */}
        <h2 style={{ marginTop: 30 }}>Staff Presence</h2>

        <div style={styles.mobileGrid}>
          {staffPresence.map((s) => {
            const status = getPresenceStatus(s.last_active)
            return (
              <div key={s.id} style={styles.card}>
                <strong>{s.full_name}</strong>
                <p>{s.staff_code}</p>
                <p>{s.role}</p>
                <p style={styles.presenceLine}>
  Status:{' '}
  <span
    style={{
      ...styles.statusBadge,
      ...(status === 'ONLINE'
        ? styles.statusActive
        : status === 'RECENT'
        ? styles.statusCompleted
        : styles.statusOverdue),
    }}
  >
    {status}
  </span>
</p>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}

/* ---------------- STYLES ---------------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    padding: '16px',
  },
  container: {
    maxWidth: 1200,
    margin: '0 auto',
  },
  title: {
    fontSize: '28px',
    marginBottom: 20,
    color: '#4b2e83',
  },
  search: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    border: '1px solid #ddd',
  },
  mobileGrid: {
    display: 'grid',
    gap: 12,
  },
  card: {
    background: '#fff',
    padding: 14,
    borderRadius: 12,
    border: '1px solid #eee',
  },
  cardTitle: {
    margin: 0,
    marginBottom: 10,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
  },
  presenceLine: {
  margin: '8px 0 0',
  fontSize: '13px',
  color: '#6b6480',
},
statusBadge: {
  display: 'inline-block',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
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