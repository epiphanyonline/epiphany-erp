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
  overdue_exposure: number
  overdue_recovered_today: number
  total_exposure: number
  expected_today: number
  actual_today: number
  variance_today: number
}

/* ---------------- HELPERS ---------------- */

function getTodayDateString() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Lagos' })
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

      const [{ data: parks, error: parksError }, { data: members, error: membersError },
        { data: collectionData, error: collectionError },
        { data: staffData, error: staffError }] = await Promise.all([
        supabase.from('parks').select('id, name'),
        supabase.from('members').select('id, main_park_id'),
        supabase.rpc('epiphany_collection_report', {
          p_date_from: today,
          p_date_to: today,
          p_park_id: null,
        }),
        supabase.from('staff').select('id, staff_code, full_name, role, last_active, is_active')
          .eq('is_active', true),
      ])

      if (parksError || membersError || collectionError || staffError) {
        console.error('Supervisor report failed', parksError || membersError || collectionError || staffError)
        setRows([])
        setLoading(false)
        return
      }

      const loansByPark = new Map<string, any[]>()
      ;(collectionData || []).forEach((loan: any) => {
        const bucket = loansByPark.get(loan.park_id) || []
        bucket.push(loan)
        loansByPark.set(loan.park_id, bucket)
      })

      const result: ParkRow[] = (parks || []).map((park: Park) => {
        const parkLoans = loansByPark.get(park.id) || []
        const parkMembers = (members || []).filter((m) => m.main_park_id === park.id)
        const expected = parkLoans.reduce(
          (sum, loan) => sum + Number(loan.expected_total_for_range || 0), 0
        )
        const actual = parkLoans.reduce(
          (sum, loan) => sum + Number(loan.actual_paid_for_range || 0), 0
        )

        return {
          park_id: park.id,
          park_name: park.name,
          members_count: parkMembers.length,
          active_loans_count: parkLoans.length,
          overdue_loans_count: parkLoans.filter((loan) => loan.display_status === 'OVERDUE').length,
          overdue_exposure: parkLoans
            .filter((loan) => loan.display_status === 'OVERDUE')
            .reduce((sum, loan) => sum + Number(loan.outstanding_balance || 0), 0),
          overdue_recovered_today: parkLoans
            .filter((loan) => loan.display_status === 'OVERDUE')
            .reduce((sum, loan) => sum + Number(loan.actual_paid_for_range || 0), 0),
          total_exposure: parkLoans.reduce(
            (sum, loan) => sum + Number(loan.outstanding_balance || 0), 0
          ),
          expected_today: expected,
          actual_today: actual,
          variance_today: actual - expected,
        }
      })

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
        <p>Scheduled collections exclude arrears after maturity. Overdue exposure and recoveries are shown separately.</p>

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
                <p>Overdue Exposure: {money(row.overdue_exposure)}</p>
                <p>Overdue Recovered: {money(row.overdue_recovered_today)}</p>
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