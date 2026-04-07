'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type ParsedRow = {
  row_no: number
  raw_phone: string
  full_name: string
  park: string
}

type PreviewRow = ParsedRow & {
  normalized_phone: string
  normalized_name: string
  hasCoreData: boolean
}

type ParkOption = {
  id: string
  name: string
}

type ResultRow = {
  row_no?: number
  raw_phone?: string
  normalized_phone?: string
  full_name?: string
  normalized_name?: string
  park?: string
  matched_member_id?: string | null
  matched_member_code?: string | null
  matched_member_name?: string | null
  action?: string | null
  reason: string
}

type RpcResult = {
  success: boolean
  created_count: number
  existing_by_phone_count: number
  existing_by_name_park_count: number
  needs_review_count: number
  error_count: number
  created: ResultRow[]
  existing_by_phone: ResultRow[]
  existing_by_name_park: ResultRow[]
  needs_review: ResultRow[]
  errors: ResultRow[]
}

type RegisterState = {
  isOpen: boolean
  row: ResultRow | null
  fullName: string
  phone: string
  parkId: string
  specificPark: string
  categoryOfClient: string
  status: string
  loading: boolean
  message: string
  error: string
}

function normalizePhone(raw: string) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (/^234\d+$/.test(digits)) digits = digits.replace(/^234/, '')
  else if (/^0\d+$/.test(digits)) digits = digits.replace(/^0/, '')
  return digits
}

function normalizeName(raw: string) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function splitCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result.map((x) => x.trim())
}

