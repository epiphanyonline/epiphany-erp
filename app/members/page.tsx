'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type MemberRow = {
  member_id: string
  member_code: string | null
  full_name: string | null
  phone: string | null
  member_status: string | null
  main_park_id: string | null
  park_name: string | null
  total_savings_balance: number | null
  total_loan_outstanding: number | null
  net_position: number | null
  created_at: string | null
}

type ParkOption = {
  id: string
  name: string
}

const PAGE_SIZE = 200
const LOAD_ALL_BATCH_SIZE = 1000

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number | string | null | undefined) {
  return `₦${toNumber(value).toLocaleString()}`
}

export default function MembersPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<MemberRow[]>([])
  const [parks, setParks] = useState<ParkOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedPark, setSelectedPark] = useState('ALL')
  const [selectedStatus, setSelectedStatus] = useState('ALL')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadedAll, setLoadedAll] = useState(false)

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchInput])

  const loadParks = useCallback(async () => {
    const { data, error } = await supabase
      .from('parks')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      setParks([])
      return
    }

    setParks((data as ParkOption[]) || [])
  }, [])

  const buildMembersQuery = useCallback(() => {
    let query = supabase
      .from('vw_member_directory')
      .select('*')
      .order('created_at', { ascending: false })

    if (search) {
      const safeSearch = search.replaceAll(',', ' ')
      query = query.or(
        `full_name.ilike.%${safeSearch}%,member_code.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,park_name.ilike.%${safeSearch}%`
      )
    }

    if (selectedPark !== 'ALL') {
      query = query.eq('main_park_id', selectedPark)
    }

    if (selectedStatus !== 'ALL') {
      query = query.eq('member_status', selectedStatus)
    }

    return query
  }, [search, selectedPark, selectedStatus])

  const normalizeRows = useCallback((data: MemberRow[] | null | undefined) => {
    return ((data || []) as MemberRow[]).map((row) => ({
      ...row,
      total_savings_balance: toNumber(row.total_savings_balance),
      total_loan_outstanding: toNumber(row.total_loan_outstanding),
      net_position: toNumber(row.net_position),
    }))
  }, [])

  const loadMembersPage = useCallback(
    async (pageIndex: number, replace = false) => {
      const from = pageIndex * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      if (replace) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      setErrorText('')

      const { data, error } = await buildMembersQuery().range(from, to)

      if (error) {
        setErrorText(error.message || 'Failed to load members.')
        if (replace) {
          setRows([])
        }
        setLoading(false)
        setLoadingMore(false)
        return
      }

      const newRows = normalizeRows(data as MemberRow[])

      setRows((prev) => {
        if (replace) return newRows

        const existingIds = new Set(prev.map((item) => item.member_id))
        const deduped = newRows.filter((item) => !existingIds.has(item.member_id))
        return [...prev, ...deduped]
      })

      setHasMore(newRows.length === PAGE_SIZE)
      setLoadedAll(false)
      setLoading(false)
      setLoadingMore(false)
    },
    [buildMembersQuery, normalizeRows]
  )

  const loadAllMembers = useCallback(async () => {
    setLoadingAll(true)
    setErrorText('')

    try {
      let from = 0
      let keepLoading = true
      const allRows: MemberRow[] = []

      while (keepLoading) {
        const to = from + LOAD_ALL_BATCH_SIZE - 1

        const { data, error } = await buildMembersQuery().range(from, to)

        if (error) {
          throw new Error(error.message || 'Failed to load all members.')
        }

        const batch = normalizeRows(data as MemberRow[])

        allRows.push(...batch)

        if (batch.length < LOAD_ALL_BATCH_SIZE) {
          keepLoading = false
        } else {
          from += LOAD_ALL_BATCH_SIZE
        }
      }

      const uniqueMap = new Map<string, MemberRow>()
      for (const row of allRows) {
        uniqueMap.set(row.member_id, row)
      }

      const finalRows = Array.from(uniqueMap.values())

      setRows(finalRows)
      setLoadedAll(true)
      setHasMore(false)
      setPage(0)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load all members.'
      setErrorText(message)
    } finally {
      setLoadingAll(false)
      setLoading(false)
      setLoadingMore(false)
    }
  }, [buildMembersQuery, normalizeRows])

  const refreshAll = useCallback(async () => {
    setPage(0)
    setHasMore(true)
    setLoadedAll(false)
    await Promise.all([loadParks(), loadMembersPage(0, true)])
  }, [loadParks, loadMembersPage])

  const handleLoadMore = useCallback(async () => {
    if (loading || loadingMore || loadingAll || !hasMore || loadedAll) return

    const nextPage = page + 1
    setPage(nextPage)
    await loadMembersPage(nextPage, false)
  }, [loading, loadingMore, loadingAll, hasMore, loadedAll, page, loadMembersPage])

  useEffect(() => {
    if (!staffLoading && staff) {
      loadParks()
    }
  }, [staffLoading, staff, loadParks])

  useEffect(() => {
    if (!staffLoading && staff) {
      setPage(0)
      setHasMore(true)
      setLoadedAll(false)
      loadMembersPage(0, true)
    }
  }, [staffLoading, staff, search, selectedPark, selectedStatus, loadMembersPage])

  const totals = useMemo(() => {
    return {
      memberCount: rows.length,
      totalSavings: rows.reduce(
        (sum, row) => sum + toNumber(row.total_savings_balance),
        0
      ),
      totalLoanOutstanding: rows.reduce(
        (sum, row) => sum + toNumber(row.total_loan_outstanding),
        0
      ),
      totalNetPosition: rows.reduce(
        (sum, row) => sum + toNumber(row.net_position),
        0
      ),
    }
  }, [rows])

  const statuses = useMemo(() => {
    const fixedStatuses = ['ACTIVE', 'INACTIVE']
    return fixedStatuses
  }, [])

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
            <h1 style={styles.title}>Members Directory</h1>
            <p style={styles.subtitle}>
              View all customers, filter by park, and check balances in one place
            </p>
          </div>
        </div>

        <section style={styles.sectionCard}>
          <div style={styles.filtersGrid}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>Search</label>
              <input
                style={styles.input}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, member code, phone, or park"
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Park</label>
              <select
                value={selectedPark}
                onChange={(e) => setSelectedPark(e.target.value)}
                style={styles.input}
              >
                <option value="ALL">All Parks</option>
                {parks.map((park) => (
                  <option key={park.id} value={park.id}>
                    {park.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={styles.input}
              >
                <option value="ALL">All Statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.actionsRow}>
            <div style={styles.actionButtonsWrap}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={refreshAll}
                disabled={loading || loadingMore || loadingAll}
              >
                Refresh
              </button>

              <button
                type="button"
                style={{
                  ...styles.primaryOutlineButton,
                  opacity: loadingAll ? 0.7 : 1,
                  cursor: loadingAll ? 'not-allowed' : 'pointer',
                }}
                onClick={loadAllMembers}
                disabled={loading || loadingMore || loadingAll}
              >
                {loadingAll ? 'Loading all members...' : 'Load All Members'}
              </button>
            </div>

            <p style={styles.smallMutedText}>
              Loaded: {rows.length}
              {loadedAll
                ? ' • Full list loaded'
                : hasMore
                ? ' • More available'
                : ' • End of list'}
            </p>
          </div>
        </section>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}

        <section style={styles.cardGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Shown</p>
            <h2 style={styles.statValue}>{totals.memberCount}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Loaded</p>
            <h2 style={styles.statValue}>{rows.length}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Savings Balance</p>
            <h2 style={styles.statValue}>{money(totals.totalSavings)}</h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Loan Outstanding</p>
            <h2 style={{ ...styles.statValue, color: '#b42318' }}>
              {money(totals.totalLoanOutstanding)}
            </h2>
          </div>

          <div style={styles.statCard}>
            <p style={styles.statLabel}>Net Position</p>
            <h2
              style={{
                ...styles.statValue,
                color:
                  totals.totalNetPosition < 0
                    ? '#b42318'
                    : totals.totalNetPosition > 0
                    ? '#027a48'
                    : '#2d1b69',
              }}
            >
              {money(totals.totalNetPosition)}
            </h2>
          </div>
        </section>

        <section style={styles.sectionCard}>
          {loading ? (
            <p style={styles.noteText}>Loading members...</p>
          ) : !rows.length ? (
            <p style={styles.noteText}>No members found.</p>
          ) : (
            <>
              <div style={styles.memberList}>
                {rows.map((row) => (
                  <div key={row.member_id} style={styles.memberCard}>
                    <div style={styles.memberTop}>
                      <div>
                        <div style={styles.memberName}>{row.full_name || '-'}</div>
                        <div style={styles.memberMeta}>
                          {row.member_code || '-'} • {row.park_name || '-'}
                        </div>
                      </div>

                      <div
                        style={{
                          ...styles.statusBadge,
                          background:
                            String(row.member_status || '').toLowerCase() === 'active'
                              ? '#ecfdf3'
                              : '#f2f4f7',
                          color:
                            String(row.member_status || '').toLowerCase() === 'active'
                              ? '#027a48'
                              : '#475467',
                        }}
                      >
                        {row.member_status || 'Unknown'}
                      </div>
                    </div>

                    <div style={styles.memberInfoGrid}>
                      <InfoMini label="Phone" value={row.phone || '-'} />
                      <InfoMini label="Savings" value={money(row.total_savings_balance)} />
                      <InfoMini label="Loan" value={money(row.total_loan_outstanding)} />
                      <InfoMini
                        label="Net Position"
                        value={money(row.net_position)}
                        color={
                          toNumber(row.net_position) < 0
                            ? '#b42318'
                            : toNumber(row.net_position) > 0
                            ? '#027a48'
                            : '#2d1b69'
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              {!loadedAll && hasMore ? (
                <div style={styles.loadMoreWrap}>
                  <button
                    type="button"
                    style={styles.loadMoreButton}
                    onClick={handleLoadMore}
                    disabled={loadingMore || loadingAll}
                  >
                    {loadingMore ? 'Loading more...' : 'Load More'}
                  </button>
                </div>
              ) : (
                <div style={styles.loadMoreWrap}>
                  <p style={styles.noteText}>
                    {loadedAll
                      ? 'Full member list has been loaded.'
                      : 'You have reached the end of the list.'}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function InfoMini({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div style={styles.infoMini}>
      <p style={styles.infoMiniLabel}>{label}</p>
      <p style={{ ...styles.infoMiniValue, color: color || '#2d1b69' }}>{value}</p>
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
    maxWidth: '1200px',
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
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '12px',
  },
  fieldBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
  actionsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '16px',
  },
  actionButtonsWrap: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  secondaryButton: {
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryOutlineButton: {
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid #4b2e83',
    background: '#f8f5fd',
    color: '#4b2e83',
    fontSize: '14px',
    fontWeight: 800,
  },
  smallMutedText: {
    margin: 0,
    color: '#7a7191',
    fontSize: '13px',
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
    color: '#2d1b69',
    lineHeight: 1.2,
    wordBreak: 'break-word',
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
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
  memberList: {
    display: 'grid',
    gap: '12px',
  },
  memberCard: {
    border: '1px solid #ece7f7',
    borderRadius: '16px',
    padding: '14px',
    background: '#fcfbff',
  },
  memberTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '14px',
  },
  memberName: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#2d1b69',
  },
  memberMeta: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
    fontWeight: 700,
    lineHeight: 1.4,
  },
  statusBadge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  memberInfoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px',
  },
  infoMini: {
    minWidth: 0,
  },
  infoMiniLabel: {
    margin: 0,
    fontSize: '11px',
    color: '#7a7191',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  infoMiniValue: {
    margin: '4px 0 0',
    fontSize: '14px',
    fontWeight: 700,
    wordBreak: 'break-word',
  },
  loadMoreWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '18px',
  },
  loadMoreButton: {
    padding: '12px 18px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontSize: '14px',
    fontWeight: 800,
    cursor: 'pointer',
  },
}