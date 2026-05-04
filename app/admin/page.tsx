// app/admin/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import * as XLSX from 'xlsx'

type GeneralOverview = {
  total_clients: number
  total_savings: number
  total_loan_portfolio: number
  total_disbursement: number
  total_repayments: number
  total_processing_fee: number
  total_membership_fee: number
  total_fees: number
  outstanding_loan: number
  net_cashflow: number
}

type ParkRanking = {
  park_id: string
  park_name: string
  total_client_base: number
  total_loan_beneficiaries: number
  total_current_loan_portfolio: number
  total_outstanding_loan: number
  total_savings_balance: number
  total_disbursement: number
  total_repayments: number
  total_savings_collected: number
  total_fees: number
  total_cash_in: number
  collection_rate_percent: number
  savings_per_client: number
  portfolio_risk_percent: number
  repayment_rank: number
  savings_rank: number
  cash_in_rank: number
}

type DailyTrend = {
  business_date: string
  total_disbursement: number
  total_repayments: number
  total_savings_collected: number
  total_fees: number
  total_cash_in: number
  transaction_count: number
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function number(value: number | null | undefined) {
  return new Intl.NumberFormat('en-NG').format(Number(value || 0))
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [fromDate, setFromDate] = useState('2026-04-01')
  const [toDate, setToDate] = useState('2026-05-04')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [overview, setOverview] = useState<GeneralOverview | null>(null)
  const [parks, setParks] = useState<ParkRanking[]>([])
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([])

  const canAccess = useMemo(() => {
    return staff?.role === 'ADMIN' || staff?.role === 'SUPERVISOR'
  }, [staff])

  useEffect(() => {
    if (!staffLoading && !staff) {
      router.push('/login')
    }
  }, [staffLoading, staff, router])

  useEffect(() => {
    if (!staffLoading && staff && !canAccess) {
      router.push('/app')
    }
  }, [staffLoading, staff, canAccess, router])

  useEffect(() => {
    if (staff && canAccess) {
      loadDashboard()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, canAccess])

  async function loadDashboard() {
    setLoading(true)
    setError('')

    try {
      const params = {
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
      }

      const [overviewRes, parkRes, dailyRes] = await Promise.all([
        supabase.rpc('get_general_performance_overview', params),
        supabase.rpc('get_park_ranking_overview', params),
        supabase.rpc('get_daily_performance_trend', params),
      ])

      if (overviewRes.error) throw overviewRes.error
      if (parkRes.error) throw parkRes.error
      if (dailyRes.error) throw dailyRes.error

      setOverview(overviewRes.data?.[0] || null)
      setParks(parkRes.data || [])
      setDailyTrend(dailyRes.data || [])
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Unable to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  function exportToExcel() {
    const workbook = XLSX.utils.book_new()

    const overviewSheet = XLSX.utils.json_to_sheet(overview ? [overview] : [])
    const parkSheet = XLSX.utils.json_to_sheet(parks)
    const trendSheet = XLSX.utils.json_to_sheet(dailyTrend)

    XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview')
    XLSX.utils.book_append_sheet(workbook, parkSheet, 'Park Ranking')
    XLSX.utils.book_append_sheet(workbook, trendSheet, 'Daily Trend')

    XLSX.writeFile(workbook, `admin-performance-${fromDate}-to-${toDate}.xlsx`)
  }

  if (staffLoading || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <p className="text-slate-300">Loading admin dashboard...</p>
      </main>
    )
  }

  if (!staff || !canAccess) {
    return null
  }

  const topCashParks = [...parks]
    .sort((a, b) => b.total_cash_in - a.total_cash_in)
    .slice(0, 8)

  const topSavingsParks = [...parks]
    .sort((a, b) => b.total_savings_balance - a.total_savings_balance)
    .slice(0, 8)

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-purple-300 font-medium">Admin Control Centre</p>
            <h1 className="text-3xl md:text-4xl font-bold">
              General Performance Overview
            </h1>
            <p className="text-slate-400 mt-2">
              Track parks, savings, loans, repayments, fees, cashflow and portfolio risk.
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
              <label className="block text-xs text-slate-400 mb-1">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <button
              onClick={loadDashboard}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Apply Filter
            </button>

            <button
              onClick={exportToExcel}
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
          <Card title="Total Client Base" value={number(overview?.total_clients)} />
          <Card title="Savings Balance" value={money(overview?.total_savings)} />
          <Card title="Loan Portfolio" value={money(overview?.total_loan_portfolio)} />
          <Card title="Outstanding Loan" value={money(overview?.outstanding_loan)} />
          <Card title="Total Disbursement" value={money(overview?.total_disbursement)} />
          <Card title="Total Repayments" value={money(overview?.total_repayments)} />
          <Card title="Total Fees" value={money(overview?.total_fees)} />
          <Card title="Net Cashflow" value={money(overview?.net_cashflow)} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Top Parks by Cash In">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCashParks}>
                <XAxis dataKey="park_name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="total_cash_in" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Top Parks by Savings Balance">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topSavingsParks}>
                <XAxis dataKey="park_name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="total_savings_balance" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <ChartCard title="Top Parks by Total Disbursement">
  <ResponsiveContainer width="100%" height={300}>
    <BarChart
      data={[...parks]
        .sort((a, b) => b.total_disbursement - a.total_disbursement)
        .slice(0, 8)}
    >
      <XAxis dataKey="park_name" stroke="#94a3b8" />
      <YAxis stroke="#94a3b8" />
      <Tooltip />
      <Bar dataKey="total_disbursement" />
    </BarChart>
  </ResponsiveContainer>
</ChartCard>

        <section>
          <ChartCard title="Daily Cash In Trend">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="business_date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="total_cash_in" strokeWidth={3} />
                <Line type="monotone" dataKey="total_repayments" strokeWidth={2} />
                <Line type="monotone" dataKey="total_savings_collected" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800">
            <h2 className="text-xl font-bold">Park Ranking Overview</h2>
            <p className="text-sm text-slate-400">
              Compare parks by portfolio, savings, repayments, cash-in and risk.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950 text-slate-300">
                <tr>
                  <Th>Park</Th>
                  <Th>Clients</Th>
                  <Th>Loan Beneficiaries</Th>
                  <Th>Loan Portfolio</Th>
                  <Th>Outstanding</Th>
                  <Th>Savings</Th>
                  <Th>Repayments</Th>
                  <Th>Cash In</Th>
                  <Th>Fees</Th>
                  <Th>Collection %</Th>
                  <Th>Risk %</Th>
                  <Th>Cash Rank</Th>
                </tr>
              </thead>
              <tbody>
                {parks.map((park) => (
                  <tr key={park.park_id} className="border-t border-slate-800 hover:bg-slate-800/60">
                    <Td>{park.park_name}</Td>
                    <Td>{number(park.total_client_base)}</Td>
                    <Td>{number(park.total_loan_beneficiaries)}</Td>
                    <Td>{money(park.total_current_loan_portfolio)}</Td>
                    <Td>{money(park.total_outstanding_loan)}</Td>
                    <Td>{money(park.total_savings_balance)}</Td>
                    <Td>{money(park.total_repayments)}</Td>
                    <Td>{money(park.total_cash_in)}</Td>
                    <Td>{money(park.total_fees)}</Td>
                    <Td>{park.collection_rate_percent}%</Td>
                    <Td>{park.portfolio_risk_percent}%</Td>
                    <Td>#{park.cash_in_rank}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
      <h2 className="text-lg font-bold mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-3 whitespace-nowrap font-semibold">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 whitespace-nowrap text-slate-200">{children}</td>
}