export default function BulkMembershipPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [result, setResult] = useState<RpcResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [parks, setParks] = useState<ParkOption[]>([])

  const [registerState, setRegisterState] = useState<RegisterState>({
    isOpen: false,
    row: null,
    fullName: '',
    phone: '',
    parkId: '',
    specificPark: '',
    categoryOfClient: 'PARK TRANSPORTER',
    status: 'ACTIVE',
    loading: false,
    message: '',
    error: '',
  })

  const canAccess =
    ['admin', 'supervisor'].includes(String(staff?.role || '').toLowerCase())

  useEffect(() => {
    async function loadParks() {
      const { data } = await supabase
        .from('parks')
        .select('id, name')
        .order('name', { ascending: true })

      setParks((data as ParkOption[]) || [])
    }

    loadParks()
  }, [])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setErrorText('')
    setSuccessText('')
    setResult(null)
    setFileName(file.name)

    try {
      const text = await file.text()
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      const parsed: ParsedRow[] = []

      for (let i = 0; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i])

        if (i === 0) {
          const maybeHeader = cols.map((c) => c.toLowerCase())
          const headerLike =
            maybeHeader.some((c) => c.includes('phone')) ||
            maybeHeader.some((c) => c.includes('name')) ||
            maybeHeader.some((c) => c.includes('park'))

          if (headerLike) continue
        }

        const rawPhone = cols[0] || ''
        const fullName = cols[1] || ''
        const park = cols[2] || ''

        if (!rawPhone && !fullName && !park) continue

        parsed.push({
          row_no: parsed.length + 1,
          raw_phone: rawPhone,
          full_name: fullName,
          park,
        })
      }

      setRows(parsed)
      setSuccessText(`Loaded ${parsed.length} row(s) from ${file.name}`)
    } catch (err: any) {
      setRows([])
      setErrorText(err?.message || 'Failed to read file.')
    } finally {
      setLoading(false)
    }
  }

  const previewRows = useMemo<PreviewRow[]>(() => {
    return rows.map((row) => ({
      ...row,
      normalized_phone: normalizePhone(row.raw_phone),
      normalized_name: normalizeName(row.full_name),
      hasCoreData: !!(row.full_name || row.raw_phone || row.park),
    }))
  }, [rows])

  const previewTotals = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.rows += 1
        if (row.hasCoreData) acc.validRows += 1
        return acc
      },
      {
        rows: 0,
        validRows: 0,
      }
    )
  }, [previewRows])

  async function handlePost() {
    if (!staff || !canAccess) return
    if (!rows.length) {
      setErrorText('Please upload a CSV file first.')
      return
    }

    setPosting(true)
    setErrorText('')
    setSuccessText('')
    setResult(null)

    const payload = rows.map((row) => ({
      row_no: row.row_no,
      raw_phone: row.raw_phone,
      full_name: row.full_name,
      park: row.park,
    }))

    const { data, error } = await supabase.rpc('bulk_register_members_upload', {
      p_requesting_staff_code: staff.staff_code,
      p_rows: payload,
    })

    if (error) {
      setErrorText(error.message || 'Bulk membership upload failed.')
      setPosting(false)
      return
    }

    setResult(data as RpcResult)
    setSuccessText('Bulk membership upload completed.')
    setPosting(false)
  }

  function openRegisterModal(row: ResultRow) {
    const matchedPark = parks.find(
      (park) => park.name.trim().toLowerCase() === String(row.park || '').trim().toLowerCase()
    )

    setRegisterState({
      isOpen: true,
      row,
      fullName: row.full_name || '',
      phone: row.raw_phone || '',
      parkId: matchedPark?.id || '',
      specificPark: '',
      categoryOfClient: 'PARK TRANSPORTER',
      status: 'ACTIVE',
      loading: false,
      message: '',
      error: '',
    })
  }

  function closeRegisterModal() {
    setRegisterState({
      isOpen: false,
      row: null,
      fullName: '',
      phone: '',
      parkId: '',
      specificPark: '',
      categoryOfClient: 'PARK TRANSPORTER',
      status: 'ACTIVE',
      loading: false,
      message: '',
      error: '',
    })
  }

  async function handleRegisterMember() {
    if (!staff || !registerState.row) return

    setRegisterState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      message: '',
    }))

    const { data, error } = await supabase.rpc('register_bulk_membership_row', {
      p_requesting_staff_code: staff.staff_code,
      p_full_name: registerState.fullName,
      p_phone: registerState.phone,
      p_park_id: registerState.parkId,
      p_status: registerState.status,
      p_specific_park: registerState.specificPark,
      p_category_of_client: registerState.categoryOfClient,
    })

    if (error) {
      setRegisterState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to register member.',
      }))
      return
    }

    const rowResult = data?.[0]

    if (!rowResult?.success) {
      setRegisterState((prev) => ({
        ...prev,
        loading: false,
        error: rowResult?.message || 'Member registration failed.',
      }))
      return
    }

    setRegisterState((prev) => ({
      ...prev,
      loading: false,
      message: `${rowResult.full_name} registered successfully as ${rowResult.member_code}.`,
    }))

    setResult((prev) => {
      if (!prev || !registerState.row) return prev

      const sameRow = (item: ResultRow) =>
        Number(item.row_no || 0) === Number(registerState.row?.row_no || 0) &&
        (item.full_name || '').trim().toLowerCase() ===
          (registerState.row?.full_name || '').trim().toLowerCase() &&
        (item.raw_phone || '').trim() === (registerState.row?.raw_phone || '').trim() &&
        (item.park || '').trim().toLowerCase() ===
          (registerState.row?.park || '').trim().toLowerCase()

      return {
        ...prev,
        created_count: prev.created_count + 1,
        needs_review_count: Math.max(0, prev.needs_review_count - 1),
        created: [
          ...prev.created,
          {
            ...registerState.row,
            action: 'CREATED_MANUALLY',
            reason: 'Member registered manually from review queue.',
            matched_member_code: rowResult.member_code,
            matched_member_name: rowResult.full_name,
            matched_member_id: rowResult.member_id,
          },
        ],
        needs_review: prev.needs_review.filter((item) => !sameRow(item)),
      }
    })
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

  if (!canAccess) {
    return (
      <main style={styles.page}>
        <div style={styles.pageInner}>
          <div style={styles.errorBox}>Only ADMIN or SUPERVISOR can access this page.</div>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Bulk Membership Registration</h1>
            <p style={styles.subtitle}>
              Upload CSV with phone, full name, and park. Existing members are safely skipped.
            </p>
          </div>
        </div>

        <section style={styles.card}>
          <div style={styles.grid}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.infoStrip}>
            <span><strong>Check 1:</strong> normalized phone</span>
            <span><strong>Check 2:</strong> full name + park</span>
            <span><strong>Safeguard:</strong> ambiguous rows go to review</span>
          </div>
        </section>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}
        {successText ? <div style={styles.successBox}>{successText}</div> : null}

        <section style={styles.statGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Loaded Rows</p>
            <h2 style={styles.statValue}>{previewTotals.rows}</h2>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>Rows With Core Data</p>
            <h2 style={styles.statValue}>{previewTotals.validRows}</h2>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Preview</h2>
            <div style={styles.buttonRow}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setRows([])
                  setFileName('')
                  setResult(null)
                  setErrorText('')
                  setSuccessText('')
                }}
                disabled={loading || posting}
              >
                Clear
              </button>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handlePost}
                disabled={loading || posting || rows.length === 0}
              >
                {posting ? 'Processing...' : 'Process Upload'}
              </button>
            </div>
          </div>

          <p style={styles.noteText}>
            {fileName ? `Current file: ${fileName}` : 'No file selected yet.'}
          </p>

          {!previewRows.length ? (
            <p style={styles.noteText}>Upload a CSV to preview rows.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Row</th>
                    <th style={styles.th}>Phone</th>
                    <th style={styles.th}>Normalized Phone</th>
                    <th style={styles.th}>Full Name</th>
                    <th style={styles.th}>Normalized Name</th>
                    <th style={styles.th}>Park</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 100).map((row) => (
                    <tr key={row.row_no}>
                      <td style={styles.td}>{row.row_no}</td>
                      <td style={styles.td}>{row.raw_phone || '-'}</td>
                      <td style={styles.td}>{row.normalized_phone || '-'}</td>
                      <td style={styles.td}>{row.full_name || '-'}</td>
                      <td style={styles.td}>{row.normalized_name || '-'}</td>
                      <td style={styles.td}>{row.park || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {result ? (
          <>
            <section style={styles.statGrid}>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Created</p>
                <h2 style={styles.statValue}>{result.created_count}</h2>
              </div>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Existing By Phone</p>
                <h2 style={styles.statValue}>{result.existing_by_phone_count}</h2>
              </div>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Existing By Name + Park</p>
                <h2 style={styles.statValue}>{result.existing_by_name_park_count}</h2>
              </div>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Needs Review</p>
                <h2 style={styles.statValue}>{result.needs_review_count}</h2>
              </div>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Errors</p>
                <h2 style={styles.statValue}>{result.error_count}</h2>
              </div>
            </section>

            <ResultTable title="Created Members" rows={result.created} />
            <ResultTable title="Existing By Phone" rows={result.existing_by_phone} />
            <ResultTable title="Existing By Name + Park" rows={result.existing_by_name_park} />

            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Needs Review</h2>
              {!result.needs_review?.length ? (
                <p style={styles.noteText}>No review rows.</p>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Row</th>
                        <th style={styles.th}>Full Name</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Park</th>
                        <th style={styles.th}>Matched Member</th>
                        <th style={styles.th}>Reason</th>
                        <th style={styles.th}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.needs_review.map((item, index) => (
                        <tr key={`${item.full_name}-${index}`}>
                          <td style={styles.td}>{item.row_no || '-'}</td>
                          <td style={styles.td}>{item.full_name || '-'}</td>
                          <td style={styles.td}>{item.raw_phone || '-'}</td>
                          <td style={styles.td}>{item.park || '-'}</td>
                          <td style={styles.td}>
                            {item.matched_member_name || '-'}{' '}
                            {item.matched_member_code ? `(${item.matched_member_code})` : ''}
                          </td>
                          <td style={styles.td}>{item.reason}</td>
                          <td style={styles.td}>
                            <button
                              type="button"
                              style={styles.smallPrimaryButton}
                              onClick={() => openRegisterModal(item)}
                            >
                              Review / Register
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <ResultTable title="Errors" rows={result.errors} />
          </>
        ) : null}

        {registerState.isOpen ? (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Register Member From Review Queue</h2>
                <button type="button" style={styles.secondaryButton} onClick={closeRegisterModal}>
                  Close
                </button>
              </div>

              {registerState.error ? <div style={styles.errorBox}>{registerState.error}</div> : null}
              {registerState.message ? <div style={styles.successBox}>{registerState.message}</div> : null}

              <div style={styles.grid}>
                <div style={styles.fieldBox}>
                  <label style={styles.label}>Full Name</label>
                  <input
                    value={registerState.fullName}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Phone</label>
                  <input
                    value={registerState.phone}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Park</label>
                  <select
                    value={registerState.parkId}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, parkId: e.target.value }))
                    }
                    style={styles.input}
                  >
                    <option value="">Select park</option>
                    {parks.map((park) => (
                      <option key={park.id} value={park.id}>
                        {park.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Specific Park</label>
                  <input
                    value={registerState.specificPark}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, specificPark: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Category of Client</label>
                  <input
                    value={registerState.categoryOfClient}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, categoryOfClient: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldBox}>
                  <label style={styles.label}>Status</label>
                  <select
                    value={registerState.status}
                    onChange={(e) =>
                      setRegisterState((prev) => ({ ...prev, status: e.target.value }))
                    }
                    style={styles.input}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={handleRegisterMember}
                  disabled={registerState.loading}
                >
                  {registerState.loading ? 'Registering...' : 'Register Member'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}

function ResultTable({
  title,
  rows,
}: {
  title: string
  rows: ResultRow[]
}) {
  return (
    <section style={styles.card}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {!rows?.length ? (
        <p style={styles.noteText}>No rows.</p>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Row</th>
                <th style={styles.th}>Full Name</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Park</th>
                <th style={styles.th}>Matched Member</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={`${title}-${item.full_name}-${index}`}>
                  <td style={styles.td}>{item.row_no || '-'}</td>
                  <td style={styles.td}>{item.full_name || '-'}</td>
                  <td style={styles.td}>{item.raw_phone || '-'}</td>
                  <td style={styles.td}>{item.park || '-'}</td>
                  <td style={styles.td}>
                    {item.matched_member_name || '-'}{' '}
                    {item.matched_member_code ? `(${item.matched_member_code})` : ''}
                  </td>
                  <td style={styles.td}>{item.action || '-'}</td>
                  <td style={styles.td}>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    padding: '16px',
  },
  pageInner: {
    maxWidth: '1280px',
    margin: '0 auto',
  },
  headerRow: {
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '32px',
    fontWeight: 800,
    color: '#4b2e83',
  },
  subtitle: {
    margin: '8px 0 0',
    color: '#6b6480',
    fontSize: '15px',
  },
  card: {
    background: '#fff',
    borderRadius: '18px',
    padding: '18px',
    border: '1px solid #ece7f7',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
    marginBottom: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '12px',
  },
  fieldBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#4b2e83',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    fontSize: '15px',
    boxSizing: 'border-box',
  },
  infoStrip: {
    marginTop: '14px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    color: '#6b6480',
    fontSize: '14px',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  statCard: {
    background: '#fff',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid #ece7f7',
    boxShadow: '0 8px 24px rgba(66, 37, 105, 0.08)',
  },
  statLabel: {
    margin: 0,
    color: '#7a7191',
    fontSize: '13px',
  },
  statValue: {
    margin: '8px 0 0',
    color: '#2d1b69',
    fontSize: '24px',
    fontWeight: 800,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#2d1b69',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  primaryButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontWeight: 800,
    cursor: 'pointer',
  },
  smallPrimaryButton: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: 'none',
    background: '#4b2e83',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '12px',
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
  },
  successBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#ecfdf3',
    border: '1px solid #abefc6',
    color: '#027a48',
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
    padding: '12px',
    background: '#faf8fe',
    borderBottom: '1px solid #ece7f7',
    color: '#6b6480',
    fontSize: '13px',
  },
  td: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '1px solid #f1edf8',
    color: '#2d1b69',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000,
  },
  modalCard: {
    width: '100%',
    maxWidth: '900px',
    background: '#fff',
    borderRadius: '18px',
    padding: '18px',
    border: '1px solid #ece7f7',
    boxShadow: '0 20px 50px rgba(66, 37, 105, 0.2)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
}