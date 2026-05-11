'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useCurrentStaff } from '../../lib/useCurrentStaff'

type ExpenseTx = {
  id: string
  tx_ref: string | null
  business_date: string | null
  staff_id: string | null
  park_id: string | null
  tx_type: string | null
  sub_type: string | null
  amount: number
  notes: string | null
  reference_text: string | null
  created_at: string | null
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export default function ExpenseApprovalsPage() {
  const router = useRouter()
  const { staff, loading: staffLoading } = useCurrentStaff()

  const [rows, setRows] = useState<ExpenseTx[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
      loadPendingExpenses()
    }
  }, [staff, isSupervisor])

  async function loadPendingExpenses() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id,
        tx_ref,
        business_date,
        staff_id,
        park_id,
        tx_type,
        sub_type,
        amount,
        notes,
        reference_text,
        created_at
      `)
      .eq('tx_type', 'EXPENSE')
      .eq('requires_approval', true)
      .is('approved_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message || 'Failed to load pending expenses')
      setRows([])
    } else {
      setRows((data || []) as ExpenseTx[])
    }

    setLoading(false)
  }

  async function approveExpense(transactionId: string) {
    if (!staff?.id) {
      setError('Unable to confirm supervisor account.')
      return
    }

    setActionLoading(transactionId)
    setError('')
    setSuccess('')

    const { data, error } = await supabase.rpc(
      'approve_expense_and_post_accounting',
      {
        p_transaction_id: transactionId,
        p_approved_by: staff.id,
        p_payment_account_code: '1000',
      }
    )

    if (error) {
      setError(error.message || 'Approval failed')
    } else {
      setSuccess(`Expense approved and posted to accounting. Journal ID: ${data}`)
      await loadPendingExpenses()
    }

    setActionLoading(null)
  }

  if (staffLoading || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <p className="text-slate-300">Loading expense approvals...</p>
      </main>
    )
  }

  if (!staff || !isSupervisor) return null

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-purple-300 font-medium">Supervisor Control</p>
            <h1 className="text-3xl font-bold">Pending Expense Approvals</h1>
            <p className="text-slate-400 mt-2">
              Approve expense transactions before they are posted into the accounting ledger.
            </p>
          </div>

          <button
            onClick={loadPendingExpenses}
            className="bg-white text-slate-950 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-semibold"
          >
            Refresh
          </button>
        </section>

        {error && (
          <div className="bg-red-950 border border-red-700 text-red-200 p-4 rounded-xl">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-950 border border-emerald-700 text-emerald-200 p-4 rounded-xl">
            {success}
          </div>
        )}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800">
            <h2 className="text-xl font-bold">Expenses Waiting for Approval</h2>
            <p className="text-sm text-slate-400">
              Only `EXPENSE` transactions appear here.
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="p-6 text-slate-400">No pending expenses.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <Th>Date</Th>
                    <Th>Reference</Th>
                    <Th>Type</Th>
                    <Th>Amount</Th>
                    <Th>Notes</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800 hover:bg-slate-800/60">
                      <Td>{row.business_date || '-'}</Td>
                      <Td>{row.tx_ref || row.reference_text || '-'}</Td>
                      <Td>{row.sub_type || 'GENERAL_EXPENSE'}</Td>
                      <Td>{money(row.amount)}</Td>
                      <Td>{row.notes || '-'}</Td>
                      <Td>
                        <button
                          onClick={() => approveExpense(row.id)}
                          disabled={actionLoading === row.id}
                          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 px-4 py-2 rounded-xl text-xs font-semibold"
                        >
                          {actionLoading === row.id ? 'Approving...' : 'Approve & Post'}
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-3 whitespace-nowrap font-semibold">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 whitespace-nowrap text-slate-200">{children}</td>
}