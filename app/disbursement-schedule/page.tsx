'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type BatchRow = {
  id: string
  batch_ref: string
  business_date: string
  park_id: string | null
  park_name: string | null
  created_by_staff_id: string
  created_by_staff_code: string
  created_by_staff_name: string
  status: string
  submitted_at: string | null
  approved_at: string | null
  approved_by_staff_code: string | null
  approved_by_staff_name: string | null
  total_requested_amount: number | null
  total_approved_amount: number | null
  line_count: number | null
  created_at: string
  updated_at: string
}

type LineRow = {
  id: string
  line_ref: string
  batch_id: string
  member_id: string
  member_code: string
  member_name_snapshot: string
  phone_snapshot: string | null
  park_id: string | null
  park_name_snapshot: string | null
  requesting_staff_id: string
  requesting_staff_code: string
  requesting_staff_name: string
  proposed_amount: number
  approved_amount: number | null
  tenure_days: number
  status: string
  request_note: string | null
  supervisor_note: string | null
  decline_reason: string | null
  posted: boolean
  posted_at: string | null
  posted_tx_ref: string | null
  posted_loan_account_id: string | null
  posting_message: string | null
  business_date: string
  created_at: string
  updated_at: string
}

type MemberSearchRow = {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  main_park_id: string | null
  specific_park: string | null
  park_name?: string | null
}

type CreateBatchResult = {
  success: boolean
  message: string
  batch_id: string | null
  batch_ref: string | null
}

type GenericLineResult = {
  success: boolean
  message: string
  line_id: string | null
  line_ref: string | null
}

