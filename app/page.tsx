'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { getSession, type StaffSession } from '../lib/auth'

type ModuleCard = {
  title: string
  description: string
  href: string
  show: boolean
  accent: string
}

export default function HomePage() {
  const [staff, setStaff] = useState<StaffSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const session = getSession()

    if (!session) {
      window.location.href = '/login'
      return
    }

    setStaff(session)
    setLoading(false)

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  if (loading || !staff) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingWrap}>
          <p style={styles.loadingText}>Loading dashboard...</p>
        </div>
      </main>
    )
  }

  const canDisburse = staff.role === 'ADMIN' || staff.role === 'SUPERVISOR'
  const canWithdrawSavings =
    staff.role === 'ADMIN' || staff.role === 'SUPERVISOR'
  const canUseSupervisorPages =
    staff.role === 'ADMIN' || staff.role === 'SUPERVISOR'

  const modules: ModuleCard[] = [
    {
      title: 'Loan Repayment',
      description: 'Post daily loan repayments from the field.',
      href: '/repayments',
      show: true,
      accent: '#6f42c1',
    },
    {
      title: 'Savings Deposit',
      description: 'Post regular or compulsory savings deposits.',
      href: '/savings/deposit',
      show: true,
      accent: '#7b61ff',
    },
    {
      title: 'Savings Withdrawal',
      description: 'Post savings withdrawals for members.',
      href: '/savings/withdrawal',
      show: canWithdrawSavings,
      accent: '#9b59b6',
    },
    {
      title: 'Loan Disbursement',
      description: 'Disburse new loans for eligible members.',
      href: '/disbursement',
      show: canDisburse,
      accent: '#5b3cc4',
    },
    {
      title: 'Daily Collections',
      description: 'Track expected vs actual repayments for today.',
      href: '/collections',
      show: true,
      accent: '#8e44ad',
    },
    {
      title: 'Overdue Dashboard',
      description: 'View overdue loans and risk exposure.',
      href: '/overdue',
      show: canUseSupervisorPages,
      accent: '#7d3c98',
    },
    {
      title: 'Supervisor Dashboard',
      description: 'See park-level performance and collections.',
      href: '/supervisor',
      show: canUseSupervisorPages,
      accent: '#663399',
    },
    {
      title: 'Daily Closure',
      description: 'Close staff day and review variance.',
      href: '/daily-closure',
      show: canUseSupervisorPages,
      accent: '#5e35b1',
    },
    {
      title: 'Account Summary',
      description: 'View daily balancing, fees, expenses and remittance.',
      href: '/account-summary',
      show: true,
      accent: '#6a1b9a',
    },
    {
      title: 'Transaction History',
      description: 'View and filter previous posted transactions.',
      href: '/transactions',
      show: true,
      accent: '#512da8',
    },
  ]

  const visibleModules = modules.filter((module) => module.show)
  const firstName = staff.full_name.split(' ')[0]

  return (
    <main style={styles.page}>
      <section
        style={{
          ...styles.heroCard,
          ...(isMobile ? styles.heroCardMobile : {}),
        }}
      >
        <div
          style={{
            ...styles.heroContent,
            ...(isMobile ? styles.heroContentMobile : {}),
          }}
        >
          <div style={styles.heroTextBlock}>
            <div style={isMobile ? styles.badgeMobile : styles.badge}>
              Epiphany ERP Dashboard
            </div>

            <h1 style={isMobile ? styles.titleMobile : styles.title}>
              Welcome back, {firstName}
            </h1>

            <p style={isMobile ? styles.subtitleMobile : styles.subtitle}>
              Manage field operations, post transactions, and monitor activities from here.
            </p>

            <div
              style={{
                ...styles.metaRow,
                ...(isMobile ? styles.metaRowMobile : {}),
              }}
            >
              <div style={isMobile ? styles.metaPillMobile : styles.metaPill}>
                <span style={styles.metaLabel}>Role</span>
                <span style={styles.metaValue}>{staff.role}</span>
              </div>

              <div style={isMobile ? styles.metaPillMobile : styles.metaPill}>
                <span style={styles.metaLabel}>Staff Code</span>
                <span style={styles.metaValue}>{staff.staff_code}</span>
              </div>
            </div>
          </div>

          {!isMobile ? (
            <div style={styles.logoPanel}>
              <div style={styles.logoGlow} />
              <div style={styles.logoFrame}>
                <Image
                  src="/logo.png"
                  alt="Epiphany Logo"
                  width={180}
                  height={180}
                  style={styles.logoImage}
                  priority
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section
        style={{
          ...styles.quickStatsRow,
          ...(isMobile ? styles.quickStatsRowMobile : {}),
        }}
      >
        <div style={styles.statCard}>
          <p style={styles.statLabel}>Signed In User</p>
          <p style={styles.statValueSmall}>{staff.full_name}</p>
        </div>

        <div style={styles.statCard}>
          <p style={styles.statLabel}>Accessible Modules</p>
          <p style={styles.statValue}>{visibleModules.length}</p>
        </div>

        <div style={styles.statCard}>
          <p style={styles.statLabel}>Access Level</p>
          <p style={styles.statValueSmall}>
            {canUseSupervisorPages ? 'Supervisor Access' : 'Officer Access'}
          </p>
        </div>
      </section>

      <section style={styles.sectionHeader}>
        <div>
          <h2 style={isMobile ? styles.sectionTitleMobile : styles.sectionTitle}>
            Quick Actions
          </h2>
          <p style={styles.sectionSubtitle}>
            Open the tools you use most often.
          </p>
        </div>
      </section>

      <section
        style={{
          ...styles.grid,
          ...(isMobile ? styles.gridMobile : {}),
        }}
      >
        {visibleModules.map((module) => (
          <button
            key={module.href}
            style={{
              ...styles.card,
              ...(isMobile ? styles.cardMobile : {}),
              borderTop: `4px solid ${module.accent}`,
            }}
            onClick={() => {
              window.location.href = module.href
            }}
          >
            <div style={styles.cardTopRow}>
              <span
                style={{
                  ...styles.cardDot,
                  background: module.accent,
                }}
              />
              <span style={styles.cardOpen}>Open →</span>
            </div>

            <h3 style={isMobile ? styles.cardTitleMobile : styles.cardTitle}>
              {module.title}
            </h3>
            <p style={styles.cardText}>{module.description}</p>
          </button>
        ))}
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'linear-gradient(180deg, #f6f4fb 0%, #f9f7fd 35%, #ffffff 100%)',
    color: '#1f1b2d',
    padding: '0',
  },
  loadingWrap: {
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: '16px',
    color: '#6b6480',
  },
  heroCard: {
    background:
      'linear-gradient(135deg, rgba(107,70,193,0.98) 0%, rgba(155,89,182,0.94) 55%, rgba(123,97,255,0.92) 100%)',
    borderRadius: '28px',
    padding: '30px',
    color: '#ffffff',
    boxShadow: '0 18px 50px rgba(75, 46, 131, 0.18)',
    marginBottom: '20px',
    overflow: 'hidden',
  },
  heroCardMobile: {
    borderRadius: '22px',
    padding: '20px',
    marginBottom: '16px',
  },
  heroContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '28px',
    flexWrap: 'wrap',
  },
  heroContentMobile: {
    gap: '14px',
  },
  heroTextBlock: {
    maxWidth: '620px',
  },
  badge: {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.25)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    marginBottom: '14px',
  },
  badgeMobile: {
    display: 'inline-block',
    padding: '7px 12px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.25)',
    fontSize: '11px',
    fontWeight: 700,
    marginBottom: '12px',
  },
  title: {
    margin: 0,
    fontSize: '42px',
    fontWeight: 800,
    lineHeight: 1.1,
    color: '#ffffff',
  },
  titleMobile: {
    margin: 0,
    fontSize: '26px',
    fontWeight: 800,
    lineHeight: 1.15,
    color: '#ffffff',
  },
  subtitle: {
    marginTop: '14px',
    fontSize: '16px',
    lineHeight: 1.7,
    color: 'rgba(255,255,255,0.92)',
    maxWidth: '560px',
  },
  subtitleMobile: {
    marginTop: '12px',
    fontSize: '14px',
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.92)',
    maxWidth: '100%',
  },
  metaRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '20px',
  },
  metaRowMobile: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '16px',
  },
  metaPill: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '140px',
    padding: '12px 14px',
    borderRadius: '16px',
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.22)',
    backdropFilter: 'blur(4px)',
  },
  metaPillMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '0',
    padding: '12px',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.22)',
  },
  metaLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.75)',
  },
  metaValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#ffffff',
  },
  logoPanel: {
    position: 'relative',
    minWidth: '220px',
    minHeight: '220px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: '220px',
    height: '220px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.10)',
    filter: 'blur(10px)',
  },
  logoFrame: {
    position: 'relative',
    width: '200px',
    height: '200px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.16)',
    border: '1px solid rgba(255,255,255,0.28)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 28px rgba(0,0,0,0.12)',
  },
  logoImage: {
    borderRadius: '50%',
    objectFit: 'cover',
  },
  quickStatsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  quickStatsRowMobile: {
    gridTemplateColumns: '1fr',
    gap: '12px',
    marginBottom: '20px',
  },
  statCard: {
    background: '#ffffff',
    border: '1px solid #ece7f7',
    borderRadius: '18px',
    padding: '16px 18px',
    boxShadow: '0 10px 28px rgba(66, 37, 105, 0.06)',
  },
  statLabel: {
    margin: 0,
    fontSize: '13px',
    color: '#7a7191',
  },
  statValue: {
    margin: '10px 0 0',
    fontSize: '30px',
    fontWeight: 800,
    color: '#2d1b69',
  },
  statValueSmall: {
    margin: '10px 0 0',
    fontSize: '18px',
    fontWeight: 700,
    color: '#2d1b69',
  },
  sectionHeader: {
    marginBottom: '14px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '26px',
    fontWeight: 800,
    color: '#2d1b69',
  },
  sectionTitleMobile: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 800,
    color: '#2d1b69',
  },
  sectionSubtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: '#7a7191',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '18px',
  },
  gridMobile: {
    gridTemplateColumns: '1fr',
    gap: '12px',
  },
  card: {
    textAlign: 'left',
    background: '#ffffff',
    border: '1px solid #ece7f7',
    borderRadius: '18px',
    padding: '18px',
    boxShadow: '0 12px 32px rgba(66, 37, 105, 0.08)',
    cursor: 'pointer',
  },
  cardMobile: {
    borderRadius: '16px',
    padding: '16px',
  },
  cardTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  cardDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  cardOpen: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#7a7191',
  },
  cardTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#2d1b69',
    fontWeight: 800,
  },
  cardTitleMobile: {
    margin: 0,
    fontSize: '17px',
    color: '#2d1b69',
    fontWeight: 800,
  },
  cardText: {
    marginTop: '10px',
    marginBottom: 0,
    fontSize: '14px',
    lineHeight: 1.55,
    color: '#6b6480',
  },
}