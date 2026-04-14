'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../../lib/supabase'
import { useCurrentStaff } from '../../../lib/useCurrentStaff'

type MemberSearchRow = {
  id: string
  member_code: string
  full_name: string
  phone: string | null
  status: string | null
  main_park_id: string | null
  specific_park: string | null
  park_name: string | null
}

type ParkOption = {
  id: string
  name: string
}

type UpdateResultRow = {
  success: boolean
  message: string
}

type DeleteResultRow = {
  success: boolean
  message: string
  deleted_member_id: string | null
  deleted_member_code: string | null
  deleted_member_name: string | null
}

export default function EditMembersPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [parks, setParks] = useState<ParkOption[]>([])
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [memberResults, setMemberResults] = useState<MemberSearchRow[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberSearchRow | null>(null)

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [parkId, setParkId] = useState('')
  const [specificPark, setSpecificPark] = useState('')
  const [status, setStatus] = useState('ACTIVE')

  const [saving, setSaving] = useState(false)
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)

  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [changeReason, setChangeReason] = useState('')

  const canAccess = useMemo(() => {
    return ['admin', 'supervisor'].includes(String(staff?.role || '').toLowerCase())
  }, [staff])

  useEffect(() => {
    if (!staffLoading && !staff) {
      window.location.href = '/login'
    }
  }, [staffLoading, staff])

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

  useEffect(() => {
    async function searchMembers() {
      const q = search.trim()
      if (q.length < 2) {
        setMemberResults([])
        return
      }

      setSearching(true)
      setErrorText('')
      setSuccessText('')

      const { data, error } = await supabase
        .from('vw_member_directory')
        .select(`
          member_id,
          member_code,
          full_name,
          phone,
          member_status,
          main_park_id,
          park_name
        `)
        .or(
          `member_code.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%,park_name.ilike.%${q}%`
        )
        .order('full_name', { ascending: true })
        .limit(20)

      if (error) {
        setMemberResults([])
        setSearching(false)
        return
      }

      const mapped: MemberSearchRow[] = ((data || []) as any[]).map((row) => ({
        id: row.member_id,
        member_code: row.member_code,
        full_name: row.full_name,
        phone: row.phone,
        status: row.member_status,
        main_park_id: row.main_park_id,
        specific_park: null,
        park_name: row.park_name,
      }))

      if (!mapped.length) {
        setMemberResults([])
        setSearching(false)
        return
      }

      const ids = mapped.map((m) => m.id)

      const { data: membersData } = await supabase
        .from('members')
        .select('id, specific_park')
        .in('id', ids)

      const specificParkMap = Object.fromEntries(
        ((membersData as { id: string; specific_park: string | null }[]) || []).map((row) => [
          row.id,
          row.specific_park || '',
        ])
      )

      setMemberResults(
        mapped.map((row) => ({
          ...row,
          specific_park: specificParkMap[row.id] || '',
        }))
      )
      setSearching(false)
    }

    const timeout = setTimeout(searchMembers, 300)
    return () => clearTimeout(timeout)
  }, [search])

  function selectMember(member: MemberSearchRow) {
    setSelectedMember(member)
    setFullName(member.full_name || '')
    setPhone(member.phone || '')
    setParkId(member.main_park_id || '')
    setSpecificPark(member.specific_park || '')
    setStatus(member.status || 'ACTIVE')
    setSearch(`${member.full_name} (${member.member_code})`)
    setMemberResults([])
    setErrorText('')
    setSuccessText('')
  }

  function clearSelectedMember() {
    setSelectedMember(null)
    setFullName('')
    setPhone('')
    setParkId('')
    setSpecificPark('')
    setStatus('ACTIVE')
    setSearch('')
    setMemberResults([])
    setErrorText('')
    setSuccessText('')
  }

  async function handleSave() {
    if (!staff || !selectedMember) return

    setSaving(true)
    setErrorText('')
    setSuccessText('')

    const { data, error } = await supabase.rpc('admin_supervisor_update_member_details', {
      p_requesting_staff_code: staff.staff_code,
      p_member_id: selectedMember.id,
      p_full_name: fullName,
      p_phone: phone,
      p_park_id: parkId || null,
      p_specific_park: specificPark || null,
      p_status: status,
      p_change_reason: changeReason || null,
    })

    setChangeReason('')

    if (error) {
      setErrorText(error.message || 'Failed to update member.')
      setSaving(false)
      return
    }

    const result = data?.[0] as UpdateResultRow | undefined

    if (!result?.success) {
      setErrorText(result?.message || 'Member update failed.')
      setSaving(false)
      return
    }

    const selectedPark = parks.find((park) => park.id === parkId)

    const updatedMember: MemberSearchRow = {
      ...selectedMember,
      full_name: fullName,
      phone: phone || null,
      status,
      main_park_id: parkId || null,
      specific_park: specificPark || null,
      park_name: selectedPark?.name || selectedMember.park_name,
    }

    setSelectedMember(updatedMember)
    setSuccessText(result.message || 'Member updated successfully.')
    setSearch(`${updatedMember.full_name} (${updatedMember.member_code})`)
    setSaving(false)
  }

  async function handleDeleteDuplicateMember(member: MemberSearchRow) {
    if (!staff?.staff_code) {
      setErrorText('No logged in staff found.')
      return
    }

    setErrorText('')
    setSuccessText('')

    const pin = window.prompt(`Enter your PIN to delete ${member.full_name || 'this member'}:`)
    if (!pin) return

    const reason = window.prompt('Enter reason for deleting this duplicate member:')
    if (!reason || !reason.trim()) {
      setErrorText('Delete reason is required.')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${member.full_name || 'this member'} (${member.member_code})?\n\nThis should only be used for duplicate members with no transaction, loan, or savings history.`
    )
    if (!confirmed) return

    try {
      setDeletingMemberId(member.id)

      const { data, error } = await supabase.rpc('delete_duplicate_member', {
        p_requesting_staff_code: staff.staff_code,
        p_member_id: member.id,
        p_login_pin: pin,
        p_reason: reason.trim(),
      })

      if (error) {
        setErrorText(error.message || 'Failed to delete member.')
        return
      }

      const result = data?.[0] as DeleteResultRow | undefined

      if (!result?.success) {
        setErrorText(result?.message || 'Delete failed.')
        return
      }

      setSuccessText(result.message || 'Duplicate member deleted successfully.')

      if (selectedMember?.id === member.id) {
        clearSelectedMember()
      }

      setMemberResults((prev) => prev.filter((row) => row.id !== member.id))

      const q = search.trim()
      if (q && selectedMember?.id !== member.id) {
        setSearch(q)
      }
    } catch (err) {
      console.error(err)
      setErrorText('Something went wrong while deleting member.')
    } finally {
      setDeletingMemberId(null)
    }
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
          <div style={styles.errorBox}>
            Only ADMIN or SUPERVISOR can access member edit.
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Edit Member Details</h1>
            <p style={styles.subtitle}>
              Search for a member, update details, and save safely with duplicate checks
            </p>
          </div>

          <button style={styles.backButton} onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>

        <section style={styles.card}>
          <div style={styles.loggedInBox}>
            Signed in as <strong>{staff.full_name}</strong> ({staff.staff_code}) • {staff.role}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Search Member</label>
            <input
              style={styles.input}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setErrorText('')
                setSuccessText('')
                if (selectedMember) setSelectedMember(null)
              }}
              placeholder="Search by member code, full name, phone, or park"
            />

            {searching ? <p style={styles.helperText}>Searching members...</p> : null}

            {!selectedMember && memberResults.length > 0 ? (
              <div style={styles.searchResultsBox}>
                {memberResults.map((member) => (
                  <div key={member.id} style={styles.searchResultRow}>
                    <button
                      type="button"
                      style={styles.searchResultItem}
                      onClick={() => selectMember(member)}
                    >
                      <div style={styles.resultTitleRow}>
                        <strong>{member.full_name}</strong>
                        <span style={styles.mutedText}>({member.member_code})</span>
                      </div>
                      <div style={styles.smallText}>Phone: {member.phone || '-'}</div>
                      <div style={styles.smallText}>Park: {member.park_name || '-'}</div>
                      <div style={styles.smallText}>Status: {member.status || '-'}</div>
                    </button>

                    
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {selectedMember ? (
          <section style={styles.card}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Selected Member</h2>

              <div style={styles.actionGroup}>
                <button type="button" style={styles.secondaryButton} onClick={clearSelectedMember}>
                  Change Member
                </button>

                <button
                  type="button"
                  style={{
                    ...styles.deleteButton,
                    ...(deletingMemberId === selectedMember.id ? styles.deleteButtonDisabled : {}),
                  }}
                  onClick={() => handleDeleteDuplicateMember(selectedMember)}
                  disabled={deletingMemberId === selectedMember.id}
                >
                  {deletingMemberId === selectedMember.id ? 'Deleting...' : 'Delete Duplicate'}
                </button>
              </div>
            </div>

            <div style={styles.selectedMemberCard}>
              <p style={styles.memberHeadline}>
                <strong>{selectedMember.full_name}</strong> ({selectedMember.member_code})
              </p>
              <p style={styles.memberMeta}>
                Current Phone: {selectedMember.phone || '-'} • Current Park: {selectedMember.park_name || '-'} • Current Status: {selectedMember.status || '-'}
              </p>
            </div>

            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>Full Name</label>
                <input
                  style={styles.input}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Phone</label>
                <input
                  style={styles.input}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 08138974746"
                />
                <p style={styles.helperText}>
                  Duplicate phone checks will run before save.
                </p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Park</label>
                <select
                  style={styles.input}
                  value={parkId}
                  onChange={(e) => setParkId(e.target.value)}
                >
                  <option value="">Select park</option>
                  {parks.map((park) => (
                    <option key={park.id} value={park.id}>
                      {park.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Specific Park</label>
                <input
                  style={styles.input}
                  value={specificPark}
                  onChange={(e) => setSpecificPark(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Status</label>
                <select
                  style={styles.input}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Change Reason</label>
                <input
                  style={styles.input}
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="e.g. Corrected phone, park transfer, typo fix"
                />
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>
        ) : null}

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}
        {successText ? <div style={styles.successBox}>{successText}</div> : null}
      </div>
    </main>
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
    marginBottom: '20px',
  },
  loggedInBox: {
    marginBottom: '18px',
    padding: '12px 14px',
    borderRadius: '12px',
    background: '#f8f5fd',
    border: '1px solid #e8def8',
    color: '#4b2e83',
    fontSize: '14px',
    lineHeight: 1.5,
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
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
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
  searchResultRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'stretch',
    padding: '10px 12px',
    borderBottom: '1px solid #f0ebf9',
    background: '#fff',
  },
  searchResultItem: {
    flex: 1,
    textAlign: 'left',
    padding: '12px 14px',
    border: '1px solid #f0ebf9',
    borderRadius: '12px',
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
    padding: '16px',
    borderRadius: '14px',
    background: '#f8f5fd',
    border: '1px solid #e8def8',
    marginBottom: '16px',
  },
  memberHeadline: {
    margin: 0,
    fontSize: '16px',
    color: '#2d1b69',
  },
  memberMeta: {
    margin: '8px 0 0',
    fontSize: '13px',
    color: '#6b6480',
    lineHeight: 1.5,
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '18px',
  },
  actionGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center',
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
  deleteButton: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #dc2626',
    background: '#dc2626',
    color: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  deleteButtonDisabled: {
    background: '#f3a6a6',
    border: '1px solid #f3a6a6',
    cursor: 'not-allowed',
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
}