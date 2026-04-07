'use client'

import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/auth'

export default function ActivityHeartbeat() {
  useEffect(() => {
    let stopped = false

    async function ping() {
      if (stopped) return

      const session = getSession()
      const staffCode = session?.staff_code

      if (!staffCode) return

      const { data, error } = await supabase.rpc('touch_staff_activity', {
        p_staff_code: staffCode,
      })

      console.log('heartbeat staffCode:', staffCode)
      console.log('heartbeat data:', data)
      console.log('heartbeat error:', error)
    }

    ping()
    const interval = setInterval(ping, 60000)

    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [])

  return null
}