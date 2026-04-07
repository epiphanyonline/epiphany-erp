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
    const session = getSession()

    if (!session) {
      setStaff(null)
      setLoading(false)
      return
    }

    const mappedStaff: CurrentStaff = {
      id: session.staff_id,
      staff_code: session.staff_code,
      full_name: session.full_name,
      role: session.role,
      is_active: session.is_active,
    }

    if (mappedStaff.is_active) {
      setStaff(mappedStaff)
    } else {
      setStaff(null)
    }

    setLoading(false)
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