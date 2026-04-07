'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type SummaryRow = {
  staff_code: string
  staff_name: string
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

type PostResult = {
  success: boolean
  message: string
  tx_ref: string | null
}

type MemberSearchRow = {
  member_code: string
  full_name: string
  phone: string | null
  specific_park: string | null
  park: { name: string | null }[] | null
  service_officer: { full_name: string | null }[] | null
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function AccountSummaryPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [businessDate, setBusinessDate] = useState(getTodayDateString())
  const [summary, setSummary] = useState<SummaryRow | null>(null)
  const [loading, setLoading] = useState(true)

  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseName, setExpenseName] = useState('')
  const [expenseNotes, setExpenseNotes] = useState('')

  const [remitAmount, setRemitAmount] = useState('')
  const [bankName, setBankName] = useState('GTB')
  const [remitReference, setRemitReference] = useState('')
  const [remitNotes, setRemitNotes] = useState('')

  const [feeType, setFeeType] = useState('CARD_FEE')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeNotes, setFeeNotes] = useState('')
  const [feeMemberSearch, setFeeMemberSearch] = useState('')
  const [feeMemberResults, setFeeMemberResults] = useState<MemberSearchRow[]>([])
  const [searchingFeeMembers, setSearchingFeeMembers] = useState(false)
  const [selectedFeeMember, setSelectedFeeMember] = useState<MemberSearchRow | null>(null)

  const [message, setMessage] = useState('')
  const [errorText, setErrorText] = useState('')
  const [postingExpense, setPostingExpense] = useState(false)
  const [postingRemit, setPostingRemit] = useState(false)
  const [postingFee, setPostingFee] = useState(false)

  async function loadSummary() {
    if (!staff) return

    setLoading(true)

    const { data, error } = await supabase.rpc('get_daily_account_summary', {
      p_staff_code: staff.staff_code,
      p_business_date: businessDate,
    })

    console.log('account summary data:', data)
    console.log('account summary error:', error)

    if (error) {
      setSummary(null)
      setErrorText(error.message)
      setLoading(false)
      return
    }

    setSummary((data?.[0] as SummaryRow) || null)
    setLoading(false)
  }

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    if (!staffLoading && staff) {
      loadSummary()
    }
  }, [staffLoading, staff, businessDate])

  useEffect(() => {
    async function searchFeeMembers() {
      const q = feeMemberSearch.trim()

      if (selectedFeeMember) return

      if (q.length < 2) {
        setFeeMemberResults([])
        return
      }

      setSearchingFeeMembers(true)

      const { data, error } = await supabase
        .from('members')
        .select(`
          member_code,
          full_name,
          phone,
          specific_park,
          park:main_park_id (
            name
          ),
          service_officer:service_officer_id (
            full_name
          )
        `)
        .or(`member_code.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('full_name', { ascending: true })
        .limit(10)

      console.log('fee member search data:', data)
      console.log('fee member search error:', error)

      if (error) {
        setFeeMemberResults([])
        setSearchingFeeMembers(false)
        return
      }

      setFeeMemberResults((data as MemberSearchRow[]) || [])
      setSearchingFeeMembers(false)
    }

    const timeout = setTimeout(searchFeeMembers, 300)
    return () => clearTimeout(timeout)
  }, [feeMemberSearch, selectedFeeMember])

  const canPostFee = useMemo(() => {
    return !!feeType && !!feeAmount && !!selectedFeeMember
  }, [feeType, feeAmount, selectedFeeMember])

  async function handlePostExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!staff) return

    setMessage('')
    setErrorText('')

    const amount = Number(expenseAmount)

    if (!amount || amount <= 0) {
      setErrorText('Expense amount must be greater than zero.')
      return
    }

    if (!expenseName.trim()) {
      setErrorText('Expense name is required.')
      return
    }

    setPostingExpense(true)

    const { data, error } = await supabase.rpc('post_expense', {
      p_staff_code: staff.staff_code,
      p_amount: amount,
      p_expense_name: expenseName.trim(),
      p_notes: expenseNotes.trim() || null,
      p_business_date: businessDate,
    })

    console.log('expense data:', data)
    console.log('expense error:', error)

    if (error) {
      setErrorText(error.message)
      setPostingExpense(false)
      return
    }

    const result = data?.[0] as PostResult | undefined

    if (!result?.success) {
      setErrorText(result?.message || 'Expense posting failed.')
      setPostingExpense(false)
      return
    }

    setMessage(result.message || 'Expense posted successfully.')
    setExpenseAmount('')
    setExpenseName('')
    setExpenseNotes('')
    setPostingExpense(false)
    await loadSummary()
  }

  async function handlePostRemittance(e: React.FormEvent) {
    e.preventDefault()
    if (!staff) return

    setMessage('')
    setErrorText('')

    const amount = Number(remitAmount)

    if (!amount || amount <= 0) {
      setErrorText('Remittance amount must be greater than zero.')
      return
    }

    setPostingRemit(true)

    const { data, error } = await supabase.rpc('post_cash_remittance', {
      p_staff_code: staff.staff_code,
      p_amount: amount,
      p_bank_name: bankName,
      p_reference_text: remitReference.trim() || null,
      p_notes: remitNotes.trim() || null,
      p_business_date: businessDate,
    })

    console.log('remittance data:', data)
    console.log('remittance error:', error)

    if (error) {
      setErrorText(error.message)
      setPostingRemit(false)
      return
    }

    const result = data?.[0] as PostResult | undefined

    if (!result?.success) {
      setErrorText(result?.message || 'Remittance posting failed.')
      setPostingRemit(false)
      return
    }

    setMessage(result.message || 'Remittance posted successfully.')
    setRemitAmount('')
    setRemitReference('')
    setRemitNotes('')
    setPostingRemit(false)
    await loadSummary()
  }

  async function handlePostFee(e: React.FormEvent) {
    e.preventDefault()
    if (!staff) return

    setMessage('')
    setErrorText('')

    const amount = Number(feeAmount)

    if (!amount || amount <= 0) {
      setErrorText('Fee amount must be greater than zero.')
      return
    }

    if (!selectedFeeMember) {
      setErrorText('Please search and select a member for this fee.')
      return
    }

    setPostingFee(true)

    const { data, error } = await supabase.rpc('post_fee', {
      p_staff_code: staff.staff_code,
      p_fee_type: feeType,
      p_amount: amount,
      p_member_code: selectedFeeMember.member_code,
      p_notes: feeNotes.trim() || null,
      p_business_date: businessDate,
    })

    console.log('fee data:', data)
    console.log('fee error:', error)

    if (error) {
      setErrorText(error.message)
      setPostingFee(false)
      return
    }

    const result = data?.[0] as PostResult | undefined

    if (!result?.success) {
      setErrorText(result?.message || 'Fee posting failed.')
      setPostingFee(false)
      return
    }

    setMessage(result.message || 'Fee posted successfully.')
    setFeeAmount('')
    setFeeNotes('')
    setFeeMemberSearch('')
    setFeeMemberResults([])
    setSelectedFeeMember(null)
    setPostingFee(false)
    await loadSummary()
  }

  function clearSelectedFeeMember() {
    setSelectedFeeMember(null)
    setFeeMemberSearch('')
    setFeeMemberResults([])
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
          <div style={styles.headerTextWrap}>
            <h1 style={styles.title}>Daily Account Summary</h1>
            <p style={styles.subtitle}>
              Balance your daily cash collection, expenses, fees, and remittance
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

        {message ? <div style={styles.successBox}>{message}</div> : null}
        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}

        {loading ? (
          <p style={styles.noteText}>Loading account summary...</p>
        ) : summary ? (
          <>
            <section style={styles.cardGrid}>
              <StatCard label="Loan Repayment" value={summary.loan_repayment_total} />
              <StatCard label="Regular Savings" value={summary.regular_savings_total} />
              <StatCard label="Compulsory Savings" value={summary.compulsory_savings_total} />
              <StatCard label="Card Fee" value={summary.card_fee_total} />
              <StatCard label="Processing Fee" value={summary.processing_fee_total} />
              <StatCard label="Membership Fee" value={summary.membership_fee_total} />
              <StatCard label="Total Cash Collected" value={summary.total_cash_collected} strong />
              <StatCard label="Expenses" value={summary.expense_total} />
              <StatCard label="Expected Remittance" value={summary.expected_remittance} strong />
              <StatCard label="Remitted" value={summary.remitted_total} />
              <StatCard
                label="Variance"
                value={summary.variance}
                danger={summary.variance < 0}
                success={summary.variance > 0}
              />
              <StatusCard status={summary.balance_status} />
            </section>

            <section style={styles.formsGrid}>
              <form style={styles.formCard} onSubmit={handlePostFee}>
                <h2 style={styles.sectionTitle}>Post Customer Fee</h2>

                <div style={styles.field}>
                  <label style={styles.label}>Search Member</label>
                  <input
                    style={styles.input}
                    value={feeMemberSearch}
                    onChange={(e) => {
                      setFeeMemberSearch(e.target.value)
                      setSelectedFeeMember(null)
                      setMessage('')
                      setErrorText('')
                    }}
                    placeholder="Search by member name, code, or phone"
                  />

                  {searchingFeeMembers ? (
                    <p style={styles.helperText}>Searching members...</p>
                  ) : null}

                  {!selectedFeeMember && feeMemberResults.length > 0 ? (
                    <div style={styles.searchResultsBox}>
                      {feeMemberResults.map((member) => (
                        <button
                          key={member.member_code}
                          type="button"
                          style={styles.searchResultItem}
                          onClick={() => {
                            setSelectedFeeMember(member)
                            setFeeMemberSearch(`${member.full_name} (${member.member_code})`)
                            setFeeMemberResults([])
                          }}
                        >
                          <div>
                            <strong>{member.full_name}</strong>{' '}
                            <span style={styles.mutedText}>({member.member_code})</span>
                          </div>
                          <div style={styles.smallText}>
                            {member.phone || '-'} •{' '}
                            {member.park?.[0]?.name || member.specific_park || '-'} •{' '}
                            {member.service_officer?.[0]?.full_name || '-'}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {selectedFeeMember ? (
                  <div style={styles.selectedMemberCard}>
                    <div>
                      <p style={styles.selectedTitle}>Selected Member</p>
                      <p style={styles.selectedText}>
                        <strong>{selectedFeeMember.full_name}</strong> ({selectedFeeMember.member_code})
                      </p>
                      <p style={styles.selectedSubtext}>
                        Phone: {selectedFeeMember.phone || '-'} | Park:{' '}
                        {selectedFeeMember.park?.[0]?.name || selectedFeeMember.specific_park || '-'} | SO:{' '}
                        {selectedFeeMember.service_officer?.[0]?.full_name || '-'}
                      </p>
                    </div>

                    <button
                      type="button"
                      style={styles.clearButton}
                      onClick={clearSelectedFeeMember}
                    >
                      Change Member
                    </button>
                  </div>
                ) : null}

                <div style={styles.field}>
                  <label style={styles.label}>Fee Type</label>
                  <select
                    style={styles.input}
                    value={feeType}
                    onChange={(e) => setFeeType(e.target.value)}
                  >
                    <option value="CARD_FEE">CARD FEE</option>
                    <option value="PROCESSING_FEE">PROCESSING FEE</option>
                    <option value="MEMBERSHIP_FEE">MEMBERSHIP FEE</option>
                  </select>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Fee Amount</label>
                  <input
                    style={styles.input}
                    type="number"
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                    placeholder="e.g. 500"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Notes</label>
                  <textarea
                    style={styles.textarea}
                    value={feeNotes}
                    onChange={(e) => setFeeNotes(e.target.value)}
                    placeholder="Optional note"
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    ...styles.primaryButton,
                    opacity: canPostFee && !postingFee ? 1 : 0.7,
                  }}
                  disabled={!canPostFee || postingFee}
                >
                  {postingFee ? 'Posting...' : 'Post Fee'}
                </button>
              </form>

              <form style={styles.formCard} onSubmit={handlePostExpense}>
                <h2 style={styles.sectionTitle}>Post Expense</h2>

                <div style={styles.field}>
                  <label style={styles.label}>Expense Amount</label>
                  <input
                    style={styles.input}
                    type="number"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="e.g. 1000"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Nature of Expense</label>
                  <input
                    style={styles.input}
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    placeholder="e.g. Transport / Printing / Stationery"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Notes</label>
                  <textarea
                    style={styles.textarea}
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    placeholder="Optional note"
                  />
                </div>

                <button type="submit" style={styles.primaryButton} disabled={postingExpense}>
                  {postingExpense ? 'Posting...' : 'Post Expense'}
                </button>
              </form>

              <form style={styles.formCard} onSubmit={handlePostRemittance}>
                <h2 style={styles.sectionTitle}>Post Cash Remittance</h2>

                <div style={styles.field}>
                  <label style={styles.label}>Amount Remitted</label>
                  <input
                    style={styles.input}
                    type="number"
                    value={remitAmount}
                    onChange={(e) => setRemitAmount(e.target.value)}
                    placeholder="e.g. 25000"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Bank</label>
                  <select
                    style={styles.input}
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  >
                    <option value="GTB">GTB</option>
                    <option value="FIRSTBANK">FIRSTBANK</option>
                    <option value="FCMB">FCMB</option>
                    <option value="STERLING">STERLING</option>
                  </select>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Reference</label>
                  <input
                    style={styles.input}
                    value={remitReference}
                    onChange={(e) => setRemitReference(e.target.value)}
                    placeholder="Teller / bank ref"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Notes</label>
                  <textarea
                    style={styles.textarea}
                    value={remitNotes}
                    onChange={(e) => setRemitNotes(e.target.value)}
                    placeholder="Optional note"
                  />
                </div>

                <button type="submit" style={styles.primaryButton} disabled={postingRemit}>
                  {postingRemit ? 'Posting...' : 'Post Remittance'}
                </button>
              </form>
            </section>
          </>
        ) : (
          <p style={styles.noteText}>No summary available.</p>
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
  value: number
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
        ₦{Number(value || 0).toLocaleString()}
      </h2>
    </div>
  )
}

function StatusCard({ status }: { status: 'BALANCED' | 'SHORT' | 'EXCESS' }) {
  const style =
    status === 'BALANCED'
      ? styles.statusBalanced
      : status === 'SHORT'
      ? styles.statusShort
      : styles.statusExcess

  return (
    <div style={styles.statCard}>
      <p style={styles.statLabel}>Balance Status</p>
      <div style={{ marginTop: '12px' }}>
        <span style={{ ...styles.statusBadge, ...style }}>{status}</span>
      </div>
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
  formsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '18px',
    marginTop: '24px',
  },
  formCard: {
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
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '14px',
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
    lineHeight: 1.2,
    wordBreak: 'break-word',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '14px',
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
  textarea: {
    minHeight: '90px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    outline: 'none',
    fontSize: '16px',
    background: '#fff',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  primaryButton: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    borderRadius: '12px',
    background: '#4b2e83',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '15px',
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
  helperText: {
    margin: 0,
    fontSize: '12px',
    color: '#7a7191',
  },
  successBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#ecfdf3',
    border: '1px solid #abefc6',
    color: '#027a48',
    lineHeight: 1.5,
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
  statusBadge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
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
  searchResultsBox: {
    border: '1px solid #e5ddf6',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#fff',
  },
  searchResultItem: {
    width: '100%',
    textAlign: 'left',
    padding: '12px 14px',
    border: 'none',
    borderBottom: '1px solid #f0ebf9',
    background: '#fff',
    cursor: 'pointer',
  },
  mutedText: {
    color: '#7a7191',
  },
  smallText: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
    lineHeight: 1.45,
  },
  selectedMemberCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '16px',
    borderRadius: '14px',
    background: '#f8f5fd',
    border: '1px solid #e8def8',
    marginBottom: '14px',
    flexWrap: 'wrap',
  },
  selectedTitle: {
    margin: 0,
    fontSize: '13px',
    color: '#7a7191',
  },
  selectedText: {
    margin: '6px 0 0',
    fontSize: '16px',
    color: '#2d1b69',
    lineHeight: 1.4,
  },
  selectedSubtext: {
    margin: '6px 0 0',
    fontSize: '13px',
    color: '#6b6480',
    lineHeight: 1.5,
  },
  clearButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: 700,
  },
}