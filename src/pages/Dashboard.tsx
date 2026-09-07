import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AccountBalance, Transaction } from '../types/database.types'

const peso = (value: number) => `₱${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Dashboard() {
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stats, setStats] = useState({ income: 0, expenses: 0, transfers: 0 })
  const [receivables, setReceivables] = useState(0)
  const [debts, setDebts] = useState(0)
  const [loans, setLoans] = useState(0)

  useEffect(() => {
    async function load() {
      const [{ data: balances }, { data: monthly }, { data: tx }, { data: rs }, { data: ds }, { data: ls }] = await Promise.all([
        supabase.from('account_balances').select('*').order('name'),
        supabase.from('monthly_statistics').select('*').order('month', { ascending: false }).limit(1),
        supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(5),
        supabase.from('receivables').select('balance').eq('status', 'active'),
        supabase.from('debts').select('balance').eq('status', 'active'),
        supabase.from('loans').select('balance').eq('status', 'active'),
      ])
      setAccounts((balances ?? []) as AccountBalance[])
      setTransactions((tx ?? []) as Transaction[])
      const row = monthly?.[0]
      if (row) setStats({ income: Number(row.income), expenses: Number(row.expenses), transfers: Number(row.transfers) })
      setReceivables((rs ?? []).reduce((s, x) => s + Number(x.balance), 0))
      setDebts((ds ?? []).reduce((s, x) => s + Number(x.balance), 0))
      setLoans((ls ?? []).reduce((s, x) => s + Number(x.balance), 0))
    }
    load()
  }, [])

  const spendableAccounts = accounts.filter(a => !a.is_system && ['cash','bank','ewallet','savings','investment','other_asset'].includes(a.account_type))
  const liquid = spendableAccounts.reduce((sum, a) => sum + Number(a.balance), 0)
  const netWorth = liquid + receivables - debts - loans
  const net = stats.income - stats.expenses

  return <div className="page">
    <div className="page-header"><div><p className="eyebrow">Overview</p><h2>Good morning.</h2><p className="muted">Your ledger now separates spendable cash from money owed and money you owe.</p></div></div>

    <section className="summary-grid">
      <article className="summary-card"><span>Net position</span><strong>{peso(netWorth)}</strong></article>
      <article className="summary-card"><span>Spendable money</span><strong>{peso(liquid)}</strong></article>
      <article className="summary-card"><span>Owed to me</span><strong>{peso(receivables)}</strong></article>
      <article className="summary-card"><span>Debt + loans</span><strong>{peso(debts + loans)}</strong></article>
    </section>

    <div className="dashboard-grid">
      <section className="panel">
        <div className="section-title"><h3>Cash flow</h3><span className="muted">Current month</span></div>
        <div className="net-flow">
          <div className="flow-item income"><span>Money in</span><strong>{peso(stats.income)}</strong></div>
          <div className="flow-item expense"><span>Money out</span><strong>{peso(stats.expenses)}</strong></div>
        </div>
        <p className="muted" style={{marginTop:14}}>Net cash flow: <strong>{net >= 0 ? '+' : ''}{peso(net)}</strong>. Loan principal, debt principal payments, and receivable movements are balance-sheet movements, not ordinary income/expense.</p>
      </section>
      <section className="panel">
        <div className="section-title"><h3>Accounts</h3><span className="muted">Spendable</span></div>
        <div>{spendableAccounts.slice(0, 8).map(a => <div key={a.id} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #eef0f4'}}><span>{a.name}</span><strong>{peso(Number(a.balance))}</strong></div>)}</div>
        {!spendableAccounts.length && <p className="muted">Add a Cash, Bank, E-Wallet, or Savings account first.</p>}
      </section>
    </div>

    <section className="cards">
      <article className="card"><small>Receivables</small><strong>{peso(receivables)}</strong><span className="muted">Asset · people owe you</span></article>
      <article className="card"><small>Debts</small><strong>{peso(debts)}</strong><span className="muted">Liability · ordinary obligations</span></article>
      <article className="card"><small>Loans</small><strong>{peso(loans)}</strong><span className="muted">Liability · formal borrowing</span></article>
    </section>

    <section className="panel table-wrap">
      <div className="section-title"><h3>Recent transactions</h3><span className="muted">Latest 5</span></div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Status</th></tr></thead><tbody>
        {transactions.length ? transactions.map(tx => <tr key={tx.id}><td>{new Date(tx.transaction_date).toLocaleDateString()}</td><td><span className={`badge ${tx.transaction_type}`}>{tx.transaction_type}</span></td><td>{tx.description}</td><td><span className={`badge ${tx.status}`}>{tx.status}</span></td></tr>) : <tr><td colSpan={4} className="muted">No transactions yet.</td></tr>}
      </tbody></table>
    </section>
  </div>
}
