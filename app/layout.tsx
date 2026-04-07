'use client'

import './globals.css'
import { useEffect, useMemo, useState } from 'react'
import { clearSession, getSession, type StaffSession } from '../lib/auth'
import ActivityHeartbeat from '../components/ActivityHeartbeat'

type NavItemType = {
  href: string
  label: string
  show: boolean
}

function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      onClick={() => {
        clearSession()
        window.location.href = '/login'
      }}
      style={compact ? styles.logoutButtonCompact : styles.logoutButton}
    >
      Logout
    </button>
  )
}

function NavItem({
  href,
  label,
  mobile = false,
  onNavigate,
}: {
  href: string
  label: string
  mobile?: boolean
  onNavigate?: () => void
}) {
  return (
    <button
      onClick={() => {
        if (onNavigate) onNavigate()
        window.location.href = href
      }}
      style={mobile ? styles.mobileNavItem : styles.navItem}
    >
      {label}
    </button>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [staff, setStaff] = useState<StaffSession | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const syncSession = () => {
      const latestSession = getSession()
      setStaff(latestSession)
      setCheckingSession(false)
    }

    const handleResize = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (!mobile) setMobileMenuOpen(false)
    }

    syncSession()
    handleResize()

    window.addEventListener('focus', syncSession)
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('focus', syncSession)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const isLoggedIn = !!staff
  const isAdmin = staff?.role === 'ADMIN'
  const isSupervisor = staff?.role === 'SUPERVISOR'
  const canUseSupervisorPages = isAdmin || isSupervisor
  const canDisburse = isAdmin || isSupervisor
  const canWithdrawSavings = isAdmin || isSupervisor

  const navItems: NavItemType[] = useMemo(
  () => [
    { href: '/', label: 'Home', show: true },

    // 👇 MEMBERS SECTION
    { href: '/members', label: 'Members', show: true },
    {
      href: '/members/edit',
      label: 'Member Management',
      show: !!canUseSupervisorPages, // 👈 Admin + Supervisor only
    },

    // 👇 OPERATIONS
    { href: '/disbursement', label: 'Disburse', show: !!canDisburse },
    { href: '/repayments', label: 'Repayment', show: true },
    { href: '/savings/deposit', label: 'Deposit', show: true },
    { href: '/savings/withdrawal', label: 'Withdraw', show: !!canWithdrawSavings },

    // 👇 COLLECTIONS / MONITORING
    { href: '/collections', label: 'Collections', show: true },
    { href: '/overdue', label: 'Overdue', show: !!canUseSupervisorPages },

    // 👇 SUPERVISOR TOOLS
    { href: '/supervisor', label: 'Supervisor', show: !!canUseSupervisorPages },
    { href: '/daily-closure', label: 'Daily Closure', show: !!canUseSupervisorPages },

    // 👇 REPORTING
    { href: '/account-summary', label: 'Account Summary', show: true },
    { href: '/account-summary/all', label: 'All Summaries', show: !!canUseSupervisorPages },
    { href: '/transactions', label: 'Transactions', show: true },

    // 👇 FINANCIAL CONTROL
    { href: '/profit', label: 'Profit', show: isSupervisor },
    { href: '/profit/all', label: 'All Profit', show: isSupervisor },

    // 👇 ADMIN TOOLS
    { href: '/bulk-upload', label: 'Bulk Upload', show: isSupervisor },
    { href: '/bulk-membership', label: 'Bulk Members', show: isSupervisor },
    { href: '/bulk-upload/exceptions', label: 'Upload Exceptions', show: isSupervisor },
  ],
  [canDisburse, canWithdrawSavings, canUseSupervisorPages, isSupervisor]
)
  return (
    <html lang="en">
      <body style={styles.body}>
        {!checkingSession && isLoggedIn ? <ActivityHeartbeat /> : null}

        {!checkingSession && isLoggedIn ? (
          <header style={styles.header}>
            <div style={isMobile ? styles.headerMobileTop : styles.headerTop}>
              <div style={styles.brandBlock}>
                <span style={isMobile ? styles.logoMobile : styles.logo}>Epiphany ERP</span>
                <span style={isMobile ? styles.sessionMobile : styles.sessionText}>
                  {staff.full_name} ({staff.staff_code}) • {staff.role}
                </span>
              </div>

              <div style={styles.headerRight}>
                {isMobile ? (
                  <>
                    <button
                      style={styles.menuButton}
                      onClick={() => setMobileMenuOpen((prev) => !prev)}
                    >
                      {mobileMenuOpen ? 'Close' : 'Menu'}
                    </button>
                    <LogoutButton compact />
                  </>
                ) : (
                  <LogoutButton />
                )}
              </div>
            </div>

            {!isMobile ? (
              <div style={styles.desktopNavWrap}>
                <nav style={styles.nav}>
                  {navItems
                    .filter((item) => item.show)
                    .map((item) => (
                      <NavItem key={item.href} href={item.href} label={item.label} />
                    ))}
                </nav>
              </div>
            ) : null}

            {isMobile && mobileMenuOpen ? (
              <div style={styles.mobileMenuPanel}>
                {navItems
                  .filter((item) => item.show)
                  .map((item) => (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      mobile
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  ))}
              </div>
            ) : null}
          </header>
        ) : null}

        <div style={isMobile ? styles.pageContentMobile : styles.pageContent}>
          {children}
        </div>
      </body>
    </html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    fontFamily: 'Arial, sans-serif',
    background: '#f6f4fb',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    background: '#ffffff',
    borderBottom: '1px solid #ece7f7',
    boxShadow: '0 4px 12px rgba(66, 37, 105, 0.06)',
  },
  headerTop: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '12px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
  },
  headerMobileTop: {
    maxWidth: '430px',
    margin: '0 auto',
    padding: '10px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  brandBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  logo: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#4b2e83',
  },
  logoMobile: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#4b2e83',
  },
  sessionText: {
    color: '#6b6480',
    fontSize: '13px',
  },
  sessionMobile: {
    color: '#6b6480',
    fontSize: '12px',
    lineHeight: 1.35,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  logoutButton: {
    padding: '8px 12px',
    borderRadius: '10px',
    border: 'none',
    background: '#fef3f2',
    color: '#b42318',
    cursor: 'pointer',
    fontWeight: 700,
  },
  logoutButtonCompact: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: 'none',
    background: '#fef3f2',
    color: '#b42318',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '13px',
  },
  menuButton: {
    padding: '8px 10px',
    borderRadius: '10px',
    border: '1px solid #d7cdee',
    background: '#fff',
    color: '#4b2e83',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '13px',
  },
  desktopNavWrap: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '0 24px 12px',
  },
  nav: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  navItem: {
    border: 'none',
    background: '#f3effb',
    padding: '8px 12px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    color: '#4b2e83',
  },
  mobileMenuPanel: {
    maxWidth: '430px',
    margin: '0 auto 10px',
    padding: '0 16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  mobileNavItem: {
    border: '1px solid #ece7f7',
    background: '#ffffff',
    padding: '12px 14px',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 700,
    color: '#4b2e83',
    textAlign: 'left',
    boxShadow: '0 6px 16px rgba(66, 37, 105, 0.05)',
  },
  pageContent: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '24px',
  },
  pageContentMobile: {
    maxWidth: '430px',
    margin: '0 auto',
    padding: '16px',
  },
}