'use client'

import { saveSession } from "@/lib/auth"
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

type LoginResult = {
  success: boolean
  message: string
  staff_id: string | null
  staff_code: string | null
  full_name: string | null
  role: string | null
  is_active: boolean | null
}

export default function LoginPage() {
  const [staffCode, setStaffCode] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorText('')

    if (!staffCode.trim()) {
      setErrorText('Staff code is required.')
      setLoading(false)
      return
    }

    if (!pin.trim()) {
      setErrorText('PIN is required.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc('verify_staff_login', {
      p_staff_code: staffCode.trim(),
      p_pin: pin.trim(),
    })

    console.log('login data:', data)
    console.log('login error:', error)

    if (error) {
      setErrorText(error.message)
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      setErrorText('No response returned from login function.')
      setLoading(false)
      return
    }

    const result = data[0] as LoginResult

    if (!result.success) {
      setErrorText(result.message || 'Login failed.')
      setLoading(false)
      return
    }
localStorage.removeItem('epiphany_staff_code')
localStorage.removeItem('epiphany_staff_profile')

    saveSession({
      staff_id: result.staff_id || '',
      staff_code: result.staff_code || '',
      full_name: result.full_name || '',
      role: result.role || '',
      is_active: result.is_active ?? false,
      logged_in_at: new Date().toISOString(),
    })

    window.location.href = '/'
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Staff Login</h1>
        <p style={styles.subtitle}>Sign in to continue to Epiphany ERP</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Staff Code</label>
            <input
              style={styles.input}
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value)}
              placeholder="e.g. EC00001"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>PIN</label>
            <input
              style={styles.input}
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
            />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        {errorText ? <div style={styles.errorBox}>{errorText}</div> : null}
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f6f4fb',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#fff',
    borderRadius: '18px',
    padding: '28px',
    border: '1px solid #ece7f7',
    boxShadow: '0 10px 30px rgba(66, 37, 105, 0.08)',
  },
  title: {
    margin: 0,
    fontSize: '30px',
    color: '#4b2e83',
  },
  subtitle: {
    marginTop: '8px',
    marginBottom: '24px',
    color: '#6b6480',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
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
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid #d7cdee',
    fontSize: '14px',
    outline: 'none',
  },
  button: {
    marginTop: '8px',
    padding: '12px 16px',
    border: 'none',
    borderRadius: '12px',
    background: '#4b2e83',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  errorBox: {
    marginTop: '16px',
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '14px',
  },
}