'use client'

import { useEffect, useState } from 'react'
import { getSession, type StaffSession } from './auth'

export type CurrentStaff = {
  id: string
  staff_code: string
  full_name: string
  role: string
  is_active: boolean
}

export function useCurrentStaff() {
  const [staff, setStaff] = useState<CurrentStaff | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const cached = getSession()
    if (!cached) {
      setStaff(null)
      setLoading(false)
      return
    }

    // Never trust cached staff codes or roles as an authorisation decision.
    // Validate the HttpOnly cookie with the database on every page load.
    async function validateStaffSession() {
      try {
        const response = await fetch('/api/staff-session', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error('Session invalid or unavailable')
        const data = await response.json() as { session?: {
          staff_id: string; staff_code: string; full_name: string;
          role: string; is_active: boolean
        }}
        const verified = data.session
        if (!verified?.staff_id || !verified.is_active) throw new Error('No active session')
        if (!cancelled) {
          setStaff({
            id: verified.staff_id,
            staff_code: verified.staff_code,
            full_name: verified.full_name,
            role: verified.role,
            is_active: verified.is_active,
          })
        }
      } catch {
        if (!cancelled) setStaff(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void validateStaffSession()
    return () => { cancelled = true }
  }, [])

  return {
    staffCode: staff?.staff_code || '',
    staff,
    loading,
    role: staff?.role || null,
    isAdmin: staff?.role === 'ADMIN',
    isSupervisor: staff?.role === 'SUPERVISOR',
    isOfficer: staff?.role === 'OFFICER',
    canDisburse: staff?.role === 'ADMIN' || staff?.role === 'SUPERVISOR',
    canWithdrawSavings: staff?.role === 'ADMIN' || staff?.role === 'SUPERVISOR',
    canUseSupervisorPages: staff?.role === 'ADMIN' || staff?.role === 'SUPERVISOR',
  }
}