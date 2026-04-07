export type StaffSession = {
  staff_id: string
  staff_code: string
  full_name: string
  role: string
  is_active: boolean
  logged_in_at: string
}

const SESSION_KEY = "epiphany_session"

export function saveSession(session: StaffSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function getSession(): StaffSession | null {
  if (typeof window === "undefined") return null

  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('epiphany_staff_code')
  localStorage.removeItem('epiphany_staff_profile')
}

export function isAuthenticated() {
  return !!getSession()
}