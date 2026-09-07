import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AccountBalance } from '../types/database.types'

export function Dashboard() {
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [stats, setStats] = useState({ income: 0, expenses: 0, transfers: 0 })

  useEffect(() => {
    async function load() {
      const [{ data: balances }, { data: monthly }] = await Promise.all([
        supabase.from('account_balances').select('*').order('name'),
        supabase.from('monthly_statistics').select('*').order('month', { ascending: false }).limit(1),
      ])
      setAccounts((balances ?? []) as AccountBalance[])
      const row = monthly?.[0]
      if (row) setStats({ income: Number(row.income), expenses: Number(row.expenses), transfers: Number(row.transfers) })
    }
    load()
  }, [])

  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)
  return <div className="page">
    <div className="page-header"><div><h2>Dashboard</h2><p className="muted">Your financial position at a glance.</p></div></div>
    <section className="summary-grid">
      <article className="summary-card"><span>Total balance</span><strong>₱{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></article>
      <article className="summary-card"><span>Income</span><strong>₱{stats.income.toLocaleString()}</strong></article>
      <article className="summary-card"><span>Expenses</span><strong>₱{stats.expenses.toLocaleString()}</strong></article>
      <article className="summary-card"><span>Transfers</span><strong>₱{stats.transfers.toLocaleString()}</strong></article>
    </section>
    <section><h3>Accounts</h3><div className="cards">{accounts.map(a => <article className="card" key={a.id}><span>{a.name}</span><small>{a.account_type}</small><strong>₱{Number(a.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></article>)}</div></section>
  </div>
}
