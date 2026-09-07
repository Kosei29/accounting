import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Account, Category, Transaction, TransactionType } from '../types/database.types'
import { useAuth } from '../features/auth/AuthProvider'

export function Transactions() {
  const { session } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [type, setType] = useState<TransactionType>('expense')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [category, setCategory] = useState('')
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    if (!session) return
    const { data: existing } = await supabase.from('accounts').select('name,account_type,is_system').in('name', ['Income','Expense'])
    const names = new Set((existing ?? []).map(a => a.name))
    const missing = ['Income','Expense'].filter(name => !names.has(name)).map(name => ({
      owner_id: session.user.id,
      name,
      account_type: name === 'Income' ? 'income' : 'expense',
      is_system: true,
      opening_balance: 0,
      opening_balance_date: new Date().toISOString().slice(0,10),
    }))
    if (missing.length) await supabase.from('accounts').insert(missing)
    const [{ data: tx }, { data: ac }, { data: cat }] = await Promise.all([
      supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(50),
      supabase.from('accounts').select('*').eq('status', 'active').order('name'),
      supabase.from('categories').select('*').eq('active', true).order('name'),
    ])
    const all = (ac ?? []) as Account[]
    const asset = all.filter(a => !a.is_system && !['income','expense','loan','credit_card','other_liability','equity'].includes(a.account_type))
    setTransactions((tx ?? []) as Transaction[]); setAccounts(all); setCategories((cat ?? []) as Category[])
    if (!account && asset[0]) setAccount(asset[0].id)
    if (!fromAccount && asset[0]) setFromAccount(asset[0].id)
    if (!toAccount && asset[1]) setToAccount(asset[1].id)
  }

  useEffect(() => { if (session) load() }, [session])

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage('')
    const value = Number(amount)
    if (!value || value <= 0 || !description.trim()) return setMessage('Enter a purpose and amount.')
    const assetAccounts = accounts.filter(a => !a.is_system && !['income','expense','loan','credit_card','other_liability','equity'].includes(a.account_type))
    let debit = account; let credit = account
    if (type === 'transfer') { debit = toAccount; credit = fromAccount }
    if (type === 'income') {
      const income = accounts.find(a => a.is_system && a.account_type === 'income')
      if (!income) return setMessage('Income control account is unavailable.')
      debit = account; credit = income.id
    }
    if (type === 'expense') {
      const expense = accounts.find(a => a.is_system && a.account_type === 'expense')
      if (!expense) return setMessage('Expense control account is unavailable.')
      debit = expense.id; credit = account
    }
    if (!assetAccounts.length) return setMessage('Add a Cash, Bank, E-Wallet, or Savings account first.')
    if (!debit || !credit || debit === credit) return setMessage('Choose valid, different accounts.')
    const { error } = await supabase.rpc('post_transaction', {
      p_transaction_date: new Date().toISOString(), p_transaction_type: type,
      p_description: description.trim(), p_category_id: category || null,
      p_debit_account_id: debit, p_credit_account_id: credit, p_amount: value,
    })
    if (error) setMessage(error.message)
    else { setMessage('Transaction posted.'); setDescription(''); setAmount(''); await load() }
  }

  const assetAccounts = accounts.filter(a => !a.is_system && !['income','expense','loan','credit_card','other_liability','equity'].includes(a.account_type))
  return <div className="page">
    <div className="page-header"><div><p className="eyebrow">General ledger</p><h2>Transactions</h2><p className="muted">Use this for ordinary income, expenses, and transfers. Receivables, debts, and loans have dedicated flows.</p></div></div>
    <form className="panel form-grid" onSubmit={submit}>
      <label>Type<select value={type} onChange={e => setType(e.target.value as TransactionType)}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select></label>
      <label>Purpose<input value={description} onChange={e => setDescription(e.target.value)} placeholder="Jeep fare" required /></label>
      <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
      {type !== 'transfer' ? <label>Account<select value={account} onChange={e => setAccount(e.target.value)}>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label> : <><label>From<select value={fromAccount} onChange={e => setFromAccount(e.target.value)}>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>To<select value={toAccount} onChange={e => setToAccount(e.target.value)}>{assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></>}
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">None</option>{categories.filter(c => c.category_type === type || c.category_type === 'other').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <button>Post transaction</button>
    </form>
    {message && <p className={message === 'Transaction posted.' ? 'success' : 'error'}>{message}</p>}
    <section className="panel table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Purpose</th><th>Status</th></tr></thead><tbody>{transactions.map(tx => <tr key={tx.id}><td>{new Date(tx.transaction_date).toLocaleDateString()}</td><td><span className={`badge ${tx.transaction_type}`}>{tx.transaction_type}</span></td><td>{tx.description}</td><td>{tx.status}</td></tr>)}</tbody></table>{!transactions.length && <p className="muted">No transactions yet.</p>}</section>
  </div>
}
