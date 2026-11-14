import Link from 'next/link'

export const dynamic = 'force-dynamic'

const components = [
  ['Chart of Accounts', 'Independent ledger codes prepared'],
  ['Journal Posting', 'Private staging engine designed; not connected to live transactions'],
  ['Trial Balance', 'Reporting query prepared; awaiting staging validation'],
  ['Profit and Loss', 'Period and park reporting query prepared'],
  ['Balance Sheet', 'Provisional reporting query prepared'],
  ['Weekly Reconciliation', 'Manual review and matching controls prepared'],
  ['Period Closing', 'Approval and closing structures prepared'],
]

export default function AccountingV2Page() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-purple-300 text-sm font-semibold">Epiphany ERP / Accounting V2</p>
          <h1 className="text-3xl font-bold mt-2">Accounting integration preview</h1>
          <p className="text-slate-300 mt-3 max-w-3xl">
            This is a development-only integration landing page. It does not expose
            financial records, perform accounting postings, or modify the existing ERP.
          </p>
        </div>
        <section className="rounded-xl border border-amber-700 bg-amber-950/30 p-4">
          <h2 className="font-semibold text-amber-200">Not activated</h2>
          <p className="text-sm mt-2 text-amber-100">
            Existing /accounting and /profit reports remain the live versions. The
            new accounting engine must be validated in a separate database and
            secure server-side staff authorisation must be implemented before activation.
          </p>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          {components.map(([name, description]) => (
            <div key={name} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">{name}</h2>
              <p className="text-sm text-slate-400 mt-2">{description}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400">
          A protected, disabled-by-default API for read-only aggregated source
          transaction movements is staged separately. This page deliberately
          does not call it or request a financial access token in the browser.
        </p>
        <Link href="/" className="inline-block underline text-purple-300">
          Back to ERP
        </Link>
      </div>
    </main>
  )
}
