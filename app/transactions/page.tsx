'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

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

type ReverseResult = {
  success: boolean
  message: string
  original_tx_ref: string | null
  reversal_tx_ref: string | null
}

function getTodayDateString() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getSevenDaysAgoString() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatAmount(value: number) {
  return `₦${Number(value || 0).toLocaleString()}`
}

function isEffectiveOperationalRow(row: TransactionRow) {
  const hasCorrection = !!String(row.correction_reason || '').trim()

  if (row.tx_type === 'REVERSAL') return false
  if (hasCorrection) return false

  return true
}

export default function TransactionsPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  const [search, setSearch] = useState('')
  const [txType, setTxType] = useState('')
  const [dateFrom, setDateFrom] = useState(getSevenDaysAgoString())
  const [dateTo, setDateTo] = useState(getTodayDateString())

  const [selectedTx, setSelectedTx] = useState<TransactionRow | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reversing, setReversing] = useState(false)

  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const canSeeAllTransactions =
    staff?.role === 'ADMIN' || staff?.role === 'SUPERVISOR'

  const txTypes = [
    'LOAN_REPAYMENT',
    'SAVINGS_DEPOSIT',
    'SAVINGS_WITHDRAWAL',
    'LOAN_DISBURSEMENT',
    'FEE',
    'EXPENSE',
    'REMITTANCE',
    'REVERSAL',
    'ADJUSTMENT',
  ]

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  async function loadTransactions() {
    if (!staff) return

    setLoading(true)
    setActionError('')

    let query = supabase
      .from('vw_transaction_report')
      .select('*')
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo)
      .order('business_date', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(500)

    if (txType) {
      query = query.eq('tx_type', txType)
    }

    if (!canSeeAllTransactions) {
      query = query.eq('staff_name', staff.full_name)
    }

    const { data, error } = await query

    if (error) {
      setRows([])
      setActionError(error.message || 'Failed to load transactions.')
      setLoading(false)
      return
    }

    setRows((data as TransactionRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!staffLoading && staff) {
      loadTransactions()
    }
  }, [staffLoading, staff, txType, dateFrom, dateTo, canSeeAllTransactions])

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows

    return rows.filter((row) => {
      return (
        (row.tx_ref || '').toLowerCase().includes(q) ||
        (row.member_code || '').toLowerCase().includes(q) ||
        (row.member_name || '').toLowerCase().includes(q) ||
        (row.staff_name || '').toLowerCase().includes(q) ||
        (row.park_name || '').toLowerCase().includes(q) ||
        (row.tx_type || '').toLowerCase().includes(q) ||
        (row.sub_type || '').toLowerCase().includes(q) ||
        (row.reference_text || '').toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const effectiveRows = useMemo(() => {
    return filteredRows.filter(isEffectiveOperationalRow)
  }, [filteredRows])

  const totals = useMemo(() => {
    return {
      visibleCount: filteredRows.length,
      effectiveCount: effectiveRows.length,
      totalIn: effectiveRows
        .filter((row) => row.direction === 'IN')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
      totalOut: effectiveRows
        .filter((row) => row.direction === 'OUT')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    }
  }, [filteredRows, effectiveRows])

  function canReverse(row: TransactionRow) {
    if (!canSeeAllTransactions) return false
    if (row.tx_type === 'REVERSAL') return false
    if (String(row.correction_reason || '').trim()) return false

    if (row.tx_type === 'LOAN_REPAYMENT') return true
    if (row.tx_type === 'SAVINGS_DEPOSIT') return true

    if (
      row.tx_type === 'FEE' &&
      ['CARD_FEE', 'PROCESSING_FEE', 'MEMBERSHIP_FEE'].includes(row.sub_type || '')
    ) {
      return true
    }

    return false
  }

  async function handleReverseSubmit() {
    if (!staff || !selectedTx) return

    setActionError('')
    setActionMessage('')

    if (!reverseReason.trim()) {
      setActionError('Reversal reason is required.')
      return
    }

    setReversing(true)

    const { data, error } = await supabase.rpc('reverse_posted_transaction', {
      p_tx_ref: selectedTx.tx_ref,
      p_reversal_reason: reverseReason.trim(),
      p_staff_code: staff.staff_code,
    })

    if (error) {
      setActionError(error.message || 'Reversal failed.')
      setReversing(false)
      return
    }

    const result = data?.[0] as ReverseResult | undefined

    if (!result?.success) {
      setActionError(result?.message || 'Reversal failed.')
      setReversing(false)
      return
    }

    setActionMessage(result.message || 'Transaction reversed successfully.')
    setSelectedTx(null)
    setReverseReason('')
    setReversing(false)
    await loadTransactions()
  }

  function openMember(memberCode: string | null) {
    if (!memberCode) return
    window.location.href = `/members/${memberCode}`
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
            <h1 style={styles.title}>Transaction History</h1>
            <p style={styles.subtitle}>
              {canSeeAllTransactions
                ? 'Audit trail and reporting view'
                : 'Your previous postings'}
            </p>
          </div>

          <button
            style={styles.backButton}
            onClick={() => window.history.back()}
            type="button"
          >
            ← Back
          </button>
        </div>

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Visible Rows</p>
            <h2 style={styles.statValue}>{totals.visibleCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Effective Rows</p>
            <h2 style={styles.statValue}>{totals.effectiveCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Effective In</p>
            <h2 style={styles.statValue}>{formatAmount(totals.totalIn)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Effective Out</p>
            <h2 style={styles.statValue}>{formatAmount(totals.totalOut)}</h2>
          </div>
        </section>

        {actionMessage ? <div style={styles.successBox}>{actionMessage}</div> : null}
        {actionError ? <div style={styles.errorBox}>{actionError}</div> : null}

        {selectedTx ? (
          <section style={styles.sectionCard}>
            <h2 style={styles.sectionTitle}>Reverse Transaction</h2>
            <p style={styles.noteText}>
              You are reversing <strong>{selectedTx.tx_ref}</strong> ({selectedTx.tx_type}) for{' '}
              <strong>{selectedTx.member_name || '-'}</strong>.
            </p>

            <div style={styles.reverseForm}>
              <textarea
                style={styles.textarea}
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Enter reason for reversal"
              />

              <div style={styles.actionRow}>
                <button
                  style={styles.cancelButton}
                  type="button"
                  onClick={() => {
                    setSelectedTx(null)
                    setReverseReason('')
                    setActionError('')
                  }}
                >
                  Cancel
                </button>

                <button
                  style={styles.reverseButton}
                  type="button"
                  onClick={handleReverseSubmit}
                  disabled={reversing}
                >
                  {reversing ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section style={styles.sectionCard}>
          <div style={styles.filterStack}>
            <input
              style={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tx ref, member, staff, park, reference"
            />

            <select
              style={styles.input}
              value={txType}
              onChange={(e) => setTxType(e.target.value)}
            >
              <option value="">All Transaction Types</option>
              {txTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <div style={styles.dateGrid}>
              <div style={styles.fieldBlock}>
                <label style={styles.fieldLabel}>From</label>
                <input
                  style={styles.input}
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.fieldLabel}>To</label>
                <input
                  style={styles.input}
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <p style={styles.noteText}>Loading transactions...</p>
          ) : !filteredRows.length ? (
            <p style={styles.noteText}>No transactions found.</p>
          ) : isMobile ? (
            <div style={styles.mobileList}>
              {filteredRows.map((row) => {
                const isEffective = isEffectiveOperationalRow(row)

                return (
                  <div
                    key={row.id}
                    style={{
                      ...styles.mobileCard,
                      opacity: isEffective ? 1 : 0.72,
                    }}
                  >
                    <div style={styles.mobileCardTop}>
                      <div>
                        <div style={styles.mobileTxType}>{row.tx_type || '-'}</div>
                        <div style={styles.mobileTxRef}>{row.tx_ref || '-'}</div>
                      </div>

                      <div
                        style={{
                          ...styles.directionBadge,
                          ...(row.direction === 'IN'
                            ? styles.directionIn
                            : styles.directionOut),
                        }}
                      >
                        {row.direction || '-'}
                      </div>
                    </div>

                    {!isEffective ? (
                      <div style={styles.reversedTag}>
                        Reversed / excluded from effective totals
                      </div>
                    ) : null}

                    <div style={styles.mobileAmount}>
                      {formatAmount(Number(row.amount || 0))}
                    </div>

                    <div style={styles.mobileGrid}>
                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Date</span>
                        <span style={styles.infoValue}>{row.business_date || '-'}</span>
                      </div>

                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Sub Type</span>
                        <span style={styles.infoValue}>{row.sub_type || '-'}</span>
                      </div>

                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Member</span>
                        <span
                          style={{
                            ...styles.infoValue,
                            ...(row.member_code ? styles.memberLink : {}),
                          }}
                          onClick={() => openMember(row.member_code)}
                        >
                          {row.member_name || '-'}
                        </span>
                        <span style={styles.subText}>{row.member_code || '-'}</span>
                      </div>

                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Staff</span>
                        <span style={styles.infoValue}>{row.staff_name || '-'}</span>
                      </div>

                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Park</span>
                        <span style={styles.infoValue}>{row.park_name || '-'}</span>
                      </div>

                      <div style={styles.infoItem}>
                        <span style={styles.infoLabel}>Reference</span>
                        <span style={styles.infoValue}>{row.reference_text || '-'}</span>
                      </div>
                    </div>

                    {canSeeAllTransactions ? (
                      <div style={styles.mobileActionRow}>
                        {canReverse(row) ? (
                          <button
                            type="button"
                            style={styles.rowActionButton}
                            onClick={() => {
                              setSelectedTx(row)
                              setActionMessage('')
                              setActionError('')
                              setReverseReason('')
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                          >
                            Reverse Transaction
                          </button>
                        ) : (
                          <span style={styles.disabledAction}>No action available</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Ref</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Sub Type</th>
                    <th style={styles.th}>Direction</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Member</th>
                    <th style={styles.th}>Staff</th>
                    <th style={styles.th}>Park</th>
                    <th style={styles.th}>Reference</th>
                    <th style={styles.th}>Status</th>
                    {canSeeAllTransactions ? <th style={styles.th}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const isEffective = isEffectiveOperationalRow(row)

                    return (
                      <tr
                        key={row.id}
                        style={{
                          opacity: isEffective ? 1 : 0.72,
                          background: isEffective ? '#fff' : '#faf8fe',
                        }}
                      >
                        <td style={styles.td}>{row.business_date || '-'}</td>
                        <td style={styles.td}>{row.tx_ref || '-'}</td>
                        <td style={styles.td}>{row.tx_type || '-'}</td>
                        <td style={styles.td}>{row.sub_type || '-'}</td>
                        <td
                          style={{
                            ...styles.td,
                            color: row.direction === 'IN' ? '#027a48' : '#b42318',
                            fontWeight: 700,
                          }}
                        >
                          {row.direction || '-'}
                        </td>
                        <td style={styles.td}>{formatAmount(Number(row.amount || 0))}</td>
                        <td
                          style={{
                            ...styles.td,
                            cursor: row.member_code ? 'pointer' : 'default',
                          }}
                          onClick={() => openMember(row.member_code)}
                        >
                          <span style={styles.linkText}>{row.member_name || '-'}</span>
                          <div style={styles.subText}>{row.member_code || '-'}</div>
                        </td>
                        <td style={styles.td}>{row.staff_name || '-'}</td>
                        <td style={styles.td}>{row.park_name || '-'}</td>
                        <td style={styles.td}>{row.reference_text || '-'}</td>
                        <td style={styles.td}>
                          {isEffective ? (
                            <span style={styles.statusActive}>Effective</span>
                          ) : (
                            <span style={styles.statusMuted}>Reversed / Excluded</span>
                          )}
                        </td>
                        {canSeeAllTransactions ? (
                          <td style={styles.td}>
                            {canReverse(row) ? (
                              <button
                                type="button"
                                style={styles.rowActionButton}
                                onClick={() => {
                                  setSelectedTx(row)
                                  setActionMessage('')
                                  setActionError('')
                                  setReverseReason('')
                                  window.scrollTo({ top: 0, behavior: 'smooth' })
                                }}
                              >
                                Reverse
                              </button>
                            ) : (
                              <span style={styles.disabledAction}>—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
    color: '#1f1b2d',
  },
  pageInner: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '16px',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
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
    lineHeight: 1.15,
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: '#6b6480',
    lineHeight: 1.5,
  },
  backButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  statCard: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 8px 24px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
  },
  statLabel: {
    margin: 0,
    fontSize: '13px',
    color: '#7a7191',
  },
  statValue: {
    margin: '10px 0 0',
    fontSize: '24px',
    color: '#2d1b69',
    lineHeight: 1.15,
    wordBreak: 'break-word',
  },
  sectionCard: {
    background: '#ffffff',
    borderRadius: '18px',
    padding: '16px',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    border: '1px solid #ece7f7',
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: 0,
    marginBottom: '12px',
    fontSize: '20px',
    color: '#2d1b69',
  },
  filterStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '18px',
  },
  dateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  },
  fieldBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: '12px',
    color: '#6b6480',
    fontWeight: 700,
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
    width: '100%',
    minHeight: '100px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    outline: 'none',
    fontSize: '16px',
    background: '#fff',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  reverseForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    flexWrap: 'wrap',
  },
  reverseButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    background: '#b42318',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  cancelButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    cursor: 'pointer',
    fontWeight: 700,
  },
  rowActionButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    background: '#fef3f2',
    color: '#b42318',
    cursor: 'pointer',
    fontWeight: 700,
  },
  disabledAction: {
    color: '#9b93af',
    fontSize: '13px',
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
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
  mobileCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
    marginBottom: '10px',
  },
  mobileTxType: {
    fontSize: '13px',
    fontWeight: 800,
    color: '#4b2e83',
    wordBreak: 'break-word',
  },
  mobileTxRef: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
    wordBreak: 'break-word',
  },
  mobileAmount: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#2d1b69',
    marginBottom: '12px',
    wordBreak: 'break-word',
  },
  directionBadge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  directionIn: {
    background: '#ecfdf3',
    color: '#027a48',
    border: '1px solid #abefc6',
  },
  directionOut: {
    background: '#fef3f2',
    color: '#b42318',
    border: '1px solid #fecdca',
  },
  mobileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  infoLabel: {
    fontSize: '11px',
    color: '#8a82a0',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 700,
  },
  infoValue: {
    fontSize: '14px',
    color: '#1f1b2d',
    fontWeight: 600,
    wordBreak: 'break-word',
  },
  memberLink: {
    color: '#4b2e83',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  mobileActionRow: {
    marginTop: '14px',
    display: 'flex',
    justifyContent: 'flex-start',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '1000px',
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
    wordBreak: 'break-word',
  },
  linkText: {
    color: '#4b2e83',
    fontWeight: 700,
    textDecoration: 'underline',
  },
  reversedTag: {
    marginBottom: '10px',
    padding: '8px 10px',
    borderRadius: '10px',
    background: '#faf8fe',
    border: '1px solid #e6def7',
    color: '#6b6480',
    fontSize: '12px',
    fontWeight: 700,
  },
  statusActive: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#ecfdf3',
    border: '1px solid #abefc6',
    color: '#027a48',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  statusMuted: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#faf8fe',
    border: '1px solid #e6def7',
    color: '#6b6480',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
}