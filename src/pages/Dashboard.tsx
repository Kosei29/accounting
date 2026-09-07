import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AccountBalance, Transaction } from '../types/database.types'

const peso = (value: number) => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function Dashboard() {
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [stats, setStats] = useState({ income: 0, expenses: 0, transfers: 0 })

  useEffect(() => {
    async function load() {
      const [{ data: balances }, { data: monthly }, { data: tx }] = await Promise.all([
        supabase.from('account_balances').select('*').order('name'),
        supabase.from('monthly_statistics').select('*').order('month', { ascending: false }).limit(1),
        supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(5),
      ])
      setAccounts((balances ?? []) as AccountBalance[])
      setTransactions((tx ?? []) as Transaction[])
      const row = monthly?.[0]
      if (row) setStats({ income: Number(row.income), expenses: Number(row.expenses), transfers: Number(row.transfers) })
    }
    load()
  }, [])

  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)
  const net = stats.income - stats.expenses

  return <div className="page">
    <div className="page-header">
      <div><p className="eyebrow">Overview</p><h2>Good morning.</h2><p className="muted">Here's what your money is doing right now.</p></div>
    </div>

    <section className="summary-grid">
      <article className="summary-card"><span>Total balance</span><strong>{peso(total)}</strong></article>
      <article className="summary-card"><span>Income this month</span><strong>{peso(stats.income)}</strong></article>
      <article className="summary-card"><span>Expenses this month</span><strong>{peso(stats.expenses)}</strong></article>
      <article className="summary-card"><span>Net cash flow</span><strong>{net >= 0 ? '+' : ''}{peso(net)}</strong></article>
    </section>

    <div className="dashboard-grid">
      <section className="panel">
        <div className="section-title"><h3>Cash flow</h3><span className="muted">Current month</span></div>
        <div className="net-flow">
          <div className="flow-item income"><span>Money in</span><strong>{peso(stats.income)}</strong></div>
          <div className="flow-item expense"><span>Money out</span><strong>{peso(stats.expenses)}</strong></div>
        </div>
      </section>
      <section className="panel">
        <div className="section-title"><h3>Accounts</h3></div>
        <div>{accounts.slice(0, 5).map(a => <div key={a.id} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #eef0f4'}}><span>{a.name}</span><strong>{peso(Number(a.balance))}</strong></div>)}</div>
      </section>
    </div>

    <section className="panel table-wrap">
      <div className="section-title"><h3>Recent transactions</h3><span className="muted">Latest 5</span></div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Status</th></tr></thead><tbody>
        {transactions.length ? transactions.map(tx => <tr key={tx.id}><td>{new Date(tx.transaction_date).toLocaleDateString()}</td><td><span className={`badge ${tx.transaction_type}`}>{tx.transaction_type}</span></td><td>{tx.description}</td><td><span className={`badge ${tx.status}`}>{tx.status}</span></td></tr>) : <tr><td colSpan={4} className="muted">No transactions yet.</td></tr>}
      </tbody></table>
    </section>
  </div>
}