type GenericBatchResult = {
  success: boolean
  message: string
  deleted_batch_id?: string | null
  deleted_batch_ref?: string | null
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

export default function DisbursementSchedulePage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [batches, setBatches] = useState<BatchRow[]>([])
  const [selectedBatch, setSelectedBatch] = useState<BatchRow | null>(null)
  const [lines, setLines] = useState<LineRow[]>([])

  const [loadingBatches, setLoadingBatches] = useState(true)
  const [loadingLines, setLoadingLines] = useState(false)
  const [busy, setBusy] = useState(false)

  const [staffRole, setStaffRole] = useState('')
  const [staffParkId, setStaffParkId] = useState<string | null>(null)
  const [staffParkName, setStaffParkName] = useState('Assigned Park')
  const [scopeLoading, setScopeLoading] = useState(true)

  const [newBatchDate, setNewBatchDate] = useState(getTodayDateString())

  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<MemberSearchRow[]>([])
  const [searchingMembers, setSearchingMembers] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MemberSearchRow | null>(null)

  const [proposedAmount, setProposedAmount] = useState('')
  const [tenureDays, setTenureDays] = useState('30')
  const [requestNote, setRequestNote] = useState('')

  const [editingLineId, setEditingLineId] = useState<string | null>(null)

  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const canAccess =
    ['OFFICER', 'SUPERVISOR', 'ADMIN'].includes(String(staffRole || '').toUpperCase())

  const canManageAll =
    ['SUPERVISOR', 'ADMIN'].includes(String(staffRole || '').toUpperCase())

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

  const loadStaffScope = useCallback(async () => {
    if (!staff?.staff_code) {
      setScopeLoading(false)
      return
    }

    setScopeLoading(true)

    const { data, error } = await supabase
      .from('staff')
      .select(`
        role,
        park_id,
        parks(name)
      `)
      .eq('staff_code', staff.staff_code)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) {
      setStaffRole('')
      setStaffParkId(null)
      setStaffParkName('Assigned Park')
      setScopeLoading(false)
      return
    }

    const role = String((data as any).role || '').toUpperCase()
    const parkId = (data as any).park_id || null
    const parkName = (data as any)?.parks?.name || 'Assigned Park'

    setStaffRole(role)
    setStaffParkId(parkId)
    setStaffParkName(parkName)
    setScopeLoading(false)
  }, [staff])

  const loadBatches = useCallback(async () => {
    if (!staff?.staff_code) return

    setLoadingBatches(true)
    setActionError('')

    let query = supabase
      .from('vw_disbursement_schedule_my_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!canManageAll) {
      query = query.eq('created_by_staff_code', staff.staff_code)
    }

    const { data, error } = await query

    if (error) {
      setBatches([])
      setActionError(error.message || 'Failed to load batches.')
      setLoadingBatches(false)
      return
    }

    const rows = (data as BatchRow[]) || []
    setBatches(rows)

    setSelectedBatch((prev) => {
      if (!prev && rows.length > 0) return rows[0]
      if (prev) {
        const refreshed = rows.find((row) => row.id === prev.id)
        return refreshed || (rows[0] ?? null)
      }
      return prev
    })

    setLoadingBatches(false)
  }, [staff, canManageAll])

  const loadLines = useCallback(async (batchId: string) => {
    setLoadingLines(true)
    setActionError('')

    const { data, error } = await supabase
      .from('vw_disbursement_schedule_batch_lines')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true })

    if (error) {
      setLines([])
      setActionError(error.message || 'Failed to load batch lines.')
      setLoadingLines(false)
      return
    }

    setLines(((data as LineRow[]) || []).map((row) => ({
      ...row,
      proposed_amount: Number(row.proposed_amount || 0),
      approved_amount: row.approved_amount == null ? null : Number(row.approved_amount),
      tenure_days: Number(row.tenure_days || 0),
    })))
    setLoadingLines(false)
  }, [])

  useEffect(() => {
    if (!staffLoading && staff) {
      loadStaffScope()
    }
  }, [staffLoading, staff, loadStaffScope])

  useEffect(() => {
    if (!staffLoading && !scopeLoading && staff && canAccess) {
      loadBatches()
    }
  }, [staffLoading, scopeLoading, staff, canAccess, loadBatches])

  useEffect(() => {
    if (selectedBatch?.id) {
      loadLines(selectedBatch.id)
    } else {
      setLines([])
    }
  }, [selectedBatch, loadLines])

  useEffect(() => {
    async function searchMembers() {
      const q = memberSearch.trim()
      if (!q || q.length < 2 || !staff) {
        setMemberResults([])
        return
      }

      setSearchingMembers(true)

      let query = supabase
        .from('members')
        .select(`
          id,
          member_code,
          full_name,
          phone,
          main_park_id,
          specific_park
        `)
        .eq('status', 'ACTIVE')
        .or(`member_code.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('full_name', { ascending: true })
        .limit(10)

      if (!canManageAll && staffParkId) {
        query = query.eq('main_park_id', staffParkId)
      }

      const { data, error } = await query

      if (error || !data) {
        setMemberResults([])
        setSearchingMembers(false)
        return
      }

      const baseRows = (data as MemberSearchRow[]) || []
      const parkIds = Array.from(new Set(baseRows.map((row) => row.main_park_id).filter(Boolean))) as string[]

      let parksMap: Record<string, string> = {}

      if (parkIds.length) {
        const { data: parksData } = await supabase
          .from('parks')
          .select('id, name')
          .in('id', parkIds)

        parksMap = Object.fromEntries(
          (((parksData as { id: string; name: string | null }[]) || []).map((park) => [
            park.id,
            park.name || '',
          ]))
        )
      }

      setMemberResults(
        baseRows.map((row) => ({
          ...row,
          park_name: row.main_park_id ? parksMap[row.main_park_id] || null : null,
        }))
      )
      setSearchingMembers(false)
    }

    const timeout = setTimeout(searchMembers, 300)
    return () => clearTimeout(timeout)
  }, [memberSearch, staff, canManageAll, staffParkId])

  const currentBatchIsDraft = selectedBatch?.status === 'DRAFT'

  const batchTotals = useMemo(() => {
    return {
      lineCount: lines.length,
      totalRequested: lines.reduce((sum, row) => sum + Number(row.proposed_amount || 0), 0),
    }
  }, [lines])

  function clearLineForm() {
    setSelectedMember(null)
    setMemberSearch('')
    setMemberResults([])
    setProposedAmount('')
    setTenureDays('30')
    setRequestNote('')
    setEditingLineId(null)
  }

  function openLineForEdit(line: LineRow) {
    setEditingLineId(line.id)
    setSelectedMember({
      id: line.member_id,
      member_code: line.member_code,
      full_name: line.member_name_snapshot,
      phone: line.phone_snapshot,
      main_park_id: line.park_id,
      specific_park: null,
      park_name: line.park_name_snapshot || null,
    })
    setMemberSearch(`${line.member_name_snapshot} (${line.member_code})`)
    setMemberResults([])
    setProposedAmount(String(line.proposed_amount || ''))
    setTenureDays(String(line.tenure_days || '30'))
    setRequestNote(line.request_note || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleCreateBatch() {
    if (!staff?.staff_code) return

    setBusy(true)
    setActionError('')
    setActionMessage('')

    const { data, error } = await supabase.rpc('create_disbursement_schedule_batch', {
      p_staff_code: staff.staff_code,
      p_business_date: newBatchDate,
    })

    if (error) {
      setActionError(error.message || 'Failed to create batch.')
      setBusy(false)
      return
    }

    const result = data?.[0] as CreateBatchResult | undefined

    if (!result?.success || !result.batch_id) {
      setActionError(result?.message || 'Failed to create batch.')
      setBusy(false)
      return
    }

    setActionMessage(result.message || 'Batch created successfully.')
    await loadBatches()
    setBusy(false)
  }

  async function handleSaveLine() {
    if (!staff?.staff_code || !selectedBatch?.id || !selectedMember) return

    setBusy(true)
    setActionError('')
    setActionMessage('')

    const amount = Number(proposedAmount)
    const tenure = Number(tenureDays)

    if (!amount || amount <= 0) {
      setActionError('Proposed amount must be greater than zero.')
      setBusy(false)
      return
    }

    if (!tenure || tenure <= 0) {
      setActionError('Tenure days must be greater than zero.')
      setBusy(false)
      return
    }

    if (editingLineId) {
      const { data, error } = await supabase.rpc('update_disbursement_schedule_line', {
        p_line_id: editingLineId,
        p_staff_code: staff.staff_code,
        p_member_code: selectedMember.member_code,
        p_proposed_amount: amount,
        p_tenure_days: tenure,
        p_request_note: requestNote.trim() || null,
      })

      if (error) {
        setActionError(error.message || 'Failed to update schedule line.')
        setBusy(false)
        return
      }

      const result = data?.[0] as GenericLineResult | undefined

      if (!result?.success) {
        setActionError(result?.message || 'Failed to update schedule line.')
        setBusy(false)
        return
      }

      setActionMessage(result.message || 'Schedule line updated successfully.')
    } else {
      const { data, error } = await supabase.rpc('add_disbursement_schedule_line', {
        p_batch_id: selectedBatch.id,
        p_staff_code: staff.staff_code,
        p_member_code: selectedMember.member_code,
        p_proposed_amount: amount,
        p_tenure_days: tenure,
        p_request_note: requestNote.trim() || null,
      })

      if (error) {
        setActionError(error.message || 'Failed to add schedule line.')
        setBusy(false)
        return
      }

      const result = data?.[0] as GenericLineResult | undefined

      if (!result?.success) {
        setActionError(result?.message || 'Failed to add schedule line.')
        setBusy(false)
        return
      }

      setActionMessage(result.message || 'Schedule line added successfully.')
    }

    clearLineForm()
    await loadBatches()
    if (selectedBatch?.id) await loadLines(selectedBatch.id)
    setBusy(false)
  }

  async function handleRemoveLine(line: LineRow) {
    if (!staff?.staff_code) return

    const confirmed = window.confirm(
      `Remove ${line.member_name_snapshot} from this schedule?`
    )
    if (!confirmed) return

    setBusy(true)
    setActionError('')
    setActionMessage('')

    const { data, error } = await supabase.rpc('remove_disbursement_schedule_line', {
      p_line_id: line.id,
      p_staff_code: staff.staff_code,
    })

    if (error) {
      setActionError(error.message || 'Failed to remove schedule line.')
      setBusy(false)
      return
    }

    const result = data?.[0] as GenericLineResult | undefined

    if (!result?.success) {
      setActionError(result?.message || 'Failed to remove schedule line.')
      setBusy(false)
      return
    }

    setActionMessage(result.message || 'Schedule line removed successfully.')

    if (editingLineId === line.id) {
      clearLineForm()
    }

    await loadBatches()
    if (selectedBatch?.id) await loadLines(selectedBatch.id)
    setBusy(false)
  }

  async function handleSubmitBatch() {
    if (!staff?.staff_code || !selectedBatch?.id) return

    const confirmed = window.confirm(
      `Submit batch ${selectedBatch.batch_ref} for approval?`
    )
    if (!confirmed) return

    setBusy(true)
    setActionError('')
    setActionMessage('')

    const { data, error } = await supabase.rpc('submit_disbursement_schedule_batch', {
      p_batch_id: selectedBatch.id,
      p_staff_code: staff.staff_code,
    })

    if (error) {
      setActionError(error.message || 'Failed to submit batch.')
      setBusy(false)
      return
    }

    const result = data?.[0] as GenericBatchResult | undefined

    if (!result?.success) {
      setActionError(result?.message || 'Failed to submit batch.')
      setBusy(false)
      return
    }

    setActionMessage(result.message || 'Batch submitted successfully.')
    await loadBatches()
    setBusy(false)
  }

  async function handleDeleteEmptyBatch() {
    if (!staff?.staff_code || !selectedBatch?.id) return

    const confirmed = window.confirm(
      `Delete empty draft batch ${selectedBatch.batch_ref}?`
    )
    if (!confirmed) return

    setBusy(true)
    setActionError('')
    setActionMessage('')

    const deletingId = selectedBatch.id

    const { data, error } = await supabase.rpc('delete_disbursement_schedule_batch', {
      p_batch_id: deletingId,
      p_staff_code: staff.staff_code,
    })

    if (error) {
      setActionError(error.message || 'Failed to delete draft batch.')
      setBusy(false)
      return
    }

    const result = data?.[0] as GenericBatchResult | undefined

    if (!result?.success) {
      setActionError(result?.message || 'Failed to delete draft batch.')
      setBusy(false)
      return
    }

    setActionMessage(result.message || 'Draft batch deleted successfully.')
    setSelectedBatch(null)
    setLines([])
    clearLineForm()
    await loadBatches()
    setBusy(false)
  }

  if (staffLoading || scopeLoading) {
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
          <div style={styles.errorBox}>You do not have access to disbursement schedules.</div>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Disbursement Schedule</h1>
            <p style={styles.subtitle}>
              Raise member loan schedules for supervisor approval and automatic posting.
            </p>
          </div>

          <button
            style={styles.backButton}
            type="button"
            onClick={() => window.history.back()}
          >
            ← Back
          </button>
        </div>

        {actionMessage ? <div style={styles.successBox}>{actionMessage}</div> : null}
        {actionError ? <div style={styles.errorBox}>{actionError}</div> : null}

        <section style={styles.card}>
          <div style={styles.infoStrip}>
            <span>
              <strong>Signed in as:</strong> {staff.full_name} ({staff.staff_code})
            </span>
            <span>
              <strong>Role:</strong> {staffRole || '-'}
            </span>
            <span>
              <strong>Park:</strong> {staffParkName || '-'}
            </span>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Create New Batch</h2>
          </div>

          <div style={styles.formGrid}>
            <div style={styles.fieldBox}>
              <label style={styles.label}>Business Date</label>
              <input
                type="date"
                value={newBatchDate}
                onChange={(e) => setNewBatchDate(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBox}>
              <label style={styles.label}>Action</label>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleCreateBatch}
                disabled={busy}
              >
                {busy ? 'Working...' : 'Create Batch'}
              </button>
            </div>
          </div>
        </section>

        <section style={styles.gridTwo}>
          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>My Recent Batches</h2>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={loadBatches}
                disabled={loadingBatches || busy}
              >
                {loadingBatches ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {loadingBatches ? (
              <p style={styles.noteText}>Loading batches...</p>
            ) : !batches.length ? (
              <p style={styles.noteText}>No batches yet.</p>
            ) : (
              <div style={styles.batchList}>
                {batches.map((batch) => {
                  const active = selectedBatch?.id === batch.id

                  return (
                    <button
                      key={batch.id}
                      type="button"
                      style={{
                        ...styles.batchCard,
                        ...(active ? styles.batchCardActive : {}),
                      }}
                      onClick={() => {
                        setSelectedBatch(batch)
                        clearLineForm()
                      }}
                    >
                      <div style={styles.batchTopRow}>
                        <strong>{batch.batch_ref}</strong>
                        <span style={styles.badge}>{batch.status}</span>
                      </div>
                      <div style={styles.batchMeta}>Date: {batch.business_date}</div>
                      <div style={styles.batchMeta}>Lines: {batch.line_count || 0}</div>
                      <div style={styles.batchMeta}>
                        Requested: {money(batch.total_requested_amount)}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Batch Details</h2>
            </div>

            {!selectedBatch ? (
              <p style={styles.noteText}>Select a batch to continue.</p>
            ) : (
              <>
                <div style={styles.detailGrid}>
                  <InfoMini label="Batch Ref" value={selectedBatch.batch_ref} />
                  <InfoMini label="Business Date" value={selectedBatch.business_date} />
                  <InfoMini label="Status" value={selectedBatch.status} />
                  <InfoMini label="Park" value={selectedBatch.park_name || '-'} />
                  <InfoMini
                    label="Requested Total"
                    value={money(selectedBatch.total_requested_amount)}
                  />
                  <InfoMini label="Line Count" value={String(selectedBatch.line_count || 0)} />
                </div>

                <div style={styles.buttonRow}>
                  {currentBatchIsDraft ? (
                    <>
                      <button
                        type="button"
                        style={styles.primaryButton}
                        onClick={handleSubmitBatch}
                        disabled={busy || lines.length === 0}
                      >
                        Submit for Approval
                      </button>

                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={handleDeleteEmptyBatch}
                        disabled={busy || lines.length > 0}
                      >
                        Delete Empty Batch
                      </button>
                    </>
                  ) : (
                    <p style={styles.noteText}>
                      This batch is no longer editable because it is {selectedBatch.status.toLowerCase()}.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </section>

        {selectedBatch ? (
          <>
            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>
                  {editingLineId ? 'Edit Schedule Line' : 'Add Schedule Line'}
                </h2>
              </div>

              {!currentBatchIsDraft ? (
                <p style={styles.noteText}>Only draft batches can be edited.</p>
              ) : (
                <div style={styles.formGrid}>
                  <div style={{ ...styles.fieldBox, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>Search Member</label>
                    <input
                      style={styles.input}
                      value={memberSearch}
                      onChange={(e) => {
                        setMemberSearch(e.target.value)
                        setSelectedMember(null)
                      }}
                      placeholder={
                        canManageAll
                          ? 'Search member by name, code, or phone'
                          : 'Search member in your park'
                      }
                    />

                    {searchingMembers ? (
                      <p style={styles.noteText}>Searching members...</p>
                    ) : null}

                    {!selectedMember && memberResults.length > 0 ? (
                      <div style={styles.searchResultsBox}>
                        {memberResults.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            style={styles.searchResultItem}
                            onClick={() => {
                              setSelectedMember(member)
                              setMemberSearch(`${member.full_name} (${member.member_code})`)
                              setMemberResults([])
                            }}
                          >
                            <div style={styles.searchResultTitle}>
                              {member.full_name} ({member.member_code})
                            </div>
                            <div style={styles.searchResultMeta}>
                              {member.phone || '-'} • {member.park_name || member.specific_park || '-'}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {selectedMember ? (
                    <div style={{ ...styles.selectedMemberCard, gridColumn: '1 / -1' }}>
                      <div>
                        <div style={styles.selectedTitle}>Selected Member</div>
                        <div style={styles.selectedText}>
                          {selectedMember.full_name} ({selectedMember.member_code})
                        </div>
                        <div style={styles.selectedSubtext}>
                          Phone: {selectedMember.phone || '-'}
                        </div>
                        <div style={styles.selectedSubtext}>
                          Park: {selectedMember.park_name || selectedMember.specific_park || '-'}
                        </div>
                      </div>

                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => {
                          setSelectedMember(null)
                          setMemberSearch('')
                          setMemberResults([])
                        }}
                      >
                        Change Member
                      </button>
                    </div>
                  ) : null}

                  <div style={styles.fieldBox}>
                    <label style={styles.label}>Proposed Amount</label>
                    <input
                      type="number"
                      value={proposedAmount}
                      onChange={(e) => setProposedAmount(e.target.value)}
                      style={styles.input}
                      placeholder="e.g. 50000"
                    />
                  </div>

                  <div style={styles.fieldBox}>
                    <label style={styles.label}>Tenure Days</label>
                    <input
                      type="number"
                      value={tenureDays}
                      onChange={(e) => setTenureDays(e.target.value)}
                      style={styles.input}
                      placeholder="e.g. 30"
                    />
                  </div>

                  <div style={{ ...styles.fieldBox, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>Request Note</label>
                    <textarea
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      style={styles.textarea}
                      placeholder="Optional note for supervisor"
                    />
                  </div>

                  <div style={styles.buttonRow}>
                    <button
                      type="button"
                      style={styles.primaryButton}
                      onClick={handleSaveLine}
                      disabled={busy || !selectedMember}
                    >
                      {editingLineId ? 'Update Line' : 'Add Line'}
                    </button>

                    {(editingLineId || selectedMember || proposedAmount || requestNote) ? (
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={clearLineForm}
                        disabled={busy}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>

            <section style={styles.card}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Schedule Lines</h2>
                <p style={styles.noteText}>
                  {batchTotals.lineCount} lines • {money(batchTotals.totalRequested)} requested
                </p>
              </div>

              {loadingLines ? (
                <p style={styles.noteText}>Loading schedule lines...</p>
              ) : !lines.length ? (
                <p style={styles.noteText}>No lines in this batch yet.</p>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Member</th>
                        <th style={styles.th}>Phone</th>
                        <th style={styles.th}>Park</th>
                        <th style={styles.th}>Amount</th>
                        <th style={styles.th}>Tenure</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Note</th>
                        <th style={styles.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id}>
                          <td style={styles.td}>
                            {line.member_name_snapshot}
                            <div style={styles.subText}>{line.member_code}</div>
                          </td>
                          <td style={styles.td}>{line.phone_snapshot || '-'}</td>
                          <td style={styles.td}>{line.park_name_snapshot || '-'}</td>
                          <td style={styles.td}>{money(line.proposed_amount)}</td>
                          <td style={styles.td}>{line.tenure_days} days</td>
                          <td style={styles.td}>{line.status}</td>
                          <td style={styles.td}>{line.request_note || '-'}</td>
                          <td style={styles.td}>
                            {currentBatchIsDraft && line.status === 'PENDING' ? (
                              <div style={styles.inlineActions}>
                                <button
                                  type="button"
                                  style={styles.smallSecondaryButton}
                                  onClick={() => openLineForEdit(line)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  style={styles.smallDangerButton}
                                  onClick={() => handleRemoveLine(line)}
                                  disabled={busy}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : (
                              <span style={styles.disabledText}>Locked</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoMini}>
      <div style={styles.infoMiniLabel}>{label}</div>
      <div style={styles.infoMiniValue}>{value}</div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f4fb',
    padding: '16px',
    color: '#1f1b2d',
  },
  pageInner: {
    maxWidth: '1280px',
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
    marginBottom: '20px',
  },
  gridTwo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '14px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#2d1b69',
  },
  infoStrip: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    color: '#6b6480',
    fontSize: '14px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
  },
  fieldBox: {
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
  textarea: {
    width: '100%',
    minHeight: '96px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    outline: 'none',
    fontSize: '16px',
    background: '#fff',
    boxSizing: 'border-box',
    resize: 'vertical',
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
  smallSecondaryButton: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '12px',
  },
  smallDangerButton: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: 'none',
    background: '#fef3f2',
    color: '#b42318',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '12px',
  },
  successBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#ecfdf3',
    border: '1px solid #abefc6',
    color: '#027a48',
  },
  errorBox: {
    marginBottom: '18px',
    padding: '14px',
    borderRadius: '12px',
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
  },
  noteText: {
    color: '#6b6480',
    fontSize: '14px',
  },
  batchList: {
    display: 'grid',
    gap: '10px',
  },
  batchCard: {
    textAlign: 'left',
    padding: '14px',
    borderRadius: '14px',
    border: '1px solid #ece7f7',
    background: '#fcfbff',
    cursor: 'pointer',
  },
  batchCardActive: {
    border: '1px solid #4b2e83',
    background: '#f8f5fd',
  },
  batchTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '8px',
  },
  batchMeta: {
    fontSize: '13px',
    color: '#6b6480',
    marginTop: '4px',
  },
  badge: {
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    background: '#f2f4f7',
    color: '#475467',
    whiteSpace: 'nowrap',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
  },
  infoMini: {
    background: '#fcfbff',
    border: '1px solid #ece7f7',
    borderRadius: '12px',
    padding: '12px',
  },
  infoMiniLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#7a7191',
    fontWeight: 700,
  },
  infoMiniValue: {
    marginTop: '6px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#2d1b69',
    wordBreak: 'break-word',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '16px',
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
  searchResultTitle: {
    fontWeight: 700,
    color: '#2d1b69',
  },
  searchResultMeta: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
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
  selectedTitle: {
    fontSize: '13px',
    color: '#7a7191',
    marginBottom: '6px',
  },
  selectedText: {
    fontSize: '16px',
    color: '#2d1b69',
    fontWeight: 700,
  },
  selectedSubtext: {
    marginTop: '4px',
    fontSize: '13px',
    color: '#6b6480',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '980px',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    background: '#faf8fe',
    borderBottom: '1px solid #ece7f7',
    color: '#6b6480',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  td: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '1px solid #f1edf8',
    color: '#2d1b69',
    fontSize: '14px',
    verticalAlign: 'top',
  },
  subText: {
    marginTop: '4px',
    fontSize: '12px',
    color: '#7a7191',
  },
  inlineActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  disabledText: {
    color: '#9b93af',
    fontSize: '13px',
  },
}