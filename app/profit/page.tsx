'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type StaffOption = {
  id: string
  staff_code: string
  full_name: string
  role: string | null
  is_active: boolean | null
}

type ProfitRow = {
  staff_code: string
  staff_name: string
  role: string
  park_name: string
  business_date_from: string
  business_date_to: string
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

function formatDateForInput(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number | null | undefined) {
  return `₦${toNumber(value).toLocaleString()}`
}

export default function ProfitPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [dateFrom, setDateFrom] = useState(getFirstDayOfMonth())
  const [dateTo, setDateTo] = useState(getTodayDateString())
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [selectedStaffCode, setSelectedStaffCode] = useState('')
  const [profit, setProfit] = useState<ProfitRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingStaffOptions, setLoadingStaffOptions] = useState(true)
  const [errorText, setErrorText] = useState('')

  const isSupervisor = String(staff?.role || '').toLowerCase() === 'supervisor'

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    async function loadStaffOptions() {
      if (!staff || !isSupervisor) return

      setLoadingStaffOptions(true)

      const { data, error } = await supabase
        .from('staff')
        .select('id, staff_code, full_name, role, is_active')
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      if (error) {
        setErrorText(error.message || 'Failed to load staff list.')
        setStaffOptions([])
        setLoadingStaffOptions(false)
        return
      }

      const rows = (data as StaffOption[]) || []
      setStaffOptions(rows)

      if (!selectedStaffCode && rows.length > 0) {
        setSelectedStaffCode(rows[0].staff_code)
      }

      setLoadingStaffOptions(false)
    }

    if (!staffLoading && staff && isSupervisor) {
      loadStaffOptions()
    }

    if (!staffLoading && staff && !isSupervisor) {
      setLoading(false)
      setLoadingStaffOptions(false)
      setErrorText('Access denied. This page is available to supervisors only.')
    }
  }, [staffLoading, staff, isSupervisor])

  useEffect(() => {
    async function loadProfit() {
      if (!staff || !isSupervisor || !selectedStaffCode) return

      setLoading(true)
      setErrorText('')

      const { data, error } = await supabase.rpc(
        'get_supervisor_staff_profit_range_summary',
        {
          p_requesting_staff_code: staff.staff_code,
          p_target_staff_code: selectedStaffCode,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        }
      )

      if (error) {
        setProfit(null)
        setErrorText(error.message || 'Failed to load profit summary.')
        setLoading(false)
        return
      }

      setProfit((data?.[0] as ProfitRow) || null)
      setLoading(false)
    }

    if (!staffLoading && staff && isSupervisor && selectedStaffCode) {
      loadProfit()
    }
  }, [staffLoading, staff, isSupervisor, selectedStaffCode, dateFrom, dateTo])

  const selectedStaffLabel = useMemo(() => {
    const found = staffOptions.find((item) => item.staff_code === selectedStaffCode)
    return found ? `${found.full_name} (${found.staff_code})` : ''
  }, [staffOptions, selectedStaffCode])

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
              Supervisor view for checking any staff profit across a selected date range
            </p>
          </div>
        </div>

        <section style={styles.sectionCard}>
          <div style={styles.rangeRow}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>Staff</label>
              <select
                value={selectedStaffCode}
                onChange={(e) => setSelectedStaffCode(e.target.value)}
                style={styles.input}
                disabled={loadingStaffOptions}
              >
                <option value="">Select staff</option>
                {staffOptions.map((item) => (
                  <option key={item.id} value={item.staff_code}>
                    {item.full_name} ({item.staff_code})
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.quickButtonsWrap}>
            <button
              type="button"
              style={styles.quickButton}
              onClick={() => {
                const today = getTodayDateString()
                setDateFrom(today)
                setDateTo(today)
              }}
            >
              Today
            </button>

            <button
              type="button"
              style={styles.quickButton}
              onClick={() => {
                const today = new Date()
                const past = new Date()
                past.setDate(today.getDate() - 6)
                setDateFrom(formatDateForInput(past))
                setDateTo(getTodayDateString())
              }}
            >
              7 Days
            </button>

            <button
              type="button"
              style={styles.quickButton}
              onClick={() => {
                setDateFrom(getFirstDayOfMonth())
                setDateTo(getTodayDateString())
              }}
            >
              This Month
            </button>
          </div>

          {selectedStaffLabel ? (
            <p style={{ ...styles.noteText, marginTop: '12px' }}>
              Viewing: <strong>{selectedStaffLabel}</strong>
            </p>
          ) : null}
        </section>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}

        {loading ? (
          <p style={styles.noteText}>Loading profit summary...</p>
        ) : !profit ? (
          <p style={styles.noteText}>No profit summary available for this selection.</p>
        ) : (
          <>
            <section style={styles.cardGrid}>
              <StatCard label="Card Fee" value={profit.card_fee_total} />
              <StatCard label="Processing Fee" value={profit.processing_fee_total} />
              <StatCard label="Membership Fee" value={profit.membership_fee_total} />
              <StatCard label="Total Fee Income" value={profit.total_fee_income} strong />
              <StatCard
                label="Expenses"
                value={profit.expense_total}
                danger={toNumber(profit.expense_total) > 0}
              />
              <StatCard
                label="Net Profit"
                value={profit.net_profit}
                strong
                danger={toNumber(profit.net_profit) < 0}
                success={toNumber(profit.net_profit) > 0}
              />
              <PercentCard value={profit.profit_margin} />
            </section>

            <section style={styles.detailCard}>
              <h2 style={styles.sectionTitle}>Summary</h2>
              <div style={styles.infoGrid}>
                <InfoItem label="Staff" value={profit.staff_name} />
                <InfoItem label="Staff Code" value={profit.staff_code} />
                <InfoItem label="Role" value={profit.role || '-'} />
                <InfoItem label="Park" value={profit.park_name || '-'} />
                <InfoItem label="From" value={profit.business_date_from} />
                <InfoItem label="To" value={profit.business_date_to} />
                <InfoItem label="Total Fee Income" value={money(profit.total_fee_income)} />
                <InfoItem label="Expenses" value={money(profit.expense_total)} />
                <InfoItem
                  label="Net Profit"
                  value={money(profit.net_profit)}
                  color={
                    toNumber(profit.net_profit) < 0
                      ? '#b42318'
                      : toNumber(profit.net_profit) > 0
                      ? '#027a48'
                      : '#2d1b69'
                  }
                />
                <InfoItem
                  label="Profit Margin"
                  value={`${toNumber(profit.profit_margin)}%`}
                  color={
                    toNumber(profit.profit_margin) < 0
                      ? '#b42318'
                      : toNumber(profit.profit_margin) > 0
                      ? '#027a48'
                      : '#2d1b69'
                  }
                />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  strong = false,
  danger = false,
  success = false,
}: {
  label: string
  value: number | null | undefined
  strong?: boolean
  danger?: boolean
  success?: boolean
}) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statLabel}>{label}</p>
      <h2
        style={{
          ...styles.statValue,
          fontWeight: strong ? 800 : 700,
          color: danger ? '#b42318' : success ? '#027a48' : '#2d1b69',
        }}
      >
        {money(value)}
      </h2>
    </div>
  )
}

function PercentCard({ value }: { value: number | null | undefined }) {
  const numericValue = toNumber(value)
  const color =
    numericValue < 0 ? '#b42318' : numericValue > 0 ? '#027a48' : '#2d1b69'

  return (
    <div style={styles.statCard}>
      <p style={styles.statLabel}>Profit Margin</p>
      <h2 style={{ ...styles.statValue, color }}>{numericValue}%</h2>
    </div>
  )
}

function InfoItem({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div style={styles.infoItem}>
      <p style={styles.infoLabel}>{label}</p>
      <p style={{ ...styles.infoValue, color: color || '#2d1b69' }}>{value}</p>
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
  sectionCard: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
    marginBottom: '20px',
  },
  rangeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
    alignItems: 'end',
  },
  fieldBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  quickButtonsWrap: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '14px',
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
    lineHeight: 1.2,
    wordBreak: 'break-word',
    color: '#2d1b69',
  },
  detailCard: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
  },
  sectionTitle: {
    margin: 0,
    marginBottom: '16px',
    fontSize: '20px',
    color: '#2d1b69',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
  },
  infoItem: {
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
    fontWeight: 700,
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
}