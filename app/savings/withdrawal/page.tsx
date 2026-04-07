'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type MemberBaseRow = {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  specific_park: string | null
  main_park_id: string | null
  service_officer_id: string | null
}

type MemberSearchRow = MemberBaseRow & {
  park_name: string | null
  service_officer_name: string | null
}

type SavingsWithdrawalResult = {
  success: boolean
  message: string
  tx_ref: string | null
  member_id: string | null
  member_code: string | null
  member_name: string | null
  account_type: string | null
  amount: number | null
  new_balance: number | null
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function SavingsWithdrawalPage() {
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<MemberSearchRow[]>([])
  const [searchingMembers, setSearchingMembers] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MemberSearchRow | null>(null)

  const [accountType, setAccountType] = useState('REGULAR')
  const [amount, setAmount] = useState('')
  const [staffCode, setStaffCode] = useState('')
  const [referenceText, setReferenceText] = useState('')
  const [notes, setNotes] = useState('')
  const [businessDate, setBusinessDate] = useState(getTodayDateString())

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SavingsWithdrawalResult | null>(null)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    const savedStaffCode = localStorage.getItem('epiphany_staff_code')
    if (savedStaffCode) {
      setStaffCode(savedStaffCode)
    }
  }, [])

  useEffect(() => {
    if (staffCode.trim()) {
      localStorage.setItem('epiphany_staff_code', staffCode.trim())
    }
  }, [staffCode])

  useEffect(() => {
    async function searchMembers() {
      const q = memberSearch.trim()

      if (q.length < 2) {
        setMemberResults([])
        return
      }

      setSearchingMembers(true)

      const { data, error } = await supabase
        .from('members')
        .select(`
          id,
          member_code,
          full_name,
          phone,
          specific_park,
          main_park_id,
          service_officer_id
        `)
        .or(`member_code.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('full_name', { ascending: true })
        .limit(10)

      console.log('member search data:', data)
      console.log('member search error:', error)

      if (error || !data) {
        setMemberResults([])
        setSearchingMembers(false)
        return
      }

      const baseRows = (data as MemberBaseRow[]) || []

      const uniqueParkIds = Array.from(
        new Set(baseRows.map((row) => row.main_park_id).filter(Boolean))
      ) as string[]

      const uniqueOfficerIds = Array.from(
        new Set(baseRows.map((row) => row.service_officer_id).filter(Boolean))
      ) as string[]

      let parksMap: Record<string, string> = {}
      let officersMap: Record<string, string> = {}

      if (uniqueParkIds.length) {
        const { data: parksData } = await supabase
          .from('parks')
          .select('id, name')
          .in('id', uniqueParkIds)

        parksMap = Object.fromEntries(
          ((parksData as { id: string; name: string | null }[]) || []).map((park) => [
            park.id,
            park.name || '',
          ])
        )
      }

      if (uniqueOfficerIds.length) {
        const { data: officersData } = await supabase
          .from('staff')
          .select('id, full_name')
          .in('id', uniqueOfficerIds)

        officersMap = Object.fromEntries(
          ((officersData as { id: string; full_name: string | null }[]) || []).map(
            (officer) => [officer.id, officer.full_name || '']
          )
        )
      }

      const enrichedRows: MemberSearchRow[] = baseRows.map((row) => ({
        ...row,
        park_name: row.main_park_id ? parksMap[row.main_park_id] || null : null,
        service_officer_name: row.service_officer_id
          ? officersMap[row.service_officer_id] || null
          : null,
      }))

      setMemberResults(enrichedRows)
      setSearchingMembers(false)
    }

    const timeout = setTimeout(searchMembers, 300)
    return () => clearTimeout(timeout)
  }, [memberSearch])

  const canSubmit = useMemo(() => {
    return !!selectedMember && !!amount && !!staffCode.trim() && !!businessDate && !!accountType
  }, [selectedMember, amount, staffCode, businessDate, accountType])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorText('')
    setResult(null)

    const numericAmount = Number(amount)

    if (!selectedMember) {
      setErrorText('Please select a member first.')
      setLoading(false)
      return
    }

    if (!staffCode.trim()) {
      setErrorText('Staff code is required.')
      setLoading(false)
      return
    }

    if (!numericAmount || numericAmount <= 0) {
      setErrorText('Amount must be greater than zero.')
      setLoading(false)
      return
    }

    if (businessDate < getTodayDateString()) {
      setErrorText('Business date cannot be earlier than today.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc('post_savings_withdrawal', {
      p_member_code: selectedMember.member_code,
      p_account_type: accountType,
      p_amount: numericAmount,
      p_staff_code: staffCode.trim(),
      p_reference_text: referenceText.trim() || null,
      p_notes: notes.trim() || null,
      p_business_date: businessDate,
    })

    console.log('withdrawal data:', data)
    console.log('withdrawal error:', error)

    if (error) {
      setErrorText(error.message)
      setLoading(false)
      return
    }

    if (data && data.length > 0) {
      setResult(data[0] as SavingsWithdrawalResult)
    } else {
      setErrorText('No response returned from savings withdrawal function.')
    }

    setLoading(false)
  }

  function clearSelectedMember() {
    setSelectedMember(null)
    setMemberSearch('')
    setMemberResults([])
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Post Savings Withdrawal</h1>
            <p style={styles.subtitle}>Record regular or compulsory savings withdrawal</p>
          </div>

          <button style={styles.backButton} onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>

        <section style={styles.card}>
          <form onSubmit={handleSubmit}>
            <div style={styles.formGrid}>
              <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
                <label style={styles.label}>Search Member</label>
                <input
                  style={styles.input}
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value)
                    setSelectedMember(null)
                    setResult(null)
                    setErrorText('')
                  }}
                  placeholder="Search by member code, name, or phone"
                />

                {searchingMembers && (
                  <p style={styles.helperText}>Searching members...</p>
                )}

                {!selectedMember && memberResults.length > 0 && (
                  <div style={styles.searchResultsBox}>
                    {memberResults.map((member) => (
                      <button
                        key={member.member_code}
                        type="button"
                        style={styles.searchResultItem}
                        onClick={() => {
                          setSelectedMember(member)
                          setMemberSearch(`${member.full_name} (${member.member_code})`)
                          setMemberResults([])
                        }}
                      >
                        <div style={styles.resultTitleRow}>
                          <strong>{member.full_name}</strong>
                          <span style={styles.mutedText}>({member.member_code})</span>
                        </div>
                        <div style={styles.smallText}>{member.phone || '-'}</div>
                        <div style={styles.smallText}>
                          Park: {member.park_name || member.specific_park || '-'}
                        </div>
                        <div style={styles.smallText}>
                          SO: {member.service_officer_name || '-'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedMember && (
                <div style={{ ...styles.selectedMemberCard, gridColumn: '1 / -1' }}>
                  <div style={styles.selectedMemberMain}>
                    <p style={styles.selectedTitle}>Selected Member</p>
                    <p style={styles.selectedText}>
                      <strong>{selectedMember.full_name}</strong> ({selectedMember.member_code})
                    </p>
                    <div style={styles.selectedDetailsStack}>
                      <p style={styles.selectedSubtext}>Phone: {selectedMember.phone || '-'}</p>
                      <p style={styles.selectedSubtext}>
                        Park: {selectedMember.park_name || selectedMember.specific_park || '-'}
                      </p>
                      <p style={styles.selectedSubtext}>
                        SO: {selectedMember.service_officer_name || '-'}
                      </p>
                    </div>
                  </div>

                  <button type="button" style={styles.clearButton} onClick={clearSelectedMember}>
                    Change Member
                  </button>
                </div>
              )}

              <div style={styles.field}>
                <label style={styles.label}>Account Type</label>
                <select
                  style={styles.input}
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                >
                  <option value="REGULAR">REGULAR</option>
                  <option value="COMPULSORY">COMPULSORY</option>
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Amount</label>
                <input
                  style={styles.input}
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 2000"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Staff Code</label>
                <input
                  style={styles.input}
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value)}
                  placeholder="e.g. EC00006"
                />
                <p style={styles.helperText}>
                  Saved automatically for future postings on this device.
                </p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Business Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={businessDate}
                  min={getTodayDateString()}
                  onChange={(e) => setBusinessDate(e.target.value)}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Reference</label>
                <input
                  style={styles.input}
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  placeholder="Receipt / teller / transfer reference"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Notes</label>
                <input
                  style={styles.input}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note"
                />
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="submit"
                  style={{
                    ...styles.submitButton,
                    opacity: canSubmit && !loading ? 1 : 0.7,
                  }}
                  disabled={!canSubmit || loading}
                >
                  {loading ? 'Posting...' : 'Post Withdrawal'}
                </button>
              </div>
            </div>
          </form>

          {errorText ? (
            <div style={styles.errorBox}>
              <strong>Error:</strong> {errorText}
            </div>
          ) : null}

          {result ? (
            <div
              style={{
                ...styles.resultBox,
                background: result.success ? '#ecfdf3' : '#fef3f2',
                borderColor: result.success ? '#abefc6' : '#fecdca',
              }}
            >
              <h3 style={{ marginTop: 0 }}>
                {result.success ? 'Savings Withdrawal Posted' : 'Savings Withdrawal Failed'}
              </h3>

              <p><strong>Message:</strong> {result.message}</p>
              <p><strong>Member:</strong> {result.member_name || '-'} ({result.member_code || '-'})</p>
              <p><strong>Account Type:</strong> {result.account_type || '-'}</p>
              <p><strong>Amount:</strong> ₦{Number(result.amount || 0).toLocaleString()}</p>
              <p><strong>Transaction Ref:</strong> {result.tx_ref || '-'}</p>
              <p><strong>New Balance:</strong> ₦{Number(result.new_balance || 0).toLocaleString()}</p>
            </div>
          ) : null}
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
    maxWidth: '1100px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
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
  card: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
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
  helperText: {
    margin: 0,
    fontSize: '12px',
    color: '#7a7191',
    lineHeight: 1.5,
  },
  searchResultsBox: {
    border: '1px solid #e5ddf6',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#fff',
    maxHeight: '320px',
    overflowY: 'auto',
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
  resultTitleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
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
    gap: '12px',
    flexWrap: 'wrap',
    padding: '16px',
    borderRadius: '14px',
    background: '#f8f5fd',
    border: '1px solid #e8def8',
  },
  selectedMemberMain: {
    flex: 1,
    minWidth: '220px',
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
  selectedDetailsStack: {
    display: 'grid',
    gap: '4px',
    marginTop: '6px',
  },
  selectedSubtext: {
    margin: 0,
    fontSize: '13px',
    color: '#6b6480',
    lineHeight: 1.45,
  },
  clearButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  buttonRow: {
    gridColumn: '1 / -1',
    marginTop: '6px',
  },
  submitButton: {
    width: '100%',
    maxWidth: '260px',
    padding: '12px 18px',
    borderRadius: '12px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '15px',
  },
  errorBox: {
    marginTop: '20px',
    padding: '14px',
    borderRadius: '12px',
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
    lineHeight: 1.5,
  },
  resultBox: {
    marginTop: '20px',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid',
    color: '#1f1b2d',
    lineHeight: 1.6,
  },
}