'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'
import * as XLSX from 'xlsx'

type TrialBalanceRow = {
  account_code: string
  account_name: string
  account_type: string
  total_debit: number
  total_credit: number
  balance: number
}

type IncomeStatementRow = {
  section: string
  account_code: string | null
  account_name: string
  amount: number
}

type BalanceSheetRow = {
  section: string
  account_code: string | null
  account_name: string
  amount: number
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export default function AccountingDashboardPage() {
  const router = useRouter()
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [fromDate, setFromDate] = useState('2026-05-01')
  const [toDate, setToDate] = useState('2026-05-04')
  const [activeTab, setActiveTab] = useState<'trial' | 'income' | 'balance'>('trial')

  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([])
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatementRow[]>([])
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isSupervisor = useMemo(() => {
    return staff?.role?.toUpperCase() === 'SUPERVISOR'
  }, [staff])

  useEffect(() => {
    if (!staffLoading && !staff) {
      router.push('/login')
    }
  }, [staffLoading, staff, router])

  useEffect(() => {
    if (!staffLoading && staff && !isSupervisor) {
      router.push('/')
    }
  }, [staffLoading, staff, isSupervisor, router])

  useEffect(() => {
    if (staff && isSupervisor) {
      loadAccountingReports()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, isSupervisor])

  async function loadAccountingReports() {
    setLoading(true)
    setError('')

    const [trialRes, incomeRes, balanceRes] = await Promise.all([
      supabase.rpc('get_trial_balance', {
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
      }),
      supabase.rpc('get_income_statement', {
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
      }),
      supabase.rpc('get_balance_sheet', {
        p_as_of_date: toDate || null,
      }),
    ])

    if (trialRes.error || incomeRes.error || balanceRes.error) {
      setError(
        trialRes.error?.message ||
          incomeRes.error?.message ||
          balanceRes.error?.message ||
          'Unable to load accounting reports'
      )
    } else {
      setTrialBalance((trialRes.data || []) as TrialBalanceRow[])
      setIncomeStatement((incomeRes.data || []) as IncomeStatementRow[])
      setBalanceSheet((balanceRes.data || []) as BalanceSheetRow[])
    }

    setLoading(false)
  }

  function exportAccountingReports() {
    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(trialBalance),
      'Trial Balance'
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(incomeStatement),
      'Income Statement'
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(balanceSheet),
      'Balance Sheet'
    )

    XLSX.writeFile(workbook, `accounting-reports-${fromDate}-to-${toDate}.xlsx`)
  }

  const totalDebit = trialBalance.reduce((sum, row) => sum + Number(row.total_debit || 0), 0)
  const totalCredit = trialBalance.reduce((sum, row) => sum + Number(row.total_credit || 0), 0)
  const isBalanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100)

  const netProfit =
    incomeStatement.find((row) => row.section === 'Net Profit')?.amount || 0

  const balanceCheck =
    balanceSheet.find((row) => row.section === 'Check')?.amount || 0

  if (staffLoading || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <p className="text-slate-300">Loading accounting dashboard...</p>
      </main>
    )
  }

  if (!staff || !isSupervisor) return null

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-purple-300 font-medium">Accounting Control Centre</p>
            <h1 className="text-3xl md:text-4xl font-bold">Accounting Dashboard</h1>
            <p className="text-slate-400 mt-2">
              Trial balance, income statement, balance sheet and auditor-ready accounting reports.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-400 mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">To / As Of</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <button
              onClick={loadAccountingReports}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Apply Filter
            </button>

            <button
              onClick={exportAccountingReports}
              className="bg-white text-slate-950 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Download Excel
            </button>
          </div>
        </section>

        {error && (
          <div className="bg-red-950 border border-red-700 text-red-200 p-4 rounded-xl">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card title="Total Debit" value={money(totalDebit)} />
          <Card title="Total Credit" value={money(totalCredit)} />
          <Card
            title="Trial Balance Status"
            value={isBalanced ? 'Balanced' : 'Not Balanced'}
            tone={isBalanced ? 'good' : 'bad'}
          />
          <Card
            title="Net Profit / Loss"
            value={money(netProfit)}
            tone={Number(netProfit) >= 0 ? 'good' : 'bad'}
          />
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-wrap gap-2">
          <TabButton active={activeTab === 'trial'} onClick={() => setActiveTab('trial')}>
            Trial Balance
          </TabButton>
          <TabButton active={activeTab === 'income'} onClick={() => setActiveTab('income')}>
            Income Statement
          </TabButton>
          <TabButton active={activeTab === 'balance'} onClick={() => setActiveTab('balance')}>
            Balance Sheet
          </TabButton>
        </section>

        {activeTab === 'trial' && (
          <ReportCard title="Trial Balance">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <Th>Code</Th>
                    <Th>Account</Th>
                    <Th>Type</Th>
                    <Th>Debit</Th>
                    <Th>Credit</Th>
                    <Th>Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance.map((row) => (
                    <tr key={row.account_code} className="border-t border-slate-800">
                      <Td>{row.account_code}</Td>
                      <Td>{row.account_name}</Td>
                      <Td>{row.account_type}</Td>
                      <Td>{money(row.total_debit)}</Td>
                      <Td>{money(row.total_credit)}</Td>
                      <Td>{money(row.balance)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportCard>
        )}

        {activeTab === 'income' && (
          <ReportCard title="Income Statement">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <Th>Section</Th>
                    <Th>Code</Th>
                    <Th>Account</Th>
                    <Th>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {incomeStatement.map((row, index) => (
                    <tr
                      key={`${row.section}-${row.account_code || index}`}
                      className={`border-t border-slate-800 ${
                        row.section === 'Net Profit' ? 'bg-purple-950/40 font-bold' : ''
                      }`}
                    >
                      <Td>{row.section}</Td>
                      <Td>{row.account_code || '-'}</Td>
                      <Td>{row.account_name}</Td>
                      <Td>{money(row.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportCard>
        )}

        {activeTab === 'balance' && (
          <ReportCard title="Balance Sheet">
            <div className="mb-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  Number(balanceCheck) === 0
                    ? 'bg-emerald-950 text-emerald-200 border border-emerald-800'
                    : 'bg-amber-950 text-amber-200 border border-amber-800'
                }`}
              >
                Balance Check: {money(balanceCheck)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <Th>Section</Th>
                    <Th>Code</Th>
                    <Th>Account</Th>
                    <Th>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {balanceSheet.map((row, index) => (
                    <tr
                      key={`${row.section}-${row.account_code || index}`}
                      className={`border-t border-slate-800 ${
                        row.section === 'Check' ? 'bg-purple-950/40 font-bold' : ''
                      }`}
                    >
                      <Td>{row.section}</Td>
                      <Td>{row.account_code || '-'}</Td>
                      <Td>{row.account_name}</Td>
                      <Td>{money(row.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportCard>
        )}
      </div>
    </main>
  )
}

function Card({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
      <p className="text-sm text-slate-400">{title}</p>
      <p
        className={`text-2xl font-bold mt-2 ${
          tone === 'good'
            ? 'text-emerald-300'
            : tone === 'bad'
            ? 'text-red-300'
            : 'text-white'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-slate-800">
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-semibold ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-3 whitespace-nowrap font-semibold">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 whitespace-nowrap text-slate-200">{children}</td>
}