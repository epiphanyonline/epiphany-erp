'use client'

import { useCallback, useEffect, useState } from 'react'

type Row = Record<string, string | number | null>
type Books = {
  from: string
  to: string
  trialBalance: Row[]
  incomeStatement: Row[]
  balanceSheet: Row[]
  warning: string
}
const start = '2026-04-01'
function today() {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
}
const money = (v: string | number | null | undefined) =>
  new Intl.NumberFormat('en-NG',{ style:'currency', currency:'NGN', maximumFractionDigits: 2 }).format(Number(v ?? 0))

export default function BooksPage() {
  const [pin, setPin] = useState('')
  const [access, setAccess] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(today)
  const [active, setActive] = useState<'trialBalance' | 'incomeStatement' | 'balanceSheet'>('trialBalance')
  const [books, setBooks] = useState<Books | null>(null)

  useEffect(() => {
    fetch('/api/books/session', { cache:'no-store' })
      .then(r => r.json()).then(r => setAccess(r.authenticated === true))
      .catch(() => setError('Unable to verify accounting access.'))
      .finally(() => setChecking(false))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/books/reports?' + new URLSearchParams({from,to}), {cache:'no-store'})
      const result = await response.json()
      if (!response.ok) {
        if (response.status === 401) { setAccess(false); setBooks(null) }
        throw new Error(result.error || 'Could not load reports')
      }
      setBooks(result as Books)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reports') }
    finally { setLoading(false) }
  }, [from,to])

  useEffect(() => { if(access && !books && !loading) void load() }, [access,books,loading,load])

  async function unlock(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/books/session', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pin})
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Access denied')
      setPin('')
      setAccess(true)
      setBooks(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Access denied') }
    finally { setLoading(false) }
  }

  async function lock() {
    await fetch('/api/books/session', {method:'DELETE'}).catch(() => {})
    setAccess(false); setBooks(null); setPin('')
  }

  const tabs = [
    {id:'trialBalance' as const, name:'Trial Balance'},
    {id:'incomeStatement' as const, name:'Income Statement'},
    {id:'balanceSheet' as const, name:'Balance Sheet'},
  ]
  const rows = books?.[active] ?? []
  const cols = rows.length ? Object.keys(rows[0]) : []

  return <main className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="text-sm font-semibold text-purple-700">Epiphany ERP</p>
          <h1 className="text-3xl font-bold">Accounting Books</h1>
          <p className="text-sm text-slate-600 mt-1">Read-only financial reports • Nigerian naira</p>
        </div>
        <a href="/" className="text-sm underline text-purple-700">Home</a>
      </div>
      {checking ? <p>Checking access…</p> : !access ?
        <section className="bg-white rounded-2xl border p-6 max-w-md shadow-sm">
          <h2 className="text-xl font-semibold">Enter accounting PIN</h2>
          <p className="text-sm text-slate-600 mt-2">Additional access check for the accounting books.</p>
          <form onSubmit={unlock} className="mt-5 space-y-4">
            <label className="block text-sm font-medium" htmlFor="accounting-pin">Accounting PIN</label>
            <input id="accounting-pin" type="password" inputMode="numeric" autoComplete="off"
              value={pin} maxLength={12} onChange={e => setPin(e.target.value)}
              className="w-full border rounded-xl p-3" required />
            <button disabled={loading} type="submit"
              className="rounded-xl bg-purple-700 text-white px-5 py-3 font-semibold disabled:opacity-60">
              {loading ? 'Checking…' : 'Unlock books'}
            </button>
          </form>
        </section> :
        <>
          <div className="flex flex-wrap items-end gap-3 bg-white border rounded-2xl p-4">
            <label className="text-sm">From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block border rounded-lg p-2 mt-1"/></label>
            <label className="text-sm">To <input type="date" value={to} onChange={e => setTo(e.target.value)} className="block border rounded-lg p-2 mt-1"/></label>
            <button onClick={() => void load()} disabled={loading || from>to}
              className="rounded-xl bg-purple-700 text-white px-4 py-2.5 disabled:opacity-50">Refresh books</button>
            <button onClick={() => void lock()} className="rounded-xl border px-4 py-2.5">Lock books</button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
            Existing ERP reports, not yet reconciled or audited. These are provisional figures.
            The new accounting engine remains separate and inactive.
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map(t => <button key={t.id} onClick={() => setActive(t.id)}
              className={'rounded-xl px-4 py-2 text-sm font-semibold border ' + (active===t.id ? 'bg-purple-700 text-white' : 'bg-white')}>{t.name}</button>)}
          </div>
          <section className="bg-white border rounded-2xl overflow-x-auto">
            <h2 className="p-4 font-semibold text-lg border-b">{tabs.find(t => t.id===active)?.name}</h2>
            {loading ? <p className="p-4">Loading financial reports…</p> :
              !books ? <p className="p-4 text-slate-600">No report loaded</p> :
              rows.length===0 ? <p className="p-4 text-slate-600">No entries for the selected period</p> :
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100"><tr>{cols.map(c => <th key={c} className="text-left p-3 whitespace-nowrap">{c.replaceAll('_',' ')}</th>)}</tr></thead>
                <tbody>{rows.map((row,i)=><tr key={i} className="border-t">{cols.map(c=><td key={c} className="p-3 whitespace-nowrap">{typeof row[c]==='number' && /amount|debit|credit|balance/i.test(c) ? money(row[c]) : String(row[c] ?? '—')}</td>)}</tr>)}</tbody>
              </table>}
          </section>
        </>
      }
      {error && <div role="alert" className="bg-red-50 border border-red-300 text-red-800 rounded-xl p-3 text-sm">{error}</div>}
      <p className="text-xs text-slate-500">For restricted access, a strong administrator login and database-level access controls are still recommended. A short shared PIN alone is not sufficient for confidential financial information.</p>
    </div>
  </main>
}
